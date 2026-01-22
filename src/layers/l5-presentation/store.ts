/**
 * L5 Presentation - Zustand Store
 *
 * Global state management for the renderer process.
 * Communicates with main process exclusively through IPC.
 * Subscribes to push events for real-time updates.
 */

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import {
  Store,
  StoreState,
  Course,
  Task,
  Notification,
  SimulationState,
  SimulationChangeEvent,
  DbCommitEvent,
  SyncStatus,
  SystemState,
  HealthStatus,
} from './types';

/**
 * Initial state
 */
const initialState: StoreState = {
  courses: [],
  tasks: [],
  notifications: [],
  simulation: {
    isActive: false,
    startedAt: null,
    grades: [],
  },
  syncStatus: 'idle',
  lastSyncedAt: null,
  systemState: null,
  healthStatus: null,
  isAuthenticated: false,
  isInitialized: false,
  lastError: null,
};

/**
 * Get the IPC API from the window object (exposed by preload.ts)
 */
function getApi() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = (window as any).api;
  if (!api) {
    console.warn('IPC API not available - running in non-Electron context');
    return null;
  }
  return api;
}

/**
 * Create the Zustand store
 */
export const useStore = create<Store>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      ...initialState,

      /**
       * Initialize the store - called once on app start
       */
      initialize: async () => {
        const api = getApi();
        if (!api) {
          set({ isInitialized: true });
          return;
        }

        try {
          // Check authentication
          const hasCredential = await api.hasCredential();
          set({ isAuthenticated: hasCredential });

          if (hasCredential) {
            // Load initial data
            await get().refreshAll();
          }

          // Get system state
          const systemState = await api.getSystemState();
          set({ systemState });

          // Get health status
          const healthStatus = await api.getHealthStatus();
          set({ healthStatus });

          // Get simulation state
          const simulation = await api.getSimulationState();
          set({ simulation });

          set({ isInitialized: true });
        } catch (error) {
          console.error('Failed to initialize store:', error);
          set({
            isInitialized: true,
            lastError: error instanceof Error ? error.message : String(error),
          });
        }
      },

      /**
       * Fetch all courses
       */
      fetchCourses: async () => {
        const api = getApi();
        if (!api) return;

        try {
          const courses = await api.getCourses();
          set({ courses });
        } catch (error) {
          console.error('Failed to fetch courses:', error);
          set({ lastError: error instanceof Error ? error.message : String(error) });
        }
      },

      /**
       * Fetch tasks (optionally for a specific course)
       */
      fetchTasks: async (courseId?: number) => {
        const api = getApi();
        if (!api) return;

        try {
          const tasks = await api.getTasks(courseId);
          if (courseId) {
            // Update only tasks for this course
            set((state) => ({
              tasks: [
                ...state.tasks.filter((t) => t.courseId !== courseId),
                ...tasks,
              ],
            }));
          } else {
            set({ tasks });
          }
        } catch (error) {
          console.error('Failed to fetch tasks:', error);
          set({ lastError: error instanceof Error ? error.message : String(error) });
        }
      },

      /**
       * Fetch all notifications
       */
      fetchNotifications: async () => {
        const api = getApi();
        if (!api) return;

        try {
          const notifications = await api.getNotifications();
          set({ notifications });
        } catch (error) {
          console.error('Failed to fetch notifications:', error);
          set({ lastError: error instanceof Error ? error.message : String(error) });
        }
      },

      /**
       * Refresh all data
       */
      refreshAll: async () => {
        const { fetchCourses, fetchTasks, fetchNotifications } = get();
        await Promise.all([
          fetchCourses(),
          fetchTasks(),
          fetchNotifications(),
        ]);
      },

      /**
       * Update target grade for a course
       */
      updateTargetGrade: async (courseId: number, targetGrade: number) => {
        const api = getApi();
        if (!api) return false;

        try {
          const result = await api.dispatch('UpdateTargetGrade', { courseId, targetGrade });
          if (result.success) {
            // Optimistically update local state
            set((state) => ({
              courses: state.courses.map((c) =>
                c.id === courseId ? { ...c, targetGrade } : c
              ),
            }));
          }
          return result.success;
        } catch (error) {
          console.error('Failed to update target grade:', error);
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
            set((state) => ({
              tasks: state.tasks.map((t) =>
                t.id === taskId
                  ? { ...t, isCompleted: isComplete, completedAt: isComplete ? new Date().toISOString() : null }
                  : t
              ),
            }));
          }
          return result.success;
        } catch (error) {
          console.error('Failed to mark task complete:', error);
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
            set((state) => ({
              notifications: state.notifications.map((n) =>
                n.id === notificationId
                  ? { ...n, dismissedAt: new Date().toISOString() }
                  : n
              ),
            }));
          }
          return result.success;
        } catch (error) {
          console.error('Failed to dismiss notification:', error);
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
          console.error('Failed to simulate grade:', error);
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
          console.error('Failed to clear simulation:', error);
          set({ lastError: error instanceof Error ? error.message : String(error) });
          return false;
        }
      },

      /**
       * Trigger a sync operation
       */
      triggerSync: async (type: 'full' | 'courses' | 'tasks' | 'notifications') => {
        const api = getApi();
        if (!api) return false;

        set({ syncStatus: 'syncing' });

        try {
          let result;
          if (type === 'full') {
            result = await api.syncFull();
          } else if (type === 'courses') {
            result = await api.syncCourses();
          } else {
            result = await api.dispatch('TriggerSync', { type });
          }

          if (result.success) {
            set({ syncStatus: 'idle', lastSyncedAt: new Date().toISOString() });
            // Refresh data after sync
            await get().refreshAll();
          } else {
            set({ syncStatus: 'error', lastError: result.error });
          }
          return result.success;
        } catch (error) {
          console.error('Failed to trigger sync:', error);
          set({
            syncStatus: 'error',
            lastError: error instanceof Error ? error.message : String(error),
          });
          return false;
        }
      },

      /**
       * Set authentication state
       */
      setAuthenticated: (authenticated: boolean) => {
        set({ isAuthenticated: authenticated });
      },

      /**
       * Handle simulation change event from main process
       */
      handleSimulationChange: (event: SimulationChangeEvent) => {
        if (event.context) {
          set({ simulation: event.context });
        } else if (event.type === 'cleared') {
          set({
            simulation: {
              isActive: false,
              startedAt: null,
              grades: [],
            },
          });
        }
      },

      /**
       * Handle database commit event from main process
       */
      handleDbCommit: (event: DbCommitEvent) => {
        // Refresh data based on which table changed
        const { fetchCourses, fetchTasks, fetchNotifications } = get();

        switch (event.table) {
          case 'courses':
            fetchCourses();
            break;
          case 'tasks':
            fetchTasks();
            break;
          case 'notifications':
            fetchNotifications();
            break;
          default:
            // For unknown tables, refresh all
            get().refreshAll();
        }
      },

      /**
       * Set error state
       */
      setError: (error: string | null) => {
        set({ lastError: error });
      },
    })),
    { name: 'canvas-store' }
  )
);

