/**
 * L5 Presentation - Zustand Store
 *
 * Global state management for the renderer process.
 * Communicates with main process exclusively through IPC.
 * Subscribes to push events for real-time updates.
 *
 * Uses direct store patching for command results to avoid
 * unnecessary re-fetches and re-renders.
 */

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import {
  Store,
  StoreState,
  Course,
  Task,
  Notification,
  SimulationChangeEvent,
  DbCommitEvent,
  DisplayCalendarEvent,
  SyncResultSummary,
  SyncConflictItem,
} from './types';

// Re-export SyncResultSummary for consumers
export type { SyncResultSummary } from './types';

/**
 * Track recent optimistic updates to skip unnecessary db:commit refreshes.
 * When a command succeeds, we increment the counter for its table.
 * When db:commit arrives, we decrement and skip refresh if counter > 0.
 * This handles concurrent commands correctly (multiple updates = multiple skips).
 */
const recentOptimisticUpdates = new Map<string, number>();
// Track timeout IDs for cleanup to prevent memory leaks
const optimisticUpdateTimeouts = new Map<string, Set<ReturnType<typeof setTimeout>>>();
const OPTIMISTIC_UPDATE_WINDOW_MS = 1000; // Auto-cleanup window

function markOptimisticUpdate(table: string): void {
  const current = recentOptimisticUpdates.get(table) || 0;
  recentOptimisticUpdates.set(table, current + 1);

  // Track timeout for this table
  if (!optimisticUpdateTimeouts.has(table)) {
    optimisticUpdateTimeouts.set(table, new Set());
  }

  // Auto-decrement after window expires in case db:commit never arrives
  // This prevents memory leaks and stale skip state
  const timeoutId = setTimeout(() => {
    const count = recentOptimisticUpdates.get(table) || 0;
    if (count > 0) {
      recentOptimisticUpdates.set(table, count - 1);
    }
    if (recentOptimisticUpdates.get(table) === 0) {
      recentOptimisticUpdates.delete(table);
    }
    // Clean up timeout reference
    const timeouts = optimisticUpdateTimeouts.get(table);
    if (timeouts) {
      timeouts.delete(timeoutId);
      if (timeouts.size === 0) {
        optimisticUpdateTimeouts.delete(table);
      }
    }
  }, OPTIMISTIC_UPDATE_WINDOW_MS);

  // Store timeout ID for potential cleanup
  optimisticUpdateTimeouts.get(table)!.add(timeoutId);
}

function shouldSkipRefresh(table: string): boolean {
  const count = recentOptimisticUpdates.get(table) || 0;
  if (count <= 0) return false;

  // Decrement counter - one skip per optimistic update
  recentOptimisticUpdates.set(table, count - 1);
  if (count - 1 <= 0) {
    recentOptimisticUpdates.delete(table);
  }
  return true;
}

/**
 * Debounced db:commit handling to prevent UI freezing during sync.
 * Batches commits by table and processes them after a delay.
 */
const pendingCommits = new Set<string>();
let commitDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const COMMIT_DEBOUNCE_MS = 500; // Wait 500ms after last commit before refreshing

function queueCommitRefresh(table: string, processCommits: () => void): void {
  pendingCommits.add(table);

  if (commitDebounceTimer) {
    clearTimeout(commitDebounceTimer);
  }

  commitDebounceTimer = setTimeout(() => {
    commitDebounceTimer = null;
    processCommits();
  }, COMMIT_DEBOUNCE_MS);
}

function processPendingCommits(
  fetchCourses: () => void,
  fetchTasks: () => void,
  fetchNotifications: () => void,
  fetchPolicies: () => void,
  fetchImportedCalendars: () => void,
  refreshAll: () => void
): void {
  if (pendingCommits.size === 0) return;

  const tables = new Set(pendingCommits);
  pendingCommits.clear();

  // If too many different tables changed, just refresh all
  // Increased from 5 to 10 tables to reduce unnecessary full refreshes (#24)
  if (tables.size > 10) {
    refreshAll();
    return;
  }

  // Refresh each affected table once
  if (tables.has('courses')) fetchCourses();
  if (tables.has('tasks')) fetchTasks();
  if (tables.has('notifications')) fetchNotifications();
  if (tables.has('course_policies')) fetchPolicies();
  if (tables.has('imported_calendars') || tables.has('calendar_events')) {
    fetchImportedCalendars();
  }
}

