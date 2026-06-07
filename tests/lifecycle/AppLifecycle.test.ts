/**
 * AppLifecycle — onWindowAllClosed close-to-tray fork (Batch 2 of the settings sweep).
 *
 * Covers the `windowBehavior.closeAction` quit-vs-tray decision in
 * `AppLifecycle.onWindowAllClosed` (AppLifecycle.ts:727). The same closeAction
 * value drives WindowManager's per-window 'close' handler, but onWindowAllClosed
 * is a public method that reaches the SAME decision with far less friction
 * (no live BrowserWindow needed).
 *
 * TWO deliberate test seams (no production change — same posture as #152's
 * setupSyncEventHandlers bracket access):
 *
 *   1. process.platform STUB. onWindowAllClosed branches on platform FIRST
 *      (darwin → never quit; linux → always quit) BEFORE reading closeAction.
 *      On Linux CI the win32 branch (where closeAction matters) is unreachable
 *      unless platform is stubbed. We use the established
 *      Object.defineProperty(process, 'platform', { value, configurable: true })
 *      save/restore pattern from tests/integration/appHandlers.test.ts.
 *
 *   2. PRIVATE-MEMBER override of boundGetWindowBehavior via bracket access.
 *      The real arrow reads getWindowBehavior(CONFIG_DIR) from disk; we override
 *      it with a stub returning the test's closeAction so the fork is driven
 *      purely in-memory. isQuitting is likewise set via bracket access.
 *
 * `electron` is mocked BEFORE importing AppLifecycle (IPC-handler train gotcha —
 * the module imports app/ipcMain from 'electron' at load; the constructor calls
 * ipcMain.on). app.quit is a jest.fn we assert on.
 */

jest.mock('electron', () => ({
  app: {
    quit: jest.fn(),
    // appPaths.ts reads these at module load (transitively imported by AppLifecycle).
    isPackaged: false,
    getPath: jest.fn((name: string) => `/tmp/cid-test-${name}`),
  },
  ipcMain: { on: jest.fn(), handle: jest.fn() },
  BrowserWindow: jest.fn(),
  dialog: {},
}));

import { app } from 'electron';
import { AppLifecycle, type AppLifecycleConfig } from '../../src/lifecycle/AppLifecycle';
import type { WindowBehaviorSettings } from '../../src/lifecycle/appSettings';

const mockApp = app as unknown as { quit: jest.Mock };

/**
 * Build an AppLifecycle with stub services. onWindowAllClosed touches only
 * this.logger / this.isQuitting / this.boundGetWindowBehavior(), so every other
 * service can be an inert jest.fn()/no-op cast through unknown.
 */
function makeLifecycle(): AppLifecycle {
  const noopLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(),
  };
  const config = {
    logger: noopLogger,
    database: {},
    migrationRunner: {},
    systemMonitor: {},
    credentialManager: {},
    healthCheck: {},
    metricsCollector: {},
    housekeepingManager: {},
    fileDownloadManager: {},
    fileWatcher: {},
    rateLimiter: {},
    circuitBreaker: {},
    crashProtectionManager: {},
    databaseLogger: noopLogger,
    commandDispatcherLogger: noopLogger,
  } as unknown as AppLifecycleConfig;
  return new AppLifecycle(config);
}

/** Drive the closeAction fork: override the private getter + isQuitting via bracket access. */
function withCloseAction(
  lifecycle: AppLifecycle,
  closeAction: WindowBehaviorSettings['closeAction'],
  isQuitting = false
): void {
  (lifecycle as unknown as Record<string, unknown>)['boundGetWindowBehavior'] = () => ({
    closeAction,
    showTrayIcon: true,
  });
  (lifecycle as unknown as Record<string, unknown>)['isQuitting'] = isQuitting;
}

describe('AppLifecycle.onWindowAllClosed — closeAction quit-vs-tray fork', () => {
  const realPlatform = process.platform;

  function stubPlatform(value: NodeJS.Platform): void {
    Object.defineProperty(process, 'platform', { value, configurable: true });
  }

  beforeEach(() => {
    mockApp.quit.mockClear();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: realPlatform,
      configurable: true,
    });
  });

  describe('win32 (closeAction is consulted)', () => {
    beforeEach(() => stubPlatform('win32'));

    it("closeAction:'quit' → app.quit called", () => {
      const lifecycle = makeLifecycle();
      withCloseAction(lifecycle, 'quit');
      lifecycle.onWindowAllClosed();
      expect(mockApp.quit).toHaveBeenCalledTimes(1);
    });

    it("closeAction:null (not yet chosen) → app.quit called (!== 'minimize-to-tray')", () => {
      const lifecycle = makeLifecycle();
      withCloseAction(lifecycle, null);
      lifecycle.onWindowAllClosed();
      expect(mockApp.quit).toHaveBeenCalledTimes(1);
    });

    it("closeAction:'minimize-to-tray' → app.quit NOT called (stays in tray)", () => {
      const lifecycle = makeLifecycle();
      withCloseAction(lifecycle, 'minimize-to-tray');
      lifecycle.onWindowAllClosed();
      // Behavior fork: the tray branch must NOT quit (backwards-wiring guard).
      expect(mockApp.quit).not.toHaveBeenCalled();
    });

    it("isQuitting:true overrides 'minimize-to-tray' → app.quit called", () => {
      const lifecycle = makeLifecycle();
      withCloseAction(lifecycle, 'minimize-to-tray', /* isQuitting */ true);
      lifecycle.onWindowAllClosed();
      // The this.isQuitting short-circuit wins over the tray preference.
      expect(mockApp.quit).toHaveBeenCalledTimes(1);
    });
  });

  describe('platform gates (the win32 tests rely on these)', () => {
    it("linux → app.quit always called, regardless of closeAction:'minimize-to-tray'", () => {
      stubPlatform('linux');
      const lifecycle = makeLifecycle();
      withCloseAction(lifecycle, 'minimize-to-tray');
      lifecycle.onWindowAllClosed();
      expect(mockApp.quit).toHaveBeenCalledTimes(1);
    });

    it("darwin → app.quit NOT called, regardless of closeAction:'quit'", () => {
      stubPlatform('darwin');
      const lifecycle = makeLifecycle();
      withCloseAction(lifecycle, 'quit');
      lifecycle.onWindowAllClosed();
      // macOS standard behavior: app stays in the Dock.
      expect(mockApp.quit).not.toHaveBeenCalled();
    });
  });
});
