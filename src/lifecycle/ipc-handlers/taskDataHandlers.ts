/**
 * Task Data IPC Handlers
 * Handlers for task data operations
 */

import { ipcMain } from 'electron';
import type { IpcContext } from './IpcContext';
import type { TaskRow, CanvasTaskQueueRow } from '../../layers/l1-persistence';
import {
  TaskReader,
  CanvasTaskQueueReader,
  CourseReader,
} from '../../layers/l1-persistence';
import {
  AcceptQueuedTaskCommand,
  RejectQueuedTaskCommand,
  BulkAcceptQueuedTasksCommand,
  MergeQueuedTaskCommand,
  DeleteTaskCommand,
} from '../../layers/l4-controller';
import { createSimulationContext } from '../../layers/l4-controller/types';
import {
  findMatchingCanvasTask,
  LINK_THRESHOLDS,
} from '../../layers/l2-daemon/sync-engine/sync/TaskMatcher';

interface CheckDuplicateInput {
  queueId: number;
  courseId: number;
  title: string;
  dueAt: string | null;
  taskType: string | null;
}

interface ConflictingField {
  field: string;
  label: string;
  canvasValue: string | null;
  localValue: string | null;
}

interface DuplicateCheckResult {
  queueId: number;
  match: {
    type: 'exact' | 'fuzzy';
    task: {
      id: number;
      title: string;
      dueAt: string | null;
      weight: number | null;
      taskType: string | null;
    };
    conflictingFields: ConflictingField[];
  } | null;
}

function computeConflictingFields(
  queued: CheckDuplicateInput,
  existing: { title: string; due_at: string | null; task_type: string | null }
): ConflictingField[] {
  const fields: ConflictingField[] = [];

  if (queued.dueAt && existing.due_at) {
    const diff = Math.abs(
      new Date(queued.dueAt).getTime() - new Date(existing.due_at).getTime()
    );
    if (diff > 60_000) {
      fields.push({
        field: 'dueAt',
        label: 'Due date',
        canvasValue: queued.dueAt,
        localValue: existing.due_at,
      });
    }
  } else if (queued.dueAt !== existing.due_at) {
    fields.push({
      field: 'dueAt',
      label: 'Due date',
      canvasValue: queued.dueAt,
      localValue: existing.due_at,
    });
  }

  if (queued.title.toLowerCase() !== existing.title.toLowerCase()) {
    fields.push({
      field: 'title',
      label: 'Title',
      canvasValue: queued.title,
      localValue: existing.title,
    });
  }

  if (queued.taskType && existing.task_type && queued.taskType !== existing.task_type) {
    fields.push({
      field: 'taskType',
      label: 'Type',
      canvasValue: queued.taskType,
      localValue: existing.task_type,
    });
  }

  return fields;
}

/**
 * Map TaskRow to API response format (camelCase with computed fields)
 */
function mapTaskRowToResponse(row: TaskRow) {
  // Determine source type: explicitly from row, or infer from external_id pattern
  const sourceType =
    row.source_type === 'canvas' || row.source_type === 'user'
      ? row.source_type
      : row.external_id.startsWith('user_')
        ? 'user'
        : 'canvas';

  return {
    id: row.id,
    externalId: row.external_id,
    sourceType,
    courseId: row.course_id,
    title: row.title,
    description: row.description,
    unlockAt: row.unlock_at ?? null,
    dueAt: row.due_at,
    dueTimeKnown: Boolean(row.due_time_known ?? 1), // Default to true for backward compat
    weight: row.weight,
    grade: row.grade,
    pointsPossible: row.points_possible,
    priorityScore: row.priority_score,
    isCompleted: Boolean(row.is_completed),
    completedAt: row.completed_at,
    submissionStatus: row.submission_status,
    taskType: row.task_type,
    taskGroupId: row.task_group_id,
    calendarEventId: row.calendar_event_id,
    location: row.location ?? null,
    isOptional: Boolean(row.is_optional),
  };
}

/**
 * Register task data handlers
 */
