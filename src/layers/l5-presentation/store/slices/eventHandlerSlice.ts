/**
 * Event Handler Slice
 * Handles push events from the main process: db:commit, simulation changes.
 */

import type { SimulationChangeEvent, DbCommitEvent } from '../../types';
import {
  shouldSkipRefresh,
  queueCommitRefresh,
  addPendingCommit,
  processPendingCommits,
} from '../storeHelpers';
import type { SliceCreator } from '../storeUtils';

export const createEventHandlerSlice: SliceCreator = (set, get) => ({
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
});
