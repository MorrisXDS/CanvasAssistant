/**
 * Sync Course Operations
 * Handles course synchronization from Canvas to local database.
 */

import type { SyncOperationContext, SyncOperationHelpers } from '../SyncOperationContext';
import { createSyncResult } from '../SyncOperationContext';
import type { SyncResult } from '../SyncEngineTypes';
import { CanvasCourse, mapCourse } from '../../data/DataMappers';
import { TERM_END_BUFFER_DAYS } from '../../../l1-persistence/constants/termLinger';

export class SyncCourseOperations {
  constructor(
    private ctx: SyncOperationContext,
    private helpers: SyncOperationHelpers
  ) {}

  /**
   * Sync courses from Canvas
   */
  async syncCourses(): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let count = 0;

    this.ctx.emitter.emit('sync-entity-start', { entity: 'courses' });

    try {
      const courses = await this.ctx.rateLimiter.enqueue(
        () =>
          this.ctx.client.getAll<CanvasCourse>('/courses', {
            enrollment_state: 'active',
            include: [
              'total_scores',
              'current_grading_period_scores',
              'syllabus_body',
              'term',
            ],
          }),
        10 // High priority
      );

      const baseUrl = this.ctx.client.getBaseUrl();

      this.ctx.db.transaction(() => {
        // Extract enrollment terms from courses
        const termsMap = new Map<
          number,
          { id: number; name: string; start_at: string | null; end_at: string | null }
        >();

        this.ctx.log?.debug('Processing courses for term extraction...');
        for (const course of courses) {
          if (course.term) {
            if (!termsMap.has(course.term.id)) {
              termsMap.set(course.term.id, {
                id: course.term.id,
                name: course.term.name,
                start_at: course.term.start_at,
                end_at: course.term.end_at,
              });
            }
          } else if (course.enrollment_term_id) {
            if (!termsMap.has(course.enrollment_term_id)) {
              termsMap.set(course.enrollment_term_id, {
                id: course.enrollment_term_id,
                name: `Semester ${course.enrollment_term_id}`,
                start_at: null,
                end_at: null,
              });
            }
          }
        }

        this.ctx.log?.debug(
          `Terms extracted: ${JSON.stringify(Array.from(termsMap.values()))}`
        );

        // Upsert enrollment terms
        for (const [termId, term] of termsMap) {
          this.ctx.db.executeWrite(
            `INSERT INTO enrollment_terms (external_id, name, start_at, end_at) VALUES (?, ?, ?, ?)
             ON CONFLICT(external_id) DO UPDATE SET name = excluded.name, start_at = excluded.start_at, end_at = excluded.end_at`,
            [String(termId), term.name, term.start_at, term.end_at],
            'enrollment_terms'
          );
        }

        const defaultTargetGrade = this.helpers.getDefaultTargetGrade();
        for (const course of courses) {
          try {
            const localCourse = mapCourse(course, baseUrl, defaultTargetGrade);

            const existing = this.ctx.db.executeReadOne<Record<string, unknown>>(
              'SELECT * FROM courses WHERE external_id = ?',
              [localCourse.external_id]
            );

            const { autoResolved, conflicts, preservedFields } =
              this.ctx.conflictResolver.detectConflicts(
                'course',
                'courses',
                (existing?.id as number) || 0,
                localCourse.external_id,
                localCourse.name,
                existing,
                localCourse
              );

            if (conflicts.length > 0) {
              // Don't emit sync-conflicts - conflicts now shown in Updates page
              // TODO: Record to sync_updates table when this code path is used

              for (const conflict of conflicts) {
                const conflictData = { ...localCourse, id: existing?.id };
                this.ctx.pendingConflictData.set(conflict.id, {
                  tableName: 'courses',
                  data: conflictData,
                });
                this.helpers.persistConflictData(conflict.id, 'courses', conflictData);
              }
            }

            const finalData: Record<string, unknown> = { ...localCourse };

            for (const [field, value] of Object.entries(autoResolved)) {
              finalData[field] = value;
            }

            if (existing) {
              for (const field of preservedFields) {
                if (existing[field] !== undefined) {
                  finalData[field] = existing[field];
                }
              }

              for (const conflict of conflicts) {
                if (existing[conflict.field] !== undefined) {
                  finalData[conflict.field] = existing[conflict.field];
                }
              }
            }

            this.ctx.db.upsert(
              'courses',
              finalData,
              'external_id',
              true,
              preservedFields
            );

            // Record a grade-history point whenever the course's overall grade
            // changes between syncs. We compare the value we just wrote against
            // the previously-stored one so the history captures the grade's
            // trajectory (one row per distinct transition) rather than a flat
            // line of identical points on every sync.
            this.recordGradeChange(existing, localCourse.external_id, finalData);

            if (this.ctx.diagnosticsEnabled) {
              this.helpers.logDiagnostic({
                entity: 'course',
                externalId: localCourse.external_id,
                action: existing ? 'update' : 'insert',
                preservedFields:
                  preservedFields.length > 0
                    ? Object.fromEntries(
                        preservedFields.map((f) => [
                          f,
                          { before: existing?.[f], after: finalData[f] },
                        ])
                      )
                    : undefined,
              });
            }

            count++;
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            errors.push(`Course ${course.id}: ${errorMsg}`);
            this.helpers.logDiagnostic({
              entity: 'course',
              externalId: String(course.id),
              action: 'error',
              error: errorMsg,
            });
            this.ctx.emitter.emit('sync-entity-error', {
              entity: 'course',
              externalId: String(course.id),
              error: errorMsg,
            });
          }
        }
      });

      this.helpers.updateSyncMetadata('/courses');
      this.ctx.emitter.emit('sync-entity-complete', { entity: 'courses', count, errors });

      return createSyncResult('courses', count, errors, startTime);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to sync courses: ${message}`);
      this.ctx.emitter.emit('sync-entity-error', {
        entity: 'courses',
        error: message,
        fatal: true,
      });
      return createSyncResult('courses', count, errors, startTime);
    }
  }

  /**
   * Append a row to `grade_history` when a course's overall grade changed since
   * the last sync. No-ops when the new grade is absent (null/non-numeric) or
   * unchanged, so the table accrues exactly one point per distinct grade
   * transition. Runs inside the caller's course-sync transaction.
   */
  private recordGradeChange(
    existing: Record<string, unknown> | undefined,
    externalId: string,
    finalData: Record<string, unknown>
  ): void {
    const next =
      typeof finalData.current_grade === 'number' &&
      Number.isFinite(finalData.current_grade)
        ? finalData.current_grade
        : null;
    if (next === null) return;

    const prev =
      typeof existing?.current_grade === 'number' ? existing.current_grade : null;
    if (next === prev) return;

    // Resolve the local course id. For an update it's already on `existing`;
    // for a first-time insert we look it up by the external id we just wrote.
    let courseId = typeof existing?.id === 'number' ? existing.id : null;
    if (courseId === null) {
      const row = this.ctx.db.executeReadOne<{ id: number }>(
        'SELECT id FROM courses WHERE external_id = ?',
        [externalId]
      );
      courseId = row?.id ?? null;
    }
    if (courseId === null) return;

    this.ctx.db.executeWrite(
      'INSERT INTO grade_history (course_id, grade) VALUES (?, ?)',
      [courseId, next],
      'grade_history'
    );
  }

  /**
   * Auto-archive courses whose enrollment term ended more than
   * `TERM_END_BUFFER_DAYS` ago.
   *
   * The threshold (and the `datetime(...)` comparison form) is deliberately
   * identical to `VisibilityOracle`'s 'auto' term filter so a course is either
   * visible or archived, never both/neither — no limbo gap while final grades
   * post. Previously this fired at `et.end_at < now` (0-day buffer) while the
   * filter hid at term_end + 30d, yanking just-finished courses out of the
   * dashboard average ~30 days early. See ADR-0015.
   *
   * JOIN affinity: `courses.enrollment_term_id` stores Canvas's term id, which
   * sync writes into `enrollment_terms.external_id` (TEXT). The CAST matches the
   * Oracle's join exactly (rather than relying on implicit SQLite affinity).
   */
  autoArchiveExpiredCourses(): { archived: number; errors: string[] } {
    const errors: string[] = [];
    let archived = 0;

    try {
      const now = new Date().toISOString();

      const expiredCourses = this.ctx.db.executeRead<{ id: number; code: string }>(
        `SELECT c.id, c.code
         FROM courses c
         INNER JOIN enrollment_terms et ON c.enrollment_term_id = CAST(et.external_id AS INTEGER)
         WHERE c.archived_at IS NULL
           AND c.deleted_at IS NULL
           AND et.end_at IS NOT NULL
           AND datetime(et.end_at) < datetime('now', '-${TERM_END_BUFFER_DAYS} days')`,
        []
      );

      if (expiredCourses.length === 0) {
        return { archived: 0, errors: [] };
      }

      this.ctx.db.transaction(() => {
        for (const course of expiredCourses) {
          try {
            this.ctx.db.executeWrite(
              `UPDATE courses SET archived_at = ?, archive_source = 'auto', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
              [now, course.id],
              'courses'
            );
            archived++;
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            errors.push(`Course ${course.code}: ${errorMsg}`);
          }
        }
      });

      if (archived > 0) {
        this.ctx.log?.info(
          `Auto-archived ${archived} courses with expired term end dates`
        );
      }

      return { archived, errors };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to auto-archive expired courses: ${message}`);
      return { archived, errors };
    }
  }
}
