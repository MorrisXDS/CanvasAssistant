/**
 * TaskSyncStrategy - Handles syncing tasks/assignments from Canvas
 *
 * Extracted from SyncEngine to reduce complexity.
 *
 * Queue System (v89+):
 * New Canvas tasks are staged in canvas_task_queue for user review.
 * Decision flow:
 * 1. Existing accepted task? → Update grades/status only
 * 2. Rejected in queue? → Update metadata, don't resurface
 * 3. Course auto-accept enabled? → Create task directly
 * 4. Matching user task with auto-merge? → Merge and accept automatically
 * 5. Otherwise → Insert/update canvas_task_queue
 */

import { BaseSyncStrategy, SyncResult, SyncContext } from './SyncStrategy';
import {
  mapAssignment,
  mapAssignmentToQueueEntry,
  CanvasAssignment,
} from '../DataMappers';
import { SyncConflictResolver } from '../SyncConflictResolver';
import { TaskMatcher, type TaskForMatching } from './TaskMatcher';

export interface TaskSyncOptions {
  /** Conflict resolver instance */
  conflictResolver: SyncConflictResolver;
  /** Enable diagnostic logging */
  diagnosticsEnabled?: boolean;
  /** Callback for diagnostic entries */
  onDiagnostic?: (entry: TaskDiagnosticEntry) => void;
  /** Callback for task merge events */
  onTaskMerged?: (event: TaskMergedEvent) => void;
  /** Callback for sync conflicts */
  onConflicts?: (conflicts: unknown[]) => void;
  /** Store pending conflict data */
  pendingConflictData?: Map<string, { tableName: string; data: Record<string, unknown> }>;
  /** Callback when tasks are queued for user review */
  onTasksQueued?: (count: number, courseId: number) => void;
}

/** Auto-accept setting values for courses */
export const AUTO_ACCEPT_MODE = {
  QUEUE_ALL: 0, // Queue all new Canvas tasks for review
  AUTO_ACCEPT_ALL: 1, // Accept all new Canvas tasks automatically
  AUTO_ACCEPT_IF_MATCH: 2, // Auto-accept only if matching user task exists
} as const;

export interface TaskDiagnosticEntry {
  entity: 'task';
  externalId: string;
  action: 'insert' | 'update';
  preservedFields?: Record<string, { before: unknown; after: unknown }>;
}

export interface TaskMergedEvent {
  localTaskId: number;
  canvasId: number;
  title: string;
}

export class TaskSyncStrategy extends BaseSyncStrategy {
  readonly entityType = 'tasks';

  private conflictResolver: SyncConflictResolver;
  private diagnosticsEnabled: boolean;
  private onDiagnostic?: (entry: TaskDiagnosticEntry) => void;
  private onTaskMerged?: (event: TaskMergedEvent) => void;
  private onConflicts?: (conflicts: unknown[]) => void;
  private pendingConflictData?: Map<
    string,
    { tableName: string; data: Record<string, unknown> }
  >;
  private onTasksQueued?: (count: number, courseId: number) => void;
  private taskMatcher: TaskMatcher;

  constructor(context: SyncContext, options: TaskSyncOptions) {
    super(context);
    this.conflictResolver = options.conflictResolver;
    this.diagnosticsEnabled = options.diagnosticsEnabled ?? false;
    this.onDiagnostic = options.onDiagnostic;
    this.onTaskMerged = options.onTaskMerged;
    this.onConflicts = options.onConflicts;
    this.pendingConflictData = options.pendingConflictData;
    this.onTasksQueued = options.onTasksQueued;
    this.taskMatcher = new TaskMatcher();
  }

