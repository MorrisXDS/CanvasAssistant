/**
 * resourceHandlers — IPC handler behavior tests (ADR-0007).
 *
 * Electron is mocked so the handler file (which imports `ipcMain` + `shell`)
 * loads in the Node test environment. Exercises the read-delegation early
 * returns, the local_path write delegations (markDownloaded / clear), and the
 * `resource:open` HTML dependency-walk that fans out across CoursePageReader /
 * HtmlDependencyReader / ResourceReader.
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
import { registerResourceHandlers } from '../../src/lifecycle/ipc-handlers/resourceHandlers';
import type { IpcContext } from '../../src/lifecycle/ipc-handlers/IpcContext';

interface IpcMainMock {
  __getHandler: (channel: string) => ((...args: unknown[]) => unknown) | undefined;
  __reset: () => void;
}
const mockIpc = ipcMain as unknown as IpcMainMock;
const mockShell = shell as unknown as { openPath: jest.Mock; openExternal: jest.Mock };

type CanvasClientStub = { getBaseUrl: () => string } | null;
type DownloadManagerStub = EventEmitter & {
  queueDownload: (job: { id: string }) => void;
};

let tmpDir: string;
let dirCounter = 0;

describe('resourceHandlers (ADR-0007)', () => {
  let db: Database;
  let token: string | null;
  let saveHtmlContent: boolean;
  let htmlEnabled: boolean;
  let promptForMissing: boolean;
  let canvasClient: CanvasClientStub;
  let downloadManager: DownloadManagerStub;

  beforeEach(() => {
    mockIpc.__reset();
    mockShell.openPath.mockClear();
    mockShell.openExternal.mockClear();

    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();

    dirCounter += 1;
    tmpDir = nodePath.join(os.tmpdir(), `cid-resource-test-${process.pid}-${dirCounter}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    token = 'tok';
    saveHtmlContent = true;
    htmlEnabled = true;
    promptForMissing = true;
    canvasClient = { getBaseUrl: () => 'https://canvas.example.com' };
    downloadManager = new EventEmitter() as DownloadManagerStub;
    downloadManager.queueDownload = () => {};

    db.executeWrite(
      `INSERT INTO courses (id, external_id, code, name) VALUES (1, '4242', 'CS101', 'Intro')`,
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
    registerResourceHandlers(buildCtx());
  }

  function buildCtx(): IpcContext {
    const unused = (name: string) => () => {
      throw new Error(`IpcContext.${name} should not be called by resource handlers`);
    };
    const noopLogger = {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      child: () => noopLogger,
    };
    return {
      getDatabase: () => db,
      getLogger: () => noopLogger as unknown as ReturnType<IpcContext['getLogger']>,
      getMetricsCollector: () =>
        ({ increment: () => {} }) as unknown as ReturnType<
          IpcContext['getMetricsCollector']
        >,
      getCredentialManager: () =>
        ({ retrieve: () => Promise.resolve(token) }) as unknown as ReturnType<
          IpcContext['getCredentialManager']
        >,
      getFileDownloadManager: () =>
        downloadManager as unknown as ReturnType<IpcContext['getFileDownloadManager']>,
      getCanvasClient: (() => canvasClient) as unknown as IpcContext['getCanvasClient'],
      getSyncEngine: (() => null) as unknown as IpcContext['getSyncEngine'],
      getSyncPreferences: (() => ({
        saveHtmlContent,
      })) as unknown as IpcContext['getSyncPreferences'],
      getLocalHtmlPathsSettings: () => ({
        enabled: htmlEnabled,
        autoRegenerate: false,
        promptForMissing,
      }),
      getFilesDir: () => tmpDir,
      getMainWindow: () => null,
      getVisibilityOracle: unused(
        'getVisibilityOracle'
      ) as IpcContext['getVisibilityOracle'],
      getFileEntityProvider: () => null,
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

  // Seed helpers --------------------------------------------------------------

  function seedResource(opts: {
    id: number;
    externalId: string;
    type?: string;
    url?: string | null;
    localPath?: string | null;
    sizeBytes?: number | null;
    mime?: string | null;
    folderPath?: string | null;
  }): void {
    db.executeWrite(
      `INSERT INTO resources
         (id, external_id, course_id, type, title, url, local_path, size_bytes, mime_type, folder_path)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
      [
        opts.id,
        opts.externalId,
        opts.type ?? 'file',
        `title-${opts.id}`,
        opts.url ?? null,
        opts.localPath ?? null,
        opts.sizeBytes ?? null,
        opts.mime ?? null,
        opts.folderPath ?? null,
      ],
      'resources'
    );
  }

  function writeTmpHtml(name: string, body: string): string {
    const p = nodePath.join(tmpDir, name);
    fs.writeFileSync(p, body, 'utf-8');
    return p;
  }

  function localPathOf(id: number): string | null {
    return (
      db.executeReadOne<{ local_path: string | null }>(
        'SELECT local_path FROM resources WHERE id = ?',
        [id]
      )?.local_path ?? null
    );
  }

  // --- registration ---------------------------------------------------------

  test('registers all four channels', () => {
    expect(mockIpc.__getHandler('resource:download')).toBeDefined();
    expect(mockIpc.__getHandler('resource:downloadByExternalId')).toBeDefined();
    expect(mockIpc.__getHandler('resource:openByExternalId')).toBeDefined();
    expect(mockIpc.__getHandler('resource:open')).toBeDefined();
  });

  // --- resource:download ----------------------------------------------------

  describe('resource:download', () => {
    test('resource not found', async () => {
      expect(await invoke('resource:download', 999)).toEqual({
        success: false,
        error: 'Resource not found',
      });
    });

    test('resource has no download URL', async () => {
      seedResource({ id: 10, externalId: 'file-1', url: null });
      expect(await invoke('resource:download', 10)).toEqual({
        success: false,
        error: 'Resource has no download URL',
      });
    });

    test('no credentials available', async () => {
      seedResource({ id: 10, externalId: 'file-1', url: 'https://x/f' });
      token = null;
      expect(await invoke('resource:download', 10)).toEqual({
        success: false,
        error: 'No credentials available',
      });
    });

    test('successful download writes local_path (markDownloaded)', async () => {
      seedResource({ id: 10, externalId: 'file-1', url: 'https://x/f' });
      downloadManager.queueDownload = (job) => {
        setImmediate(() =>
          downloadManager.emit('download-complete', {
            id: job.id,
            success: true,
            localPath: '/disk/f.pdf',
          })
        );
      };
      const res = (await invoke('resource:download', 10)) as {
        success: boolean;
        localPath?: string;
      };
      expect(res).toEqual({ success: true, localPath: '/disk/f.pdf' });
      expect(localPathOf(10)).toBe('/disk/f.pdf');
    });

    test('failed download resolves error, no write', async () => {
      seedResource({ id: 10, externalId: 'file-1', url: 'https://x/f' });
      downloadManager.queueDownload = (job) => {
        setImmediate(() =>
          downloadManager.emit('download-error', {
            id: job.id,
            success: false,
            error: 'boom',
          })
        );
      };
      expect(await invoke('resource:download', 10)).toEqual({
        success: false,
        error: 'boom',
      });
      expect(localPathOf(10)).toBeNull();
    });
  });

  // --- resource:downloadByExternalId ----------------------------------------

  describe('resource:downloadByExternalId', () => {
    test('resource not found', async () => {
      expect(await invoke('resource:downloadByExternalId', 'nope')).toEqual({
        success: false,
        error: 'Resource not found',
      });
    });

    test('successful download writes local_path (markDownloaded by id)', async () => {
      seedResource({ id: 11, externalId: 'file-xyz', url: 'https://x/f' });
      downloadManager.queueDownload = (job) => {
        setImmediate(() =>
          downloadManager.emit('download-complete', {
            id: job.id,
            success: true,
            localPath: '/disk/xyz.pdf',
          })
        );
      };
      const res = (await invoke('resource:downloadByExternalId', 'file-xyz')) as {
        success: boolean;
      };
      expect(res.success).toBe(true);
      expect(localPathOf(11)).toBe('/disk/xyz.pdf');
    });
  });

  // --- resource:openByExternalId --------------------------------------------

  describe('resource:openByExternalId', () => {
    test('resource not found', async () => {
      expect(await invoke('resource:openByExternalId', 'nope')).toEqual({
        success: false,
        error: 'Resource not found',
      });
    });

    test('no local_path → needsDownload', async () => {
      seedResource({ id: 12, externalId: 'file-a', localPath: null });
      expect(await invoke('resource:openByExternalId', 'file-a')).toEqual({
        success: false,
        error: 'File not downloaded',
        needsDownload: true,
      });
    });

    test('local_path present but file missing on disk → clear + needsDownload', async () => {
      seedResource({
        id: 13,
        externalId: 'file-b',
        localPath: nodePath.join(tmpDir, 'gone.pdf'),
      });
      const res = (await invoke('resource:openByExternalId', 'file-b')) as {
        success: boolean;
        needsDownload?: boolean;
      };
      expect(res.success).toBe(false);
      expect(res.needsDownload).toBe(true);
      // clear() delegation nulled the path
      expect(localPathOf(13)).toBeNull();
    });

    test('file exists → opens and succeeds', async () => {
      const p = writeTmpHtml('present.pdf', 'bytes');
      seedResource({ id: 14, externalId: 'file-c', localPath: p });
      expect(await invoke('resource:openByExternalId', 'file-c')).toEqual({
        success: true,
      });
      expect(mockShell.openPath).toHaveBeenCalledWith(p);
    });
  });

  // --- resource:open --------------------------------------------------------

  describe('resource:open', () => {
    test('not downloaded (no local_path)', async () => {
      seedResource({ id: 20, externalId: 'file-d', localPath: null });
      expect(await invoke('resource:open', 20)).toEqual({
        success: false,
        error: 'File not downloaded',
      });
    });

    test('local_path present but missing on disk → clear', async () => {
      seedResource({
        id: 21,
        externalId: 'file-e',
        localPath: nodePath.join(tmpDir, 'gone.pdf'),
      });
      const res = (await invoke('resource:open', 21)) as { success: boolean };
      expect(res.success).toBe(false);
      expect(localPathOf(21)).toBeNull();
    });

    test('non-HTML file opens directly', async () => {
      const p = writeTmpHtml('doc.pdf', 'bytes');
      seedResource({ id: 22, externalId: 'file-f', localPath: p });
      expect(await invoke('resource:open', 22)).toEqual({ success: true });
      expect(mockShell.openPath).toHaveBeenCalledWith(p);
    });

    test('HTML with offline disabled → opens in Canvas (getUrlSlug + course lookup)', async () => {
      const p = writeTmpHtml('page.html', '<html></html>');
      seedResource({ id: 23, externalId: 'html-page-week-1', localPath: p });
      db.executeWrite(
        `INSERT INTO course_pages (id, external_id, course_id, page_type, title, url_slug, body_html)
         VALUES (50, 'pg-1', 1, 'content', 'Week 1', 'week-1', '<p>x</p>')`,
        [],
        'course_pages'
      );
      saveHtmlContent = false; // → useStoredHtml = true → open in Canvas
      register();

      const res = (await invoke('resource:open', 23)) as {
        success: boolean;
        openedInCanvas?: boolean;
      };
      expect(res).toEqual({ success: true, openedInCanvas: true });
      expect(mockShell.openExternal).toHaveBeenCalledWith(
        'https://canvas.example.com/courses/4242/pages/week-1'
      );
      // Backwards-wiring guard: the local file was NOT opened on the Canvas branch.
      expect(mockShell.openPath).not.toHaveBeenCalled();
    });

    test('HTML with localHtmlPaths.enabled=false (saveHtmlContent still true) → opens in Canvas', async () => {
      // Isolates the SECOND operand of `useStoredHtml = !saveHtmlContent ||
      // !htmlSettings.enabled` — the existing test above flips saveHtmlContent;
      // this proves the htmlSettings.enabled half of the same fork on its own.
      const p = writeTmpHtml('page2.html', '<html></html>');
      seedResource({ id: 26, externalId: 'html-page-week-2', localPath: p });
      db.executeWrite(
        `INSERT INTO course_pages (id, external_id, course_id, page_type, title, url_slug, body_html)
         VALUES (51, 'pg-2', 1, 'content', 'Week 2', 'week-2', '<p>x</p>')`,
        [],
        'course_pages'
      );
      saveHtmlContent = true; // keep the first operand FALSE…
      htmlEnabled = false; // …so only !htmlSettings.enabled drives useStoredHtml.
      register();

      const res = (await invoke('resource:open', 26)) as {
        success: boolean;
        openedInCanvas?: boolean;
      };
      expect(res).toEqual({ success: true, openedInCanvas: true });
      expect(mockShell.openExternal).toHaveBeenCalledWith(
        'https://canvas.example.com/courses/4242/pages/week-2'
      );
      expect(mockShell.openPath).not.toHaveBeenCalled();
    });

    test('HTML with recorded deps → reports missing file + page dependencies', async () => {
      const p = writeTmpHtml('main.html', '<html><body>main</body></html>');
      seedResource({ id: 24, externalId: 'html-page-main', localPath: p });

      // Recorded dependency edges: main → file 777, main → page sub-page
      const edge = (cType: string, cId: string): void => {
        db.executeWrite(
          `INSERT INTO html_dependencies (parent_source_type, parent_source_id, child_source_type, child_source_id)
           VALUES ('page', 'main', ?, ?)`,
          [cType, cId],
          'html_dependencies'
        );
      };
      edge('file', '777');
      edge('page', 'sub-page');

      // The file dependency exists as a resource but is NOT downloaded.
      seedResource({
        id: 25,
        externalId: '777',
        localPath: null,
        sizeBytes: 1234,
        url: 'https://x/777',
      });
      // The page dependency: a course_page (matched by url_slug) whose generated
      // HTML resource does not exist → counted as a missing page.
      db.executeWrite(
        `INSERT INTO course_pages (id, external_id, course_id, page_type, title, url_slug, body_html)
         VALUES (60, 'sub-ext', 1, 'content', 'Sub Page', 'sub-page', '<p>sub</p>')`,
        [],
        'course_pages'
      );

      const res = (await invoke('resource:open', 24)) as {
        success: boolean;
        hasMissingDependencies?: boolean;
        missingDependencies?: Array<{ sourceId: string; type: string }>;
        totalMissingCount?: number;
      };
      expect(res.success).toBe(false);
      expect(res.hasMissingDependencies).toBe(true);
      const ids = (res.missingDependencies ?? []).map((d) => d.sourceId).sort();
      expect(ids).toEqual(['777', 'sub-page']);
    });

    // A2 — promptForMissing skip fork (resourceHandlers.ts:412).
    // The test above (`HTML with recorded deps`) already pins the `else` branch
    // (promptForMissing:true → recursive dep-walk → hasMissingDependencies). This
    // pins the `!promptForMissing` skip branch: the SAME missing-dependency seed,
    // but with promptForMissing:false, must skip the dep check and open the file
    // directly (no hasMissingDependencies in the result).
    test('promptForMissing:false → dep check skipped, HTML opened directly (no hasMissingDependencies)', async () => {
      const p = writeTmpHtml('skip.html', '<html><body>main</body></html>');
      seedResource({ id: 30, externalId: 'html-page-skip', localPath: p });

      // Seed a recorded missing file dependency — identical shape to the dep-walk
      // test — so the ONLY difference driving the result is promptForMissing.
      db.executeWrite(
        `INSERT INTO html_dependencies (parent_source_type, parent_source_id, child_source_type, child_source_id)
         VALUES ('page', 'skip', 'file', '888')`,
        [],
        'html_dependencies'
      );
      seedResource({
        id: 31,
        externalId: '888',
        localPath: null,
        sizeBytes: 1234,
        url: 'https://x/888',
      });

      // saveHtmlContent:true + htmlEnabled:true → useStoredHtml false → reaches
      // the promptForMissing fork. Flip the skip branch on.
      saveHtmlContent = true;
      htmlEnabled = true;
      promptForMissing = false;
      register();

      const res = (await invoke('resource:open', 30)) as {
        success: boolean;
        hasMissingDependencies?: boolean;
        openedInCanvas?: boolean;
      };
      expect(res.success).toBe(true);
      // Backwards-wiring guard: the dep-walk did NOT run despite a missing dep.
      expect(res.hasMissingDependencies).toBeUndefined();
      expect(res.openedInCanvas).toBeFalsy();
      // The local file is opened directly.
      expect(mockShell.openPath).toHaveBeenCalledWith(p);
      expect(mockShell.openExternal).not.toHaveBeenCalled();
    });
  });
});

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = mockIpc.__getHandler(channel);
  if (!handler) throw new Error(`No handler registered for ${channel}`);
  return Promise.resolve(handler({} as unknown, ...args));
}
