/**
 * updateHandlers — IPC handler delegation tests (ADR-0007 / ADR-0012).
 *
 * Verifies that:
 * - updates:getPrefs delegates to UserPreferencesReader (no raw SQL).
 * - updates:setPrefs delegates to SetUserPreferenceCommand (no raw SQL).
 * - updates:checkNow delegates to UpdateChecker.checkNow().
 * - Handlers are thin adapters: no database.execute* calls present in the
 *   handler file itself (covered by the ADR-0007 hard-zero gate test).
 */

jest.mock('electron', () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    ipcMain: {
      handle: jest.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
        handlers.set(channel, fn);
      }),
      __getHandler: (channel: string) => handlers.get(channel),
      __reset: () => handlers.clear(),
    },
  };
});

import { ipcMain } from 'electron';
import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';
import { registerUpdateHandlers } from '../../src/lifecycle/ipc-handlers/updateHandlers';
import type { IpcContext } from '../../src/lifecycle/ipc-handlers/IpcContext';
import type { UpdateChecker } from '../../src/layers/l2-daemon/update/UpdateChecker';

interface IpcMainMock {
  __getHandler: (channel: string) => ((...args: unknown[]) => unknown) | undefined;
  __reset: () => void;
}

const mockIpc = ipcMain as unknown as IpcMainMock;

// ---- helpers ----

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = mockIpc.__getHandler(channel);
  if (!handler) throw new Error(`No handler registered for ${channel}`);
  return Promise.resolve(handler({} as unknown, ...args));
}

const noopLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: () => noopLogger,
};

function buildCtx(
  database: Database,
  updateChecker: UpdateChecker | null = null
): IpcContext {
  const unused = (name: string) => () => {
    throw new Error(`IpcContext.${name} should not be called by these tests`);
  };
  return {
    getDatabase: () => database,
    getLogger: () => noopLogger as unknown as ReturnType<IpcContext['getLogger']>,
    getMainWindow: () => null,
    getVisibilityOracle: () => null,
    getFileEntityProvider: () => null,
    getCanvasClient: () => null,
    getUpdateChecker: () => updateChecker,
    getMetricsCollector: unused(
      'getMetricsCollector'
    ) as IpcContext['getMetricsCollector'],
    getCredentialManager: unused(
      'getCredentialManager'
    ) as IpcContext['getCredentialManager'],
    getFileDownloadManager: unused(
      'getFileDownloadManager'
    ) as IpcContext['getFileDownloadManager'],
    getHealthCheck: unused('getHealthCheck') as IpcContext['getHealthCheck'],
    getSystemMonitor: unused('getSystemMonitor') as IpcContext['getSystemMonitor'],
    getSyncEngine: unused('getSyncEngine') as IpcContext['getSyncEngine'],
    getOperationCoordinator: unused(
      'getOperationCoordinator'
    ) as IpcContext['getOperationCoordinator'],
    clearCanvasClient: unused('clearCanvasClient') as IpcContext['clearCanvasClient'],
    initializeCanvasClient: unused(
      'initializeCanvasClient'
    ) as IpcContext['initializeCanvasClient'],
    getCommandDispatcher: unused(
      'getCommandDispatcher'
    ) as IpcContext['getCommandDispatcher'],
    getWindowBehavior: unused('getWindowBehavior') as IpcContext['getWindowBehavior'],
    setWindowBehavior: unused('setWindowBehavior') as IpcContext['setWindowBehavior'],
    getLocalHtmlPathsSettings: unused(
      'getLocalHtmlPathsSettings'
    ) as IpcContext['getLocalHtmlPathsSettings'],
    getIsQuitting: unused('getIsQuitting') as IpcContext['getIsQuitting'],
    setIsQuitting: unused('setIsQuitting') as IpcContext['setIsQuitting'],
    getConfigDir: unused('getConfigDir') as IpcContext['getConfigDir'],
    getFilesDir: unused('getFilesDir') as IpcContext['getFilesDir'],
    getDbPath: unused('getDbPath') as IpcContext['getDbPath'],
    getBackupDir: () => '/tmp/backups',
    getAppVersion: unused('getAppVersion') as IpcContext['getAppVersion'],
    getSyncPreferences: unused('getSyncPreferences') as IpcContext['getSyncPreferences'],
    startAutoSync: unused('startAutoSync') as IpcContext['startAutoSync'],
    stopAutoSync: unused('stopAutoSync') as IpcContext['stopAutoSync'],
    getCrashProtectionManager: unused(
      'getCrashProtectionManager'
    ) as IpcContext['getCrashProtectionManager'],
    getAppDataDir: unused('getAppDataDir') as IpcContext['getAppDataDir'],
    getDatabaseCorruptionDetected: unused(
      'getDatabaseCorruptionDetected'
    ) as IpcContext['getDatabaseCorruptionDetected'],
    setDatabaseCorruptionDetected: unused(
      'setDatabaseCorruptionDetected'
    ) as IpcContext['setDatabaseCorruptionDetected'],
    resetWindowSize: unused('resetWindowSize') as IpcContext['resetWindowSize'],
    createTray: unused('createTray') as IpcContext['createTray'],
    destroyTray: unused('destroyTray') as IpcContext['destroyTray'],
    resetAppState: unused('resetAppState') as IpcContext['resetAppState'],
  };
}