  async syncForCourse(
    canvasCourseId: number,
    localCourseId: number
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let count = 0;
    let queuedCount = 0;

    // Get course info for conflict display and auto-accept setting
    const courseRow = this.db.executeReadOne<{
      name: string;
      auto_accept_canvas_tasks: number | null;
    }>('SELECT name, auto_accept_canvas_tasks FROM courses WHERE id = ?', [
      localCourseId,
    ]);
    const courseName = courseRow?.name;
    const autoAcceptMode =
      courseRow?.auto_accept_canvas_tasks ?? AUTO_ACCEPT_MODE.QUEUE_ALL;

    try {
      const assignments = await this.rateLimiter.enqueue(
        () =>
          this.client.getAll<CanvasAssignment>(`/courses/${canvasCourseId}/assignments`, {
            order_by: 'due_at',
            'include[]': 'submission',
          }),
        5 // Medium priority
      );

      // Get user tasks for potential matching (only if we might need to match)
      const userTasks =
        autoAcceptMode === AUTO_ACCEPT_MODE.AUTO_ACCEPT_IF_MATCH ||
        autoAcceptMode === AUTO_ACCEPT_MODE.QUEUE_ALL
          ? this.getUserTasksForMatching(localCourseId)
          : [];

      this.db.transaction(() => {
        for (const assignment of assignments) {
          try {
            const externalId = String(assignment.id);

            // === DECISION POINT 1: Already accepted task? ===
            // Check if this Canvas assignment already has an accepted task
            const acceptedTask = this.db.executeReadOne<{
              id: number;
              acceptance_method: string | null;
            }>(
              `SELECT id, acceptance_method FROM tasks
               WHERE external_id = ? AND acceptance_method IS NOT NULL`,
              [externalId]
            );

            if (acceptedTask) {
              // Already accepted - update grades/status only (not the full task)
              this.updateAcceptedTaskGrades(assignment, acceptedTask.id);
              count++;
              continue;
            }

            // === DECISION POINT 2: Rejected in queue? ===
            const queueEntry = this.db.executeReadOne<{
              id: number;
              status: string;
            }>('SELECT id, status FROM canvas_task_queue WHERE external_id = ?', [
              externalId,
            ]);

            if (queueEntry?.status === 'rejected') {
              // Rejected - update queue metadata but don't create task
              this.updateQueueEntry(assignment, queueEntry.id);
              count++;
              continue;
            }

            // === DECISION POINT 3: Legacy task (pre-queue system)? ===
            // Check for existing task by external_id (legacy or manually created)
            const existingTask = this.db.executeReadOne<Record<string, unknown>>(
              'SELECT * FROM tasks WHERE external_id = ?',
              [externalId]
            );

            if (existingTask) {
              // Legacy task - treat as accepted, update with full sync logic
              this.syncExistingTask(assignment, existingTask, localCourseId, courseName);
              count++;
              continue;
            }

            // === DECISION POINT 4: Check for matching user task by title ===
            const existingByTitle = this.db.executeReadOne<{
              id: number;
              source_type: string;
              title: string;
              due_at: string | null;
            }>(
              `SELECT id, source_type, title, due_at FROM tasks
               WHERE course_id = ? AND title = ? AND external_id IS NULL AND source_type = 'user'`,
              [localCourseId, assignment.name]
            );

            if (existingByTitle) {
              // Exact title match with user task - merge directly (existing behavior)
              this.mergeUserTaskWithCanvas(assignment, existingByTitle.id, localCourseId);
              count++;
              continue;
            }

            // === DECISION POINT 5: Auto-accept mode? ===
            if (autoAcceptMode === AUTO_ACCEPT_MODE.AUTO_ACCEPT_ALL) {
              // Create task directly, mark as auto-accepted
              this.createAcceptedTask(assignment, localCourseId, 'auto');
              count++;
              continue;
            }

            // === DECISION POINT 6: Auto-accept with matching? ===
            if (autoAcceptMode === AUTO_ACCEPT_MODE.AUTO_ACCEPT_IF_MATCH) {
              const match = this.findMatchingUserTask(assignment, userTasks);
              if (match && this.taskMatcher.shouldAutoLink(match.confidence)) {
                // High-confidence match - auto-merge
                this.mergeUserTaskWithCanvas(
                  assignment,
                  match.canvasTaskId!,
                  localCourseId
                );
                count++;
                continue;
              }
            }

            // === DECISION POINT 7: Queue for user review ===
            // Check for fuzzy matching user task
            const fuzzyMatch = this.findMatchingUserTask(assignment, userTasks);

            // Create or update queue entry
            const queueData = mapAssignmentToQueueEntry(
              assignment,
              localCourseId,
              fuzzyMatch?.canvasTaskId,
              fuzzyMatch?.confidence
            );

            if (queueEntry) {
              // Update existing pending queue entry
              this.db.executeWrite(
                `UPDATE canvas_task_queue SET
                  canvas_data = ?,
                  title = ?,
                  description = ?,
                  due_at = ?,
                  points_possible = ?,
                  task_type = ?,
                  matched_user_task_id = ?,
                  match_confidence = ?,
                  last_synced_at = CURRENT_TIMESTAMP,
                  updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
                [
                  queueData.canvas_data,
                  queueData.title,
                  queueData.description,
                  queueData.due_at,
                  queueData.points_possible,
                  queueData.task_type,
                  queueData.matched_user_task_id,
                  queueData.match_confidence,
                  queueEntry.id,
                ],
                'canvas_task_queue'
              );
            } else {
              // Insert new queue entry
              this.db.upsert('canvas_task_queue', queueData, 'external_id', true);
              queuedCount++;
            }

            count++;
          } catch (error) {
            errors.push(
              `Task ${assignment.id}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      });

      // Auto-complete tasks that have both weight > 0 and grade set
      this.autoCompleteGradedTasks(localCourseId);

      // Notify about queued tasks
      if (queuedCount > 0 && this.onTasksQueued) {
        this.onTasksQueued(queuedCount, localCourseId);
      }

      return this.successResult(count, Date.now() - startTime, errors);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to sync tasks for course ${canvasCourseId}: ${message}`);
      return this.failedResult(errors.join('; '), Date.now() - startTime);
    }
  }

  /**
   * Auto-complete tasks that have grades set
   */
  private autoCompleteGradedTasks(localCourseId: number): void {
    this.db.executeWrite(
      `UPDATE tasks
       SET is_completed = 1, completed_at = CURRENT_TIMESTAMP
       WHERE course_id = ? AND weight > 0 AND grade IS NOT NULL AND is_completed = 0`,
      [localCourseId],
      'tasks'
    );
  }

  /**
   * Resolve Canvas assignment group ID to local database ID
   */
  private resolveLocalGroupId(
    canvasGroupId: number,
    localCourseId: number
  ): number | null {
    const localGroup = this.db.executeReadOne<{ id: number }>(
      `SELECT id FROM canvas_assignment_groups
       WHERE course_id = ? AND canvas_group_id = ?`,
      [localCourseId, canvasGroupId]
    );
    return localGroup?.id ?? null;
  }

  // =========================================================================
  // Queue System Helper Methods
  // =========================================================================

  /**
   * Get user tasks for fuzzy matching
   */
  private getUserTasksForMatching(localCourseId: number): TaskForMatching[] {
    const rows = this.db.executeRead<{
      id: number;
      title: string;
      course_id: number;
      due_at: string | null;
    }>(
      `SELECT id, title, course_id, due_at FROM tasks
       WHERE course_id = ? AND source_type = 'user' AND external_id IS NULL
       AND deleted_at IS NULL`,
      [localCourseId]
    );

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      courseId: row.course_id,
      dueAt: row.due_at,
      sourceType: 'user' as const,
    }));
  }

  /**
   * Find matching user task using fuzzy matching
   */
  private findMatchingUserTask(
    assignment: CanvasAssignment,
    userTasks: TaskForMatching[]
  ): { canvasTaskId: number; confidence: number } | null {
    if (userTasks.length === 0) return null;

    const canvasTask: TaskForMatching = {
      id: assignment.id,
      title: assignment.name,
      courseId: 0, // Will be filtered by course in userTasks
      dueAt: assignment.due_at,
      sourceType: 'canvas',
    };

    // Match against user tasks in the same course
    const match = this.taskMatcher.findMatch(
      canvasTask,
      userTasks.map((t) => ({ ...t, courseId: 0 })) // Normalize courseId for matching
    );

    if (match.method !== 'none' && match.canvasTaskId !== null) {
      // canvasTaskId here actually refers to the user task ID (confusing naming in TaskMatcher)
      // Find the original user task
      const userTask = userTasks.find((t) => t.title === match.canvasTaskTitle);
      if (userTask) {
        return {
          canvasTaskId: userTask.id,
          confidence: match.confidence,
        };
      }
    }

    return null;
  }

  /**
   * Update only grade/status fields for an already-accepted task
   */
  private updateAcceptedTaskGrades(assignment: CanvasAssignment, taskId: number): void {
    const localTask = mapAssignment(assignment, 0); // courseId not needed for grade fields

    this.db.executeWrite(
      `UPDATE tasks SET
        grade = ?,
        submission_status = ?,
        is_completed = ?,
        completed_at = COALESCE(completed_at, ?),
        entered_grade = ?,
        points_deducted = ?,
        late_policy_status = ?,
        seconds_late = ?,
        is_excused = ?,
        is_missing = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [
        localTask.grade,
        localTask.submission_status,
        localTask.is_completed,
        localTask.completed_at,
        localTask.entered_grade,
        localTask.points_deducted,
        localTask.late_policy_status,
        localTask.seconds_late,
        localTask.is_excused,
        localTask.is_missing,
        taskId,
      ],
      'tasks'
    );
  }

  /**
   * Update metadata for a queue entry (for rejected tasks that need metadata refresh)
   */
  private updateQueueEntry(assignment: CanvasAssignment, queueId: number): void {
    this.db.executeWrite(
      `UPDATE canvas_task_queue SET
        canvas_data = ?,
        title = ?,
        description = ?,
        due_at = ?,
        points_possible = ?,
        last_synced_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [
        JSON.stringify(assignment),
        assignment.name,
        assignment.description,
        assignment.due_at,
        assignment.points_possible,
        queueId,
      ],
      'canvas_task_queue'
    );
  }

  /**
   * Sync an existing task (legacy or manually created) with full conflict resolution
   */
  private syncExistingTask(
    assignment: CanvasAssignment,
    existing: Record<string, unknown>,
    localCourseId: number,
    courseName?: string
  ): void {
    const localTask = mapAssignment(assignment, localCourseId);

    // Detect conflicts
    const { autoResolved, conflicts, preservedFields } =
      this.conflictResolver.detectConflicts(
        'task',
        'tasks',
        existing.id as number,
        localTask.external_id,
        localTask.title,
        existing,
        localTask,
        { courseName, courseId: localCourseId }
      );

    if (conflicts.length > 0) {
      this.onConflicts?.(conflicts);
      if (this.pendingConflictData) {
        for (const conflict of conflicts) {
          this.pendingConflictData.set((conflict as { id: string }).id, {
            tableName: 'tasks',
            data: { ...localTask, id: existing.id },
          });
        }
      }
    }

    // Build final data
    const finalData: Record<string, unknown> = { ...localTask };

    for (const [field, value] of Object.entries(autoResolved)) {
      finalData[field] = value;
    }

    for (const field of preservedFields) {
      if (existing[field] !== undefined) {
        finalData[field] = existing[field];
      }
    }

    if (assignment.assignment_group_id) {
      const localGroupId = this.resolveLocalGroupId(
        assignment.assignment_group_id,
        localCourseId
      );
      if (localGroupId) {
        finalData.assignment_group_id = localGroupId;
      }
    }

    // Mark as legacy acceptance method if not already set
    if (!existing.acceptance_method) {
      finalData.acceptance_method = 'legacy';
    }

    this.db.upsert('tasks', finalData, 'external_id', true, preservedFields);

    if (this.diagnosticsEnabled && this.onDiagnostic) {
      this.onDiagnostic({
        entity: 'task',
        externalId: localTask.external_id,
        action: 'update',
        preservedFields:
          preservedFields.length > 0
            ? Object.fromEntries(
                preservedFields.map((f) => [
                  f,
                  { before: existing[f], after: finalData[f] },
                ])
              )
            : undefined,
      });
    }
  }

  /**
   * Merge a user-created task with a Canvas assignment
   */
  private mergeUserTaskWithCanvas(
    assignment: CanvasAssignment,
    userTaskId: number,
    localCourseId: number
  ): void {
    const localTask = mapAssignment(assignment, localCourseId);

    // Merge: link the user task to Canvas, preserve user-set fields
    this.db.executeWrite(
      `UPDATE tasks SET
        external_id = ?,
        source_type = 'canvas',
        description = COALESCE(?, description),
        due_at = COALESCE(?, due_at),
        unlock_at = COALESCE(?, unlock_at),
        lock_at = COALESCE(?, lock_at),
        points_possible = COALESCE(?, points_possible),
        submission_types = COALESCE(?, submission_types),
        task_type = COALESCE(?, task_type),
        grade = ?,
        submission_status = ?,
        is_completed = CASE WHEN is_completed = 1 THEN 1 ELSE ? END,
        completed_at = COALESCE(completed_at, ?),
        acceptance_method = 'auto',
        accepted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [
        localTask.external_id,
        localTask.description,
        localTask.due_at,
        localTask.unlock_at,
        localTask.lock_at,
        localTask.points_possible,
        localTask.submission_types,
        localTask.task_type,
        localTask.grade,
        localTask.submission_status,
        localTask.is_completed,
        localTask.completed_at,
        userTaskId,
      ],
      'tasks'
    );

    this.onTaskMerged?.({
      localTaskId: userTaskId,
      canvasId: assignment.id,
      title: localTask.title,
    });
  }

  /**
   * Create a new accepted task from a Canvas assignment
   */
  private createAcceptedTask(
    assignment: CanvasAssignment,
    localCourseId: number,
    acceptanceMethod: 'manual' | 'auto' | 'bulk'
  ): void {
    const localTask = mapAssignment(assignment, localCourseId);

    const finalData: Record<string, unknown> = {
      ...localTask,
      acceptance_method: acceptanceMethod,
      accepted_at: new Date().toISOString(),
    };

    // Resolve assignment group
    if (assignment.assignment_group_id) {
      const localGroupId = this.resolveLocalGroupId(
        assignment.assignment_group_id,
        localCourseId
      );
      if (localGroupId) {
        finalData.assignment_group_id = localGroupId;
      }
    }

    this.db.upsert('tasks', finalData, 'external_id', true);

    if (this.diagnosticsEnabled && this.onDiagnostic) {
      this.onDiagnostic({
        entity: 'task',
        externalId: localTask.external_id,
        action: 'insert',
      });
    }
  }
}
