/**
 * csvExportHandlers — IPC handler behavior tests (ADR-0007).
 *
 * The actual CSV writing (ExportManager) and the save dialog are mocked;
 * the focus is that a successful export logs to `export_history` through
 * RecordExportHistoryCommand (no raw SQL in the handler).
 */

const mockShowSaveDialog = jest.fn();

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
    dialog: { showSaveDialog: (...args: unknown[]) => mockShowSaveDialog(...args) },
  };
});

const mockExportTasksCsv = jest.fn();
const mockExportGradesCsv = jest.fn();

jest.mock('../../src/layers/l2-daemon', () => ({
  ExportManager: jest.fn().mockImplementation(() => ({
    exportTasksCsv: (...args: unknown[]) => mockExportTasksCsv(...args),
    exportGradesCsv: (...args: unknown[]) => mockExportGradesCsv(...args),
  })),
}));

import { ipcMain } from 'electron';
import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';
import { registerCsvExportHandlers } from '../../src/lifecycle/ipc-handlers/csvExportHandlers';
import type { IpcContext } from '../../src/lifecycle/ipc-handlers/IpcContext';

interface IpcMainMock {
  __getHandler: (channel: string) => ((...args: unknown[]) => unknown) | undefined;
  __reset: () => void;
}

const mockIpc = ipcMain as unknown as IpcMainMock;

describe('csvExportHandlers (ADR-0007)', () => {
  let db: Database;

  beforeEach(() => {
    mockIpc.__reset();
    mockShowSaveDialog.mockReset();
    mockExportTasksCsv.mockReset();
    mockExportGradesCsv.mockReset();

    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    registerCsvExportHandlers(buildCtx(db));
  });

  afterEach(() => {
    db.close();
  });

  function historyRows() {
    return db.executeRead<{ export_type: string; tasks_exported: number }>(
      'SELECT export_type, tasks_exported FROM export_history',
      []
    );
  }

  describe('data:exportTasksCsv', () => {
    test('logs to export_history on a successful export', async () => {
      mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/t.csv' });
      mockExportTasksCsv.mockResolvedValue({
        success: true,
        fileSize: 100,
        tasksExported: 4,
      });

      const res = (await invoke('data:exportTasksCsv', {})) as { success: boolean };
      expect(res.success).toBe(true);

      const rows = historyRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ export_type: 'csv', tasks_exported: 4 });
    });

    test('does not log when the export fails', async () => {
      mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/t.csv' });
      mockExportTasksCsv.mockResolvedValue({ success: false, error: 'boom' });

      await invoke('data:exportTasksCsv', {});
      expect(historyRows()).toHaveLength(0);
    });

    test('returns cancelled when the dialog is dismissed', async () => {
      mockShowSaveDialog.mockResolvedValue({ canceled: true });

      const res = (await invoke('data:exportTasksCsv', {})) as { success: boolean };
      expect(res.success).toBe(false);
      expect(historyRows()).toHaveLength(0);
    });
  });

  describe('data:exportGradesCsv', () => {
    test('logs to export_history on a successful export', async () => {
      mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/g.csv' });
      mockExportGradesCsv.mockResolvedValue({
        success: true,
        fileSize: 200,
        tasksExported: 9,
      });

      const res = (await invoke('data:exportGradesCsv', {})) as { success: boolean };
      expect(res.success).toBe(true);

      const rows = historyRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ export_type: 'csv', tasks_exported: 9 });
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
    getDbPath: unused('getDbPath') as IpcContext['getDbPath'],
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
