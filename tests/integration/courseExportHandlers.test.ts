/**
 * courseExportHandlers — handler behavior tests (ADR-0007).
 *
 * Covers both migrated paths: `data:exportCourseData` (reads via
 * CourseExportReader, then writes the JSON file) and `data:importCourseData`
 * (delegates to ImportCourseDataCommand). Dialogs and the filesystem are
 * mocked.
 */

const mockShowOpenDialog = jest.fn();
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
    dialog: {
      showOpenDialog: (...a: unknown[]) => mockShowOpenDialog(...a),
      showSaveDialog: (...a: unknown[]) => mockShowSaveDialog(...a),
    },
  };
});

const mockReadFileSync = jest.fn();
const mockWriteFileSync = jest.fn();
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
    writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
  };
});

import { ipcMain } from 'electron';
import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';
import { registerCourseExportHandlers } from '../../src/lifecycle/ipc-handlers/courseExportHandlers';
import type { IpcContext } from '../../src/lifecycle/ipc-handlers/IpcContext';

interface IpcMainMock {
  __getHandler: (channel: string) => ((...args: unknown[]) => unknown) | undefined;
  __reset: () => void;
}

const mockIpc = ipcMain as unknown as IpcMainMock;

describe('courseExportHandlers — data:importCourseData (ADR-0007)', () => {
  let db: Database;

  beforeEach(() => {
    mockIpc.__reset();
    mockShowOpenDialog.mockReset();
    mockShowSaveDialog.mockReset();
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    registerCourseExportHandlers(buildCtx(db));
  });

  afterEach(() => {
    db.close();
  });

  describe('data:exportCourseData', () => {
    test('gathers the bundle and writes the JSON file', async () => {
      db.executeWrite(
        `INSERT INTO courses (id, external_id, code, name) VALUES (1, 'c1', 'CS', 'Intro')`,
        [],
        'courses'
      );
      db.executeWrite(
        `INSERT INTO tasks (id, external_id, course_id, title) VALUES (5, 't1', 1, 'HW')`,
        [],
        'tasks'
      );
      mockShowSaveDialog.mockResolvedValue({
        canceled: false,
        filePath: '/tmp/export.json',
      });

      const res = (await invoke('data:exportCourseData', {})) as {
        success: boolean;
        data: { courseCount: number; taskCount: number; filePath: string };
      };

      expect(res.success).toBe(true);
      expect(res.data).toMatchObject({ courseCount: 1, taskCount: 1 });
      // the bundle was serialized to disk (CourseExportReader.gather delegation)
      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
      const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
      expect(written.courses[0].code).toBe('CS');
      expect(written.tasks).toHaveLength(1);
    });

    test('no courses → error before opening the save dialog', async () => {
      const res = (await invoke('data:exportCourseData', {
        courseIds: [999],
      })) as { success: boolean; error: string };
      expect(res.success).toBe(false);
      expect(res.error).toBe('No courses found to export');
      expect(mockShowSaveDialog).not.toHaveBeenCalled();
    });
  });

  test('imports a valid payload and returns counts', async () => {
    mockShowOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/tmp/in.json'],
    });
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        version: '1.1',
        courses: [{ id: 1, externalId: 'c1', code: 'CS', name: 'CS' }],
        tasks: [{ id: 2, external_id: 't1', course_id: 1, title: 'HW' }],
      })
    );

    const res = (await invoke('data:importCourseData')) as {
      success: boolean;
      data: { coursesImported: number; tasksImported: number; filePath: string };
    };

    expect(res.success).toBe(true);
    expect(res.data).toMatchObject({ coursesImported: 1, tasksImported: 1 });
    expect(res.data.filePath).toBe('/tmp/in.json');

    const count = db.executeReadOne<{ n: number }>(
      'SELECT COUNT(*) as n FROM courses',
      []
    );
    expect(count?.n).toBe(1);
  });

  test('returns failure for a structurally-invalid payload', async () => {
    mockShowOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/tmp/bad.json'],
    });
    mockReadFileSync.mockReturnValue(JSON.stringify({ notVersioned: true }));

    const res = (await invoke('data:importCourseData')) as {
      success: boolean;
      error: string;
    };
    expect(res.success).toBe(false);
    expect(res.error).toContain('Invalid export file format');
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
    getFilesDir: unused('getFilesDir') as IpcContext['getFilesDir'],
    getDbPath: unused('getDbPath') as IpcContext['getDbPath'],
    getBackupDir: unused('getBackupDir') as IpcContext['getBackupDir'],
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
