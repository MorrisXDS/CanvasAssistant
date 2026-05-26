/**
 * Sync Task Operations
 * Handles task/assignment synchronization from Canvas to local database.
 */

import type { SyncOperationContext, SyncOperationHelpers } from '../SyncOperationContext';
import { createSyncResult } from '../SyncOperationContext';
import type { SyncResult } from '../SyncEngineTypes';
import { CanvasAssignment, mapAssignment } from '../../data/DataMappers';

export class SyncTaskOperations {
  constructor(
    private ctx: SyncOperationContext,
    private helpers: SyncOperationHelpers
  ) {}

  /**
   * Sync tasks (assignments) for a specific course
   */
  async syncTasks(canvasCourseId: number, localCourseId: number): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let count = 0;

    this.ctx.log?.info('[SyncTaskOps] syncTasks START', {
      canvasCourseId,
      localCourseId,
    });

    const courseSettings = this.helpers.getCourseSettings(localCourseId);
    const todayEndTime = this.helpers.getTodayEndTime();

    const courseRow = this.ctx.db.executeReadOne<{ name: string }>(
      'SELECT name FROM courses WHERE id = ?',
      [localCourseId]
    );
    const courseName = courseRow?.name;

    try {
      const assignments = await this.ctx.rateLimiter.enqueue(
        () =>
          this.ctx.client.getAll<CanvasAssignment>(
            `/courses/${canvasCourseId}/assignments`,
            {
              order_by: 'due_at',
            }
          ),
        5
      );

      this.ctx.log?.info('[SyncTaskOps] Fetched assignments', {
        courseId: localCourseId,
        count: assignments.length,
        titles: assignments.slice(0, 5).map((a) => a.name),
      });

      this.ctx.db.transaction(() => {
        for (const assignment of assignments) {
          try {
            const localTask = mapAssignment(assignment, localCourseId);

            const titleMatches = this.ctx.db.executeRead<{
              id: number;
              source_type: string;
              weight: number;
              priority_score: number;
              local_modified_at: string | null;
            }>(
              "SELECT id, source_type, weight, priority_score, local_modified_at FROM tasks WHERE course_id = ? AND title = ? AND external_id IS NULL AND source_type = 'user'",
              [localCourseId, localTask.title]
            );

            // Only auto-link by title when the match is unambiguous. Two user
            // tasks sharing a title in one course can't be safely linked to a
            // single Canvas assignment, so skip the merge and let the
            // external_id / conflict path queue it instead of merging an
            // arbitrary (SQLite-order-dependent) one.
            if (titleMatches.length > 1) {
              this.ctx.log?.warn(
                '[SyncTaskOps] Ambiguous title match; skipping auto-merge',
                {
                  courseId: localCourseId,
                  title: localTask.title,
                  matches: titleMatches.length,
                }
              );
            }

            const existingByTitle = titleMatches.length === 1 ? titleMatches[0] : null;

            if (existingByTitle) {
              this.ctx.db.executeWrite(
                `UPDATE tasks SET
                  external_id = ?,
                  source_type = 'canvas',
                  description = COALESCE(?, description),
                  due_at = COALESCE(?, due_at),
                  unlock_at = COALESCE(?, unlock_at),
                  points_possible = COALESCE(?, points_possible),
                  submission_types = COALESCE(?, submission_types),
                  is_completed = ?,
                  updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
                [
                  localTask.external_id,
                  localTask.description,
                  localTask.due_at,
                  localTask.unlock_at,
                  localTask.points_possible,
                  localTask.submission_types,
                  localTask.is_completed,
                  existingByTitle.id,
                ],
                'tasks'
              );

              this.ctx.emitter.emit('task-merged', {
                localTaskId: existingByTitle.id,
                canvasId: assignment.id,
                title: localTask.title,
              });
            } else {
              const existing = this.ctx.db.executeReadOne<Record<string, unknown>>(
                'SELECT * FROM tasks WHERE external_id = ?',
                [localTask.external_id]
              );

              const { autoResolved, conflicts, preservedFields } =
                this.ctx.conflictResolver.detectConflicts(
                  'task',
                  'tasks',
                  (existing?.id as number) || 0,
                  localTask.external_id,
                  localTask.title,
                  existing,
                  localTask,
                  {
                    allowGuessedOverride: courseSettings.allowGuessedOverride,
                    courseName,
                    courseId: localCourseId,
                  }
                );

              if (conflicts.length > 0) {
                this.ctx.log?.info(
                  `[SyncTaskOps] Conflicts detected (deferred to Updates page)`,
                  {
                    count: conflicts.length,
                    taskId: existing?.id,
                  }
                );
                // Don't emit sync-conflicts - conflicts now shown in Updates page
                // TODO: Record to sync_updates table when this code path is used

                for (const conflict of conflicts) {
                  const conflictData = { ...localTask, id: existing?.id };
                  this.ctx.pendingConflictData.set(conflict.id, {
                    tableName: 'tasks',
                    data: conflictData,
                  });
                  this.helpers.persistConflictData(conflict.id, 'tasks', conflictData);
                }
              }

              const finalData: Record<string, unknown> = { ...localTask };

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

              let autoAssignedDueDate = false;

              if (courseSettings.autoAssignDueDate && !finalData.due_at) {
                const existingModified = existing?.local_modified_fields as string | null;
                const modifiedFields = existingModified
                  ? JSON.parse(existingModified)
                  : [];
                const fieldSources = existing?.field_sources
                  ? JSON.parse(existing.field_sources as string)
                  : {};
                const userSetDueDate =
                  modifiedFields.includes('due_at') || fieldSources.due_at === 'user';

                if (!userSetDueDate) {
                  autoAssignedDueDate = true;
                  finalData.due_at = todayEndTime;
                } else if (existing?.due_at) {
                  finalData.due_at = existing.due_at;
                }
              }

              this.ctx.db.upsert(
                'tasks',
                finalData,
                'external_id',
                true,
                preservedFields
              );

              if (autoAssignedDueDate) {
                const row = this.ctx.db.executeReadOne<{ id: number }>(
                  'SELECT id FROM tasks WHERE external_id = ?',
                  [localTask.external_id]
                );
                if (row) {
                  this.ctx.conflictResolver.setFieldSource(
                    'tasks',
                    row.id,
                    'due_at',
                    'guessed'
                  );
                }
              }

              if (this.ctx.diagnosticsEnabled) {
                this.helpers.logDiagnostic({
                  entity: 'task',
                  externalId: localTask.external_id,
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
            }

            count++;
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            errors.push(`Task ${assignment.id}: ${errorMsg}`);
            this.ctx.emitter.emit('sync-entity-error', {
              entity: 'task',
              externalId: String(assignment.id),
              courseId: canvasCourseId,
              error: errorMsg,
            });
          }
        }
      });

      this.autoCompleteGradedTasks(localCourseId);
      this.helpers.updateSyncMetadata(`/courses/${canvasCourseId}/assignments`);

      this.ctx.emitter.emit('sync-entity-complete', {
        entity: 'tasks',
        count,
        errors,
        courseId: canvasCourseId,
      });

      return createSyncResult('tasks', count, errors, startTime);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to sync tasks for course ${canvasCourseId}: ${message}`);
      this.ctx.emitter.emit('sync-entity-error', {
        entity: 'tasks',
        courseId: canvasCourseId,
        error: message,
        fatal: true,
      });
      return createSyncResult('tasks', count, errors, startTime);
    }
  }

  /**
   * Auto-complete tasks that have both weight > 0 and grade set.
   * Respects local_modified_fields - if user explicitly marked a task as incomplete,
   * we don't auto-complete it even if it has a grade.
   */
  autoCompleteGradedTasks(courseId?: number): void {
    // Only auto-complete tasks where user hasn't explicitly modified is_completed
    const whereClause = courseId
      ? `WHERE course_id = ? AND weight > 0 AND grade IS NOT NULL AND is_completed = 0
         AND (
           local_modified_fields IS NULL
           OR NOT json_valid(local_modified_fields)
           OR NOT EXISTS (
             SELECT 1 FROM json_each(local_modified_fields)
             WHERE value = 'is_completed'
           )
         )`
      : `WHERE weight > 0 AND grade IS NOT NULL AND is_completed = 0
         AND (
           local_modified_fields IS NULL
           OR NOT json_valid(local_modified_fields)
           OR NOT EXISTS (
             SELECT 1 FROM json_each(local_modified_fields)
             WHERE value = 'is_completed'
           )
         )`;
    const params = courseId ? [courseId] : [];

    const result = this.ctx.db.executeWrite(
      `UPDATE tasks SET
        is_completed = 1,
        completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
        updated_at = CURRENT_TIMESTAMP
      ${whereClause}`,
      params,
      'tasks'
    );

    if (result.changes > 0) {
      this.ctx.emitter.emit('tasks-auto-completed', { count: result.changes, courseId });
    }
  }

  /**
   * Calculate event start/end times from a task's due date.
   */
  private calculateEventTimes(dueAt: Date): { start: Date; end: Date } {
    const start = new Date(0); // Unix epoch as sentinel
    const end = new Date(dueAt);
    return { start, end };
  }

  /**
   * Sync calendar events for all tasks.
   */
  syncTaskCalendarEvents(): { created: number; updated: number; errors: string[] } {
    const errors: string[] = [];
    let created = 0;
    let updated = 0;

    try {
      const tasks = this.ctx.db.executeRead<{
        id: number;
        title: string;
        description: string | null;
        due_at: string | null;
        due_time_known: number;
        course_id: number;
        calendar_event_id: number | null;
      }>(
        `SELECT t.id, t.title, t.description, t.due_at, t.due_time_known, t.course_id, t.calendar_event_id
         FROM tasks t
         WHERE t.is_completed = 0`
      );

      const courseTerms = this.ctx.db.executeRead<{
        course_id: number;
        term_end_at: string | null;
      }>(
        `SELECT c.id as course_id, et.end_at as term_end_at
         FROM courses c
         LEFT JOIN enrollment_terms et ON c.enrollment_term_id = et.external_id`
      );
      const termEndByCoursId = new Map(
        courseTerms.map((ct) => [ct.course_id, ct.term_end_at])
      );

      this.ctx.db.transaction(() => {
        // Cleanup orphaned calendar events
        const orphanedCleanup = this.ctx.db.executeWrite(
          `DELETE FROM calendar_events
           WHERE task_id IS NULL
             AND uid LIKE 'task-%@cid'`,
          [],
          'calendar_events'
        );
        if (orphanedCleanup.changes > 0) {
          this.ctx.log?.info(
            `Cleaned up ${orphanedCleanup.changes} orphaned task calendar events`
          );
        }

        for (const task of tasks) {
          try {
            let dueDate: Date | null = null;

            if (task.due_at) {
              dueDate = new Date(task.due_at);
            } else {
              const termEndAt = termEndByCoursId.get(task.course_id);
              if (termEndAt) {
                dueDate = new Date(termEndAt);
                dueDate.setDate(dueDate.getDate() - 31);
              } else {
                dueDate = new Date();
                dueDate.setDate(dueDate.getDate() + 30);
              }
            }

            const isAllDay = task.due_time_known === 0;
            let startAt: string;
            let endAt: string;

            if (isAllDay) {
              startAt = dueDate.toISOString().split('T')[0] + 'T00:00:00.000Z';
              endAt = startAt;
            } else {
              const { start, end } = this.calculateEventTimes(dueDate);
              startAt = start.toISOString();
              endAt = end.toISOString();
            }

            const uid = `task-${task.id}@cid`;
            const epochStart = new Date(0).toISOString();

            if (task.calendar_event_id) {
              // Check if user has set a custom start time (non-epoch)
              // If so, preserve it; otherwise use epoch for deadline events
              const existingEvent = this.ctx.db.executeReadOne<{ start_at: string }>(
                'SELECT start_at FROM calendar_events WHERE id = ?',
                [task.calendar_event_id]
              );
              const preserveStart =
                existingEvent &&
                existingEvent.start_at &&
                new Date(existingEvent.start_at).getTime() >= 86400000; // > 1 day from epoch = user-set

              this.ctx.db.executeWrite(
                `UPDATE calendar_events SET
                   title = ?,
                   description = ?,
                   start_at = ?,
                   end_at = ?,
                   all_day = ?,
                   updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [
                  task.title,
                  task.description,
                  preserveStart ? existingEvent!.start_at : epochStart,
                  endAt,
                  isAllDay ? 1 : 0,
                  task.calendar_event_id,
                ],
                'calendar_events'
              );
              updated++;
            } else {
              const existing = this.ctx.db.executeReadOne<{
                id: number;
                start_at: string;
              }>('SELECT id, start_at FROM calendar_events WHERE task_id = ?', [task.id]);

              if (existing) {
                // Preserve user-set start time (non-epoch)
                const preserveStart =
                  existing.start_at && new Date(existing.start_at).getTime() >= 86400000;

                this.ctx.db.executeWrite(
                  `UPDATE calendar_events SET
                     title = ?,
                     description = ?,
                     start_at = ?,
                     end_at = ?,
                     all_day = ?,
                     updated_at = CURRENT_TIMESTAMP
                   WHERE id = ?`,
                  [
                    task.title,
                    task.description,
                    preserveStart ? existing.start_at : epochStart,
                    endAt,
                    isAllDay ? 1 : 0,
                    existing.id,
                  ],
                  'calendar_events'
                );
                this.ctx.db.executeWrite(
                  'UPDATE tasks SET calendar_event_id = ? WHERE id = ?',
                  [existing.id, task.id],
                  'tasks'
                );
                updated++;
              } else {
                // New calendar event for task - use epoch as default (deadline event)
                const result = this.ctx.db.executeWrite(
                  `INSERT INTO calendar_events (
                     source_type, course_id, task_id, title, description,
                     start_at, end_at, all_day, uid, created_at, updated_at
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                  [
                    'user',
                    task.course_id,
                    task.id,
                    task.title,
                    task.description,
                    epochStart, // Use epoch for deadline events by default
                    endAt,
                    isAllDay ? 1 : 0,
                    uid,
                  ],
                  'calendar_events'
                );

                const eventId = result.lastInsertRowid as number;
                this.ctx.db.executeWrite(
                  'UPDATE tasks SET calendar_event_id = ? WHERE id = ?',
                  [eventId, task.id],
                  'tasks'
                );
                created++;
              }
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            errors.push(`Task ${task.id}: ${errorMsg}`);
          }
        }
      });

      this.ctx.log?.info(
        `Synced task calendar events: ${created} created, ${updated} updated, ${errors.length} errors`
      );

      return { created, updated, errors };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to sync task calendar events: ${message}`);
      return { created, updated, errors };
    }
  }
}
