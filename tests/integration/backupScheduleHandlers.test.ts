/**
 * backupScheduleHandlers — IPC handler behavior tests (ADR-0007).
 *
 * The schedule read/write routes through UserPreferencesReader +
 * Set/DeleteUserPreferenceCommand (migration 112 consolidated the former
 * app_settings table into user_preferences); history reads through
 * ExportHistoryReader.getByType — no raw SQL in the handler. fs is mocked.
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

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return { ...actual, existsSync: () => true };
});

import { ipcMain } from 'electron';
import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';
import { registerBackupScheduleHandlers } from '../../src/lifecycle/ipc-handlers/backupScheduleHandlers';
import type { IpcContext } from '../../src/lifecycle/ipc-handlers/IpcContext';

interface IpcMainMock {
  __getHandler: (channel: string) => ((...args: unknown[]) => unknown) | undefined;
  __reset: () => void;
}

const mockIpc = ipcMain as unknown as IpcMainMock;

describe('backupScheduleHandlers (ADR-0007)', () => {
  let db: Database;

  beforeEach(() => {
    mockIpc.__reset();
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    registerBackupScheduleHandlers(buildCtx(db));
  });

  afterEach(() => {
    db.close();
  });

  function appSetting(key: string): string | undefined {
    return db.executeReadOne<{ value: string }>(
      'SELECT value FROM user_preferences WHERE key = ?',
      [key]
    )?.value;
  }

  describe('backup:getSchedule', () => {
    test('returns defaults when unset', async () => {
      const res = (await invoke('backup:getSchedule')) as {
        success: boolean;
        data: { frequency: string };
      };
      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();
    });

    test('returns the stored schedule with a computed nextRun', async () => {
      await invoke('backup:setSchedule', {
        enabled: true,
        frequency: 'daily',
        time: '03:00',
      });

      const res = (await invoke('backup:getSchedule')) as {
        success: boolean;
        data: { frequency: string; nextRun?: string };
      };
      expect(res.data.frequency).toBe('daily');
      expect(typeof res.data.nextRun).toBe('string');
    });
  });

  describe('backup:setSchedule', () => {
    test('stores the schedule and the encryption password when encrypting', async () => {
      const res = (await invoke('backup:setSchedule', {
        enabled: true,
        frequency: 'weekly',
        dayOfWeek: 1,
        encrypt: true,
        encryptionPassword: 'secret',
      })) as { success: boolean };

      expect(res.success).toBe(true);
      expect(appSetting('exportSchedule')).toBeDefined();
      // password stored separately, and NOT inside the schedule blob
      expect(appSetting('backupEncryptionPassword')).toBe('secret');
      expect(appSetting('exportSchedule')).not.toContain('secret');
    });

    test('deletes the stored password when encryption is disabled', async () => {
      db.executeWrite(
        `INSERT INTO user_preferences (key, value) VALUES ('backupEncryptionPassword', 'old')`,
        []
      );

      await invoke('backup:setSchedule', {
        enabled: true,
        frequency: 'daily',
        encrypt: false,
      });

      expect(appSetting('backupEncryptionPassword')).toBeUndefined();
    });
  });

  describe('backup:getHistory', () => {
    test('returns scheduled-export rows with exists/encrypted flags', async () => {
      db.executeWrite(
        `INSERT INTO export_history (export_type, file_path, status) VALUES ('scheduled', '/b/x.db', 'completed')`,
        []
      );
      db.executeWrite(
        `INSERT INTO export_history (export_type, status) VALUES ('csv', 'completed')`,
        []
      );

      const res = (await invoke('backup:getHistory', 10)) as {
        success: boolean;
        data: Array<{ file_path: string; exists: boolean; encrypted: boolean }>;
      };

      expect(res.success).toBe(true);
      expect(res.data).toHaveLength(1); // only the scheduled row
      expect(res.data[0].exists).toBe(true); // fs.existsSync mocked true
      expect(res.data[0].encrypted).toBe(false); // not a .enc path
    });
  });
});

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = mockIpc.__getHandler(channel);
  if (!handler) throw new Error(`No handler registered for ${channel}`);
  return Promise.resolve(handler({} as unknown, ...args));
}

function buildCtx(database: Database): IpcContext {
  const unused = (name: string) => () => {
    throw new Error(`IpcContext.${name} should not be called by these tests`);
  };
  const noopLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    child: () => noopLogger,
  };
  return {
    getDatabase: () => database,
    getLogger: () => noopLogger as unknown as ReturnType<IpcContext['getLogger']>,
    getBackupDir: () => '/tmp/backups',
    getMainWindow: () => null,
    getVisibilityOracle: () => null,
    getFileEntityProvider: () => null,
    getCanvasClient: () => null,
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
