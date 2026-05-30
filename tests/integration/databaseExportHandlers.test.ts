/**
 * databaseExportHandlers — IPC handler behavior tests (ADR-0007).
 *
 * Covers the migrated paths: the WAL checkpoint now uses database.checkpoint()
 * and the diagnostics endpoint reads via DiagnosticsReader. Dialog + fs are
 * mocked. (Import/encrypted paths operate on a separate file connection and
 * are out of scope.)
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
    dialog: { showSaveDialog: (...a: unknown[]) => mockShowSaveDialog(...a) },
    app: { getPath: () => '/tmp' },
  };
});

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return { ...actual, copyFileSync: jest.fn() };
});

jest.mock('../../src/layers/l2-daemon', () => ({ ExportManager: jest.fn() }));

import fs from 'fs';
import { ipcMain } from 'electron';
import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';
import { registerDatabaseExportHandlers } from '../../src/lifecycle/ipc-handlers/databaseExportHandlers';
import type { IpcContext } from '../../src/lifecycle/ipc-handlers/IpcContext';

interface IpcMainMock {
  __getHandler: (channel: string) => ((...args: unknown[]) => unknown) | undefined;
  __reset: () => void;
}

const mockIpc = ipcMain as unknown as IpcMainMock;

describe('databaseExportHandlers (ADR-0007)', () => {
  let db: Database;

  beforeEach(() => {
    mockIpc.__reset();
    mockShowSaveDialog.mockReset();
    (fs.copyFileSync as jest.Mock).mockReset();
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    registerDatabaseExportHandlers(buildCtx(db));
  });

  afterEach(() => {
    db.close();
  });

  describe('data:exportDatabase', () => {
    test('checkpoints and copies the database file', async () => {
      mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/out.db' });

      const res = (await invoke('data:exportDatabase')) as { success: boolean };

      expect(res.success).toBe(true);
      expect(fs.copyFileSync).toHaveBeenCalled();
    });

    test('returns cancelled when the dialog is dismissed', async () => {
      mockShowSaveDialog.mockResolvedValue({ canceled: true });

      const res = (await invoke('data:exportDatabase')) as { success: boolean };
      expect(res.success).toBe(false);
      expect(fs.copyFileSync).not.toHaveBeenCalled();
    });
  });

  describe('data:getDatabaseDiagnostics', () => {
    test('returns row counts, schema version, and calendar detail', async () => {
      db.executeWrite(
        `INSERT INTO courses (external_id, code, name, target_grade) VALUES ('e1', 'C', 'C', 85)`,
        []
      );
      db.executeWrite(
        `INSERT INTO imported_calendars (name, filename, event_count) VALUES ('Cal', 'c.ics', 2)`,
        []
      );

      const res = (await invoke('data:getDatabaseDiagnostics')) as {
        success: boolean;
        data: Record<string, unknown>;
      };

      expect(res.success).toBe(true);
      expect(res.data.courses).toBe(1);
      expect(typeof res.data.schemaVersion).toBe('number');
      expect(Array.isArray(res.data.importedCalendarsDetail)).toBe(true);
      expect((res.data.importedCalendarsDetail as unknown[]).length).toBe(1);
      expect(Array.isArray(res.data.calendarEventsByType)).toBe(true);
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
    getVisibilityOracle: () => null,
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
