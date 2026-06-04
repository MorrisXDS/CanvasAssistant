/**
 * @jest-environment jsdom
 */

/**
 * Chunk 1 (straggler centralization) regression guard for syncSlice.
 *
 * syncCanvasTimezone previously persisted the synced Canvas timezone under the
 * raw literal 'timezoneSettings'. The refactor swapped that to
 * STORAGE_KEYS.TIMEZONE. STORAGE_KEYS.TIMEZONE === 'timezoneSettings', so the
 * persisted key string must be UNCHANGED — otherwise the renderer's timezone
 * read (which still uses the same key) would orphan.
 *
 * This exercises the real syncCanvasTimezone call path with a mocked window.api
 * and asserts the value lands under the exact key 'timezoneSettings', merged
 * onto any pre-existing object (the action does `{...current, canvasTimezone, lastSyncedAt}`).
 */

import { createSyncSlice } from '../../src/layers/l5-presentation/store/slices/syncSlice';
import { STORAGE_KEYS } from '../../src/layers/l5-presentation/settings/settingsSchema';
import type { Store } from '../../src/layers/l5-presentation/types';

describe('syncSlice.syncCanvasTimezone — persists under "timezoneSettings" (chunk 1)', () => {
  const TIMEZONE = 'America/Toronto';

  beforeEach(() => {
    localStorage.clear();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).api = {
      getUserProfile: jest
        .fn()
        .mockResolvedValue({ success: true, data: { time_zone: TIMEZONE } }),
      log: { info: jest.fn() },
    };
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).api;
  });

  function makeSlice() {
    const state: Partial<Store> = {};
    const set = jest.fn((partial: unknown) => {
      Object.assign(
        state,
        typeof partial === 'function'
          ? (partial as (s: Store) => Partial<Store>)(state as Store)
          : partial
      );
    });
    const get = jest.fn(() => state as Store);
    return createSyncSlice(set as never, get as never);
  }

  it('uses the exact key string and the STORAGE_KEYS.TIMEZONE constant point to it', () => {
    expect(STORAGE_KEYS.TIMEZONE).toBe('timezoneSettings');
  });

  it('writes the synced canvas timezone under localStorage["timezoneSettings"]', async () => {
    const slice = makeSlice();
    await slice.syncCanvasTimezone!();

    const raw = localStorage.getItem('timezoneSettings');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.canvasTimezone).toBe(TIMEZONE);
    expect(typeof parsed.lastSyncedAt).toBe('string');
  });

  it('merges onto a pre-existing timezone settings object (preserves userOverride)', async () => {
    localStorage.setItem(
      STORAGE_KEYS.TIMEZONE,
      JSON.stringify({ userOverride: 'Europe/London', canvasTimezone: null })
    );

    const slice = makeSlice();
    await slice.syncCanvasTimezone!();

    const parsed = JSON.parse(localStorage.getItem('timezoneSettings') as string);
    // Pre-existing user override must survive the canvas-timezone merge.
    expect(parsed.userOverride).toBe('Europe/London');
    expect(parsed.canvasTimezone).toBe(TIMEZONE);
  });
});
