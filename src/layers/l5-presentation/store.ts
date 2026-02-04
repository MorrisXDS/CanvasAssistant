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
} from './types';
import {
  markOptimisticUpdate,
  shouldSkipRefresh,
  queueCommitRefresh,
  addPendingCommit,
  processPendingCommits,
} from './storeHelpers';
import { getEffectiveTimezone } from './settings';

// Re-export for consumers
export type { SyncResultSummary } from './types';
export { subscribeToIpcEvents } from './storeSubscriptions';
export { getCachedCourseGrades } from './courseGradesCache';
export { selectors } from './storeSelectors';

/**
 * Initial state
 */
const initialState: StoreState = {
  courses: [],
  tasks: [],
  notifications: [],
  taskQueue: [],
  taskQueueCount: 0,
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

      // =========================================================================
      // Canvas Task Queue Actions
      // =========================================================================

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
            } else {
              set({ taskQueue: [], taskQueueCount: 0 });
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
            // Refresh tasks to show updated merged task
            await get().fetchTasks();
          }
          return result;
        } catch (error) {
          console.error('Failed to merge queued task:', error);
          return { success: false };
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
          fetchImportedCalendars,
          fetchTaskQueueCount,
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
          // Get effective timezone for DST-aware recurrence expansion
          let timezone = getEffectiveTimezone();
          // If 'local', resolve to actual system timezone IANA string
          if (timezone === 'local') {
            timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          }
          const events = await api.getCalendarEventsForRange({
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            includeHidden: false,
            timezone, // Always pass timezone for DST-aware expansion
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

          // Return result including existingCalendar info for duplicate detection
          return {
            success: result.success,
            calendarId: result.data?.calendarId,
            eventCount: result.data?.eventCount,
            existingCalendar: result.existingCalendar,
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
       * Re-import an existing calendar (replace events with new content)
       */
      reimportCalendar: async (calendarId: number, content: string) => {
        const api = getApi();
        if (!api) return { success: false };

        try {
          const result = await api.reimportCalendar(calendarId, content);
          if (result.success) {
            // Refresh calendars and events
            await get().fetchImportedCalendars();
          }
          return result;
        } catch (error) {
          console.error('Failed to reimport calendar:', error);
          return { success: false };
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
          weight?: number;
        }
      ) => {
        const api = getApi();
        if (!api) return false;

        try {
          const result = await api.updateCalendarEvent(id, data);
          if (result.success) {
            // Get the event to find linked taskId before updating
            const currentEvent = get().calendarEvents.find((e) => e.id === id);
            const linkedTaskId = currentEvent?.taskId;

            // Optimistic update for calendar events
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

            // Bidirectional sync: also update linked task in store immediately
            if (linkedTaskId) {
              set((state) => ({
                tasks: state.tasks.map((t) =>
                  t.id === linkedTaskId
                    ? {
                        ...t,
                        ...(data.title !== undefined && { title: data.title }),
                        ...(data.description !== undefined && {
                          description: data.description,
                        }),
                        ...(data.startAt !== undefined && { unlockAt: data.startAt }),
                        ...(data.endAt !== undefined && { dueAt: data.endAt }),
                        ...(data.location !== undefined && { location: data.location }),
                        // Only update courseId if it's a valid number (not null)
                        ...(data.courseId !== undefined &&
                          data.courseId !== null && { courseId: data.courseId }),
                        ...(data.taskType !== undefined && { taskType: data.taskType }),
                        ...(data.weight !== undefined && { weight: data.weight }),
                      }
                    : t
                ),
              }));
            }
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

            // Sync Canvas timezone during full sync
            if (type === 'full') {
              get().syncCanvasTimezone();
            }

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
       * Sync Canvas timezone from user profile and store in localStorage
       * This fetches the timezone from Canvas and updates the local settings
       */
      syncCanvasTimezone: async () => {
        const api = getApi();
        if (!api) return;

        try {
          // Fetch user profile from Canvas (includes time_zone)
          const profileResult = await api.getUserProfile();
          if (profileResult.success && profileResult.data?.time_zone) {
            const timezone = profileResult.data.time_zone;

            // Store in database via IPC
            await api.syncCanvasTimezone(timezone);

            // Update localStorage for renderer access
            const currentSettings = JSON.parse(
              localStorage.getItem('timezoneSettings') || '{}'
            );
            localStorage.setItem(
              'timezoneSettings',
              JSON.stringify({
                ...currentSettings,
                canvasTimezone: timezone,
                lastSyncedAt: new Date().toISOString(),
              })
            );

            console.log(`Canvas timezone synced: ${timezone}`);
          }
        } catch (error) {
          console.error('Failed to sync Canvas timezone:', error);
        }
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
          addPendingCommit(event.table);
          return;
        }

        // Queue the refresh with debouncing
        const {
          fetchCourses,
          fetchTasks,
          fetchNotifications,
          fetchImportedCalendars,
          refreshAll,
        } = get();
        queueCommitRefresh(event.table, () => {
          processPendingCommits(
            fetchCourses,
            fetchTasks,
            fetchNotifications,
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
