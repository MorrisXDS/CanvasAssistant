/**
 * htmlDependencyHandlers — IPC handler behavior tests (ADR-0007).
 *
 * Electron is mocked so the handler file (which imports `ipcMain`) loads in the
 * Node test environment. Exercises both channels and the dependency-walk fan-out
 * (file download, page processing, recorded-vs-parsed dependency paths, the
 * three content-hash source types, and the unsynced-page Canvas fetch).
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
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as nodePath from 'path';
import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';
import { registerHtmlDependencyHandlers } from '../../src/lifecycle/ipc-handlers/htmlDependencyHandlers';
import type { IpcContext } from '../../src/lifecycle/ipc-handlers/IpcContext';

interface IpcMainMock {
  __getHandler: (channel: string) => ((...args: unknown[]) => unknown) | undefined;
  __reset: () => void;
}
const mockIpc = ipcMain as unknown as IpcMainMock;

type CanvasClientStub = { get: jest.Mock } | null;
type DownloadManagerStub = EventEmitter & {
  queueDownload: (job: { id: string }) => void;
};

let tmpDir: string;
let dirCounter = 0;

describe('htmlDependencyHandlers (ADR-0007)', () => {
  let db: Database;
  let saveHtmlContent: boolean;
  let token: string | null;
  let canvasClient: CanvasClientStub;
  let downloadManager: DownloadManagerStub;

  beforeEach(() => {
    mockIpc.__reset();
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();

    dirCounter += 1;
    tmpDir = nodePath.join(os.tmpdir(), `cid-htmldep-test-${process.pid}-${dirCounter}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    saveHtmlContent = true;
    token = 'tok';
    canvasClient = { get: jest.fn() };
    downloadManager = new EventEmitter() as DownloadManagerStub;
    downloadManager.queueDownload = () => {};

    db.executeWrite(
      `INSERT INTO courses (id, external_id, code, name, syllabus_body, syllabus_hash)
       VALUES (1, '4242', 'CS101', 'Intro', '<p>syllabus</p>', 'shash')`,
      [],
      'courses'
    );

    register();
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function register(): void {
    mockIpc.__reset();
    registerHtmlDependencyHandlers(buildCtx());
  }

  function buildCtx(): IpcContext {
    const unused = (name: string) => () => {
      throw new Error(`IpcContext.${name} should not be called by html-dep handlers`);
    };
    const noopLogger = {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      child: () => noopLogger,
    };
    const operationCoordinator = {
      startOperation: () => 'session-abcdefghijklmnopqrstuvwxyz',
      completeOperation: () => {},
    };
    return {
      getDatabase: () => db,
      getLogger: () => noopLogger as unknown as ReturnType<IpcContext['getLogger']>,
      getCredentialManager: () =>
        ({ retrieve: () => Promise.resolve(token) }) as unknown as ReturnType<
          IpcContext['getCredentialManager']
        >,
      getFileDownloadManager: () =>
        downloadManager as unknown as ReturnType<IpcContext['getFileDownloadManager']>,
      getOperationCoordinator: (() =>
        operationCoordinator) as unknown as IpcContext['getOperationCoordinator'],
      getSyncPreferences: (() => ({
        saveHtmlContent,
      })) as unknown as IpcContext['getSyncPreferences'],
      getFilesDir: () => tmpDir,
      getCanvasClient: (() => canvasClient) as unknown as IpcContext['getCanvasClient'],
      getSyncEngine: (() => null) as unknown as IpcContext['getSyncEngine'],
      getLocalHtmlPathsSettings: unused(
        'getLocalHtmlPathsSettings'
      ) as IpcContext['getLocalHtmlPathsSettings'],
      getMainWindow: () => null,
      getVisibilityOracle: unused(
        'getVisibilityOracle'
      ) as IpcContext['getVisibilityOracle'],
      getFileEntityProvider: () => null,
      getMetricsCollector: unused(
        'getMetricsCollector'
      ) as IpcContext['getMetricsCollector'],
      getHealthCheck: unused('getHealthCheck') as IpcContext['getHealthCheck'],
      getSystemMonitor: unused('getSystemMonitor') as IpcContext['getSystemMonitor'],
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

  // --- seed helpers ---------------------------------------------------------

  function seedResource(opts: {
    id: number;
    externalId: string;
    type?: string;
    url?: string | null;
    localPath?: string | null;
    folderPath?: string | null;
  }): void {
    db.executeWrite(
      `INSERT INTO resources (id, external_id, course_id, type, title, url, local_path, folder_path)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?)`,
      [
        opts.id,
        opts.externalId,
        opts.type ?? 'file',
        `title-${opts.id}`,
        opts.url ?? null,
        opts.localPath ?? null,
        opts.folderPath ?? null,
      ],
      'resources'
    );
  }

  function seedPage(opts: {
    id: number;
    externalId: string;
    slug: string;
    body?: string | null;
    contentHash?: string | null;
  }): void {
    db.executeWrite(
      `INSERT INTO course_pages (id, external_id, course_id, page_type, title, url_slug, body_html, content_hash)
       VALUES (?, ?, 1, 'content', ?, ?, ?, ?)`,
      [
        opts.id,
        opts.externalId,
        `Page ${opts.id}`,
        opts.slug,
        opts.body ?? null,
        opts.contentHash ?? null,
      ],
      'course_pages'
    );
  }

  function writeHtml(name: string, body: string): string {
    const p = nodePath.join(tmpDir, name);
    fs.writeFileSync(p, body, 'utf-8');
    return p;
  }

  // --- registration ---------------------------------------------------------

  test('registers both channels', () => {
    expect(mockIpc.__getHandler('html:checkDependencies')).toBeDefined();
    expect(mockIpc.__getHandler('html:downloadDependencies')).toBeDefined();
  });

  // --- checkDependencies -----------------------------------------------------

  describe('checkDependencies', () => {
    test('feature disabled → featureDisabled flag, no reads', async () => {
      saveHtmlContent = false;
      const res = (await invoke('html:checkDependencies', 1)) as {
        success: boolean;
        featureDisabled?: boolean;
      };
      expect(res).toMatchObject({ success: true, featureDisabled: true });
    });

    test('resource not found', async () => {
      expect(await invoke('html:checkDependencies', 999)).toEqual({
        success: false,
        error: 'Resource not found',
      });
    });

    test('happy path resolves dependencies (getOpenInfoById + course lookup)', async () => {
      const p = writeHtml('main.html', '<html><body>no deps</body></html>');
      seedResource({ id: 10, externalId: 'html-page-main', localPath: p });
      const res = (await invoke('html:checkDependencies', 10)) as { success: boolean };
      expect(res.success).toBe(true);
    });
  });

  // --- downloadDependencies --------------------------------------------------

  describe('downloadDependencies', () => {
    test('feature disabled → error', async () => {
      saveHtmlContent = false;
      expect(await invoke('html:downloadDependencies', 1)).toMatchObject({
        success: false,
      });
    });

    test('resource not downloaded → error', async () => {
      seedResource({ id: 10, externalId: 'html-page-main', localPath: null });
      expect(await invoke('html:downloadDependencies', 10)).toEqual({
        success: false,
        error: 'Resource not found or not downloaded',
      });
    });

    test('no credentials → error', async () => {
      const p = writeHtml('m.html', '<html></html>');
      seedResource({ id: 10, externalId: 'html-page-main', localPath: p });
      token = null;
      expect(await invoke('html:downloadDependencies', 10)).toEqual({
        success: false,
        error: 'No credentials available',
      });
    });

    test('page source: downloads a file dep + processes a synced page dep (parse path)', async () => {
      // Main page HTML references a Canvas file (777) and a Canvas page (sub-page).
      const mainHtml =
        '<html><body>' +
        '<a href="https://canvas.example.com/courses/4242/files/777">f</a>' +
        '<a href="https://canvas.example.com/courses/4242/pages/sub-page">p</a>' +
        '</body></html>';
      const mainPath = writeHtml('main.html', mainHtml);
      seedResource({ id: 10, externalId: 'html-page-main', localPath: mainPath });
      // course_pages row for the main page (so getContentHash('page','main') returns)
      seedPage({
        id: 40,
        externalId: 'main',
        slug: 'main',
        body: '<p>m</p>',
        contentHash: 'h-main',
      });

      // The referenced file resource (not yet downloaded → triggers a download).
      seedResource({ id: 11, externalId: '777', url: 'https://x/777', localPath: null });
      // The referenced page (synced, has body) → processPage generates its HTML.
      seedPage({ id: 41, externalId: 'sub-ext', slug: 'sub-page', body: '<p>sub</p>' });

      // Download manager writes the file then emits completion.
      downloadManager.queueDownload = (job) => {
        const fp = nodePath.join(tmpDir, 'dep.bin');
        fs.writeFileSync(fp, 'bytes');
        setImmediate(() =>
          downloadManager.emit('download-complete', { id: job.id, localPath: fp })
        );
      };
      register();

      const res = (await invoke('html:downloadDependencies', 10)) as {
        success: boolean;
        filesDownloaded: number;
        pagesProcessed: number;
      };
      expect(res.success).toBe(true);
      expect(res.filesDownloaded).toBe(1);
      expect(res.pagesProcessed).toBe(1);

      // file resource got its local_path set (setLocalPath delegation)
      const fileRow = db.executeReadOne<{ local_path: string | null }>(
        'SELECT local_path FROM resources WHERE external_id = ?',
        ['777']
      );
      expect(fileRow?.local_path).toBeTruthy();

      // dependency edges recorded (replaceChild delegations) with the session id
      const edges = db.executeRead<{
        child_source_type: string;
        child_source_id: string;
      }>(
        "SELECT child_source_type, child_source_id FROM html_dependencies WHERE parent_source_id = 'main'"
      );
      expect(edges).toEqual(
        expect.arrayContaining([
          { child_source_type: 'file', child_source_id: '777' },
          { child_source_type: 'page', child_source_id: 'sub-page' },
        ])
      );
    });

    test('assignment source: computes content hash from tasks', async () => {
      const p = writeHtml('asg.html', '<html><body>no deps</body></html>');
      seedResource({ id: 10, externalId: 'html-assignment-900', localPath: p });
      db.executeWrite(
        `INSERT INTO tasks (id, external_id, course_id, title, description, description_hash)
         VALUES (200, '900', 1, 'HW', '<p>d</p>', 'dhash')`,
        [],
        'tasks'
      );
      const res = (await invoke('html:downloadDependencies', 10)) as { success: boolean };
      expect(res.success).toBe(true);
    });

    test('syllabus source: computes content hash from courses', async () => {
      const p = writeHtml('syl.html', '<html><body>no deps</body></html>');
      seedResource({ id: 10, externalId: 'html-syllabus-4242', localPath: p });
      const res = (await invoke('html:downloadDependencies', 10)) as { success: boolean };
      expect(res.success).toBe(true);
    });

    test('unsynced page dep is fetched from Canvas (upsertCoursePage + re-read)', async () => {
      const mainHtml =
        '<html><body>' +
        '<a href="https://canvas.example.com/courses/4242/pages/fresh-page">p</a>' +
        '</body></html>';
      const mainPath = writeHtml('main.html', mainHtml);
      seedResource({ id: 10, externalId: 'html-page-main', localPath: mainPath });
      // 'fresh-page' has NO course_pages row → handler fetches it from Canvas.
      canvasClient!.get.mockResolvedValue({
        data: {
          page_id: 555,
          url: 'fresh-page',
          title: 'Fresh',
          body: '<p>fresh body</p>',
          updated_at: '2026-01-01T00:00:00Z',
          created_at: '2026-01-01T00:00:00Z',
        },
      });
      register();

      const res = (await invoke('html:downloadDependencies', 10)) as {
        success: boolean;
        pagesProcessed: number;
      };
      expect(res.success).toBe(true);
      expect(canvasClient!.get).toHaveBeenCalled();
      // the page was upserted into course_pages (UpsertCoursePageCommand)
      const page = db.executeReadOne<{ title: string }>(
        "SELECT title FROM course_pages WHERE url_slug = 'fresh-page'"
      );
      expect(page?.title).toBe('Fresh');
    });

    test('stale recorded deps are purged then re-parsed (deleteAllForParent + getChildrenWithHash)', async () => {
      const mainPath = writeHtml('main.html', '<html><body>no deps now</body></html>');
      seedResource({ id: 10, externalId: 'html-page-main', localPath: mainPath });
      // Main page has a CURRENT content hash...
      seedPage({
        id: 40,
        externalId: 'main',
        slug: 'main',
        body: '<p>m</p>',
        contentHash: 'current-hash',
      });
      // ...but a previously-recorded dependency carries a STALE hash.
      db.executeWrite(
        `INSERT INTO html_dependencies
           (parent_source_type, parent_source_id, child_source_type, child_source_id, recorded_content_hash)
         VALUES ('page', 'main', 'file', '777', 'old-hash')`,
        [],
        'html_dependencies'
      );

      const res = (await invoke('html:downloadDependencies', 10)) as { success: boolean };
      expect(res.success).toBe(true);
      // Stale edge purged; main HTML now has no deps so nothing re-recorded.
      const remaining = db.executeReadOne(
        "SELECT 1 FROM html_dependencies WHERE parent_source_id = 'main' AND child_source_id = '777'"
      );
      expect(remaining).toBeUndefined();
    });
  });
});

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = mockIpc.__getHandler(channel);
  if (!handler) throw new Error(`No handler registered for ${channel}`);
  return Promise.resolve(handler({} as unknown, ...args));
}
