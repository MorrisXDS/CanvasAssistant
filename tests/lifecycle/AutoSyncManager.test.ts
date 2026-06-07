/**
 * AutoSyncManager — scheduler + per-sync timeout (liveness guard) tests.
 *
 * The load-bearing case is the timeout: a `syncAll()` that hangs (in-flight at
 * sleep, not properly aborted on wake) must NOT wedge the scheduler. Each
 * `syncAll()` call site is wrapped in `Promise.race([syncAll(), timeout])`; on
 * timeout the existing catch branch logs the failure, emits `sync:status error`,
 * and the interval keeps ticking (so the NEXT interval can still fire).
 *
 * Uses fake timers. The interplay to be careful about: the `setInterval`
 * callback is `async`, so after `jest.advanceTimersByTime` fires it we must
 * flush microtasks (and re-advance for the inner timeout `setTimeout`) before
 * the catch branch has run. `flushAll()` interleaves timer + microtask drains.
 *
 * No `electron` import is needed — BrowserWindow is supplied as a mock via the
 * `getMainWindow` config callback.
 */

import { AutoSyncManager } from '../../src/lifecycle/AutoSyncManager';

const AUTO_SYNC_TIMEOUT_MS = 5 * 60 * 1000;
// Use an interval LONGER than the 5-minute timeout so that advancing fake time
// far enough to fire the inner Promise.race timeout does not also re-fire the
// outer interval (which would inflate the syncAll call count).
const INTERVAL_MINUTES = 15;
const INTERVAL_MS = INTERVAL_MINUTES * 60 * 1000;

type WebContentsSend = jest.Mock;

function makeMainWindow() {
  const send: WebContentsSend = jest.fn();
  return {
    window: {
      isDestroyed: () => false,
      webContents: { send },
    },
    send,
  };
}

/** Flush just the microtask queue (no timer advancement). */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

function makeManager(overrides: {
  syncAll?: jest.Mock;
  canSync?: boolean;
  safeMode?: boolean;
  syncEngineNull?: boolean;
  intervalMinutes?: number;
  autoSyncEnabled?: boolean;
}) {
  const {
    syncAll = jest.fn().mockResolvedValue(undefined),
    canSync = true,
    safeMode = false,
    syncEngineNull = false,
    intervalMinutes = INTERVAL_MINUTES,
    autoSyncEnabled = true,
  } = overrides;

  const syncEngine = { syncAll };
  const mainWindow = makeMainWindow();

  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const metricsCollector = { increment: jest.fn() };
  const systemMonitor = { getState: jest.fn(() => ({ canSync })) };
  const crashProtectionManager = {
    isSafeModeEnabled: jest.fn(() => safeMode),
    startSafeModeClearTimer: jest.fn(),
  };
  const database = {
    executeReadOne: jest.fn(() => ({
      value: JSON.stringify({ autoSyncEnabled, autoSyncInterval: intervalMinutes }),
    })),
  };

  const manager = new AutoSyncManager({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal test doubles
    database: database as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logger: logger as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metricsCollector: metricsCollector as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    systemMonitor: systemMonitor as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    crashProtectionManager: crashProtectionManager as any,
    getSyncEngine: () => (syncEngineNull ? null : (syncEngine as any)),
    getMainWindow: () => mainWindow.window as any,
  });

  return {
    manager,
    syncAll,
    send: mainWindow.send,
    logger,
    metricsCollector,
    crashProtectionManager,
  };
}

