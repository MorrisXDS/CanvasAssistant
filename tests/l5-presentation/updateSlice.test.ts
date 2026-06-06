/**
 * @jest-environment jsdom
 */

/**
 * updateSlice — store slice tests (ADR-0012).
 *
 * Tests the three actions: setUpdateAvailable, dismissUpdateAvailable,
 * and skipUpdateVersion.
 */

import { createStore } from '../../src/layers/l5-presentation/store/store';
import type { UpdateAvailablePayload } from '../../src/shared/ipc-contract';

// ---- Helpers ----

const MOCK_PAYLOAD: UpdateAvailablePayload = {
  version: '2.0.0',
  htmlUrl: 'https://github.com/MorrisXDS/CanvasAssistant/releases/tag/v2.0.0',
  level: 'breaking',
  reason: 'v2.0.0 is a major release.',
};

const CAUTION_PAYLOAD: UpdateAvailablePayload = {
  version: '1.2.0',
  htmlUrl: 'https://github.com/MorrisXDS/CanvasAssistant/releases/tag/v1.2.0',
  level: 'caution',
  reason:
    'Updating will migrate your local database. You cannot roll back to v1.1.2 afterward.',
};

// ---- Tests ----

describe('updateSlice', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
  });

  describe('initial state', () => {
    it('starts with updateAvailable: null', () => {
      expect(store.getState().updateAvailable).toBeNull();
    });
  });

  describe('setUpdateAvailable', () => {
    it('sets the updateAvailable payload', () => {
      store.getState().setUpdateAvailable(MOCK_PAYLOAD);
      expect(store.getState().updateAvailable).toEqual(MOCK_PAYLOAD);
    });

    it('replaces an existing payload with a new one', () => {
      store.getState().setUpdateAvailable(MOCK_PAYLOAD);
      store.getState().setUpdateAvailable(CAUTION_PAYLOAD);
      expect(store.getState().updateAvailable?.version).toBe('1.2.0');
    });

    it('clears the payload when called with null', () => {
      store.getState().setUpdateAvailable(MOCK_PAYLOAD);
      store.getState().setUpdateAvailable(null);
      expect(store.getState().updateAvailable).toBeNull();
    });
  });

  describe('dismissUpdateAvailable', () => {
    it('clears the payload (Later action)', () => {
      store.getState().setUpdateAvailable(MOCK_PAYLOAD);
      store.getState().dismissUpdateAvailable();
      expect(store.getState().updateAvailable).toBeNull();
    });

    it('is a no-op when already null', () => {
      expect(() => store.getState().dismissUpdateAvailable()).not.toThrow();
      expect(store.getState().updateAvailable).toBeNull();
    });
  });

  describe('skipUpdateVersion', () => {
    it('clears the payload after a successful prefs write', async () => {
      // Install a mock api that accepts the IPC calls.
      const mockGetPrefs = jest.fn().mockResolvedValue({
        success: true,
        data: {
          enabled: true,
          intervalHours: 24,
          lastCheckedAt: null,
          skippedVersion: null,
        },
      });
      const mockSetPrefs = jest.fn().mockResolvedValue({ success: true });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).api = {
        getUpdatePrefs: mockGetPrefs,
        setUpdatePrefs: mockSetPrefs,
        log: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
      };

      store.getState().setUpdateAvailable(MOCK_PAYLOAD);
      await store.getState().skipUpdateVersion('2.0.0');

      expect(store.getState().updateAvailable).toBeNull();
      expect(mockSetPrefs).toHaveBeenCalledWith(
        expect.objectContaining({ skippedVersion: '2.0.0' })
      );
    });

    it('still clears the payload even when setUpdatePrefs fails', async () => {
      const mockGetPrefs = jest.fn().mockResolvedValue({
        success: true,
        data: {
          enabled: true,
          intervalHours: 24,
          lastCheckedAt: null,
          skippedVersion: null,
        },
      });
      const mockSetPrefs = jest.fn().mockRejectedValue(new Error('network error'));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).api = {
        getUpdatePrefs: mockGetPrefs,
        setUpdatePrefs: mockSetPrefs,
        log: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
      };

      store.getState().setUpdateAvailable(MOCK_PAYLOAD);
      await store.getState().skipUpdateVersion('2.0.0');

      // Payload is cleared regardless of the write error.
      expect(store.getState().updateAvailable).toBeNull();
    });

    it('clears the payload even when the IPC API is unavailable', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).api = undefined;

      store.getState().setUpdateAvailable(MOCK_PAYLOAD);
      await store.getState().skipUpdateVersion('2.0.0');

      expect(store.getState().updateAvailable).toBeNull();
    });
  });

  describe('selectors', () => {
    it('pendingUpdate selector returns null from initial state', async () => {
      // Import selectors lazily to avoid circular dep issues in tests.
      const { selectors } =
        await import('../../src/layers/l5-presentation/store/storeSelectors');
      expect(selectors.pendingUpdate(store.getState())).toBeNull();
    });

    it('pendingUpdate selector returns the payload after setUpdateAvailable', async () => {
      const { selectors } =
        await import('../../src/layers/l5-presentation/store/storeSelectors');
      store.getState().setUpdateAvailable(CAUTION_PAYLOAD);
      expect(selectors.pendingUpdate(store.getState())).toEqual(CAUTION_PAYLOAD);
    });
  });
});
