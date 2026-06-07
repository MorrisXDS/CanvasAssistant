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

import { ipcMain, shell } from 'electron';
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
import { createPathBuilder } from '../../src/layers/l0-utilities/PathBuilder';

interface IpcMainMock {
  __getHandler: (channel: string) => ((...args: unknown[]) => unknown) | undefined;
  __reset: () => void;
}
const mockIpc = ipcMain as unknown as IpcMainMock;
const mockShell = shell as unknown as { openPath: jest.Mock; openExternal: jest.Mock };

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
  // Drives getLocalHtmlPathsSettings().promptForMissing — defaults false to
  // preserve the pre-existing tests' behavior (dep-walk skipped). The A1 fork
  // tests flip this to true to exercise the missing-dependency-prompt branch.
  let promptForMissing: boolean;

  beforeEach(() => {
    mockIpc.__reset();
    // Clear the shell spies so per-test fork assertions (which side effect
    // fired) are isolated — the openFile fork tests assert openExternal vs
    // openPath was/was-NOT called, which only holds with a clean slate.
    mockShell.openExternal.mockClear();
    mockShell.openPath.mockClear();
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
    promptForMissing = false;

    registerPagesHandlers(
      buildCtx(
        db,
        () => canvasClient,
        () => htmlEnabled,
        tmpDir,
        { getPromptForMissing: () => promptForMissing }
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

  /**
   * Run a seeding fn with FK enforcement off, so we can insert orphan rows
   * (a module_item whose module is missing, or a module whose course is
   * missing) to exercise the handler's defensive "not found" guards. Those
   * branches are otherwise unreachable because the schema's FKs forbid the
   * orphan rows.
   */
  function withFkOff(fn: () => void): void {
    db.executeWrite('PRAGMA foreign_keys = OFF', []);
    try {
      fn();
    } finally {
      db.executeWrite('PRAGMA foreign_keys = ON', []);
    }
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
          getPromptForMissing: () => promptForMissing,
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
      // item_type is checked before the module lookup; seed the full valid
      // chain so the module_item insert satisfies its FK.
      seedCourse();
      seedModule();
      seedModuleItem('Assignment');
      expect(await invoke('pages:downloadContent', 10)).toEqual({
        success: false,
        error: 'Module item is not a Page type',
      });
    });

    test('module not found', async () => {
      // Orphan module_item (module 5 does not exist) → defensive guard.
      withFkOff(() => seedModuleItem());
      expect(await invoke('pages:downloadContent', 10)).toEqual({
        success: false,
        error: 'Module not found',
      });
    });

    test('course not found', async () => {
      // Orphan module (course 1 does not exist) + its item → defensive guard.
      withFkOff(() => {
        seedModule();
        seedModuleItem();
      });
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

      // RecordHtmlDependencyCommand page→file edge.
      const dep = db.executeReadOne<{ child_source_id: string }>(
        "SELECT child_source_id FROM html_dependencies WHERE child_source_type = 'file'"
      );
      expect(dep?.child_source_id).toBe('555');

      // The dependency resource row now persists (fixed latent bug): it used to
      // throw on the resources.context_type CHECK (context_type='page_dependency')
      // and never land; it now writes the allowed 'files' value.
      const depResource = db.executeReadOne<{ context_type: string; local_path: string }>(
        "SELECT context_type, local_path FROM resources WHERE type = 'file' AND course_id = 1"
      );
      expect(depResource?.context_type).toBe('files');
      expect(depResource?.local_path).toContain('lecture.pdf');
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

    // The localHtmlPaths.enabled fork is the proven landmine: the previous
    // version of this test asserted ONLY result.success, so a backwards-wired
    // fork would still pass. These tests pin WHICH file gets opened on each
    // branch, plus the negative (the other branch's side effect did NOT fire).
    test('offline HTML disabled → opens the Canvas page URL (not the local file)', async () => {
      seedCourse();
      seedModule();
      seedModuleItem();
      htmlEnabled = false;

      const result = (await invoke('pages:openFile', 10)) as { success: boolean };
      expect(result.success).toBe(true);

      // Behavior fork: the Canvas page URL is opened externally…
      expect(mockShell.openExternal).toHaveBeenCalledTimes(1);
      expect(mockShell.openExternal).toHaveBeenCalledWith(
        'https://canvas.example.com/courses/4242/pages/my-page'
      );
      // …and the local-open path was NOT taken (backwards-wiring guard).
      expect(mockShell.openPath).not.toHaveBeenCalled();
    });

    test('offline HTML disabled + no canvas client → opens the stored module_item.url fallback', async () => {
      seedCourse();
      seedModule();
      seedModuleItem();
      htmlEnabled = false;
      canvasClient = null; // forces the stored-url fallback branch (line 475)

      const result = (await invoke('pages:openFile', 10)) as { success: boolean };
      expect(result.success).toBe(true);

      expect(mockShell.openExternal).toHaveBeenCalledTimes(1);
      expect(mockShell.openExternal).toHaveBeenCalledWith(
        'https://canvas.example.com/courses/4242/pages/my-page'
      );
      expect(mockShell.openPath).not.toHaveBeenCalled();
    });

    test('offline HTML enabled + local file present → opens the local file (not Canvas)', async () => {
      seedCourse();
      seedModule();
      seedModuleItem();
      htmlEnabled = true;

      // Pre-create the file at the EXACT path the handler computes, derived via
      // PathBuilder (never hardcoded separators — Windows-dev/Linux-CI gotcha).
      // buildCtx hardcodes promptForMissing:false, so the dep-walk is skipped
      // and the handler opens the file directly.
      const localPath = createPathBuilder(tmpDir).getPageHtmlPath(
        'CS101',
        'Week 1',
        'My Page'
      );
      fs.mkdirSync(nodePath.dirname(localPath), { recursive: true });
      fs.writeFileSync(localPath, '<html><body>offline</body></html>');

      const result = (await invoke('pages:openFile', 10)) as {
        success: boolean;
        needsDownload?: boolean;
      };
      expect(result.success).toBe(true);
      expect(result.needsDownload).toBeFalsy();

      // Behavior fork: the LOCAL file is opened…
      expect(mockShell.openPath).toHaveBeenCalledTimes(1);
      expect(mockShell.openPath).toHaveBeenCalledWith(localPath);
      // …and Canvas was NOT opened externally (backwards-wiring guard).
      expect(mockShell.openExternal).not.toHaveBeenCalled();
    });

    test('offline HTML enabled but file missing → needsDownload (no file opened either way)', async () => {
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
      // Neither branch's open side effect fired on the short-circuit.
      expect(mockShell.openPath).not.toHaveBeenCalled();
      expect(mockShell.openExternal).not.toHaveBeenCalled();
    });

    // A1 — promptForMissing fork (pagesHandlers.ts:502).
    // When promptForMissing && !skipDependencyCheck, the handler reads the local
    // HTML, regex-matches `<safeTitle>_files/...` references, and short-circuits
    // with `hasMissingDependencies` (no open) for any referenced file absent on
    // disk. When false (or all deps present) it falls through to shell.openPath.
    // The seeded title is 'My Page' → sanitizeTitle is identity → the regex
    // pattern is `My Page_files/...`. Paths derived via PathBuilder (never
    // hardcoded separators — Windows-dev/Linux-CI gotcha #146).
    describe('promptForMissing dependency fork (A1)', () => {
      /** Write the page HTML at the handler's computed path. Returns the deps folder. */
      function seedLocalPageHtml(body: string): string {
        const builder = createPathBuilder(tmpDir);
        const localPath = builder.getPageHtmlPath('CS101', 'Week 1', 'My Page');
        fs.mkdirSync(nodePath.dirname(localPath), { recursive: true });
        fs.writeFileSync(localPath, body);
        return builder.getPageDependenciesPath('CS101', 'Week 1', 'My Page');
      }

      test('promptForMissing:true + a referenced dep absent on disk → hasMissingDependencies, file NOT opened', async () => {
        seedCourse();
        seedModule();
        seedModuleItem();
        htmlEnabled = true;
        promptForMissing = true;

        // HTML references My Page_files/missing.png; the deps folder exists but
        // the referenced file does not → missing dependency.
        const depsFolder = seedLocalPageHtml(
          '<html><body><img src="My Page_files/missing.png"></body></html>'
        );
        fs.mkdirSync(depsFolder, { recursive: true });

        const result = (await invoke('pages:openFile', 10)) as {
          success: boolean;
          hasMissingDependencies?: boolean;
          missingDependencies?: Array<{ filename: string }>;
        };

        expect(result.success).toBe(false);
        expect(result.hasMissingDependencies).toBe(true);
        expect(result.missingDependencies?.map((d) => d.filename)).toContain(
          'missing.png'
        );
        // Behavior fork: the prompt short-circuits the open (backwards-wiring guard).
        expect(mockShell.openPath).not.toHaveBeenCalled();
        expect(mockShell.openExternal).not.toHaveBeenCalled();
      });

      test('promptForMissing:true + all referenced deps present → falls through, file opened', async () => {
        seedCourse();
        seedModule();
        seedModuleItem();
        htmlEnabled = true;
        promptForMissing = true;

        const builder = createPathBuilder(tmpDir);
        const localPath = builder.getPageHtmlPath('CS101', 'Week 1', 'My Page');
        const depsFolder = seedLocalPageHtml(
          '<html><body><img src="My Page_files/present.png"></body></html>'
        );
        // The referenced dependency IS on disk now → no missing deps.
        fs.mkdirSync(depsFolder, { recursive: true });
        fs.writeFileSync(nodePath.join(depsFolder, 'present.png'), 'png-bytes');

        const result = (await invoke('pages:openFile', 10)) as {
          success: boolean;
          hasMissingDependencies?: boolean;
        };

        expect(result.success).toBe(true);
        expect(result.hasMissingDependencies).toBeFalsy();
        // Behavior fork: dep check passed → local file opened.
        expect(mockShell.openPath).toHaveBeenCalledTimes(1);
        expect(mockShell.openPath).toHaveBeenCalledWith(localPath);
        expect(mockShell.openExternal).not.toHaveBeenCalled();
      });

      test('promptForMissing:false + a referenced dep absent → dep check skipped, file opened (no hasMissingDependencies)', async () => {
        seedCourse();
        seedModule();
        seedModuleItem();
        htmlEnabled = true;
        promptForMissing = false; // the skip branch

        const builder = createPathBuilder(tmpDir);
        const localPath = builder.getPageHtmlPath('CS101', 'Week 1', 'My Page');
        const depsFolder = seedLocalPageHtml(
          '<html><body><img src="My Page_files/missing.png"></body></html>'
        );
        fs.mkdirSync(depsFolder, { recursive: true });
        // missing.png is deliberately absent — but promptForMissing:false means
        // the dep check never runs, so the file opens regardless.

        const result = (await invoke('pages:openFile', 10)) as {
          success: boolean;
          hasMissingDependencies?: boolean;
        };

        expect(result.success).toBe(true);
        // Backwards-wiring guard: the prompt branch must NOT fire when off.
        expect(result.hasMissingDependencies).toBeUndefined();
        expect(mockShell.openPath).toHaveBeenCalledTimes(1);
        expect(mockShell.openPath).toHaveBeenCalledWith(localPath);
      });
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
  opts: {
    token?: string | null;
    fileDownloadManager?: EventEmitter;
    getPromptForMissing?: () => boolean;
  } = {}
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
      promptForMissing: opts.getPromptForMissing ? opts.getPromptForMissing() : false,
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
