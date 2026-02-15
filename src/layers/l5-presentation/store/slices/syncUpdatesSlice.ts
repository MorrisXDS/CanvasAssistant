/**
 * Sync Updates Slice
 * Handles sync update notification methods: fetch, mark seen, handle events.
 */

import type { SyncUpdate } from '../../types';
import { getApi, type SliceCreator } from '../storeUtils';

export const createSyncUpdatesSlice: SliceCreator = (set, get) => ({
  /**
   * Fetch all sync updates (for Updates page)
   */
  fetchSyncUpdates: async () => {
    const api = getApi();
    if (!api?.getSyncUpdates) return;

    try {
      const updates = (await api.getSyncUpdates()) as SyncUpdate[];
      set((state) => ({
        syncUpdates: {
          ...state.syncUpdates,
          updates,
          lastFetchedAt: new Date().toISOString(),
        },
      }));
    } catch (error) {
      console.error('Failed to fetch sync updates:', error);
    }
  },

  /**
   * Fetch sync updates count (for FAB badge)
   */
  fetchSyncUpdatesCount: async () => {
    const api = getApi();
    console.log(
      '[store] fetchSyncUpdatesCount called, api available:',
      !!api?.getSyncUpdatesCount
    );
    if (!api?.getSyncUpdatesCount) return;

    try {
      const counts = await api.getSyncUpdatesCount();
      console.log('[store] fetchSyncUpdatesCount received:', counts);
      set((state) => ({
        syncUpdates: {
          ...state.syncUpdates,
          totalUnseen: counts.total,
          conflictCount: counts.conflicts,
          informationalCount: counts.informational,
          actionRequiredCount: counts.actionRequired ?? 0,
        },
      }));
    } catch (error) {
      console.error('Failed to fetch sync updates count:', error);
    }
  },

  /**
   * Mark specific updates as seen
   */
  markSyncUpdatesSeen: async (ids: number[]) => {
    const api = getApi();
    if (!api?.markSyncUpdatesSeen) return;

    try {
      await api.markSyncUpdatesSeen(ids);

      // Optimistic update - remove from updates list and decrement count
      set((state) => ({
        syncUpdates: {
          ...state.syncUpdates,
          updates: state.syncUpdates.updates.filter((u) => !ids.includes(u.id)),
          totalUnseen: Math.max(0, state.syncUpdates.totalUnseen - ids.length),
          informationalCount: Math.max(
            0,
            state.syncUpdates.informationalCount - ids.length
          ),
        },
      }));
    } catch (error) {
      console.error('Failed to mark sync updates as seen:', error);
    }
  },

  /**
   * Mark all updates as seen (with optional filters)
   */
  markAllSyncUpdatesSeen: async (options?: {
    courseId?: number;
    entityType?: string;
    excludeConflicts?: boolean;
    excludeActionRequired?: boolean;
  }) => {
    const api = getApi();
    if (!api?.markAllSyncUpdatesSeen) return;

    try {
      await api.markAllSyncUpdatesSeen(options);

      // Refresh counts after bulk update
      await get().fetchSyncUpdatesCount();
      await get().fetchSyncUpdates();
    } catch (error) {
      console.error('Failed to mark all sync updates as seen:', error);
    }
  },

  /**
   * Mark update seen by entity (for cross-page communication)
   */
  markSyncUpdateSeenByEntity: async (entityType: string, entityId: number) => {
    const api = getApi();
    if (!api?.markSyncUpdateSeenByEntity) return;

    try {
      await api.markSyncUpdateSeenByEntity(entityType, entityId);

      // Optimistic update
      set((state) => {
        const updates = state.syncUpdates.updates.filter(
          (u) => !(u.entityType === entityType && u.entityId === entityId)
        );
        const removed = state.syncUpdates.updates.length - updates.length;

        return {
          syncUpdates: {
            ...state.syncUpdates,
            updates,
            totalUnseen: Math.max(0, state.syncUpdates.totalUnseen - removed),
            informationalCount: Math.max(
              0,
              state.syncUpdates.informationalCount - removed
            ),
          },
        };
      });
    } catch (error) {
      console.error('Failed to mark sync update by entity:', error);
    }
  },

  /**
   * Handle sync updates push event from main process
   */
  handleSyncUpdatesEvent: (event: {
    type: string;
    totalUnseen: number;
    conflictCount: number;
  }) => {
    console.log('[store] handleSyncUpdatesEvent called with:', event);
    set((state) => {
      const newState = {
        syncUpdates: {
          ...state.syncUpdates,
          totalUnseen: event.totalUnseen,
          conflictCount: event.conflictCount,
          informationalCount: event.totalUnseen - event.conflictCount,
        },
      };
      console.log('[store] Setting syncUpdates to:', newState.syncUpdates);
      return newState;
    });
  },
});
