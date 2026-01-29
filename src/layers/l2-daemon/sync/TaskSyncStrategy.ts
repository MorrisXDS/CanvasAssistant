/**
 * TaskSyncStrategy - Handles syncing tasks/assignments from Canvas
 *
 * Extracted from SyncEngine to reduce complexity.
 */

import { BaseSyncStrategy, SyncResult, SyncContext } from './SyncStrategy';
import { mapAssignment, CanvasAssignment } from '../DataMappers';
import { SyncConflictResolver } from '../SyncConflictResolver';

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
}

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

  constructor(context: SyncContext, options: TaskSyncOptions) {
    super(context);
    this.conflictResolver = options.conflictResolver;
    this.diagnosticsEnabled = options.diagnosticsEnabled ?? false;
    this.onDiagnostic = options.onDiagnostic;
    this.onTaskMerged = options.onTaskMerged;
    this.onConflicts = options.onConflicts;
    this.pendingConflictData = options.pendingConflictData;
  }

  async syncForCourse(
    canvasCourseId: number,
    localCourseId: number
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let count = 0;

    // Get course name for conflict display
    const courseRow = this.db.executeReadOne<{ name: string }>(
      'SELECT name FROM courses WHERE id = ?',
      [localCourseId]
    );
    const courseName = courseRow?.name;

    try {
      const assignments = await this.rateLimiter.enqueue(
        () =>
          this.client.getAll<CanvasAssignment>(`/courses/${canvasCourseId}/assignments`, {
            order_by: 'due_at',
            'include[]': 'submission',
          }),
        5 // Medium priority
      );

      this.db.transaction(() => {
        for (const assignment of assignments) {
          try {
            const localTask = mapAssignment(assignment, localCourseId);

            // Check for existing local task by title (for user-created tasks)
            const existingByTitle = this.db.executeReadOne<{
              id: number;
              source_type: string;
              weight: number;
              priority_score: number;
              local_modified_at: string | null;
            }>(
              'SELECT id, source_type, weight, priority_score, local_modified_at FROM tasks WHERE course_id = ? AND title = ? AND external_id IS NULL',
              [localCourseId, localTask.title]
            );

            if (existingByTitle && existingByTitle.source_type === 'user') {
              // Merge: link the user task to Canvas, preserve user-set fields
              // Keep local is_completed if user modified it (don't overwrite user completion)
              this.db.executeWrite(
                `UPDATE tasks SET
                  external_id = ?,
                  source_type = 'canvas',
                  description = COALESCE(?, description),
                  due_at = COALESCE(?, due_at),
                  unlock_at = COALESCE(?, unlock_at),
                  points_possible = COALESCE(?, points_possible),
                  submission_types = COALESCE(?, submission_types),
                  updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
                [
                  localTask.external_id,
                  localTask.description,
                  localTask.due_at,
                  localTask.unlock_at,
                  localTask.points_possible,
                  localTask.submission_types,
                  existingByTitle.id,
                ],
                'tasks'
              );

              this.onTaskMerged?.({
                localTaskId: existingByTitle.id,
                canvasId: assignment.id,
                title: localTask.title,
              });
            } else {
              // Get existing record
              const existing = this.db.executeReadOne<Record<string, unknown>>(
                'SELECT * FROM tasks WHERE external_id = ?',
                [localTask.external_id]
              );

              // Detect conflicts
              const { autoResolved, conflicts, preservedFields } =
                this.conflictResolver.detectConflicts(
                  'task',
                  'tasks',
                  (existing?.id as number) || 0,
                  localTask.external_id,
                  localTask.title,
                  existing,
                  localTask,
                  { courseName, courseId: localCourseId }
                );

              if (conflicts.length > 0) {
                // Emit conflicts for UI to handle
                this.onConflicts?.(conflicts);

                // Store pending data for when conflicts are resolved
                if (this.pendingConflictData) {
                  for (const conflict of conflicts) {
                    this.pendingConflictData.set((conflict as { id: string }).id, {
                      tableName: 'tasks',
                      data: { ...localTask, id: existing?.id },
                    });
                  }
                }
              }

              // Build final data
              const finalData: Record<string, unknown> = { ...localTask };

              // Apply auto-resolved Canvas values
              for (const [field, value] of Object.entries(autoResolved)) {
                finalData[field] = value;
              }

              // Preserve local-only fields from existing record
              if (existing) {
                for (const field of preservedFields) {
                  if (existing[field] !== undefined) {
                    finalData[field] = existing[field];
                  }
                }
              }

              // Upsert the task
              this.db.upsert('tasks', finalData, 'external_id', true, preservedFields);

              // Log diagnostic
              if (this.diagnosticsEnabled && this.onDiagnostic) {
                this.onDiagnostic({
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
            errors.push(
              `Task ${assignment.id}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      });

      // Auto-complete tasks that have both weight > 0 and grade set
      this.autoCompleteGradedTasks(localCourseId);

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
}
