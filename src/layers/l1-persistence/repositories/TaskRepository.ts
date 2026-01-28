/**
 * TaskRepository - Database operations for tasks
 *
 * Encapsulates all SQL operations for the tasks table.
 */

import type { Database } from '../Database';
import type { Task } from '../../../shared/ipc-contract';
import { BaseRepository, TaskRow } from './BaseRepository';

export interface TaskUpdates {
  title?: string;
  description?: string | null;
  dueAt?: string | null;
  weight?: number;
  grade?: number | null;
  pointsPossible?: number | null;
  priorityScore?: number;
  isCompleted?: boolean;
  completedAt?: string | null;
  submissionStatus?: string | null;
  taskType?: string | null;
  taskGroupId?: number | null;
}

export interface CreateTaskParams {
  externalId: string;
  courseId: number;
  title: string;
  description?: string | null;
  dueAt?: string | null;
  weight?: number;
  grade?: number | null;
  pointsPossible?: number | null;
  priorityScore?: number;
  isCompleted?: boolean;
  taskType?: string | null;
  taskGroupId?: number | null;
}

export class TaskRepository extends BaseRepository<Task, TaskRow> {
  constructor(db: Database) {
    super(db);
  }

  /**
   * Calculate effective submission status using OR logic.
   * If either Canvas or user status is 'graded' or 'submitted', use that.
   */
  private getEffectiveSubmissionStatus(
    canvasStatus: string | null,
    userStatus: string | null
  ): string | null {
    if (canvasStatus === 'graded' || userStatus === 'graded') return 'graded';
    if (canvasStatus === 'submitted' || userStatus === 'submitted') return 'submitted';
    return canvasStatus ?? userStatus ?? 'pending';
  }

  protected mapRowToEntity(row: TaskRow): Task {
    // Parse field_sources JSON if present
    let fieldSources: Record<string, 'canvas' | 'user' | 'guessed'> | undefined;
    if (row.field_sources) {
      try {
        fieldSources = JSON.parse(row.field_sources);
      } catch {
        // Invalid JSON, ignore
      }
    }

    const userSubmissionStatus = row.user_submission_status ?? null;
    const effectiveStatus = this.getEffectiveSubmissionStatus(
      row.submission_status,
      userSubmissionStatus
    );

    return {
      id: row.id,
      externalId: row.external_id,
      courseId: row.course_id,
      title: row.title,
      description: row.description,
      dueAt: row.due_at,
      dueTimeKnown: Boolean(row.due_time_known ?? 1),
      weight: row.weight,
      grade: row.grade,
      pointsPossible: row.points_possible,
      priorityScore: row.priority_score,
      isCompleted: Boolean(row.is_completed),
      isOptional: Boolean(row.is_optional),
      completedAt: row.completed_at,
      submissionStatus: row.submission_status,
      userSubmissionStatus,
      effectiveSubmissionStatus: effectiveStatus,
      taskType: row.task_type,
      taskGroupId: row.task_group_id,
      calendarEventId: row.calendar_event_id ?? null,
      fieldSources,
    };
  }

  protected mapEntityToRow(_entity: Partial<Task>): Record<string, unknown> {
    // Not used directly, but required by base class
    return {};
  }

  /**
   * Find all tasks, ordered by priority score descending.
   */
  findAll(): Task[] {
    return this.queryAll<TaskRow>('SELECT * FROM tasks ORDER BY priority_score DESC');
  }

  /**
   * Find a task by its internal ID.
   */
  findById(id: number): Task | null {
    return this.queryOne<TaskRow>('SELECT * FROM tasks WHERE id = ?', [id]);
  }

  /**
   * Find a task by its Canvas external ID.
   */
  findByExternalId(externalId: string): Task | null {
    return this.queryOne<TaskRow>('SELECT * FROM tasks WHERE external_id = ?', [
      externalId,
    ]);
  }

  /**
   * Find tasks for a specific course.
   */
  findByCourseId(courseId: number): Task[] {
    return this.queryAll<TaskRow>(
      'SELECT * FROM tasks WHERE course_id = ? ORDER BY priority_score DESC',
      [courseId]
    );
  }

  /**
   * Find incomplete tasks for a course.
   */
  findIncompleteByCourseId(courseId: number): Task[] {
    return this.queryAll<TaskRow>(
      'SELECT * FROM tasks WHERE course_id = ? AND is_completed = 0 ORDER BY priority_score DESC',
      [courseId]
    );
  }

  /**
   * Find completed tasks for a course with grades.
   */
  findCompletedWithGrades(courseId: number): Task[] {
    return this.queryAll<TaskRow>(
      'SELECT * FROM tasks WHERE course_id = ? AND is_completed = 1 AND grade IS NOT NULL ORDER BY completed_at DESC',
      [courseId]
    );
  }

