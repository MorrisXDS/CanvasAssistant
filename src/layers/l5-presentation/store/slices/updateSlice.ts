/**
 * Update Slice (ADR-0012)
 *
 * Holds the pending update notification in the Zustand store. The renderer
 * receives the `update:available` push event via storeSubscriptions and calls
 * `setUpdateAvailable`. The UpdateAvailableModal (Batch B) reads from here as
 * the single source of truth — it never manages its own `isOpen` state.
 */

import type { UpdateAvailablePayload } from '../../types';
import { getApi, type SliceCreator } from '../storeUtils';
import { createLogger } from '../../../l6-ui/utils/rendererLogger';

const log = createLogger('updateSlice');

export const createUpdateSlice: SliceCreator = (set) => ({
  updateAvailable: null,

  /**
   * Set or clear the pending update notification.
   * Called by storeSubscriptions when the `update:available` push event arrives.
   */
  setUpdateAvailable: (payload: UpdateAvailablePayload | null) => {
    set({ updateAvailable: payload });
  },

  /**
   * Clear the pending update without persisting a skip preference.
   * Maps to the "Later" action in the UpdateAvailableModal.
   */
  dismissUpdateAvailable: () => {
    set({ updateAvailable: null });
  },

  /**
   * Record the user's choice to skip a specific version and clear the
   * notification. Writes `skippedVersion` to `user_preferences` via IPC so
   * that `UpdateChecker` will not re-emit the event for the same version.
   *
   * Maps to the "Skip this version" action in the UpdateAvailableModal.
   */
  skipUpdateVersion: async (version: string) => {
    const api = getApi();
    if (!api) {
      log.warn('skipUpdateVersion: IPC API not available');
      set({ updateAvailable: null });
      return;
    }

    try {
      // Read current prefs, merge skippedVersion, then write back.
      const getResult = await api.getUpdatePrefs?.();
      const currentPrefs = getResult?.data;
      if (currentPrefs) {
        await api.setUpdatePrefs?.({
          ...currentPrefs,
          skippedVersion: version,
        });
      }
    } catch (error) {
      log.error(
        'skipUpdateVersion: failed to persist skipped version',
        error instanceof Error ? error : undefined
      );
    }

    // Always clear from the store regardless of whether the write succeeded.
    set({ updateAvailable: null });
  },
});
