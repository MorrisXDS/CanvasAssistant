/**
 * @jest-environment jsdom
 */

/**
 * ADR-0013 — deferrable re-auth + app-wide sync gating (L5 store).
 *
 * Covers the store contract:
 *  - deferReauth / reopenReauth / clearAuthError flag transitions
 *  - triggerSync guard (no-op with reason when deferred OR authError set)
 *  - initialize() sets authError ONLY on validity:'invalid'
 *  - selectSyncDisabled / selectSyncDisabledReason truth table
 *
 * Slices are invoked directly with set/get spies (the pattern in
 * coreDataSlice.test.ts).
 */

import { createSyncSlice } from '../../src/layers/l5-presentation/store/slices/syncSlice';
import { createCoreDataSlice } from '../../src/layers/l5-presentation/store/slices/coreDataSlice';
import {
  selectSyncDisabled,
  selectSyncDisabledReason,
} from '../../src/layers/l5-presentation/store/storeSelectors';
import type { Store, StoreState } from '../../src/layers/l5-presentation/types';

function stubWindowApi(api: Record<string, unknown>): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).api = api;
}
function clearWindowApi(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).api;
}

/** Build a captured-state harness: set() merges into a mutable state object. */
function makeHarness(initial: Partial<StoreState> = {}) {
  const state: Partial<StoreState> = {
    authError: null,
    authReauthDeferred: false,
    ...initial,
  };
  const extra: Record<string, unknown> = {};
  const get = jest.fn(() => ({ ...state, ...extra }) as unknown as Store);
  const set = jest.fn((partial: unknown) => {
    const next = typeof partial === 'function' ? partial(state) : partial;
    Object.assign(state, next);
  });
  return { state, get, set, extra };
}

describe('syncSlice — deferReauth / reopenReauth / clearAuthError (ADR-0013)', () => {
  it('deferReauth sets authReauthDeferred:true and clears authError', () => {
    const { state, get, set } = makeHarness({
      authError: { type: 'expired' },
    });
    const slice = createSyncSlice(set, get);
    slice.deferReauth!();
    expect(state.authReauthDeferred).toBe(true);
    expect(state.authError).toBeNull();
  });

  it('clearAuthError clears BOTH authError and authReauthDeferred', () => {
    const { state, get, set } = makeHarness({
      authError: { type: 'expired' },
      authReauthDeferred: true,
    });
    const slice = createSyncSlice(set, get);
    slice.clearAuthError!();
    expect(state.authError).toBeNull();
    expect(state.authReauthDeferred).toBe(false);
  });

  it('reopenReauth sets authError (modal reopens) and leaves deferred flag alone', () => {
    const { state, get, set } = makeHarness({ authReauthDeferred: true });
    const slice = createSyncSlice(set, get);
    slice.reopenReauth!();
    expect(state.authError).toEqual({
      type: 'expired',
      reason: 'Reconnect to resume sync',
    });
    expect(state.authReauthDeferred).toBe(true);
  });
});

describe('syncSlice — triggerSync guard (ADR-0013)', () => {
  beforeEach(() => clearWindowApi());

  it('no-ops with a reason when authReauthDeferred is true; never calls api.syncFull', async () => {
    const syncFull = jest.fn();
    stubWindowApi({ syncFull });
    const { get, set } = makeHarness({ authReauthDeferred: true });
    const slice = createSyncSlice(set, get);

    const res = await slice.triggerSync!('full');

    expect(res).toEqual({
      success: false,
      error: 'Canvas token expired — reconnect to sync',
    });
    expect(syncFull).not.toHaveBeenCalled();
  });

  it('no-ops when authError is set; never calls api.syncFull', async () => {
    const syncFull = jest.fn();
    stubWindowApi({ syncFull });
    const { get, set } = makeHarness({ authError: { type: 'expired' } });
    const slice = createSyncSlice(set, get);

    const res = await slice.triggerSync!('full');

    expect(res).toEqual({
      success: false,
      error: 'Canvas token expired — reconnect to sync',
    });
    expect(syncFull).not.toHaveBeenCalled();
  });

  it('proceeds normally when neither flag is set (happy path still works)', async () => {
    const syncFull = jest
      .fn()
      .mockResolvedValue({ success: true, result: { courses: { synced: 1 } } });
    stubWindowApi({ syncFull });
    const { get, set, extra } = makeHarness();
    // refreshAll / syncCanvasTimezone are called on success — stub them.
    extra.refreshAll = jest.fn().mockResolvedValue(undefined);
    extra.syncCanvasTimezone = jest.fn();
    const slice = createSyncSlice(set, get);

    const res = await slice.triggerSync!('full');

    expect(syncFull).toHaveBeenCalledTimes(1);
    expect(res.success).toBe(true);
  });
});