/**
 * Subscribe to IPC events from main process
 * Call this in the renderer entry point
 */
export function subscribeToIpcEvents(): () => void {
  const api = getApi();
  if (!api) {
    console.warn('Cannot subscribe to IPC events - API not available');
    return () => {};
  }

  const unsubSimulation = api.onSimulationChanged((event: SimulationChangeEvent) => {
    useStore.getState().handleSimulationChange(event);
  });

  const unsubDbCommit = api.onDbCommit((event: DbCommitEvent) => {
    useStore.getState().handleDbCommit(event);
  });

  const unsubSyncStatus = api.onSyncStatus((status: 'idle' | 'syncing' | 'error') => {
    console.debug(`[store] Sync status changed: ${status}`);
    useStore.setState({ syncStatus: status });
    // Update lastSyncedAt when sync completes successfully
    if (status === 'idle') {
      const now = new Date().toISOString();
      console.debug(`[store] Updating lastSyncedAt: ${now}`);
      useStore.setState({ lastSyncedAt: now });
      // Refresh data after sync
      useStore.getState().refreshAll();
    }
  });

  return () => {
    unsubSimulation();
    unsubDbCommit();
    unsubSyncStatus();
  };
}

/**
 * Selectors for common queries
 */
export const selectors = {
  /**
   * Get visible (non-hidden) courses
   */
  visibleCourses: (state: StoreState) =>
    state.courses.filter((c) => !c.isHidden),

  /**
   * Get tasks for a specific course
   */
  courseTasks: (courseId: number) => (state: StoreState) =>
    state.tasks.filter((t) => t.courseId === courseId),

  /**
   * Get incomplete tasks sorted by priority
   */
  priorityTasks: (state: StoreState) =>
    state.tasks
      .filter((t) => !t.isCompleted)
      .sort((a, b) => b.priorityScore - a.priorityScore),

  /**
   * Get undismissed notifications
   */
  activeNotifications: (state: StoreState) =>
    state.notifications.filter((n) => !n.dismissedAt),

  /**
   * Get simulated grade for a task
   */
  simulatedGrade: (taskId: number) => (state: StoreState) =>
    state.simulation.grades.find((g) => g.taskId === taskId)?.simulatedGrade ?? null,

  /**
   * Get effective grade for a task (simulated if exists, else actual)
   */
  effectiveGrade: (taskId: number) => (state: StoreState) => {
    const simulated = selectors.simulatedGrade(taskId)(state);
    if (simulated !== null) return simulated;
    const task = state.tasks.find((t) => t.id === taskId);
    return task?.grade ?? null;
  },
};
