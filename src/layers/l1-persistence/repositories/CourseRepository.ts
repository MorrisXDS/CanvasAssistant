/**
 * CourseRepository - Database operations for courses
 *
 * Encapsulates all SQL operations for the courses table.
 */

import type { Database } from '../Database';
import type { Course, CourseDetail } from '../../../shared/ipc-contract';
import { BaseRepository, CourseRow } from './BaseRepository';

export interface CourseUpdates {
  targetGrade?: number;
  assessedGrade?: number | null;
  currentGrade?: number | null;
  color?: string | null;
  nickname?: string | null;
  isHidden?: boolean;
}

export class CourseRepository extends BaseRepository<Course, CourseRow> {
  constructor(db: Database) {
    super(db);
  }

  protected mapRowToEntity(row: CourseRow): Course {
    return {
      id: row.id,
      externalId: row.external_id,
      code: row.code,
      name: row.name,
      targetGrade: row.target_grade,
      assessedGrade: row.assessed_grade,
      currentGrade: row.current_grade,
      color: row.color,
      nickname: row.nickname,
      isHidden: Boolean(row.is_hidden),
      lastSyncedAt: row.last_synced_at,
      enrollmentTermId: row.enrollment_term_id,
    };
  }

  protected mapEntityToRow(entity: Partial<Course>): Record<string, unknown> {
    const row: Record<string, unknown> = {};
    if (entity.targetGrade !== undefined) row.target_grade = entity.targetGrade;
    if (entity.assessedGrade !== undefined) row.assessed_grade = entity.assessedGrade;
    if (entity.currentGrade !== undefined) row.current_grade = entity.currentGrade;
    if (entity.color !== undefined) row.color = entity.color;
    if (entity.nickname !== undefined) row.nickname = entity.nickname;
    if (entity.isHidden !== undefined) row.is_hidden = entity.isHidden ? 1 : 0;
    return row;
  }

  /**
   * Find all courses, ordered by name.
   */
  findAll(): Course[] {
    return this.queryAll<CourseRow>('SELECT * FROM courses ORDER BY name');
  }

  /**
   * Find a course by its internal ID.
   */
  findById(id: number): Course | null {
    return this.queryOne<CourseRow>('SELECT * FROM courses WHERE id = ?', [id]);
  }

  /**
   * Find a course by its Canvas external ID.
   */
  findByExternalId(externalId: string): Course | null {
    return this.queryOne<CourseRow>('SELECT * FROM courses WHERE external_id = ?', [externalId]);
  }

  /**
   * Find courses by enrollment term.
   */
  findByTermId(termId: number): Course[] {
    return this.queryAll<CourseRow>(
      'SELECT * FROM courses WHERE enrollment_term_id = ? ORDER BY name',
      [termId]
    );
  }

  /**
   * Find visible (non-hidden) courses.
   */
  findVisible(): Course[] {
    return this.queryAll<CourseRow>(
      'SELECT * FROM courses WHERE is_hidden = 0 ORDER BY name'
    );
  }

  /**
   * Get detailed course information including syllabus.
   */
  findDetailById(id: number): CourseDetail | null {
    const row = this.db.executeReadOne<CourseRow>(
      'SELECT * FROM courses WHERE id = ?',
      [id]
    );

    if (!row) return null;

    return {
      ...this.mapRowToEntity(row),
      totalWeight: row.total_weight,
      syllabusBody: row.syllabus_body,
    };
  }

  /**
   * Update a course and return the updated entity.
   */
  update(id: number, updates: CourseUpdates): Course | null {
    const mappedUpdates: Record<string, unknown> = {};

    if (updates.targetGrade !== undefined) mappedUpdates.target_grade = updates.targetGrade;
    if (updates.assessedGrade !== undefined) mappedUpdates.assessed_grade = updates.assessedGrade;
    if (updates.currentGrade !== undefined) mappedUpdates.current_grade = updates.currentGrade;
    if (updates.color !== undefined) mappedUpdates.color = updates.color;
    if (updates.nickname !== undefined) mappedUpdates.nickname = updates.nickname;
    if (updates.isHidden !== undefined) mappedUpdates.is_hidden = updates.isHidden ? 1 : 0;

    const keys = Object.keys(mappedUpdates);
    if (keys.length === 0) {
      return this.findById(id);
    }

    const setClause = keys.map((key) => `${key} = ?`).join(', ');
    const values = [...Object.values(mappedUpdates), id];

    this.db.executeWrite(
      `UPDATE courses SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      values,
      'courses'
    );

    return this.findById(id);
  }

  /**
   * Get the target grade for a course.
   */
  getTargetGrade(id: number): number | null {
    const row = this.db.executeReadOne<{ target_grade: number }>(
      'SELECT target_grade FROM courses WHERE id = ?',
      [id]
    );
    return row?.target_grade ?? null;
  }

  /**
   * Update the assessed grade for a course.
   */
  updateAssessedGrade(id: number, assessedGrade: number | null): void {
    this.db.executeWrite(
      'UPDATE courses SET assessed_grade = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [assessedGrade, id],
      'courses'
    );
  }

  /**
   * Check if a course exists.
   */
  exists(id: number): boolean {
    const row = this.db.executeReadOne<{ id: number }>(
      'SELECT id FROM courses WHERE id = ?',
      [id]
    );
    return row !== null;
  }

  /**
   * Mark a field as locally modified.
   * This is used for sync conflict detection.
   */
  markFieldModified(id: number, field: string): void {
    const row = this.db.executeReadOne<{ local_modified_fields: string | null }>(
      'SELECT local_modified_fields FROM courses WHERE id = ?',
      [id]
    );

    const modified = new Set<string>(
      row?.local_modified_fields ? JSON.parse(row.local_modified_fields) : []
    );
    modified.add(field);

    this.db.executeWrite(
      'UPDATE courses SET local_modified_fields = ? WHERE id = ?',
      [JSON.stringify(Array.from(modified)), id],
      'courses'
    );
  }
}