describe('AutoSyncManager', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('interval timeout (liveness guard)', () => {
    it('times out a hung syncAll, logs the failure, emits sync:status error, and keeps the scheduler alive', async () => {
      // syncAll never resolves — the wedge scenario.
      const syncAll = jest.fn(() => new Promise<void>(() => {}));
      const { manager, send, logger, metricsCollector } = makeManager({ syncAll });

      manager.start();

      // Fire the first interval tick; the async callback reaches Promise.race
      // and registers the inner 5-minute timeout setTimeout.
      await jest.advanceTimersByTimeAsync(INTERVAL_MS);
      expect(syncAll).toHaveBeenCalledTimes(1);

      // Push past the 5-minute timeout so the race rejects, then flush the
      // rejection through the catch branch.
      await jest.advanceTimersByTimeAsync(AUTO_SYNC_TIMEOUT_MS);
      await flushMicrotasks();

      // catch branch ran.
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Auto-sync failed')
      );
      expect(metricsCollector.increment).toHaveBeenCalledWith('sync.auto.failure');
      expect(send).toHaveBeenCalledWith('sync:status', 'error');

      // The scheduler is NOT wedged: the next interval boundary fires syncAll
      // again (the interval timer was never cleared by the timeout). One full
      // interval has not yet elapsed since the tick (only 5 min of the 15 has),
      // so advance the remainder.
      await jest.advanceTimersByTimeAsync(INTERVAL_MS);
      expect(syncAll).toHaveBeenCalledTimes(2);

      manager.stop();
    });
  });

  describe('happy path', () => {
    it('sends syncing then idle + file-status-changed and increments success on a normal sync', async () => {
      const syncAll = jest.fn().mockResolvedValue(undefined);
      const { manager, send, metricsCollector } = makeManager({ syncAll });

      manager.start();
      await jest.advanceTimersByTimeAsync(INTERVAL_MS);
      await flushMicrotasks();

      expect(syncAll).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith('sync:status', 'syncing');
      expect(send).toHaveBeenCalledWith('sync:status', 'idle');
      expect(send).toHaveBeenCalledWith('file-status-changed', {
        type: 'sync-complete',
      });
      expect(metricsCollector.increment).toHaveBeenCalledWith('sync.auto.success');

      manager.stop();
    });
  });

  describe('stop()', () => {
    it('clears the interval so no further ticks fire', async () => {
      const syncAll = jest.fn().mockResolvedValue(undefined);
      const { manager } = makeManager({ syncAll });

      manager.start();
      manager.stop();

      await jest.advanceTimersByTimeAsync(INTERVAL_MS * 3);
      await flushMicrotasks();

      expect(syncAll).not.toHaveBeenCalled();
    });
  });

  describe('sync-preferences gate the scheduler (behavior change)', () => {
    // The disabled-return branch (AutoSyncManager.ts:79-82) and the interval
    // VALUE driving setInterval (line 138) were previously untested — the
    // settings only affect behavior here, and "flip the setting → it actually
    // behaves differently" was the gap.
    it('does NOT schedule when autoSyncEnabled=false (the disabled-by-flag branch)', async () => {
      const syncAll = jest.fn().mockResolvedValue(undefined);
      const { manager, logger } = makeManager({ syncAll, autoSyncEnabled: false });

      manager.start();
      await jest.advanceTimersByTimeAsync(INTERVAL_MS * 3);
      await flushMicrotasks();

      expect(syncAll).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'Auto-sync is disabled (manual sync only)'
      );

      manager.stop();
    });

    it('does NOT schedule when intervalMinutes=0 (the autoSyncIntervalMs<=0 operand)', async () => {
      const syncAll = jest.fn().mockResolvedValue(undefined);
      const { manager, logger } = makeManager({ syncAll, intervalMinutes: 0 });

      manager.start();
      await jest.advanceTimersByTimeAsync(INTERVAL_MS * 3);
      await flushMicrotasks();

      expect(syncAll).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'Auto-sync is disabled (manual sync only)'
      );

      manager.stop();
    });

    it('uses the configured interval VALUE for setInterval (30 min, not the 15-min default)', async () => {
      const syncAll = jest.fn().mockResolvedValue(undefined);
      const { manager, syncAll: sa } = makeManager({ syncAll, intervalMinutes: 30 });
      const THIRTY_MIN_MS = 30 * 60 * 1000;

      manager.start();

      // At 29 minutes the 30-minute interval has NOT yet fired.
      await jest.advanceTimersByTimeAsync(29 * 60 * 1000);
      await flushMicrotasks();
      expect(sa).not.toHaveBeenCalled();

      // One more minute (to 30) fires it exactly once — proving the interval
      // value (30, the pref) drove scheduling, not the 15-min default.
      await jest.advanceTimersByTimeAsync(THIRTY_MIN_MS - 29 * 60 * 1000);
      await flushMicrotasks();
      expect(sa).toHaveBeenCalledTimes(1);

      manager.stop();
    });
  });

  describe('safe mode', () => {
    it('does not start the interval when safe mode is enabled', async () => {
      const syncAll = jest.fn().mockResolvedValue(undefined);
      const { manager, logger } = makeManager({ syncAll, safeMode: true });

      manager.start();
      await jest.advanceTimersByTimeAsync(INTERVAL_MS * 2);
      await flushMicrotasks();

      expect(syncAll).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Safe mode enabled')
      );

      manager.stop();
    });
  });

  describe('triggerFocusRestoreSync timeout', () => {
    it('times out a hung focus-restore sync and emits sync:status error', async () => {
      const syncAll = jest.fn(() => new Promise<void>(() => {}));
      const { manager, send, logger, metricsCollector } = makeManager({ syncAll });

      const p = manager.triggerFocusRestoreSync();
      // Let the method reach Promise.race and register the inner timeout, then
      // push past it so the race rejects into the catch branch.
      await flushMicrotasks();
      await jest.advanceTimersByTimeAsync(AUTO_SYNC_TIMEOUT_MS);
      await p;

      expect(syncAll).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith('sync:status', 'syncing');
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Focus restore sync failed')
      );
      expect(metricsCollector.increment).toHaveBeenCalledWith(
        'sync.focus_restore.failure'
      );
      expect(send).toHaveBeenCalledWith('sync:status', 'error');
    });

    it('completes a normal focus-restore sync and increments success', async () => {
      const syncAll = jest.fn().mockResolvedValue(undefined);
      const { manager, send, metricsCollector } = makeManager({ syncAll });

      const p = manager.triggerFocusRestoreSync();
      await flushMicrotasks();
      await p;

      expect(syncAll).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith('sync:status', 'idle');
      expect(metricsCollector.increment).toHaveBeenCalledWith(
        'sync.focus_restore.success'
      );
    });
  });
});
