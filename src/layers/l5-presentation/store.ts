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
  SimulationState,
  SimulationChangeEvent,
  DbCommitEvent,
  SyncStatus,
  SystemState,
  HealthStatus,
  ImportedCalendar,
  DisplayCalendarEvent,
  EnrollmentTerm,
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
const OPTIMISTIC_UPDATE_WINDOW_MS = 1000; // Auto-cleanup window

function markOptimisticUpdate(table: string): void {
  const current = recentOptimisticUpdates.get(table) || 0;
  recentOptimisticUpdates.set(table, current + 1);

  // Auto-decrement after window expires in case db:commit never arrives
  // This prevents memory leaks and stale skip state
  setTimeout(() => {
    const count = recentOptimisticUpdates.get(table) || 0;
    if (count > 0) {
      recentOptimisticUpdates.set(table, count - 1);
    }
    if (recentOptimisticUpdates.get(table) === 0) {
      recentOptimisticUpdates.delete(table);
    }
  }, OPTIMISTIC_UPDATE_WINDOW_MS);
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
  fetchImportedCalendars: () => void,
  refreshAll: () => void
): void {
  if (pendingCommits.size === 0) return;

  const tables = new Set(pendingCommits);
  pendingCommits.clear();

  // If too many different tables changed, just refresh all
  if (tables.size > 3) {
    refreshAll();
    return;
  }

  // Refresh each affected table once
  if (tables.has('courses')) fetchCourses();
  if (tables.has('tasks')) fetchTasks();
  if (tables.has('notifications')) fetchNotifications();
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
          let courses = await api.getCourses();

          // Debug: Log all courses with their term info
          console.debug('[Store] All courses fetched:', courses.map((c: Course) => ({
            id: c.id,
            code: c.code,
            name: c.name,
            enrollmentTermId: c.enrollmentTermId,
          })));

          // Apply semester filtering based on academic settings
          // Default to 'auto' if no settings exist (matches UI default)
          let semesterSelection: 'all' | 'auto' | string = 'auto';
          const academicSettings = localStorage.getItem('academicSettings');
          if (academicSettings) {
            try {
              const settings = JSON.parse(academicSettings);
              semesterSelection = settings.termSelection || 'auto';
            } catch (e) {
              console.error('[Store] Failed to parse academic settings:', e);
            }
          }

          console.debug('[Store] Semester selection:', semesterSelection, 'Courses before filter:', courses.length);

          if (semesterSelection !== 'all') {
            if (semesterSelection === 'auto') {
              // Auto-detect: show courses where semester is currently active
              // Canvas end_at is usually ~1 month after actual course end, so we subtract 30 days
              const terms = await api.getEnrollmentTerms();
              const now = new Date();
              const DAYS_BUFFER = 30; // Canvas end_at is ~1 month after actual course end

              console.debug('[Store] All terms from DB:', terms.map((t: EnrollmentTerm) => ({
                id: t.id,
                externalId: t.externalId,
                name: t.name,
                startAt: t.startAt,
                endAt: t.endAt,
              })));
              console.debug('[Store] Current date:', now.toISOString());

              // Find terms that are currently active
              const currentTermIds = new Set<number>();
              for (const term of terms) {
                const termIdNum = parseInt(term.externalId, 10);

                // Skip "Default Term" - these are non-academic courses
                if (term.name === 'Default Term' || termIdNum === 1) {
                  console.debug(`[Store] Term "${term.name}" (${termIdNum}): skipping Default Term`);
                  continue;
                }

                if (!term.endAt) {
                  // No end date and not Default Term - skip (shouldn't happen for real terms)
                  console.debug(`[Store] Term "${term.name}" (${termIdNum}): no end_at, skipping`);
                  continue;
                }

                // Subtract buffer days from end_at to get actual course end
                const endDate = new Date(term.endAt);
                const adjustedEndDate = new Date(endDate.getTime() - DAYS_BUFFER * 24 * 60 * 60 * 1000);
                const isCurrent = adjustedEndDate > now;

                console.debug(`[Store] Term "${term.name}" (${termIdNum}): end_at=${term.endAt}, adjusted=${adjustedEndDate.toISOString()}, isCurrent=${isCurrent}`);

                if (isCurrent) {
                  currentTermIds.add(termIdNum);
                }
              }

              console.debug('[Store] Current semester IDs:', Array.from(currentTermIds));

              if (currentTermIds.size > 0) {
                const beforeCount = courses.length;
                courses = courses.filter((c: Course) =>
                  c.enrollmentTermId !== null && currentTermIds.has(c.enrollmentTermId)
                );
                console.debug(`[Store] Filtered ${beforeCount} -> ${courses.length} courses`);
              } else {
                console.debug('[Store] No current semesters found, showing all courses');
              }
              console.debug('[Store] Courses after auto-filter:', courses.map((c: Course) => c.code));
            } else {
              // Specific semester selected - filter by term external_id
              const selectedTermId = parseInt(semesterSelection, 10);
              if (!isNaN(selectedTermId)) {
                courses = courses.filter((c: Course) => c.enrollmentTermId === selectedTermId);
                console.debug('[Store] Filtering by semester:', selectedTermId, 'Courses after filter:', courses.length);
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
       * Fetch tasks (optionally for a specific course)
       */
      fetchTasks: async (courseId?: number) => {
        const api = getApi();
        if (!api) return;

        try {
          let tasks = await api.getTasks(courseId);

          if (!courseId) {
            // Filter tasks to only include those from visible (non-hidden) courses filtered by semester
            const allCourses = get().courses;
            const visibleCourseIds = new Set(
              allCourses.filter((c: Course) => !c.isHidden).map((c: Course) => c.id)
            );

            // Only skip filtering if NO courses are loaded yet (loading state)
            // If courses exist but all are hidden, filter will return empty (correct behavior)
            if (allCourses.length === 0) {
              console.debug(`[Store] Skipping task filter - no courses loaded yet (${tasks.length} tasks)`);
            } else {
              const beforeCount = tasks.length;
              tasks = tasks.filter((t: Task) => visibleCourseIds.has(t.courseId));
              console.debug(`[Store] Filtered tasks: ${beforeCount} -> ${tasks.length} (only from ${visibleCourseIds.size} visible courses)`);
            }
          }

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
       * Uses Promise.allSettled to ensure partial failures don't block other refreshes
       */
      refreshAll: async () => {
        const { fetchCourses, fetchTasks, fetchNotifications, fetchImportedCalendars } = get();
        // Fetch courses FIRST since tasks filtering depends on courses being loaded
        await fetchCourses();
        // Then fetch everything else in parallel - use allSettled to handle partial failures
        const results = await Promise.allSettled([
          fetchTasks(),
          fetchNotifications(),
          fetchImportedCalendars(),
        ]);

        // Log any unexpected failures (individual fetch methods already handle their own errors)
        const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
        if (failures.length > 0) {
          for (const failure of failures) {
            console.error('[Store] Unexpected refresh failure:', failure.reason);
          }
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
          console.log('[Store] Fetching imported calendars...');
          const calendars = await api.getImportedCalendars();
          console.log('[Store] Fetched imported calendars:', calendars.length, calendars);
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
          console.log('[Store] Fetching calendar events for range:', {
            start: startDate.toISOString(),
            end: endDate.toISOString(),
          });
          const events = await api.getCalendarEventsForRange({
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            includeHidden: false,
          });
          console.log('[Store] Fetched calendar events:', events.length, events);
          set({ calendarEvents: events });
        } catch (error) {
          console.error('Failed to fetch calendar events:', error);
        }
      },

      /**
       * Import an ICS file
       */
      importICSFile: async (content: string, filename: string, options?: { name?: string; color?: string }) => {
        const api = getApi();
        if (!api) {
          console.warn('[Store] No API available for importICSFile');
          return { success: false };
        }

        try {
          console.log('[Store] Importing ICS file:', { filename, options, contentLength: content.length });
          const result = await api.importICS({
            content,
            filename,
            name: options?.name,
            color: options?.color,
          });

          console.log('[Store] Import ICS result:', result);

          if (result.success) {
            // Refresh calendars
            console.log('[Store] Refreshing calendars after import...');
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
          const result = await api.deleteImportedCalendar(calendarId);
          if (result.success) {
            set((state) => ({
              importedCalendars: state.importedCalendars.filter((c) => c.id !== calendarId),
              calendarEvents: state.calendarEvents.filter((e) => e.importedCalendarId !== calendarId),
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
      updateImportedCalendar: async (calendarId: number, updates: { name?: string; color?: string }) => {
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
       * Update target grade for a course
       */
      updateTargetGrade: async (courseId: number, targetGrade: number) => {
        const api = getApi();
        if (!api) return false;

        try {
          const result = await api.dispatch('UpdateTargetGrade', { courseId, targetGrade });
          if (result.success) {
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
            // Mark optimistic updates (task + course assessed grade)
            markOptimisticUpdate('tasks');
            markOptimisticUpdate('courses');
            // Update local state directly
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
        }
      ) => {
        const api = getApi();
        if (!api) return { success: false };

        const isAutoSync = options?.isAutoSync ?? false;

        // Set initial sync state with message
        const getSyncMessage = (phase: string) => {
          switch (phase) {
            case 'courses': return 'Syncing courses...';
            case 'tasks': return 'Syncing assignments...';
            case 'notifications': return 'Syncing announcements...';
            case 'files': return 'Syncing files...';
            default: return 'Syncing...';
          }
        };

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
              courses: syncResult?.courses ? {
                synced: syncResult.courses.synced || 0,
                new: syncResult.courses.inserted || 0,
              } : undefined,
              tasks: syncResult?.tasks ? {
                synced: syncResult.tasks.synced || 0,
                new: syncResult.tasks.inserted || 0,
              } : undefined,
              announcements: syncResult?.notifications ? {
                synced: syncResult.notifications.synced || 0,
                new: syncResult.notifications.inserted || 0,
              } : undefined,
              files: syncResult?.files ? {
                synced: syncResult.files.synced || 0,
                new: syncResult.files.inserted || 0,
              } : undefined,
              errors: syncResult?.errors || [],
              timestamp,
            };
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
            set({ syncStatus: 'error', syncMessage: null, isAutoSync: false, lastError: result.error });
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
          console.debug(`[Store] Skipping refresh for ${event.table} (recent optimistic update)`);
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
        const { fetchCourses, fetchTasks, fetchNotifications, fetchImportedCalendars, refreshAll } = get();
        queueCommitRefresh(event.table, () => {
          processPendingCommits(fetchCourses, fetchTasks, fetchNotifications, fetchImportedCalendars, refreshAll);
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
       * Add sync conflicts from sync engine
       */
      addSyncConflicts: (conflicts) => {
        set((state) => ({
          syncConflicts: [...state.syncConflicts, ...conflicts],
        }));
      },

      /**
       * Resolve a single sync conflict
       */
      resolveSyncConflict: async (conflictId, useCanvasValue, rememberChoice, rememberForAll) => {
        const api = getApi();
        if (!api) return;

        try {
          await api.resolveSyncConflict({
            conflictId,
            useCanvasValue,
            rememberChoice,
            rememberForAll,
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

  const unsubSyncStatus = api.onSyncStatus((status: 'idle' | 'syncing' | 'error') => {
    useStore.setState({ syncStatus: status });
    // Update lastSyncedAt when sync completes successfully
    if (status === 'idle') {
      useStore.setState({ lastSyncedAt: new Date().toISOString() });
      // Refresh data after sync
      useStore.getState().refreshAll();
    }
  });

  const unsubSyncConflicts = api.onSyncConflicts((conflicts: SyncConflictItem[]) => {
    useStore.getState().addSyncConflicts(conflicts);
  });

  return () => {
    unsubSimulation();
    unsubDbCommit();
    unsubSyncStatus();
    unsubSyncConflicts();
  };
}

/**
 * Memoized course grades calculation
 * Uses a cache to avoid O(courses × tasks) on every render
 */
const courseGradesCache = new Map<string, { earned: number; trend: number; assessed: number }>();
let lastTasksHash = '';

function computeTasksHash(tasks: { courseId: number; weight: number; grade: number | null }[]): string {
  // Simple hash based on task courseId and grades - changes trigger recalculation
  return tasks
    .filter(t => t.weight > 0)
    .map(t => `${t.courseId}:${t.grade}:${t.weight}`)
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
    const grades: Record<number, { earned: number; trend: number; assessed: number }> = {};
    for (const course of state.courses) {
      grades[course.id] = getCachedCourseGrades(course.id, state.tasks);
    }
    return grades;
  },
};
