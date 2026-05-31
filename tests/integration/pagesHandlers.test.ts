/**
 * pagesHandlers — IPC handler behavior tests (ADR-0007).
 *
 * Electron is mocked so the handler file (which imports `ipcMain` + `shell`)
 * loads in the Node test environment. Exercises the read-delegation early
 * returns, the successful download (course-page + page-resource write
 * delegations), the page-link and file dependency recording, and the
 * openFile read delegations.
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
    shell: {
      openPath: jest.fn().mockResolvedValue(''),
      openExternal: jest.fn(),
    },
  };
});

import { ipcMain } from 'electron';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as nodePath from 'path';
import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';
import { registerPagesHandlers } from '../../src/lifecycle/ipc-handlers/pagesHandlers';
import type { IpcContext } from '../../src/lifecycle/ipc-handlers/IpcContext';
import { createPathBuilder } from '../../src/layers/l0-utilities';

interface IpcMainMock {
  __getHandler: (channel: string) => ((...args: unknown[]) => unknown) | undefined;
  __reset: () => void;
}
const mockIpc = ipcMain as unknown as IpcMainMock;

type CanvasClientStub = { get: jest.Mock; getBaseUrl: () => string } | null;
type DownloadManagerStub = EventEmitter & {
  queueDownload: (job: { id: string }) => void;
};

let tmpDir: string;
let dirCounter = 0;

describe('pagesHandlers (ADR-0007)', () => {
  let db: Database;
  let canvasClient: CanvasClientStub;
  let htmlEnabled: boolean;

  beforeEach(() => {
    mockIpc.__reset();
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();

    dirCounter += 1;
    tmpDir = nodePath.join(os.tmpdir(), `cid-pages-test-${process.pid}-${dirCounter}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    canvasClient = {
      get: jest.fn(),
      getBaseUrl: () => 'https://canvas.example.com',
    };
    htmlEnabled = true;

    registerPagesHandlers(
      buildCtx(
        db,
        () => canvasClient,
        () => htmlEnabled,
        tmpDir
      )
    );
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function seedCourse(): void {
    db.executeWrite(
      `INSERT INTO courses (id, external_id, code, name) VALUES (1, '4242', 'CS101', 'Intro')`,
      [],
      'courses'
    );
  }
  function seedModule(): void {
    db.executeWrite(
      `INSERT INTO modules (id, external_id, course_id, name) VALUES (5, 'm1', 1, 'Week 1')`,
      [],
      'modules'
    );
  }
  function seedModuleItem(itemType = 'Page'): void {
    db.executeWrite(
      `INSERT INTO module_items (id, external_id, module_id, title, item_type, page_url, url)
       VALUES (10, 'mi1', 5, 'My Page', ?, 'my-page', 'https://canvas.example.com/courses/4242/pages/my-page')`,
      [itemType],
      'module_items'
    );
  }

  /** Re-register handlers with a custom token + download manager (file-dep tests). */
  function reregister(dlm: DownloadManagerStub): void {
    mockIpc.__reset();
    registerPagesHandlers(
      buildCtx(
        db,
        () => canvasClient,
        () => htmlEnabled,
        tmpDir,
        {
          token: 'tok',
          fileDownloadManager: dlm,
        }
      )
    );
  }

  test('registers both channels', () => {
    expect(mockIpc.__getHandler('pages:downloadContent')).toBeDefined();
    expect(mockIpc.__getHandler('pages:openFile')).toBeDefined();
  });

  describe('downloadContent early returns (read delegations)', () => {
    test('canvas client not connected', async () => {
      canvasClient = null;
      expect(await invoke('pages:downloadContent', 10)).toEqual({
        success: false,
        error: 'Canvas client not connected',
      });
    });

    test('module item not found', async () => {
      expect(await invoke('pages:downloadContent', 10)).toEqual({
        success: false,
        error: 'Module item not found',
      });
    });

    test('module item is not a Page type', async () => {
      seedModuleItem('Assignment');
      expect(await invoke('pages:downloadContent', 10)).toEqual({
        success: false,
        error: 'Module item is not a Page type',
      });
    });

    test('module not found', async () => {
      seedModuleItem();
      expect(await invoke('pages:downloadContent', 10)).toEqual({
        success: false,
        error: 'Module not found',
      });
    });

    test('course not found', async () => {
      seedModuleItem();
      seedModule();
      expect(await invoke('pages:downloadContent', 10)).toEqual({
        success: false,
        error: 'Course not found',
      });
    });
  });

  describe('downloadContent success (write delegations)', () => {
    test('saves page, persists course_page + page resource', async () => {
      seedCourse();
      seedModule();
      seedModuleItem();
      canvasClient!.get.mockResolvedValue({
        data: {
          page_id: 999,
          url: 'my-page',
          title: 'My Page',
          body: '<p>Hello, no dependencies here.</p>',
          updated_at: '2026-01-01T00:00:00Z',
          created_at: '2026-01-01T00:00:00Z',
        },
      });

      const result = (await invoke('pages:downloadContent', 10)) as {
        success: boolean;
        localPath?: string;
      };
      expect(result.success).toBe(true);
      expect(result.localPath).toBeTruthy();
      expect(fs.existsSync(result.localPath!)).toBe(true);

      // course_pages upserted (UpsertCoursePageCommand)
      const page = db.executeReadOne<{ title: string }>(
        'SELECT title FROM course_pages WHERE course_id = 1'
      );
      expect(page?.title).toBe('My Page');

      // page resource upserted (UpsertResourceCommand.upsertPage)
      const res = db.executeReadOne<{ type: string; external_id: string }>(
        "SELECT type, external_id FROM resources WHERE type = 'page'"
      );
      expect(res?.external_id).toBe('html-page-my-page');
    });

    test('records page-link dependencies from body HTML', async () => {
      seedCourse();
      seedModule();
      seedModuleItem();
      // A canvas-page link to a page in the SAME course (external_id 4242)
      canvasClient!.get.mockResolvedValue({
        data: {
          page_id: 1000,
          url: 'my-page',
          title: 'My Page',
          body: '<a href="https://canvas.example.com/courses/4242/pages/other-page">Other</a>',
          updated_at: '2026-01-01T00:00:00Z',
          created_at: '2026-01-01T00:00:00Z',
        },
      });

      const result = (await invoke('pages:downloadContent', 10)) as { success: boolean };
      expect(result.success).toBe(true);

      // RecordHtmlDependencyCommand page→page edge
      const dep = db.executeReadOne<{ child_source_id: string }>(
        "SELECT child_source_id FROM html_dependencies WHERE child_source_type = 'page'"
      );
      expect(dep?.child_source_id).toBe('other-page');
    });

    test('downloads a file dependency and records the file edge', async () => {
      seedCourse();
      seedModule();
      seedModuleItem();

      // Page body references a Canvas file → triggers the dependency download
      canvasClient!.get.mockImplementation((endpoint: string) => {
        if (endpoint.includes('/files/')) {
          return Promise.resolve({
            data: {
              id: 555,
              display_name: 'lecture.pdf',
              url: 'https://canvas.example.com/files/555/download',
              'content-type': 'application/pdf',
            },
          });
        }
        return Promise.resolve({
          data: {
            page_id: 1001,
            url: 'my-page',
            title: 'My Page',
            body: '<a href="https://canvas.example.com/courses/4242/files/555">PDF</a>',
            updated_at: '2026-01-01T00:00:00Z',
            created_at: '2026-01-01T00:00:00Z',
          },
        });
      });

      // Download manager writes the file at the handler's computed dependency
      // path, then emits a completion event.
      const dlm = new EventEmitter() as DownloadManagerStub;
      const depsFolder = createPathBuilder(tmpDir).getPageDependenciesPath(
        'CS101',
        'Week 1',
        'My Page'
      );
      dlm.queueDownload = (job) => {
        fs.mkdirSync(depsFolder, { recursive: true });
        const localPath = nodePath.join(depsFolder, 'lecture.pdf');
        fs.writeFileSync(localPath, 'pdf-bytes');
        setImmediate(() =>
          dlm.emit('download-complete', { id: job.id, success: true, localPath })
        );
      };
      reregister(dlm);

      const result = (await invoke('pages:downloadContent', 10)) as { success: boolean };
      expect(result.success).toBe(true);

      // RecordHtmlDependencyCommand page→file edge (recorded even though the
      // resources upsert hits the pre-existing context_type CHECK — see the
      // FOLLOWUP note; the dependency id is pushed before the upsert).
      const dep = db.executeReadOne<{ child_source_id: string }>(
        "SELECT child_source_id FROM html_dependencies WHERE child_source_type = 'file'"
      );
      expect(dep?.child_source_id).toBe('555');
    });

    test('a failed file download is tolerated (page still saves)', async () => {
      seedCourse();
      seedModule();
      seedModuleItem();
      canvasClient!.get.mockImplementation((endpoint: string) => {
        if (endpoint.includes('/files/')) {
          return Promise.resolve({
            data: {
              id: 555,
              display_name: 'lecture.pdf',
              url: 'https://canvas.example.com/files/555/download',
              'content-type': 'application/pdf',
            },
          });
        }
        return Promise.resolve({
          data: {
            page_id: 1002,
            url: 'my-page',
            title: 'My Page',
            body: '<a href="https://canvas.example.com/courses/4242/files/555">PDF</a>',
            updated_at: '2026-01-01T00:00:00Z',
            created_at: '2026-01-01T00:00:00Z',
          },
        });
      });

      const dlm = new EventEmitter() as DownloadManagerStub;
      dlm.queueDownload = (job) => {
        setImmediate(() =>
          dlm.emit('download-error', { id: job.id, success: false, error: 'boom' })
        );
      };
      reregister(dlm);

      const result = (await invoke('pages:downloadContent', 10)) as { success: boolean };
      expect(result.success).toBe(true);
      // Failed download → no dependency edge recorded
      expect(
        db.executeReadOne(
          "SELECT 1 FROM html_dependencies WHERE child_source_type = 'file'"
        )
      ).toBeUndefined();
    });
  });

  describe('openFile (read delegations)', () => {
    test('module item not found', async () => {
      expect(await invoke('pages:openFile', 10)).toEqual({
        success: false,
        error: 'Module item not found',
      });
    });

    test('offline HTML disabled → opens in Canvas', async () => {
      seedCourse();
      seedModule();
      seedModuleItem();
      htmlEnabled = false;

      const result = (await invoke('pages:openFile', 10)) as { success: boolean };
      expect(result.success).toBe(true);
    });

    test('offline HTML enabled but file missing → needsDownload', async () => {
      seedCourse();
      seedModule();
      seedModuleItem();
      htmlEnabled = true;

      const result = (await invoke('pages:openFile', 10)) as {
        success: boolean;
        needsDownload?: boolean;
      };
      expect(result.success).toBe(false);
      expect(result.needsDownload).toBe(true);
    });
  });
});

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = mockIpc.__getHandler(channel);
  if (!handler) throw new Error(`No handler registered for ${channel}`);
  return Promise.resolve(handler({} as unknown, ...args));
}