describe('coreDataSlice — initialize() auth status pull (ADR-0013)', () => {
  beforeEach(() => clearWindowApi());

  function baseApi(authStatus: {
    validity: 'valid' | 'invalid' | 'unknown';
  }): Record<string, unknown> {
    return {
      hasCredential: jest.fn().mockResolvedValue(true),
      getAuthStatus: jest
        .fn()
        .mockResolvedValue({ success: true, data: { ...authStatus } }),
      getLastSyncTime: jest.fn().mockResolvedValue(null),
      getSystemState: jest.fn().mockResolvedValue(null),
      getHealthStatus: jest.fn().mockResolvedValue(null),
      getSimulationState: jest
        .fn()
        .mockResolvedValue({ isActive: false, startedAt: null, grades: [] }),
    };
  }

  it('sets authError when validity is "invalid"', async () => {
    stubWindowApi(baseApi({ validity: 'invalid' }));
    const setAuthError = jest.fn();
    const { get, set, extra } = makeHarness();
    extra.refreshAll = jest.fn().mockResolvedValue(undefined);
    extra.fetchSyncUpdatesCount = jest.fn().mockResolvedValue(undefined);
    extra.setAuthError = setAuthError;
    const slice = createCoreDataSlice(set, get);

    await slice.initialize!();

    expect(setAuthError).toHaveBeenCalledWith({
      type: 'expired',
      reason: 'Stored Canvas token is invalid',
    });
  });

  it('does NOT set authError when validity is "unknown" (offline must not prompt)', async () => {
    stubWindowApi(baseApi({ validity: 'unknown' }));
    const setAuthError = jest.fn();
    const { get, set, extra } = makeHarness();
    extra.refreshAll = jest.fn().mockResolvedValue(undefined);
    extra.fetchSyncUpdatesCount = jest.fn().mockResolvedValue(undefined);
    extra.setAuthError = setAuthError;
    const slice = createCoreDataSlice(set, get);

    await slice.initialize!();

    expect(setAuthError).not.toHaveBeenCalled();
  });

  it('does NOT set authError when validity is "valid"', async () => {
    stubWindowApi(baseApi({ validity: 'valid' }));
    const setAuthError = jest.fn();
    const { get, set, extra } = makeHarness();
    extra.refreshAll = jest.fn().mockResolvedValue(undefined);
    extra.fetchSyncUpdatesCount = jest.fn().mockResolvedValue(undefined);
    extra.setAuthError = setAuthError;
    const slice = createCoreDataSlice(set, get);

    await slice.initialize!();

    expect(setAuthError).not.toHaveBeenCalled();
  });
});

describe('selectSyncDisabled / selectSyncDisabledReason truth table (ADR-0013)', () => {
  const mk = (over: Partial<StoreState>): StoreState =>
    ({ authError: null, authReauthDeferred: false, ...over }) as StoreState;

  it('disabled when authReauthDeferred', () => {
    const s = mk({ authReauthDeferred: true });
    expect(selectSyncDisabled(s)).toBe(true);
    expect(selectSyncDisabledReason(s)).toBe('Canvas token expired — reconnect to sync');
  });

  it('disabled when authError set', () => {
    const s = mk({ authError: { type: 'expired' } });
    expect(selectSyncDisabled(s)).toBe(true);
    expect(selectSyncDisabledReason(s)).not.toBeNull();
  });

  it('enabled (reason null) when neither flag set', () => {
    const s = mk({});
    expect(selectSyncDisabled(s)).toBe(false);
    expect(selectSyncDisabledReason(s)).toBeNull();
  });
});
