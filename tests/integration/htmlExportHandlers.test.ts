/**
 * htmlExportHandlers — IPC handler behavior tests (ADR-0007).
 *
 * The filesystem is mocked; the focus is that exports register through
 * UpsertHtmlExportCommand, course/export lookups route through
 * CourseReader / HtmlExportReader, and getExports reads via the reader —
 * i.e. no raw SQL in the handler.
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
  return {
    ...actual,
    existsSync: () => false,
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
  };
});

import fs from 'fs';
import { ipcMain } from 'electron';
import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';
import { registerHtmlExportHandlers } from '../../src/lifecycle/ipc-handlers/htmlExportHandlers';
import type { IpcContext } from '../../src/lifecycle/ipc-handlers/IpcContext';

interface IpcMainMock {
  __getHandler: (channel: string) => ((...args: unknown[]) => unknown) | undefined;
  __reset: () => void;
}

const mockIpc = ipcMain as unknown as IpcMainMock;

function seedCourse(db: Database, id: number, code: string): void {
  db.executeWrite(
    `INSERT INTO courses (id, external_id, code, name, target_grade) VALUES (?, ?, ?, ?, 85)`,
    [id, `ext_${id}`, code, `Course ${code}`]
  );
}

describe('htmlExportHandlers (ADR-0007)', () => {
  let db: Database;

  beforeEach(() => {
    mockIpc.__reset();
    (fs.writeFileSync as jest.Mock).mockReset();
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    seedCourse(db, 1, 'CS101');
    registerHtmlExportHandlers(buildCtx(db));
  });

  afterEach(() => {
    db.close();
  });

  function exportRows() {
    return db.executeRead<{ source_type: string; source_id: string; title: string }>(
      'SELECT source_type, source_id, title FROM html_exports ORDER BY id',
      []
    );
  }

  describe('pages:exportHtml', () => {
    test('writes the file and registers the export', async () => {
      const res = (await invoke('pages:exportHtml', {
        courseId: 1,
        pageId: 42,
        title: 'Week 1',
        bodyHtml: '<p>hi</p>',
      })) as { success: boolean; data: { filePath: string } };

      expect(res.success).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalled();

      const rows = exportRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ source_type: 'page', source_id: '42' });
    });

    test('reuses the existing path on re-export (syllabus)', async () => {
      const first = (await invoke('pages:exportHtml', {
        courseId: 1,
        pageId: -1,
        title: 'Syllabus',
        bodyHtml: '<p>v1</p>',
      })) as { success: boolean; data: { filePath: string } };

      const second = (await invoke('pages:exportHtml', {
        courseId: 1,
        pageId: -1,
        title: 'Syllabus',
        bodyHtml: '<p>v2</p>',
      })) as { success: boolean; data: { filePath: string } };

      expect(second.success).toBe(true);
      expect(second.data.filePath).toBe(first.data.filePath);
      // Upsert keeps a single row for the (course, syllabus) context
      expect(exportRows()).toHaveLength(1);
    });

    test('returns error for a missing course', async () => {
      const res = (await invoke('pages:exportHtml', {
        courseId: 999,
        pageId: 1,
        title: 'x',
        bodyHtml: 'y',
      })) as { success: boolean; error: string };
      expect(res.success).toBe(false);
      expect(res.error).toContain('Course not found');
    });
  });

  describe('html:exportBatch', () => {
    test('exports each item and registers them', async () => {
      const res = (await invoke('html:exportBatch', {
        courseId: 1,
        items: [
          { sourceType: 'page', sourceId: '1', title: 'A', bodyHtml: '<p>a</p>' },
          { sourceType: 'assignment', sourceId: '2', title: 'B', bodyHtml: '<p>b</p>' },
        ],
      })) as { success: boolean; data: { exported: number; total: number } };

      expect(res.success).toBe(true);
      expect(res.data).toMatchObject({ exported: 2, total: 2 });
      expect(exportRows()).toHaveLength(2);
    });

    test('returns error for a missing course', async () => {
      const res = (await invoke('html:exportBatch', { courseId: 999, items: [] })) as {
        success: boolean;
        error: string;
      };
      expect(res.success).toBe(false);
      expect(res.error).toContain('Course not found');
    });
  });

  describe('html:getExports', () => {
    test('returns registered exports for a course', async () => {
      await invoke('pages:exportHtml', {
        courseId: 1,
        pageId: 5,
        title: 'P5',
        bodyHtml: '<p>x</p>',
      });

      const list = (await invoke('html:getExports', 1)) as Array<{
        sourceType: string;
        sourceId: string;
        localPath: string;
      }>;

      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ sourceType: 'page', sourceId: '5' });
      expect(list[0].localPath.length).toBeGreaterThan(0);
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
    getFilesDir: () => '/tmp/files',
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