  /**
   * Create a new task and return it.
   */
  create(params: CreateTaskParams): Task {
    const result = this.db.executeWrite(
      `INSERT INTO tasks (
        external_id, course_id, title, description, due_at, weight,
        grade, points_possible, priority_score, is_completed, task_type, task_group_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.externalId,
        params.courseId,
        params.title,
        params.description ?? null,
        params.dueAt ?? null,
        params.weight ?? 0,
        params.grade ?? null,
        params.pointsPossible ?? null,
        params.priorityScore ?? 0,
        params.isCompleted ? 1 : 0,
        params.taskType ?? null,
        params.taskGroupId ?? null,
      ],
      'tasks'
    );

    return this.findById(result.lastInsertRowid as number)!;
  }

  /**
   * Update a task and return the updated entity.
   * Automatically marks task as complete if weight > 0 and grade is set.
   */
  update(id: number, updates: TaskUpdates): Task | null {
    const mappedUpdates: Record<string, unknown> = {};

    if (updates.title !== undefined) mappedUpdates.title = updates.title;
    if (updates.description !== undefined)
      mappedUpdates.description = updates.description;
    if (updates.dueAt !== undefined) mappedUpdates.due_at = updates.dueAt;
    if (updates.weight !== undefined) mappedUpdates.weight = updates.weight;
    if (updates.grade !== undefined) mappedUpdates.grade = updates.grade;
    if (updates.pointsPossible !== undefined)
      mappedUpdates.points_possible = updates.pointsPossible;
    if (updates.priorityScore !== undefined)
      mappedUpdates.priority_score = updates.priorityScore;
    if (updates.isCompleted !== undefined)
      mappedUpdates.is_completed = updates.isCompleted ? 1 : 0;
    if (updates.completedAt !== undefined)
      mappedUpdates.completed_at = updates.completedAt;
    if (updates.submissionStatus !== undefined)
      mappedUpdates.submission_status = updates.submissionStatus;
    if (updates.taskType !== undefined) mappedUpdates.task_type = updates.taskType;
    if (updates.taskGroupId !== undefined)
      mappedUpdates.task_group_id = updates.taskGroupId;

    const keys = Object.keys(mappedUpdates);
    if (keys.length === 0) {
      return this.findById(id);
    }

    const setClause = keys.map((key) => `${key} = ?`).join(', ');
    const values = [...Object.values(mappedUpdates), id];

    this.db.executeWrite(
      `UPDATE tasks SET ${setClause}, local_modified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      values,
      'tasks'
    );

    const task = this.findById(id);

    // Auto-complete if task now has weight > 0 and grade set, and isn't already completed
    // Only do this if we're not explicitly setting isCompleted in this update
    if (
      task &&
      updates.isCompleted === undefined &&
      task.weight > 0 &&
      task.grade !== null &&
      !task.isCompleted
    ) {
      this.db.executeWrite(
        `UPDATE tasks SET is_completed = 1, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [id],
        'tasks'
      );
      return this.findById(id);
    }

    return task;
  }

  /**
   * Mark a task as complete/incomplete.
   */
  setCompleted(id: number, isCompleted: boolean): Task | null {
    const completedAt = isCompleted ? new Date().toISOString() : null;
    return this.update(id, { isCompleted, completedAt });
  }

  /**
   * Update the grade for a task.
   * Automatically marks task as complete if weight > 0 and grade is set.
   */
  setGrade(id: number, grade: number | null): Task | null {
    const task = this.update(id, { grade });

    // Auto-complete if task has weight > 0 and grade is now set
    if (task && grade !== null && task.weight > 0 && !task.isCompleted) {
      return this.setCompleted(id, true);
    }

    return task;
  }

  /**
   * Delete a task.
   */
  delete(id: number): boolean {
    const result = this.db.executeWrite('DELETE FROM tasks WHERE id = ?', [id], 'tasks');
    return result.changes > 0;
  }

  /**
   * Delete a task by external ID.
   */
  deleteByExternalId(externalId: string): boolean {
    const result = this.db.executeWrite(
      'DELETE FROM tasks WHERE external_id = ?',
      [externalId],
      'tasks'
    );
    return result.changes > 0;
  }

  /**
   * Check if a task exists.
   */
  exists(id: number): boolean {
    const row = this.db.executeReadOne<{ id: number }>(
      'SELECT id FROM tasks WHERE id = ?',
      [id]
    );
    return row !== undefined;
  }

  /**
   * Get the course ID for a task.
   */
  getCourseId(id: number): number | null {
    const row = this.db.executeReadOne<{ course_id: number }>(
      'SELECT course_id FROM tasks WHERE id = ?',
      [id]
    );
    return row?.course_id ?? null;
  }

  /**
   * Get weighted grade data for grade calculation.
   */
  getGradeData(courseId: number): { weightedSum: number; totalWeight: number } {
    const result = this.db.executeReadOne<{
      weighted_sum: number;
      total_weight: number;
    }>(
      `SELECT
         COALESCE(SUM(CASE WHEN grade IS NOT NULL THEN grade * weight ELSE 0 END), 0) as weighted_sum,
         COALESCE(SUM(CASE WHEN grade IS NOT NULL THEN weight ELSE 0 END), 0) as total_weight
       FROM tasks
       WHERE course_id = ? AND is_completed = 1`,
      [courseId]
    );

    return {
      weightedSum: result?.weighted_sum ?? 0,
      totalWeight: result?.total_weight ?? 0,
    };
  }

  /**
   * Mark a field as locally modified.
   * This is used for sync conflict detection.
   */
  markFieldModified(id: number, field: string): void {
    const row = this.db.executeReadOne<{ local_modified_fields: string | null }>(
      'SELECT local_modified_fields FROM tasks WHERE id = ?',
      [id]
    );

    const modified = new Set<string>(
      row?.local_modified_fields ? JSON.parse(row.local_modified_fields) : []
    );
    modified.add(field);

    this.db.executeWrite(
      'UPDATE tasks SET local_modified_fields = ? WHERE id = ?',
      [JSON.stringify(Array.from(modified)), id],
      'tasks'
    );
  }
}
