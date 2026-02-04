/**
 * Task Data IPC Handlers
 * Handlers for task data operations
 */

import { ipcMain } from 'electron';
import type { IpcContext } from './IpcContext';
import type {
  TaskRow,
  CanvasTaskQueueRow,
} from '../layers/l1-persistence/DatabaseRowTypes';
import {
  AcceptQueuedTaskCommand,
  RejectQueuedTaskCommand,
  BulkAcceptQueuedTasksCommand,
  MergeQueuedTaskCommand,
} from '../layers/l4-controller';
import { createSimulationContext } from '../layers/l4-controller/types';

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
    userSubmissionStatus: row.user_submission_status,
    effectiveSubmissionStatus:
      row.submission_status || row.user_submission_status || null,
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
  const getVisibleDataProvider = ctx.getVisibleDataProvider;

  ipcMain.handle(
    'data:getTasks',
    (_event, options?: { courseIds?: number[] } | number) => {
      try {
        // Use VisibleDataProvider as single source of truth for visibility
        // This ensures consistent filtering across all services
        let sql: string;
        let params: number[] = [];

        if (typeof options === 'number') {
          // Legacy: single courseId - verify it's visible first
          if (
            getVisibleDataProvider() &&
            !getVisibleDataProvider()!.isCourseVisible(options)
          ) {
            return []; // Course not visible, return empty
          }
          sql = `SELECT t.* FROM tasks t
                 WHERE t.course_id = ?
                   AND (t.deleted_at IS NULL)
                 ORDER BY t.priority_score DESC`;
          params = [options];
        } else if (
          options?.courseIds &&
          Array.isArray(options.courseIds) &&
          options.courseIds.length > 0
        ) {
          // Filter provided courseIds to only visible ones
          const visibleIds = getVisibleDataProvider()?.getVisibleCourseIds() ?? [];
          const visibleSet = new Set(visibleIds);
          const filteredCourseIds = options.courseIds.filter((id) => visibleSet.has(id));

          if (filteredCourseIds.length === 0) return [];

          const placeholders = filteredCourseIds.map(() => '?').join(', ');
          sql = `SELECT t.* FROM tasks t
                 WHERE t.course_id IN (${placeholders})
                   AND (t.deleted_at IS NULL)
                 ORDER BY t.priority_score DESC`;
          params = filteredCourseIds;
        } else {
          // No filter - return tasks from all visible courses
          const visibleIds = getVisibleDataProvider()?.getVisibleCourseIds() ?? [];
          if (visibleIds.length === 0) return [];

          const placeholders = visibleIds.map(() => '?').join(', ');
          sql = `SELECT t.* FROM tasks t
                 WHERE t.course_id IN (${placeholders})
                   AND (t.deleted_at IS NULL)
                 ORDER BY t.priority_score DESC`;
          params = visibleIds;
        }

        const rows = database.executeRead<TaskRow>(sql, params);
        return rows.map(mapTaskRowToResponse);
      } catch (error) {
        logger.error(`Failed to get tasks: ${error}`);
        throw error;
      }
    }
  );

  // Get tasks for an archived course (bypasses visibility filtering)
  // Archived courses are local-only sandboxes - users can view/edit without affecting active workflows
  ipcMain.handle('data:getTasksForArchivedCourse', (_event, courseId: number) => {
    try {
      // Verify the course is actually archived
      const course = database.executeReadOne<{ archived_at: string | null }>(
        'SELECT archived_at FROM courses WHERE id = ?',
        [courseId]
      );

      if (!course?.archived_at) {
        logger.error(
          `Attempted to get tasks for non-archived course ${courseId} via archived endpoint`
        );
        return [];
      }

      const rows = database.executeRead<TaskRow>(
        `SELECT * FROM tasks WHERE course_id = ? ORDER BY priority_score DESC`,
        [courseId]
      );

      return rows.map(mapTaskRowToResponse);
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

  // Get all pending queue entries (filtered by visibility)
  ipcMain.handle('data:getTaskQueue', (_event, options?: { status?: string }) => {
    try {
      const visibleIds = getVisibleDataProvider()?.getVisibleCourseIds() ?? [];
      if (visibleIds.length === 0) return [];

      const placeholders = visibleIds.map(() => '?').join(', ');
      let sql = `SELECT * FROM canvas_task_queue WHERE course_id IN (${placeholders})`;
      const params: (string | number)[] = [...visibleIds];

      if (options?.status) {
        sql += ' AND status = ?';
        params.push(options.status);
      } else {
        // Default to pending only
        sql += " AND status = 'pending'";
      }

      sql += ' ORDER BY due_at ASC, first_seen_at ASC';

      const rows = database.executeRead<CanvasTaskQueueRow>(sql, params);
      return rows.map(mapQueueRowToResponse);
    } catch (error) {
      logger.error(`Failed to get task queue: ${error}`);
      throw error;
    }
  });

  // Get queue count (for badges)
  ipcMain.handle('data:getTaskQueueCount', (_event, options?: { courseId?: number }) => {
    try {
      const visibleIds = getVisibleDataProvider()?.getVisibleCourseIds() ?? [];
      if (visibleIds.length === 0) return 0;

      let sql: string;
      let params: number[];

      if (options?.courseId) {
        // Verify course is visible
        if (!visibleIds.includes(options.courseId)) return 0;
        sql = `SELECT COUNT(*) as count FROM canvas_task_queue WHERE course_id = ? AND status = 'pending'`;
        params = [options.courseId];
      } else {
        const placeholders = visibleIds.map(() => '?').join(', ');
        sql = `SELECT COUNT(*) as count FROM canvas_task_queue WHERE course_id IN (${placeholders}) AND status = 'pending'`;
        params = visibleIds;
      }

      const result = database.executeReadOne<{ count: number }>(sql, params);
      return result?.count ?? 0;
    } catch (error) {
      logger.error(`Failed to get task queue count: ${error}`);
      throw error;
    }
  });

  // Get queue entries for a specific course
  ipcMain.handle('data:getTaskQueueForCourse', (_event, courseId: number) => {
    try {
      // Verify course is visible
      const visibleIds = getVisibleDataProvider()?.getVisibleCourseIds() ?? [];
      if (!visibleIds.includes(courseId)) return [];

      const rows = database.executeRead<CanvasTaskQueueRow>(
        `SELECT * FROM canvas_task_queue WHERE course_id = ? AND status = 'pending'
         ORDER BY due_at ASC, first_seen_at ASC`,
        [courseId]
      );
      return rows.map(mapQueueRowToResponse);
    } catch (error) {
      logger.error(`Failed to get task queue for course: ${error}`);
      throw error;
    }
  });

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
      const courses = database.executeRead<{
        id: number;
        name: string;
        auto_accept_canvas_tasks: number | null;
      }>('SELECT id, name, auto_accept_canvas_tasks FROM courses');

      return courses.map((c) => ({
        id: c.id,
        name: c.name,
        autoAccept: c.auto_accept_canvas_tasks,
      }));
    } catch (error) {
      return { error: String(error) };
    }
  });

  // DEBUG: Force delete a task by ID (bypasses all checks)
  ipcMain.handle('debug:forceDeleteTask', (_event, taskId: number) => {
    try {
      // Get task info first
      const task = database.executeReadOne<{
        id: number;
        title: string;
        external_id: string;
      }>('SELECT id, title, external_id FROM tasks WHERE id = ?', [taskId]);

      if (!task) {
        return { success: false, error: 'Task not found' };
      }

      // Hard delete
      database.executeWrite('DELETE FROM tasks WHERE id = ?', [taskId], 'tasks');

      return {
        success: true,
        deleted: { id: task.id, title: task.title, externalId: task.external_id },
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // DEBUG: Check queue and task state
  ipcMain.handle('debug:getQueueState', (_event, courseId?: number) => {
    try {
      // Get all queue entries (including non-pending)
      const queueEntries = database.executeRead<CanvasTaskQueueRow>(
        courseId
          ? 'SELECT * FROM canvas_task_queue WHERE course_id = ?'
          : 'SELECT * FROM canvas_task_queue',
        courseId ? [courseId] : []
      );

      // Get tasks with their acceptance status
      const tasks = database.executeRead<{
        id: number;
        external_id: string;
        title: string;
        course_id: number;
        source_type: string;
        acceptance_method: string | null;
      }>(
        courseId
          ? 'SELECT id, external_id, title, course_id, source_type, acceptance_method FROM tasks WHERE course_id = ?'
          : 'SELECT id, external_id, title, course_id, source_type, acceptance_method FROM tasks',
        courseId ? [courseId] : []
      );

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
          externalId: t.external_id,
          title: t.title,
          sourceType: t.source_type,
          acceptanceMethod: t.acceptance_method,
          courseId: t.course_id,
        })),
      };
    } catch (error) {
      logger.error(`Debug getQueueState failed: ${error}`);
      return { error: String(error) };
    }
  });
}
