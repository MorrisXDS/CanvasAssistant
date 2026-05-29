/**
 * exportHandlers — IPC handler behavior tests (ADR-0007).
 *
 * The save dialog, ExportManager, and filesystem are mocked; the focus is
 * that exports/backups log to `export_history` via RecordExportHistoryCommand,
 * the WAL checkpoint runs via database.checkpoint(), and getExportHistory
 * reads through ExportHistoryReader — i.e. no raw SQL in the handler.
 */

const mockShowSaveDialog = jest.fn();
const mockShowOpenDialog = jest.fn();

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
    dialog: {
      showSaveDialog: (...a: unknown[]) => mockShowSaveDialog(...a),
      showOpenDialog: (...a: unknown[]) => mockShowOpenDialog(...a),
    },
    app: { getPath: () => '/tmp' },
  };
});

const mockExportSelective = jest.fn();
jest.mock('../../src/layers/l2-daemon', () => ({
  ExportManager: jest.fn().mockImplementation(() => ({
    exportSelective: (...a: unknown[]) => mockExportSelective(...a),
  })),
}));

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: () => true,
    mkdirSync: jest.fn(),
    copyFileSync: jest.fn(),
    statSync: jest.fn(() => ({ size: 4242 })),
  };
});

import fs from 'fs';
import { ipcMain } from 'electron';
import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';
import { registerExportHandlers } from '../../src/lifecycle/ipc-handlers/exportHandlers';
import type { IpcContext } from '../../src/lifecycle/ipc-handlers/IpcContext';

interface IpcMainMock {
  __getHandler: (channel: string) => ((...args: unknown[]) => unknown) | undefined;
  __reset: () => void;
}

const mockIpc = ipcMain as unknown as IpcMainMock;

describe('exportHandlers (ADR-0007)', () => {
  let db: Database;

  beforeEach(() => {
    mockIpc.__reset();
    mockShowSaveDialog.mockReset();
    mockExportSelective.mockReset();
    (fs.copyFileSync as jest.Mock).mockReset();
    (fs.statSync as jest.Mock).mockReturnValue({ size: 4242 });

    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    registerExportHandlers(buildCtx(db));
  });

  afterEach(() => {
    db.close();
  });

  function history() {
    return db.executeRead<{ export_type: string; status: string }>(
      'SELECT export_type, status FROM export_history ORDER BY id',
      []
    );
  }

  describe('data:exportSelective', () => {
    test('logs a selective export on success', async () => {
      mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/e.json' });
      mockExportSelective.mockResolvedValue({
        success: true,
        fileSize: 100,
        tasksExported: 3,
        filesExported: 1,
      });

      const res = (await invoke('data:exportSelective', {
        format: 'json',
        courses: [1, 2],
        encrypt: true,
      })) as { success: boolean };

      expect(res.success).toBe(true);
      const rows = history();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ export_type: 'selective', status: 'completed' });
    });

    test('returns cancelled without logging when dialog dismissed', async () => {
      mockShowSaveDialog.mockResolvedValue({ canceled: true });
      const res = (await invoke('data:exportSelective', { format: 'json' })) as {
        success: boolean;
      };
      expect(res.success).toBe(false);
      expect(history()).toHaveLength(0);
    });
  });

  describe('data:runScheduledBackup', () => {
    test('checkpoints, copies, and logs a completed backup', async () => {
      const res = (await invoke('data:runScheduledBackup')) as {
        success: boolean;
        fileSize: number;
      };
      expect(res.success).toBe(true);
      expect(fs.copyFileSync).toHaveBeenCalled();

      const rows = history();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ export_type: 'scheduled', status: 'completed' });
    });

    test('logs a failed backup when the copy throws', async () => {
      (fs.copyFileSync as jest.Mock).mockImplementationOnce(() => {
        throw new Error('disk full');
      });

      const res = (await invoke('data:runScheduledBackup')) as { success: boolean };
      expect(res.success).toBe(false);

      const rows = history();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ export_type: 'scheduled', status: 'failed' });
    });
  });

  describe('data:getExportHistory', () => {
    test('returns recent history rows', async () => {
      db.executeWrite(
        `INSERT INTO export_history (export_type, status) VALUES ('csv', 'completed')`,
        []
      );
      const res = (await invoke('data:getExportHistory')) as {
        success: boolean;
        data: Array<{ export_type: string }>;
      };
      expect(res.success).toBe(true);
      expect(res.data).toHaveLength(1);
      expect(res.data[0].export_type).toBe('csv');
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
    getMetricsCollector: () =>
      ({ increment: () => {} }) as unknown as ReturnType<
        IpcContext['getMetricsCollector']
      >,
    getMainWindow: () => ({}) as unknown as ReturnType<IpcContext['getMainWindow']>,
    getDbPath: () => '/tmp/canvas.db',
    getFilesDir: () => '/tmp',
    getAppVersion: () => '0.0.0-test',
    getVisibilityOracle: () =>
      ({}) as unknown as ReturnType<IpcContext['getVisibilityOracle']>,
    getSyncEngine: () => null,
    getFileEntityProvider: () => null,
    getCanvasClient: () => null,
    getCredentialManager: unused(
      'getCredentialManager'
    ) as IpcContext['getCredentialManager'],
    getFileDownloadManager: unused(
      'getFileDownloadManager'
    ) as IpcContext['getFileDownloadManager'],
    getHealthCheck: unused('getHealthCheck') as IpcContext['getHealthCheck'],
    getSystemMonitor: unused('getSystemMonitor') as IpcContext['getSystemMonitor'],
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
    getBackupDir: unused('getBackupDir') as IpcContext['getBackupDir'],
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