describe('updateHandlers (ADR-0007 / ADR-0012)', () => {
  let db: Database;

  beforeEach(() => {
    mockIpc.__reset();
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    registerUpdateHandlers(buildCtx(db));
  });

  afterEach(() => {
    db.close();
  });

  // ---- updates:getPrefs ----

  describe('updates:getPrefs', () => {
    test('returns defaults when key is absent from user_preferences', async () => {
      const res = (await invoke('updates:getPrefs')) as {
        success: boolean;
        data: { enabled: boolean; intervalHours: number };
      };
      expect(res.success).toBe(true);
      expect(res.data.enabled).toBe(false);
      expect(res.data.intervalHours).toBe(24);
    });

    test('returns stored prefs when key exists', async () => {
      db.executeWrite(
        `INSERT INTO user_preferences (key, value) VALUES ('updatePreferences', ?)`,
        [
          JSON.stringify({
            enabled: true,
            intervalHours: 12,
            lastCheckedAt: null,
            skippedVersion: null,
          }),
        ]
      );
      const res = (await invoke('updates:getPrefs')) as {
        success: boolean;
        data: { enabled: boolean; intervalHours: number };
      };
      expect(res.success).toBe(true);
      expect(res.data.enabled).toBe(true);
      expect(res.data.intervalHours).toBe(12);
    });

    test('returns defaults when stored JSON is invalid', async () => {
      db.executeWrite(
        `INSERT INTO user_preferences (key, value) VALUES ('updatePreferences', 'not-json')`,
        []
      );
      const res = (await invoke('updates:getPrefs')) as {
        success: boolean;
        data: { enabled: boolean };
      };
      expect(res.success).toBe(true);
      expect(res.data.enabled).toBe(false);
    });
  });

  // ---- updates:setPrefs ----

  describe('updates:setPrefs', () => {
    test('stores valid prefs in user_preferences via SetUserPreferenceCommand', async () => {
      const prefs = {
        enabled: true,
        intervalHours: 48,
        lastCheckedAt: null,
        skippedVersion: null,
      };
      const res = (await invoke('updates:setPrefs', prefs)) as { success: boolean };
      expect(res.success).toBe(true);

      const stored = db.executeReadOne<{ value: string }>(
        `SELECT value FROM user_preferences WHERE key = 'updatePreferences'`
      );
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!.value);
      expect(parsed.enabled).toBe(true);
      expect(parsed.intervalHours).toBe(48);
    });

    test('rejects invalid prefs shape', async () => {
      const res = (await invoke('updates:setPrefs', { enabled: 'yes' })) as {
        success: boolean;
      };
      expect(res.success).toBe(false);
    });

    test('accepts intervalHours: 0 (launch-only, no timer)', async () => {
      const prefs = {
        enabled: true,
        intervalHours: 0,
        lastCheckedAt: null,
        skippedVersion: null,
      };
      const res = (await invoke('updates:setPrefs', prefs)) as { success: boolean };
      expect(res.success).toBe(true);

      // Verify the value was actually persisted (round-trip regression guard).
      const stored = db.executeReadOne<{ value: string }>(
        `SELECT value FROM user_preferences WHERE key = 'updatePreferences'`
      );
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!.value);
      expect(parsed.intervalHours).toBe(0);
    });

    test('rejects intervalHours: -1 (below minimum)', async () => {
      const res = (await invoke('updates:setPrefs', {
        enabled: true,
        intervalHours: -1,
        lastCheckedAt: null,
        skippedVersion: null,
      })) as { success: boolean };
      expect(res.success).toBe(false);
    });

    test('rejects intervalHours: 999 (above maximum of 168)', async () => {
      const res = (await invoke('updates:setPrefs', {
        enabled: true,
        intervalHours: 999,
        lastCheckedAt: null,
        skippedVersion: null,
      })) as { success: boolean };
      expect(res.success).toBe(false);
    });
  });

  // ---- updates:checkNow ----

  describe('updates:checkNow', () => {
    test('returns success: true when updateChecker is null (feature unavailable)', async () => {
      // ctx was built with null updateChecker
      const res = (await invoke('updates:checkNow')) as { success: boolean };
      expect(res.success).toBe(true);
    });

    test('calls updateChecker.checkNow() when the checker is wired', async () => {
      mockIpc.__reset();
      const mockChecker = {
        checkNow: jest.fn().mockResolvedValue(undefined),
      } as unknown as UpdateChecker;
      registerUpdateHandlers(buildCtx(db, mockChecker));

      const res = (await invoke('updates:checkNow')) as { success: boolean };
      expect(res.success).toBe(true);
      expect(mockChecker.checkNow).toHaveBeenCalledTimes(1);
    });
  });
});