/**
 * Initial state
 */
const initialState: StoreState = {
  courses: [],
  tasks: [],
  notifications: [],
  policies: [],
  importedCalendars: [],
  calendarEvents: [],
  simulation: {
    isActive: false,
    startedAt: null,
    grades: [],
  },
  syncStatus: 'idle',
  syncMessage: null,
  isAutoSync: false,
  lastSyncedAt: null,
  lastSyncResult: null,
  systemState: null,
  healthStatus: null,
  isAuthenticated: false,
  isInitialized: false,
  authError: null,
  lastError: null,
  syncConflicts: [],
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
 * Log user actions to the main process logger
 * All user actions are logged at 'info' level for comprehensive tracking
 */
function logUserAction(action: string, data?: Record<string, unknown>): void {
  const api = getApi();
  if (!api?.log) return;

  const message = data ? `[UI] ${action}: ${JSON.stringify(data)}` : `[UI] ${action}`;

  api.log.info(message, 'store');
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

            // Get last sync time from database
            const lastSyncTime = await api.getLastSyncTime?.();
            if (lastSyncTime) {
              set({ lastSyncedAt: lastSyncTime });
            }
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
          let courses = await api.getCourses();

          // Get term selection from database via VisibleDataProvider (single source of truth)
          let semesterSelection: 'all' | 'auto' | string = 'auto';
          try {
            const termResult = await api.getTermSelection();
            if (termResult?.termSelection !== undefined) {
              semesterSelection = String(termResult.termSelection);
            }
          } catch (e) {
            console.error('[Store] Failed to get term selection from database:', e);
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
                  api.setTermSelection(valueToSet).catch((err: unknown) => {
                    // Log migration errors instead of swallowing them (#23)
                    console.warn(
                      '[Store] Failed to migrate term selection to database:',
                      err
                    );
                  });
                }
              } catch (parseError) {
                console.error('[Store] Failed to parse academic settings:', parseError);
              }
            }
          }

          // console.debug('[Store] Semester selection:', semesterSelection, 'Courses before filter:', courses.length);

          if (semesterSelection !== 'all') {
            if (semesterSelection === 'auto') {
              // Auto-detect: show courses where semester is currently active
              // Canvas end_at is usually ~1 month after actual course end, so we subtract 30 days
              const terms = await api.getEnrollmentTerms();
              const now = new Date();
              const DAYS_BUFFER = 30; // Canvas end_at is ~1 month after actual course end

              // Debug logging disabled for production

              // Find terms that are currently active
              const currentTermIds = new Set<number>();
              for (const term of terms) {
                const termIdNum = parseInt(term.externalId, 10);

                // Skip "Default Term" - these are non-academic courses
                if (term.name === 'Default Term' || termIdNum === 1) {
                  // console.debug(`[Store] Term "${term.name}" (${termIdNum}): skipping Default Term`);
                  continue;
                }

                if (!term.endAt) {
                  // No end date and not Default Term - skip (shouldn't happen for real terms)
                  // console.debug(`[Store] Term "${term.name}" (${termIdNum}): no end_at, skipping`);
                  continue;
                }

                // Subtract buffer days from end_at to get actual course end
                const endDate = new Date(term.endAt);
                const adjustedEndDate = new Date(
                  endDate.getTime() - DAYS_BUFFER * 24 * 60 * 60 * 1000
                );
                const isCurrent = adjustedEndDate > now;

                // console.debug(`[Store] Term "${term.name}" (${termIdNum}): end_at=${term.endAt}, adjusted=${adjustedEndDate.toISOString()}, isCurrent=${isCurrent}`);

                if (isCurrent) {
                  currentTermIds.add(termIdNum);
                }
              }

              // console.debug('[Store] Current semester IDs:', Array.from(currentTermIds));

              if (currentTermIds.size > 0) {
                const _beforeCount = courses.length;
                courses = courses.filter(
                  (c: Course) =>
                    c.enrollmentTermId !== null && currentTermIds.has(c.enrollmentTermId)
                );
                // console.debug(`[Store] Filtered ${beforeCount} -> ${courses.length} courses`);
              } else {
                // console.debug('[Store] No current semesters found, showing all courses');
              }
              // console.debug('[Store] Courses after auto-filter:', courses.map((c: Course) => c.code));
            } else {
              // Specific semester selected - filter by term external_id
              const selectedTermId = parseInt(semesterSelection, 10);
              if (!isNaN(selectedTermId)) {
                courses = courses.filter(
                  (c: Course) => c.enrollmentTermId === selectedTermId
                );
                // console.debug('[Store] Filtering by semester:', selectedTermId, 'Courses after filter:', courses.length);
              }
            }
          }

          set({ courses });
        } catch (error) {
          console.error('Failed to fetch courses:', error);
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
          let tasks: Task[];

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
              // No courses loaded yet - fetch all (will be empty anyway)
              // console.debug('[Store] Fetching all tasks - no courses loaded yet');
              tasks = await api.getTasks({ courseIds: 'all' });
            } else {
              // Get visible course IDs and fetch only those tasks
              const visibleCourseIds = allCourses
                .filter((c: Course) => !c.isHidden)
                .map((c: Course) => c.id);

              // console.debug(`[Store] Fetching tasks for ${visibleCourseIds.length} visible courses`);
              tasks = await api.getTasks({ courseIds: visibleCourseIds });
            }

            set({ tasks });
          }
        } catch (error) {
          console.error('Failed to fetch tasks:', error);
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

          let notifications: Notification[];

          if (allCourses.length === 0) {
            // No courses loaded yet - fetch all
            // console.debug('[Store] Fetching all notifications - no courses loaded yet');
            notifications = await api.getNotifications({ courseIds: 'all' });
          } else {
            // Get visible course IDs and fetch only those notifications
            const visibleCourseIds = allCourses
              .filter((c: Course) => !c.isHidden)
              .map((c: Course) => c.id);

            // console.debug(`[Store] Fetching notifications for ${visibleCourseIds.length} visible courses`);
            notifications = await api.getNotifications({ courseIds: visibleCourseIds });
          }

          set({ notifications });
        } catch (error) {
          console.error('Failed to fetch notifications:', error);
          set({ lastError: error instanceof Error ? error.message : String(error) });
        }
      },

      /**
       * Fetch policies for visible courses
       * Used for displaying policy badges on task cards
       */
      fetchPolicies: async () => {
        const api = getApi();
        if (!api) return;

        try {
          const allCourses = get().courses;

          if (allCourses.length === 0) {
            // No courses loaded yet - fetch all policies
            const policies = await api.getAllPolicies();
            set({ policies });
          } else {
            // Get visible course IDs and fetch only those policies
            const visibleCourseIds = allCourses
              .filter((c: Course) => !c.isHidden)
              .map((c: Course) => c.id);

            const policies = await api.getAllPolicies({ courseIds: visibleCourseIds });
            set({ policies });
          }
        } catch (error) {
          console.error('Failed to fetch policies:', error);
          // Don't set lastError for policies - not critical
        }
      },

      /**
       * Refresh all data
       * Uses Promise.allSettled to ensure partial failures don't block other refreshes
       */
      refreshAll: async () => {
        console.debug('[Store] refreshAll: starting');
        const startTime = Date.now();
        const {
          fetchCourses,
          fetchTasks,
          fetchNotifications,
          fetchPolicies,
          fetchImportedCalendars,
        } = get();
        try {
          // Fetch courses FIRST since tasks filtering depends on courses being loaded
          await fetchCourses();
          // Then fetch everything else in parallel - use allSettled to handle partial failures
          const results = await Promise.allSettled([
            fetchTasks(),
            fetchNotifications(),
            fetchPolicies(),
            fetchImportedCalendars(),
          ]);

          // Log any unexpected failures (individual fetch methods already handle their own errors)
          const failures = results.filter(
            (r): r is PromiseRejectedResult => r.status === 'rejected'
          );
          if (failures.length > 0) {
            for (const failure of failures) {
              console.error('[Store] Unexpected refresh failure:', failure.reason);
            }
          }
          console.debug(`[Store] refreshAll: completed in ${Date.now() - startTime}ms`);
        } catch (error) {
          console.error('[Store] refreshAll: fatal error', error);
          throw error;
        }
      },

      // ============ Imported Calendar Actions ============

      /**
       * Fetch all imported calendars
       */
      fetchImportedCalendars: async () => {
        const api = getApi();
        if (!api) {
          console.warn('[Store] No API available for fetchImportedCalendars');
          return;
        }

        try {
          // console.log('[Store] Fetching imported calendars...');
          const calendars = await api.getImportedCalendars();
          // console.log('[Store] Fetched imported calendars:', calendars.length, calendars);
          set({ importedCalendars: calendars });
        } catch (error) {
          console.error('Failed to fetch imported calendars:', error);
        }
      },

      /**
       * Fetch calendar events for a date range
       */
      fetchCalendarEventsForRange: async (startDate: Date, endDate: Date) => {
        const api = getApi();
        if (!api) {
          console.warn('[Store] No API available for fetchCalendarEventsForRange');
          return;
        }

        try {
          const events = await api.getCalendarEventsForRange({
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            includeHidden: false,
          });
          // console.log('[Store] Fetched calendar events:', events.length, events);
          set({ calendarEvents: events });
        } catch (error) {
          console.error('Failed to fetch calendar events:', error);
        }
      },

      /**
       * Import an ICS file
       */
      importICSFile: async (
        content: string,
        filename: string,
        options?: { name?: string; color?: string }
      ) => {
        const api = getApi();
        if (!api) {
          console.warn('[Store] No API available for importICSFile');
          return { success: false };
        }

        try {
          // console.log('[Store] Importing ICS file:', { filename, options, contentLength: content.length });
          const result = await api.importICS({
            content,
            filename,
            name: options?.name,
            color: options?.color,
          });

          // console.log('[Store] Import ICS result:', result);

          if (result.success) {
            // Refresh calendars
            // console.log('[Store] Refreshing calendars after import...');
            await get().fetchImportedCalendars();
          }

          return {
            success: result.success,
            calendarId: result.data?.calendarId,
            eventCount: result.data?.eventCount,
          };
        } catch (error) {
          console.error('Failed to import ICS:', error);
          return { success: false };
        }
      },

      /**
       * Delete an imported calendar
       */
      deleteImportedCalendar: async (calendarId: number) => {
        const api = getApi();
        if (!api) return false;

        try {
          const calendar = get().importedCalendars.find((c) => c.id === calendarId);
          const result = await api.deleteImportedCalendar(calendarId);
          if (result.success) {
            logUserAction('Calendar deleted', { calendarId, name: calendar?.name });
            set((state) => ({
              importedCalendars: state.importedCalendars.filter(
                (c) => c.id !== calendarId
              ),
              calendarEvents: state.calendarEvents.filter(
                (e) => e.importedCalendarId !== calendarId
              ),
            }));
          }
          return result.success;
        } catch (error) {
          console.error('Failed to delete calendar:', error);
          return false;
        }
      },

      /**
       * Toggle calendar visibility
       */
      toggleCalendarVisibility: async (calendarId: number, isVisible: boolean) => {
        const api = getApi();
        if (!api) return false;

        try {
          const result = await api.toggleCalendarVisibility(calendarId, isVisible);
          if (result.success) {
            set((state) => ({
              importedCalendars: state.importedCalendars.map((c) =>
                c.id === calendarId ? { ...c, isVisible } : c
              ),
            }));
          }
          return result.success;
        } catch (error) {
          console.error('Failed to toggle calendar visibility:', error);
          return false;
        }
      },

      /**
       * Update calendar metadata
       */
      updateImportedCalendar: async (
        calendarId: number,
        updates: { name?: string; color?: string }
      ) => {
        const api = getApi();
        if (!api) return false;

        try {
          const result = await api.updateImportedCalendar(calendarId, updates);
          if (result.success) {
            set((state) => ({
              importedCalendars: state.importedCalendars.map((c) =>
                c.id === calendarId ? { ...c, ...updates } : c
              ),
            }));
          }
          return result.success;
        } catch (error) {
          console.error('Failed to update calendar:', error);
          return false;
        }
      },

      /**
       * Create a user calendar event
       */
      createCalendarEvent: async (data: {
        title: string;
        description?: string;
        startAt: string;
        endAt?: string;
        allDay: boolean;
        location?: string;
        courseId?: number;
        color?: string;
        notes?: string;
        reminderMinutes?: number;
      }) => {
        const api = getApi();
        if (!api) return { success: false };

        try {
          const result = await api.createCalendarEvent(data);
          if (result.success && result.data) {
            // Optimistic update - add the new event to the list
            const newEvent: DisplayCalendarEvent = {
              id: result.data.id,
              externalId: null,
              sourceType: 'user',
              courseId: data.courseId ?? null,
              importedCalendarId: null,
              taskId: null,
              title: data.title,
              description: data.description ?? null,
              startAt: data.startAt,
              endAt: data.endAt ?? null,
              allDay: data.allDay,
              location: data.location ?? null,
              uid: null,
              recurrenceRule: null,
              recurrenceExceptionDates: null,
              parentEventId: null,
              eventColor: data.color ?? null,
              notes: data.notes ?? null,
              reminderMinutes: data.reminderMinutes ?? null,
              isRecurrenceInstance: false,
              color: data.color ?? '#6366F1', // Use provided color or default user event color
            };
            set((state) => ({
              calendarEvents: [...state.calendarEvents, newEvent],
            }));
            return { success: true, id: result.data.id };
          }
          return { success: false };
        } catch (error) {
          console.error('Failed to create calendar event:', error);
          return { success: false };
        }
      },

      /**
       * Update a calendar event
       */
      updateCalendarEvent: async (
        id: number,
        data: {
          title?: string;
          description?: string;
          startAt?: string;
          endAt?: string;
          allDay?: boolean;
          location?: string;
          courseId?: number | null;
          color?: string;
          notes?: string;
          reminderMinutes?: number;
          taskType?: string;
        }
      ) => {
        const api = getApi();
        if (!api) return false;

        try {
          const result = await api.updateCalendarEvent(id, data);
          if (result.success) {
            // Optimistic update
            set((state) => ({
              calendarEvents: state.calendarEvents.map((e) =>
                e.id === id
                  ? {
                      ...e,
                      ...(data.title !== undefined && { title: data.title }),
                      ...(data.description !== undefined && {
                        description: data.description,
                      }),
                      ...(data.startAt !== undefined && { startAt: data.startAt }),
                      ...(data.endAt !== undefined && { endAt: data.endAt }),
                      ...(data.allDay !== undefined && { allDay: data.allDay }),
                      ...(data.location !== undefined && { location: data.location }),
                      ...(data.courseId !== undefined && { courseId: data.courseId }),
                      ...(data.color !== undefined && {
                        eventColor: data.color,
                        color: data.color,
                      }),
                      ...(data.notes !== undefined && { notes: data.notes }),
                      ...(data.reminderMinutes !== undefined && {
                        reminderMinutes: data.reminderMinutes,
                      }),
                    }
                  : e
              ),
            }));
          }
          return result.success;
        } catch (error) {
          console.error('Failed to update calendar event:', error);
          return false;
        }
      },

      /**
       * Delete a calendar event
       */
      deleteCalendarEvent: async (id: number) => {
        const api = getApi();
        if (!api) return false;

        try {
          const result = await api.deleteCalendarEvent(id);
          if (result.success) {
            // Optimistic update - remove from list
            set((state) => ({
              calendarEvents: state.calendarEvents.filter((e) => e.id !== id),
            }));
          }
          return result.success;
        } catch (error) {
          console.error('Failed to delete calendar event:', error);
          return false;
        }
      },

      /**
       * Export calendars to ICS
       */
      exportCalendarsBatch: async (options: {
        mode: 'all' | 'selected';
        calendarIds?: number[];
        courseIds?: number[];
        includeUserEvents?: boolean;
        consolidate?: boolean;
        dateRange?: { start: string; end: string };
      }) => {
        const api = getApi();
        if (!api) return { success: false };

        try {
          const result = await api.exportCalendarsBatch(options);
          return {
            success: result.success,
            content: result.data?.content,
            eventCount: result.data?.eventCount,
          };
        } catch (error) {
          console.error('Failed to export calendars:', error);
          return { success: false };
        }
      },

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
            logUserAction('Notification dismissed', { notificationId });
            // Mark optimistic update
            markOptimisticUpdate('notifications');
            // Update local state directly
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
       * @param type Sync type: 'full', 'courses', 'tasks', or 'notifications'
       * @param options Optional sync options for full sync (termSelection, syncCanvasFiles, syncAnnouncements, isAutoSync)
       * @returns Sync result with success status and summary data
       */
      triggerSync: async (
        type: 'full' | 'courses' | 'tasks' | 'notifications',
        options?: {
          termSelection?: 'all' | 'auto' | string;
          syncCanvasFiles?: boolean;
          syncAnnouncements?: boolean;
          isAutoSync?: boolean;
          courseIds?: number[];
        }
      ) => {
        const api = getApi();
        if (!api) return { success: false };

        const isAutoSync = options?.isAutoSync ?? false;

        // Set initial sync state with message
        const getSyncMessage = (phase: string) => {
          switch (phase) {
            case 'courses':
              return 'Syncing courses...';
            case 'tasks':
              return 'Syncing assignments...';
            case 'notifications':
              return 'Syncing announcements...';
            case 'files':
              return 'Syncing files...';
            default:
              return 'Syncing...';
          }
        };

        logUserAction('Sync started', { type, isAutoSync });

        set({
          syncStatus: 'syncing',
          syncMessage: getSyncMessage(type === 'full' ? 'courses' : type),
          isAutoSync,
        });

        try {
          let result;
          if (type === 'full') {
            // Update message as we progress through phases
            set({ syncMessage: 'Syncing courses...' });
            result = await api.syncFull(options);
          } else if (type === 'courses') {
            result = await api.syncCourses();
          } else {
            result = await api.dispatch('TriggerSync', { type });
          }

          if (result.success) {
            const timestamp = new Date().toISOString();
            // Parse the sync result into a summary for display
            const syncResult = result.result;
            const summary: SyncResultSummary = {
              courses: syncResult?.courses
                ? {
                    synced: syncResult.courses.synced || 0,
                    new: syncResult.courses.inserted || 0,
                  }
                : undefined,
              tasks: syncResult?.tasks
                ? {
                    synced: syncResult.tasks.synced || 0,
                    new: syncResult.tasks.inserted || 0,
                  }
                : undefined,
              announcements: syncResult?.notifications
                ? {
                    synced: syncResult.notifications.synced || 0,
                    new: syncResult.notifications.inserted || 0,
                  }
                : undefined,
              files: syncResult?.files
                ? {
                    synced: syncResult.files.synced || 0,
                    new: syncResult.files.inserted || 0,
                  }
                : undefined,
              errors: syncResult?.errors || [],
              timestamp,
            };
            logUserAction('Sync completed', {
              type,
              courses: summary.courses?.synced,
              tasks: summary.tasks?.synced,
              newItems: (summary.courses?.new || 0) + (summary.tasks?.new || 0),
            });
            set({
              syncStatus: 'idle',
              syncMessage: null,
              isAutoSync: false,
              lastSyncedAt: timestamp,
              lastSyncResult: summary,
            });
            // Refresh data after sync
            await get().refreshAll();
            // Return the full result including sync summary
            return { success: true, result: result.result, summary };
          } else {
            set({
              syncStatus: 'error',
              syncMessage: null,
              isAutoSync: false,
              lastError: result.error,
            });
            return { success: false, error: result.error };
          }
        } catch (error) {
          console.error('Failed to trigger sync:', error);
          const errorMsg = error instanceof Error ? error.message : String(error);
          set({
            syncStatus: 'error',
            syncMessage: null,
            isAutoSync: false,
            lastError: errorMsg,
          });
          return { success: false, error: errorMsg };
        }
      },

      /**
       * Dismiss the auto-sync banner
       */
      dismissAutoSyncBanner: () => {
        set({ isAutoSync: false });
      },

      /**
       * Set authentication state
       */
      setAuthenticated: (authenticated: boolean) => {
        set({ isAuthenticated: authenticated });
      },

      /**
       * Set auth error (e.g., token expired)
       */
      setAuthError: (error) => {
        set({ authError: error });
      },

      /**
       * Clear auth error
       */
      clearAuthError: () => {
        set({ authError: null });
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
       *
       * Debounces refreshes to prevent UI freezing during sync.
       * Skips refresh if we recently performed an optimistic update for that table.
       */
      handleDbCommit: (event: DbCommitEvent) => {
        // Skip refresh if we recently updated this table optimistically
        if (shouldSkipRefresh(event.table)) {
          // console.debug(`[Store] Skipping refresh for ${event.table} (recent optimistic update)`);
          return;
        }

        // Skip immediate refresh while syncing - we'll refresh when sync completes
        const { syncStatus } = get();
        if (syncStatus === 'syncing') {
          // Just track which tables changed, don't refresh yet
          pendingCommits.add(event.table);
          return;
        }

        // Queue the refresh with debouncing
        const {
          fetchCourses,
          fetchTasks,
          fetchNotifications,
          fetchPolicies,
          fetchImportedCalendars,
          refreshAll,
        } = get();
        queueCommitRefresh(event.table, () => {
          processPendingCommits(
            fetchCourses,
            fetchTasks,
            fetchNotifications,
            fetchPolicies,
            fetchImportedCalendars,
            refreshAll
          );
        });
      },

      /**
       * Set error state
       */
      setError: (error: string | null) => {
        set({ lastError: error });
      },

      /**
       * Clear last sync result (to dismiss the toast)
       */
      clearSyncResult: () => {
        set({ lastSyncResult: null });
      },

      /**
       * Add sync conflicts from sync engine (merges with existing, no duplicates)
       */
      addSyncConflicts: (conflicts) => {
        set((state) => {
          const existingMap = new Map(state.syncConflicts.map((c) => [c.id, c]));

          // Merge new conflicts - update existing or add new
          for (const conflict of conflicts) {
            existingMap.set(conflict.id, conflict);
          }

          return { syncConflicts: Array.from(existingMap.values()) };
        });
      },

      /**
       * Resolve a single sync conflict
       */
      resolveSyncConflict: async (
        conflictId,
        useCanvasValue,
        rememberChoice,
        rememberForAll,
        expiresAt
      ) => {
        const api = getApi();
        if (!api) return;

        try {
          await api.resolveSyncConflict({
            conflictId,
            useCanvasValue,
            rememberChoice,
            rememberForAll,
            expiresAt,
          });

          // Remove the resolved conflict from state
          set((state) => ({
            syncConflicts: state.syncConflicts.filter((c) => c.id !== conflictId),
          }));

          // Refresh data after resolution
          await get().refreshAll();
        } catch (error) {
          console.error('Failed to resolve sync conflict:', error);
        }
      },

      /**
       * Resolve all sync conflicts at once
       */
      resolveAllSyncConflicts: async (useCanvasValues) => {
        const api = getApi();
        if (!api) return;

        try {
          await api.resolveAllSyncConflicts(useCanvasValues);

          // Clear all conflicts from state
          set({ syncConflicts: [] });

          // Refresh data after resolution
          await get().refreshAll();
        } catch (error) {
          console.error('Failed to resolve all sync conflicts:', error);
        }
      },

      /**
       * Clear sync conflicts without resolving (dismiss)
       */
      clearSyncConflicts: () => {
        set({ syncConflicts: [] });
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

  const unsubSyncStatus = api.onSyncStatus(
    async (status: 'idle' | 'syncing' | 'error') => {
      console.debug(`[Store] sync:status received: ${status}`);
      useStore.setState({ syncStatus: status });
      // Update lastSyncedAt when sync completes successfully
      if (status === 'idle') {
        useStore.setState({ lastSyncedAt: new Date().toISOString() });
        // Refresh data after sync - await to ensure UI updates before processing other events
        // This fixes IPC event ordering race where db:commit events could arrive out of order
        try {
          await useStore.getState().refreshAll();
        } catch (err) {
          console.error('[Store] refreshAll failed after sync:status idle:', err);
        }
      }
    }
  );

  const unsubSyncConflicts = api.onSyncConflicts((conflicts: SyncConflictItem[]) => {
    useStore.getState().addSyncConflicts(conflicts);
  });

  const unsubAuthExpired =
    api.onAuthExpired?.((data: { reason: string }) => {
      useStore.getState().setAuthError({ type: 'expired', reason: data.reason });
    }) || (() => {});

  const unsubAppReset =
    api.onAppReset?.((data: { tokenDeleted: boolean; clearLocalStorage: boolean }) => {
      // Handle app reset from main process - clear localStorage and reload
      if (data.clearLocalStorage) {
        localStorage.clear();
      }
      // Reload to go back to login/onboarding
      window.location.reload();
    }) || (() => {});

  // Listen for file status changes from FileWatcher (deletions, additions)
  const unsubFileStatus =
    api.onFileStatusChanged?.(
      (data: { type: 'deleted' | 'added'; resourceId?: number; path: string }) => {
        console.debug(`[Store] file-status-changed: ${data.type} ${data.path}`);
        // Files aren't stored in zustand - components fetch them directly
        // Just broadcast an event so components can refetch if needed
        // The store will emit a custom event that FilesPage can listen to
        window.dispatchEvent(new CustomEvent('file-status-changed', { detail: data }));
      }
    ) || (() => {});

  // Listen for sync phase changes (staged progress)
  const unsubSyncPhase =
    api.onSyncPhase?.((data: { phase: string; status: string }) => {
      if (data.status === 'started') {
        const phaseMessages: Record<string, string> = {
          fetch: 'Loading courses...',
          commit: 'Saving data...',
          'file-refs': 'Processing files...',
          'html-content': 'Downloading content...',
        };
        const message = phaseMessages[data.phase] || `Syncing ${data.phase}...`;
        useStore.setState({ syncMessage: message });
      }
    }) || (() => {});

  // Listen for sync progress updates (per-course progress)
  const unsubSyncProgress =
    api.onSyncProgress?.(
      (data: {
        syncId: string;
        phase: string;
        totalCourses: number;
        completedCourses: number;
        currentCourse?: string;
      }) => {
        if (data.currentCourse) {
          useStore.setState({
            syncMessage: `Syncing ${data.currentCourse}... (${data.completedCourses}/${data.totalCourses})`,
          });
        }
      }
    ) || (() => {});

  return () => {
    unsubSimulation();
    unsubDbCommit();
    unsubSyncStatus();
    unsubSyncConflicts();
    unsubAuthExpired();
    unsubAppReset();
    unsubFileStatus();
    unsubSyncPhase();
    unsubSyncProgress();
  };
}

/**
 * Memoized course grades calculation
 * Uses a cache to avoid O(courses × tasks) on every render
 */
const courseGradesCache = new Map<
  string,
  { earned: number; trend: number; assessed: number }
>();
let lastTasksHash = '';

function computeTasksHash(
  tasks: { courseId: number; weight: number; grade: number | null }[]
): string {
  // Simple hash based on task courseId and grades - changes trigger recalculation
  return tasks
    .filter((t) => t.weight > 0)
    .map((t) => `${t.courseId}:${t.grade}:${t.weight}`)
    .join('|');
}

export function getCachedCourseGrades(
  courseId: number,
  tasks: { courseId: number; weight: number; grade: number | null }[]
): { earned: number; trend: number; assessed: number } {
  const tasksHash = computeTasksHash(tasks);

  // Invalidate cache if tasks changed
  if (tasksHash !== lastTasksHash) {
    courseGradesCache.clear();
    lastTasksHash = tasksHash;
  }

  const cacheKey = `${courseId}`;
  const cached = courseGradesCache.get(cacheKey);
  if (cached) return cached;

  // Calculate grades for this course
  let totalWeight = 0;
  let totalContribution = 0;

  for (const task of tasks) {
    if (task.courseId === courseId && task.weight > 0 && task.grade !== null) {
      totalWeight += task.weight;
      totalContribution += (task.grade / 100) * task.weight;
    }
  }

  const result = {
    earned: totalContribution,
    assessed: totalWeight,
    trend: totalWeight > 0 ? (totalContribution / totalWeight) * 100 : 0,
  };

  courseGradesCache.set(cacheKey, result);
  return result;
}

/**
 * Selectors for common queries
 */
export const selectors = {
  /**
   * Get visible (non-hidden) courses
   */
  visibleCourses: (state: StoreState) => state.courses.filter((c) => !c.isHidden),

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
   * Get policies for a specific course
   */
  coursePolicies: (courseId: number) => (state: StoreState) =>
    state.policies.filter((p) => p.courseId === courseId && p.isActive),

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

  /**
   * Get visible imported calendars
   */
  visibleCalendars: (state: StoreState) =>
    state.importedCalendars.filter((c) => c.isVisible),

  /**
   * Get calendar events for visible calendars
   */
  visibleCalendarEvents: (state: StoreState) => {
    const visibleIds = new Set(
      state.importedCalendars.filter((c) => c.isVisible).map((c) => c.id)
    );
    return state.calendarEvents.filter(
      (e) => e.importedCalendarId && visibleIds.has(e.importedCalendarId)
    );
  },

  /**
   * Get events for a specific calendar
   */
  calendarEvents: (calendarId: number) => (state: StoreState) =>
    state.calendarEvents.filter((e) => e.importedCalendarId === calendarId),

  /**
   * Get memoized grade calculations for a course
   * Uses internal cache to avoid O(courses × tasks) calculations
   */
  courseGrades: (courseId: number) => (state: StoreState) =>
    getCachedCourseGrades(courseId, state.tasks),

  /**
   * Get all course grades (memoized)
   */
  allCourseGrades: (state: StoreState) => {
    const grades: Record<number, { earned: number; trend: number; assessed: number }> =
      {};
    for (const course of state.courses) {
      grades[course.id] = getCachedCourseGrades(course.id, state.tasks);
    }
    return grades;
  },
};