function buildCtx(
  database: Database,
  getCanvasClient: () => CanvasClientStub,
  getHtmlEnabled: () => boolean,
  filesDir: string,
  opts: { token?: string | null; fileDownloadManager?: EventEmitter } = {}
): IpcContext {
  const unused = (name: string) => () => {
    throw new Error(`IpcContext.${name} should not be called by pages handlers`);
  };
  const noopLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    child: () => noopLogger,
  };
  const credentialManager = {
    retrieve: () => Promise.resolve(opts.token ?? null),
  };
  // Real EventEmitter so the handler's `.on`/`.off` wiring is valid. Tests
  // without file dependencies never queue a download; the file-dep tests
  // supply their own emitter whose queueDownload emits a completion event.
  const fileDownloadManager = opts.fileDownloadManager ?? new EventEmitter();
  return {
    getDatabase: () => database,
    getLogger: () => noopLogger as unknown as ReturnType<IpcContext['getLogger']>,
    getMainWindow: () => null,
    getCredentialManager: () =>
      credentialManager as unknown as ReturnType<IpcContext['getCredentialManager']>,
    getFileDownloadManager: () =>
      fileDownloadManager as unknown as ReturnType<IpcContext['getFileDownloadManager']>,
    getCanvasClient: getCanvasClient as unknown as IpcContext['getCanvasClient'],
    getFilesDir: () => filesDir,
    getLocalHtmlPathsSettings: () => ({
      enabled: getHtmlEnabled(),
      autoRegenerate: false,
      promptForMissing: false,
    }),
    getVisibilityOracle: unused(
      'getVisibilityOracle'
    ) as IpcContext['getVisibilityOracle'],
    getFileEntityProvider: () => null,
    getMetricsCollector: unused(
      'getMetricsCollector'
    ) as IpcContext['getMetricsCollector'],
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
