/**
 * Core Data Slice
 * Handles initialization, course/task/notification fetching, and refreshAll.
 */

import type { Course } from '../../types';
import { getCurrentTermIds } from '../storeHelpers';
import { getApi, type SliceCreator } from '../storeUtils';
import { createLogger } from '../../../l6-ui/utils/rendererLogger';

const log = createLogger('coreDataSlice');

export const createCoreDataSlice: SliceCreator = (set, get) => ({
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

        // Get last sync time from database
        const lastSyncTime = await api.getLastSyncTime?.();
        if (lastSyncTime) {
          set({ lastSyncedAt: lastSyncTime });
        }

        // Fetch sync updates count for FAB badge
        await get().fetchSyncUpdatesCount();
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
      log.error('Failed to initialize store', error instanceof Error ? error : undefined);
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
      let courses = await api.getCourses();

      // Get term selection from database via VisibleDataProvider (single source of truth)
      let semesterSelection: 'all' | 'auto' | string = 'auto';
      try {
        const termResult = await api.getTermSelection();
        if (termResult?.termSelection !== undefined) {
          semesterSelection = String(termResult.termSelection);
        }
      } catch (e) {
        log.error(
          '[Store] Failed to get term selection from database',
          e instanceof Error ? e : undefined
        );
        // Fall back to localStorage for backwards compatibility during migration
        const academicSettings = localStorage.getItem('academicSettings');
        if (academicSettings) {
          try {
            const settings = JSON.parse(academicSettings);
            semesterSelection = settings.termSelection || 'auto';
            // Migrate to database
            if (api.setTermSelection) {
              const valueToSet =
                semesterSelection === 'all' || semesterSelection === 'auto'
                  ? semesterSelection
                  : parseInt(semesterSelection, 10);
              api.setTermSelection(valueToSet).catch(() => {
                // Log migration errors instead of swallowing them (#23)
                log.warn('[Store] Failed to migrate term selection to database');
              });
            }
          } catch (parseError) {
            log.error(
              '[Store] Failed to parse academic settings',
              parseError instanceof Error ? parseError : undefined
            );
          }
        }
      }

      if (semesterSelection !== 'all') {
        if (semesterSelection === 'auto') {
          // Auto-detect: show courses where semester is currently active
          const terms = await api.getEnrollmentTerms();
          const currentTermIds = getCurrentTermIds(terms);

          if (currentTermIds.size > 0) {
            courses = courses.filter(
              (c: Course) =>
                c.enrollmentTermId !== null && currentTermIds.has(c.enrollmentTermId)
            );
          }
        } else {
          // Specific semester selected - filter by term external_id
          const selectedTermId = parseInt(semesterSelection, 10);
          if (!isNaN(selectedTermId)) {
            courses = courses.filter(
              (c: Course) => c.enrollmentTermId === selectedTermId
            );
          }
        }
      }

      set({ courses });
    } catch (error) {
      log.error('Failed to fetch courses', error instanceof Error ? error : undefined);
      set({ lastError: error instanceof Error ? error.message : String(error) });
    }
  },

  /**
   * Fetch tasks - filtered by visible courses at source for bandwidth efficiency
   * Pass courseId for single course, or leave empty for all visible courses
   */
  fetchTasks: async (courseId?: number) => {
    const api = getApi();
    if (!api) return;

    try {
      let tasks: import('../../types').Task[];

      if (courseId) {
        // Single course fetch
        tasks = await api.getTasks(courseId);
        // Update only tasks for this course
        set((state) => ({
          tasks: [...state.tasks.filter((t) => t.courseId !== courseId), ...tasks],
        }));
      } else {
        // Fetch tasks only for visible courses (filter at source)
        const allCourses = get().courses;

        if (allCourses.length === 0) {
          tasks = await api.getTasks({ courseIds: 'all' });
        } else {
          // Get visible course IDs and fetch only those tasks
          const visibleCourseIds = allCourses
            .filter((c: Course) => !c.isHidden)
            .map((c: Course) => c.id);

          tasks = await api.getTasks({ courseIds: visibleCourseIds });
        }

        set({ tasks });
      }
    } catch (error) {
      log.error('Failed to fetch tasks', error instanceof Error ? error : undefined);
      set({ lastError: error instanceof Error ? error.message : String(error) });
    }
  },

  /**
   * Fetch notifications - filtered by visible courses at source for bandwidth efficiency
   * System notifications (courseId is null) are always included by the IPC handler
   */
  fetchNotifications: async () => {
    const api = getApi();
    if (!api) return;

    try {
      const allCourses = get().courses;

      let notifications: import('../../types').Notification[];

      if (allCourses.length === 0) {
        notifications = await api.getNotifications({ courseIds: 'all' });
      } else {
        // Get visible course IDs and fetch only those notifications
        const visibleCourseIds = allCourses
          .filter((c: Course) => !c.isHidden)
          .map((c: Course) => c.id);

        notifications = await api.getNotifications({ courseIds: visibleCourseIds });
      }

      set({ notifications });
    } catch (error) {
      log.error(
        'Failed to fetch notifications',
        error instanceof Error ? error : undefined
      );
      set({ lastError: error instanceof Error ? error.message : String(error) });
    }
  },

  /**
   * Refresh all data
   * Uses Promise.allSettled to ensure partial failures don't block other refreshes
   */
  refreshAll: async () => {
    log.debug('[Store] refreshAll: starting');
    const startTime = Date.now();
    const {
      fetchCourses,
      fetchTasks,
      fetchNotifications,
      fetchImportedCalendars,
      fetchTaskQueueCount,
      fetchSyncUpdatesCount,
      fetchSyncUpdates,
    } = get();
    try {
      // Fetch courses FIRST since tasks filtering depends on courses being loaded
      await fetchCourses();
      // Then fetch everything else in parallel - use allSettled to handle partial failures
      const results = await Promise.allSettled([
        fetchTasks(),
        fetchNotifications(),
        fetchImportedCalendars(),
        fetchTaskQueueCount(),
        fetchSyncUpdatesCount(),
        fetchSyncUpdates(),
      ]);

      // Log any unexpected failures (individual fetch methods already handle their own errors)
      const failures = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected'
      );
      if (failures.length > 0) {
        for (const failure of failures) {
          log.error(`[Store] Unexpected refresh failure: ${failure.reason}`);
        }
      }
      log.debug(`[Store] refreshAll: completed in ${Date.now() - startTime}ms`);
    } catch (error) {
      log.error(
        '[Store] refreshAll: fatal error',
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  },
});
