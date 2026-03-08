/**
 * Sync Slice
 * Handles sync operations, auth actions, timezone sync, and sync conflicts.
 */

import type { SyncResultSummary, SyncConflictItem } from '../../types';
import { getApi, logUserAction, type SliceCreator } from '../storeUtils';
import { createLogger } from '../../../l6-ui/utils/rendererLogger';

const log = createLogger('syncSlice');

export const createSyncSlice: SliceCreator = (set, get) => ({
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
      log.error('Failed to trigger sync', error instanceof Error ? error : undefined);
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

        log.info(`Canvas timezone synced: ${timezone}`);
      }
    } catch (error) {
      log.error('Failed to sync Canvas timezone', error instanceof Error ? error : undefined);
    }
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
  addSyncConflicts: (conflicts: SyncConflictItem[]) => {
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
      log.error('Failed to resolve sync conflict', error instanceof Error ? error : undefined);
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
      log.error('Failed to resolve all sync conflicts', error instanceof Error ? error : undefined);
    }
  },

  /**
   * Clear sync conflicts without resolving (dismiss)
   */
  clearSyncConflicts: () => {
    set({ syncConflicts: [] });
  },
});
