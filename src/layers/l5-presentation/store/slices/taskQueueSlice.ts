/**
 * Task Queue Slice
 * Handles Canvas task queue management: fetch, accept, reject, bulk accept, merge.
 */

import { getApi, logUserAction, type SliceCreator } from '../storeUtils';

export const createTaskQueueSlice: SliceCreator = (set, get) => ({
  /**
   * Fetch pending queue entries (new Canvas tasks awaiting user review)
   */
  fetchTaskQueue: async (options?: { courseId?: number }) => {
    const api = getApi();
    if (!api) return;

    try {
      let taskQueue;
      if (options?.courseId) {
        taskQueue = await api.getTaskQueueForCourse(options.courseId);
      } else {
        taskQueue = await api.getTaskQueue({ status: 'pending' });
      }
      set({ taskQueue });
    } catch (error) {
      console.error('Failed to fetch task queue:', error);
    }
  },

  /**
   * Fetch count of pending queue entries (for badges)
   */
  fetchTaskQueueCount: async (options?: { courseId?: number }) => {
    const api = getApi();
    if (!api) return;

    try {
      const taskQueueCount = await api.getTaskQueueCount(options);
      set({ taskQueueCount });
    } catch (error) {
      console.error('Failed to fetch task queue count:', error);
    }
  },

  /**
   * Accept a queued task (creates it as active coursework)
   * @param edits Optional edits to apply when creating the task
   */
  acceptQueuedTask: async (
    queueId: number,
    edits?: { title?: string; dueAt?: string | null; taskType?: string | null }
  ) => {
    const api = getApi();
    if (!api) return { success: false };

    logUserAction('acceptQueuedTask', { queueId, edits });

    try {
      const result = await api.acceptQueuedTask(queueId, edits);
      if (result.success) {
        // Remove from local queue state
        set((state) => ({
          taskQueue: state.taskQueue.filter((q) => q.id !== queueId),
          taskQueueCount: Math.max(0, state.taskQueueCount - 1),
        }));
        // Cross-page communication: mark related sync update as seen
        await get().markSyncUpdateSeenByEntity('task', queueId);
        // Refresh tasks to include the newly accepted task
        await get().fetchTasks();
      }
      return result;
    } catch (error) {
      console.error('Failed to accept queued task:', error);
      return { success: false };
    }
  },

  /**
   * Reject a queued task (won't resurface on re-sync)
   */
  rejectQueuedTask: async (queueId: number) => {
    const api = getApi();
    if (!api) return false;

    logUserAction('rejectQueuedTask', { queueId });

    try {
      const result = await api.rejectQueuedTask(queueId);
      if (result.success) {
        // Remove from local queue state
        set((state) => ({
          taskQueue: state.taskQueue.filter((q) => q.id !== queueId),
          taskQueueCount: Math.max(0, state.taskQueueCount - 1),
        }));
        // Cross-page communication: mark related sync update as seen
        await get().markSyncUpdateSeenByEntity('task', queueId);
      }
      return result.success;
    } catch (error) {
      console.error('Failed to reject queued task:', error);
      return false;
    }
  },

  /**
   * Bulk accept all pending queue entries
   */
  bulkAcceptQueuedTasks: async (options?: { courseId?: number }) => {
    const api = getApi();
    if (!api) return { success: false };

    logUserAction('bulkAcceptQueuedTasks', options);

    try {
      const result = await api.bulkAcceptQueuedTasks(options);
      if (result.success) {
        // Clear queue (or filter by course if courseId specified)
        if (options?.courseId) {
          set((state) => ({
            taskQueue: state.taskQueue.filter((q) => q.courseId !== options.courseId),
          }));
          // Mark all task sync updates for this course as seen (including action-required items)
          await get().markAllSyncUpdatesSeen({
            courseId: options.courseId,
            entityType: 'task',
            excludeActionRequired: false, // Include action-required items since we're accepting them
          });
        } else {
          set({ taskQueue: [], taskQueueCount: 0 });
          // Mark all task sync updates as seen (including action-required items)
          await get().markAllSyncUpdatesSeen({
            entityType: 'task',
            excludeActionRequired: false, // Include action-required items since we're accepting them
          });
        }
        // Refresh tasks to include newly accepted tasks
        await get().fetchTasks();
        // Refresh queue count
        await get().fetchTaskQueueCount();
      }
      return result;
    } catch (error) {
      console.error('Failed to bulk accept queued tasks:', error);
      return { success: false };
    }
  },

  /**
   * Merge a queued task with an existing user task
   */
  mergeQueuedTask: async (params: {
    queueId: number;
    userTaskId: number;
    keepFromUser?: { notes?: boolean; dueAt?: boolean; title?: boolean };
  }) => {
    const api = getApi();
    if (!api) return { success: false };

    logUserAction('mergeQueuedTask', params);

    try {
      const result = await api.mergeQueuedTask(params);
      if (result.success) {
        // Remove from local queue state
        set((state) => ({
          taskQueue: state.taskQueue.filter((q) => q.id !== params.queueId),
          taskQueueCount: Math.max(0, state.taskQueueCount - 1),
        }));
        // Cross-page communication: mark related sync update as seen
        await get().markSyncUpdateSeenByEntity('task', params.queueId);
        // Refresh tasks to show updated merged task
        await get().fetchTasks();
      }
      return result;
    } catch (error) {
      console.error('Failed to merge queued task:', error);
      return { success: false };
    }
  },
});