export function registerTaskDataHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();
  const getVisibilityOracle = ctx.getVisibilityOracle;

  // L1 readers — per ADR-0007 / ADR-0008 PR-D, no raw `database.execute*`
  // calls in this handler file. SQL lives in these reader classes.
  const taskReader = new TaskReader(database);
  const queueReader = new CanvasTaskQueueReader(database);
  const courseReader = new CourseReader(database);

  ipcMain.handle(
    'data:getTasks',
    (_event, options?: { courseIds?: number[] } | number) => {
      try {
        if (typeof options === 'number') {
          // Legacy: single courseId. Verify visible, then read.
          if (getVisibilityOracle() && !getVisibilityOracle()!.isCourseVisible(options)) {
            return [];
          }
          return taskReader.getByCourseIds([options]).map(mapTaskRowToResponse);
        }

        const visibleIds = getVisibilityOracle()?.getVisibleCourseIds() ?? [];
        if (visibleIds.length === 0) return [];

        if (
          options?.courseIds &&
          Array.isArray(options.courseIds) &&
          options.courseIds.length > 0
        ) {
          const visibleSet = new Set(visibleIds);
          const filtered = options.courseIds.filter((id) => visibleSet.has(id));
          if (filtered.length === 0) return [];
          return taskReader.getByCourseIds(filtered).map(mapTaskRowToResponse);
        }

        return taskReader.getByCourseIds(visibleIds).map(mapTaskRowToResponse);
      } catch (error) {
        logger.error(`Failed to get tasks: ${error}`);
        throw error;
      }
    }
  );

  // Get tasks for an archived course (bypasses visibility filtering).
  // Archived courses are local-only sandboxes — users can view/edit
  // without affecting active workflows. Includes soft-deleted rows so
  // the archive view is complete.
  ipcMain.handle('data:getTasksForArchivedCourse', (_event, courseId: number) => {
    try {
      const course = courseReader.getById(courseId);
      if (!course?.archived_at) {
        logger.error(
          `Attempted to get tasks for non-archived course ${courseId} via archived endpoint`
        );
        return [];
      }

      return taskReader
        .getByCourseIds([courseId], { includeDeleted: true })
        .map(mapTaskRowToResponse);
    } catch (error) {
      logger.error(`Failed to get tasks for archived course: ${error}`);
      throw error;
    }
  });

  // =========================================================================
  // Canvas Task Queue Handlers
  // =========================================================================

  /**
   * Map queue row to API response format (camelCase)
   */
  function mapQueueRowToResponse(row: CanvasTaskQueueRow) {
    return {
      id: row.id,
      externalId: row.external_id,
      courseId: row.course_id,
      title: row.title,
      description: row.description,
      dueAt: row.due_at,
      pointsPossible: row.points_possible,
      taskType: row.task_type,
      status: row.status,
      matchedUserTaskId: row.matched_user_task_id,
      matchConfidence: row.match_confidence,
      firstSeenAt: row.first_seen_at,
      lastSyncedAt: row.last_synced_at,
      resolvedAt: row.resolved_at,
      resolvedBy: row.resolved_by,
    };
  }

  // Get queue entries (filtered by visibility). Defaults to status='pending'.
  ipcMain.handle('data:getTaskQueue', (_event, options?: { status?: string }) => {
    try {
      const visibleIds = getVisibilityOracle()?.getVisibleCourseIds() ?? [];
      if (visibleIds.length === 0) return [];
      const status = (options?.status ?? 'pending') as
        | 'pending'
        | 'accepted'
        | 'rejected'
        | 'merged';
      return queueReader
        .getByCourseIds(visibleIds, { status })
        .map(mapQueueRowToResponse);
    } catch (error) {
      logger.error(`Failed to get task queue: ${error}`);
      throw error;
    }
  });

  // Get queue count (for badges). Hardcoded to status='pending'.
  ipcMain.handle('data:getTaskQueueCount', (_event, options?: { courseId?: number }) => {
    try {
      const visibleIds = getVisibilityOracle()?.getVisibleCourseIds() ?? [];
      if (visibleIds.length === 0) return 0;

      if (options?.courseId) {
        if (!visibleIds.includes(options.courseId)) return 0;
        return queueReader.countByCourseIds([options.courseId], { status: 'pending' });
      }
      return queueReader.countByCourseIds(visibleIds, { status: 'pending' });
    } catch (error) {
      logger.error(`Failed to get task queue count: ${error}`);
      throw error;
    }
  });

  // Get queue entries for one course (must be visible). Status='pending'.
  ipcMain.handle('data:getTaskQueueForCourse', (_event, courseId: number) => {
    try {
      const visibleIds = getVisibilityOracle()?.getVisibleCourseIds() ?? [];
      if (!visibleIds.includes(courseId)) return [];
      return queueReader
        .getByCourseIds([courseId], { status: 'pending' })
        .map(mapQueueRowToResponse);
    } catch (error) {
      logger.error(`Failed to get task queue for course: ${error}`);
      throw error;
    }
  });

  // Check for duplicate user tasks matching queued Canvas items (exact or fuzzy)
  ipcMain.handle(
    'data:checkQueueDuplicates',
    (_event, items: CheckDuplicateInput[]): DuplicateCheckResult[] => {
      try {
        return items.map((item) => {
          // Reader returns the FULL TaskRow shape; locally narrow to what
          // the matching logic needs.
          const candidates = taskReader.findUnlinkedUserTasksInCourse(item.courseId);

          // 1. Exact title match (case-insensitive). Done in JS now —
          //    same set of candidates, same case-insensitive equality.
          const exact = candidates.find(
            (t) => t.title.toLowerCase() === item.title.toLowerCase()
          );
          if (exact) {
            return {
              queueId: item.queueId,
              match: {
                type: 'exact' as const,
                task: {
                  id: exact.id,
                  title: exact.title,
                  dueAt: exact.due_at,
                  weight: exact.weight,
                  taskType: exact.task_type ?? null,
                },
                conflictingFields: computeConflictingFields(item, exact),
              },
            };
          }

          // 2. Fuzzy match via TaskMatcher across the same candidate set.
          const userTasks = candidates;

          const canvasEntry = {
            id: item.queueId,
            title: item.title,
            courseId: item.courseId,
            dueAt: item.dueAt,
            sourceType: 'canvas' as const,
          };

          let bestMatch: { task: TaskRow; confidence: number } | null = null;
          for (const ut of userTasks) {
            const result = findMatchingCanvasTask(
              {
                id: ut.id,
                title: ut.title,
                courseId: item.courseId,
                dueAt: ut.due_at,
                sourceType: 'user' as const,
              },
              [canvasEntry]
            );
            if (
              result.confidence >= LINK_THRESHOLDS.suggestLink &&
              (!bestMatch || result.confidence > bestMatch.confidence)
            ) {
              bestMatch = { task: ut, confidence: result.confidence };
            }
          }

          if (bestMatch) {
            return {
              queueId: item.queueId,
              match: {
                type: 'fuzzy' as const,
                task: {
                  id: bestMatch.task.id,
                  title: bestMatch.task.title,
                  dueAt: bestMatch.task.due_at,
                  weight: bestMatch.task.weight,
                  taskType: bestMatch.task.task_type ?? null,
                },
                conflictingFields: computeConflictingFields(item, bestMatch.task),
              },
            };
          }

          return { queueId: item.queueId, match: null };
        });
      } catch (error) {
        logger.error(`Failed to check queue duplicates: ${error}`);
        throw error;
      }
    }
  );

  // Accept a queued task
  ipcMain.handle(
    'data:acceptQueuedTask',
    async (
      _event,
      queueId: number,
      edits?: {
        title?: string;
        dueAt?: string | null;
        startAt?: string | null;
        taskType?: string | null;
        weight?: number | null;
        location?: string | null;
        notes?: string | null;
      }
    ) => {
      try {
        const command = new AcceptQueuedTaskCommand();
        const result = await command.execute(
          {
            db: database,
            simulationContext: createSimulationContext(),
          },
          { queueId, edits }
        );
        return result;
      } catch (error) {
        logger.error(`Failed to accept queued task: ${error}`);
        return { success: false, error: String(error) };
      }
    }
  );

  // Reject a queued task
  ipcMain.handle('data:rejectQueuedTask', async (_event, queueId: number) => {
    try {
      const command = new RejectQueuedTaskCommand();
      const result = await command.execute(
        {
          db: database,
          simulationContext: createSimulationContext(),
        },
        { queueId }
      );
      return result;
    } catch (error) {
      logger.error(`Failed to reject queued task: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  // Bulk accept queued tasks
  ipcMain.handle(
    'data:bulkAcceptQueuedTasks',
    async (_event, options?: { courseId?: number }) => {
      try {
        const command = new BulkAcceptQueuedTasksCommand();
        const result = await command.execute(
          {
            db: database,
            simulationContext: createSimulationContext(),
          },
          { courseId: options?.courseId }
        );
        return result;
      } catch (error) {
        logger.error(`Failed to bulk accept queued tasks: ${error}`);
        return { success: false, error: String(error) };
      }
    }
  );

  // Merge a queued task with a user task
  ipcMain.handle(
    'data:mergeQueuedTask',
    async (
      _event,
      params: {
        queueId: number;
        userTaskId: number;
        keepFromUser?: { notes?: boolean; dueAt?: boolean; title?: boolean };
      }
    ) => {
      try {
        const command = new MergeQueuedTaskCommand();
        const result = await command.execute(
          {
            db: database,
            simulationContext: createSimulationContext(),
          },
          params
        );
        return result;
      } catch (error) {
        logger.error(`Failed to merge queued task: ${error}`);
        return { success: false, error: String(error) };
      }
    }
  );

  // DEBUG: Check course auto-accept settings
  ipcMain.handle('debug:getCourseSettings', (_event) => {
    try {
      return courseReader.getAll().map((c) => ({
        id: c.id,
        name: c.name,
        autoAccept: c.auto_accept_canvas_tasks ?? null,
      }));
    } catch (error) {
      return { error: String(error) };
    }
  });

  // DEBUG: Force delete a task by ID (bypasses all checks).
  // Routes through DeleteTaskCommand({force:true}) — same path as the
  // production delete with the force flag set; this also tidies up
  // link_suggestions referencing the task.
  ipcMain.handle('debug:forceDeleteTask', async (_event, taskId: number) => {
    try {
      const task = taskReader.getById(taskId);
      if (!task) {
        return { success: false, error: 'Task not found' };
      }

      const command = new DeleteTaskCommand();
      const result = await command.execute(
        { db: database, simulationContext: createSimulationContext() },
        { taskId, force: true }
      );

      if (!result.success) {
        return { success: false, error: result.error ?? 'Delete failed' };
      }

      return {
        success: true,
        deleted: {
          id: task.id,
          title: task.title,
          externalId: task.external_id ?? null,
        },
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // DEBUG: Check queue and task state
  ipcMain.handle('debug:getQueueState', (_event, courseId?: number) => {
    try {
      const queueEntries = courseId
        ? queueReader.getByCourseIds([courseId])
        : queueReader.getAll();

      const tasks = courseId
        ? taskReader.getByCourseIds([courseId], { includeDeleted: true })
        : taskReader.getAll();

      return {
        queueEntries: queueEntries.map((q) => ({
          id: q.id,
          externalId: q.external_id,
          title: q.title,
          status: q.status,
          courseId: q.course_id,
        })),
        tasks: tasks.map((t) => ({
          id: t.id,
          externalId: t.external_id ?? null,
          title: t.title,
          sourceType: t.source_type ?? null,
          acceptanceMethod:
            (t as TaskRow & { acceptance_method?: string | null }).acceptance_method ??
            null,
          courseId: t.course_id,
        })),
      };
    } catch (error) {
      logger.error(`Debug getQueueState failed: ${error}`);
      return { error: String(error) };
    }
  });
}
