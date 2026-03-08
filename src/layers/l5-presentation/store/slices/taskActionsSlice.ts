/**
 * Task Actions Slice
 * Handles task commands: updateTargetGrade, markTaskComplete, dismissNotification, simulation.
 */

import { markOptimisticUpdate } from '../storeHelpers';
import { getApi, logUserAction, type SliceCreator } from '../storeUtils';
import { createLogger } from '../../../l6-ui/utils/rendererLogger';

const log = createLogger('taskActionsSlice');

export const createTaskActionsSlice: SliceCreator = (set, get) => ({
  /**
   * Update target grade for a course
   */
  updateTargetGrade: async (courseId: number, targetGrade: number) => {
    const api = getApi();
    if (!api) return false;

    try {
      const result = await api.dispatch('UpdateTargetGrade', {
        courseId,
        targetGrade,
      });
      if (result.success) {
        logUserAction('Target grade updated', { courseId, targetGrade });
        // Mark optimistic update to skip db:commit refresh
        markOptimisticUpdate('courses');
        // Update local state directly (no re-fetch needed)
        set((state) => ({
          courses: state.courses.map((c) =>
            c.id === courseId ? { ...c, targetGrade } : c
          ),
        }));
      }
      return result.success;
    } catch (error) {
      log.error('Failed to update target grade', error instanceof Error ? error : undefined);
      set({ lastError: error instanceof Error ? error.message : String(error) });
      return false;
    }
  },

  /**
   * Mark a task as complete/incomplete
   */
  markTaskComplete: async (taskId: number, isComplete: boolean) => {
    const api = getApi();
    if (!api) return false;

    try {
      const result = await api.dispatch('MarkTaskComplete', { taskId, isComplete });
      if (result.success) {
        // Get task title for logging
        const task = get().tasks.find((t) => t.id === taskId);
        logUserAction(isComplete ? 'Task completed' : 'Task uncompleted', {
          taskId,
          title: task?.title,
        });
        // Mark optimistic updates (task + course assessed grade)
        markOptimisticUpdate('tasks');
        markOptimisticUpdate('courses');
        // Update local state directly
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  isCompleted: isComplete,
                  completedAt: isComplete ? new Date().toISOString() : null,
                }
              : t
          ),
        }));
      }
      return result.success;
    } catch (error) {
      log.error('Failed to mark task complete', error instanceof Error ? error : undefined);
      set({ lastError: error instanceof Error ? error.message : String(error) });
      return false;
    }
  },

  /**
   * Dismiss a notification
   */
  dismissNotification: async (notificationId: number) => {
    const api = getApi();
    if (!api) return false;

    try {
      const result = await api.dispatch('DismissNotification', { notificationId });
      if (result.success) {
        logUserAction('Notification dismissed', { notificationId });
        // Mark optimistic update
        markOptimisticUpdate('notifications');
        // Update local state directly
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === notificationId ? { ...n, dismissedAt: new Date().toISOString() } : n
          ),
        }));
      }
      return result.success;
    } catch (error) {
      log.error('Failed to dismiss notification', error instanceof Error ? error : undefined);
      set({ lastError: error instanceof Error ? error.message : String(error) });
      return false;
    }
  },

  /**
   * Simulate a grade (what-if analysis)
   */
  simulateGrade: async (taskId: number, grade: number) => {
    const api = getApi();
    if (!api) return false;

    try {
      const result = await api.dispatch('SimulateGrade', { taskId, grade });
      return result.success;
    } catch (error) {
      log.error('Failed to simulate grade', error instanceof Error ? error : undefined);
      set({ lastError: error instanceof Error ? error.message : String(error) });
      return false;
    }
  },

  /**
   * Clear simulation (all or specific task)
   */
  clearSimulation: async (taskId?: number) => {
    const api = getApi();
    if (!api) return false;

    try {
      const result = await api.dispatch('ClearSimulation', taskId ? { taskId } : {});
      return result.success;
    } catch (error) {
      log.error('Failed to clear simulation', error instanceof Error ? error : undefined);
      set({ lastError: error instanceof Error ? error.message : String(error) });
      return false;
    }
  },
});
