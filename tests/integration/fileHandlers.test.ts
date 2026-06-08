/**
 * fileHandlers — IPC handler behavior tests (ADR-0007).
 *
 * Electron is mocked so the handler file (ipcMain + dialog + shell) loads in
 * the Node test environment. Exercises the DB-touching channels: attachment
 * download/open/show, files:clearSync, the resource show/delete variants, and
 * canvas-file:open (open-existing + download-then-open).
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
      showItemInFolder: jest.fn(),
      openExternal: jest.fn(),
    },
    dialog: {
      showOpenDialog: jest.fn(),
      showSaveDialog: jest.fn(),
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
import { registerFileHandlers } from '../../src/lifecycle/ipc-handlers/fileHandlers';
import type { IpcContext } from '../../src/lifecycle/ipc-handlers/IpcContext';

interface IpcMainMock {
  __getHandler: (channel: string) => ((...args: unknown[]) => unknown) | undefined;
  __reset: () => void;
}
const mockIpc = ipcMain as unknown as IpcMainMock;
const mockShell = shell as unknown as {
  openPath: jest.Mock;
  showItemInFolder: jest.Mock;
};

type DownloadManagerStub = EventEmitter & {
  queueDownload: (job: { id: string }) => void;
  getBaseDir: () => string;
};

let tmpDir: string;
let dirCounter = 0;

describe('fileHandlers (ADR-0007)', () => {
  let db: Database;
  let token: string | null;
  let downloadManager: DownloadManagerStub;

  beforeEach(() => {
    mockIpc.__reset();
    mockShell.openPath.mockClear();
    mockShell.showItemInFolder.mockClear();

    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();

    dirCounter += 1;
    tmpDir = nodePath.join(os.tmpdir(), `cid-file-test-${process.pid}-${dirCounter}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    token = 'tok';
    downloadManager = new EventEmitter() as DownloadManagerStub;
    downloadManager.queueDownload = () => {};
    downloadManager.getBaseDir = () => tmpDir;

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
    registerFileHandlers(buildCtx());
  }

  function buildCtx(): IpcContext {
    const unused = (name: string) => () => {
      throw new Error(`IpcContext.${name} should not be called by file handlers`);
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
      getMainWindow: () => null,
      getVisibilityOracle: unused(
        'getVisibilityOracle'
      ) as IpcContext['getVisibilityOracle'],
      getFileEntityProvider: () => null,
      getCanvasClient: unused(
        'getCanvasClient'
      ) as unknown as IpcContext['getCanvasClient'],
      getSyncEngine: unused('getSyncEngine') as IpcContext['getSyncEngine'],
      getSyncPreferences: unused(
        'getSyncPreferences'
      ) as IpcContext['getSyncPreferences'],
      getLocalHtmlPathsSettings: unused(
        'getLocalHtmlPathsSettings'
      ) as IpcContext['getLocalHtmlPathsSettings'],
      getFilesDir: unused('getFilesDir') as IpcContext['getFilesDir'],
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

  // --- seeds ----------------------------------------------------------------

  function seedAttachment(opts: { id: number; localPath?: string | null }): void {
    db.executeWrite('PRAGMA foreign_keys = OFF', []);
    db.executeWrite(
      `INSERT INTO notification_attachments
         (id, notification_id, course_id, external_id, display_name, filename, url, local_path, download_status)
       VALUES (?, 99, 1, ?, 'D', 'f.pdf', 'https://x/att', ?, 'pending')`,
      [opts.id, `att-${opts.id}`, opts.localPath ?? null],
      'notification_attachments'
    );
    db.executeWrite('PRAGMA foreign_keys = ON', []);
  }

  function seedResource(opts: {
    id: number;
    externalId: string;
    url?: string | null;
    localPath?: string | null;
  }): void {
    db.executeWrite(
      `INSERT INTO resources (id, external_id, course_id, type, title, url, local_path, folder_path)
       VALUES (?, ?, 1, 'file', ?, ?, ?, 'Wk1')`,
      [
        opts.id,
        opts.externalId,
        `title-${opts.id}`,
        opts.url ?? null,
        opts.localPath ?? null,
      ],
      'resources'
    );
  }

  function writeFile(name: string): string {
    const p = nodePath.join(tmpDir, name);
    fs.writeFileSync(p, 'bytes');
    return p;
  }

  function attachmentStatus(id: number): string | undefined {
    return db.executeReadOne<{ download_status: string }>(
      'SELECT download_status FROM notification_attachments WHERE id = ?',
      [id]
    )?.download_status;
  }

  function resourceLocalPath(id: number): string | null {
    return (
      db.executeReadOne<{ local_path: string | null }>(
        'SELECT local_path FROM resources WHERE id = ?',
        [id]
      )?.local_path ?? null
    );
  }

  // --- attachment:download --------------------------------------------------

  /** Seed a resource with an explicit type (for type-filter tests). */
  function seedResourceOfType(opts: {
    id: number;
    externalId: string;
    type: string;
    localPath?: string | null;
    url?: string | null;
  }): void {
    db.executeWrite(
      `INSERT INTO resources (id, external_id, course_id, type, title, url, local_path, folder_path)
       VALUES (?, ?, 1, ?, ?, ?, ?, 'Wk1')`,
      [
        opts.id,
        opts.externalId,
        opts.type,
        `title-${opts.id}`,
        opts.url ?? null,
        opts.localPath ?? null,
      ],
      'resources'
    );
  }

  describe('attachment:download', () => {
    test('attachment not found', async () => {
      expect(await invoke('attachment:download', 999)).toEqual({
        success: false,
        error: 'Attachment not found',
      });
    });

    test('no credentials', async () => {
      seedAttachment({ id: 10 });
      token = null;
      expect(await invoke('attachment:download', 10)).toEqual({
        success: false,
        error: 'No credentials available',
      });
    });

    test('success marks completed + local_path (markDownloaded)', async () => {
      seedAttachment({ id: 10 });
      downloadManager.queueDownload = (job) => {
        setImmediate(() =>
          downloadManager.emit('download-complete', {
            id: job.id,
            success: true,
            localPath: '/d/att.pdf',
          })
        );
      };
      register();
      const res = (await invoke('attachment:download', 10)) as { success: boolean };
      expect(res.success).toBe(true);
      expect(attachmentStatus(10)).toBe('completed');
    });

    test('failure marks failed (setStatus)', async () => {
      seedAttachment({ id: 10 });
      downloadManager.queueDownload = (job) => {
        setImmediate(() =>
          downloadManager.emit('download-error', {
            id: job.id,
            success: false,
            error: 'boom',
          })
        );
      };
      register();
      const res = (await invoke('attachment:download', 10)) as { success: boolean };
      expect(res.success).toBe(false);
      expect(attachmentStatus(10)).toBe('failed');
    });

    // --- dedup-reuse guard (cases a–e) ---

    // (a) Reuse: matching type='file' resource with a real on-disk file →
    //     markDownloaded, return success, queueDownload NOT called.
    test('(a) reuse: existing downloaded resource → skips network fetch', async () => {
      const realPath = writeFile('real.pdf');
      seedAttachment({ id: 10 });
      // externalId must match attachment's external_id = 'att-10'
      seedResource({ id: 50, externalId: 'att-10', localPath: realPath });

      let queueCalled = false;
      downloadManager.queueDownload = () => {
        queueCalled = true;
      };
      register();

      const res = (await invoke('attachment:download', 10)) as {
        success: boolean;
        localPath?: string;
      };

      expect(res).toEqual({ success: true, localPath: realPath });
      expect(attachmentStatus(10)).toBe('completed');
      // attachment's local_path must point at the resource file
      const row = db.executeReadOne<{ local_path: string | null }>(
        'SELECT local_path FROM notification_attachments WHERE id = 10',
        []
      );
      expect(row?.local_path).toBe(realPath);
      expect(queueCalled).toBe(false);
    });

    // (b) No match → normal download: regression guard ensuring existing
    //     behavior is preserved when no resource shares the external_id.
    test('(b) no match → queueDownload IS called (regression guard)', async () => {
      seedAttachment({ id: 10 });
      // resource has a DIFFERENT externalId → no match
      seedResource({
        id: 51,
        externalId: 'other-ext',
        localPath: writeFile('other.pdf'),
      });

      let queueCalled = false;
      downloadManager.queueDownload = (job) => {
        queueCalled = true;
        setImmediate(() =>
          downloadManager.emit('download-complete', {
            id: job.id,
            success: true,
            localPath: '/d/att.pdf',
          })
        );
      };
      register();

      const res = (await invoke('attachment:download', 10)) as { success: boolean };
      expect(res.success).toBe(true);
      expect(queueCalled).toBe(true);
    });

    // (c) Stale file → falls through: resource row exists but local_path
    //     does NOT exist on disk → existsSync returns false → queueDownload called.
    test('(c) stale file → falls through to normal download', async () => {
      seedAttachment({ id: 10 });
      const stalePath = nodePath.join(tmpDir, 'gone-file.pdf'); // never written to disk
      seedResource({ id: 52, externalId: 'att-10', localPath: stalePath });

      let queueCalled = false;
      downloadManager.queueDownload = (job) => {
        queueCalled = true;
        setImmediate(() =>
          downloadManager.emit('download-complete', {
            id: job.id,
            success: true,
            localPath: '/d/att.pdf',
          })
        );
      };
      register();

      await invoke('attachment:download', 10);
      expect(queueCalled).toBe(true);
    });

    // (d) URL-shaped local_path → falls through: resource local_path is an
    //     https:// URL → guard rejects it → queueDownload called.
    test('(d) URL-shaped local_path → falls through to normal download', async () => {
      seedAttachment({ id: 10 });
      seedResource({
        id: 53,
        externalId: 'att-10',
        localPath: 'https://canvas.example.com/files/123/download',
      });

      let queueCalled = false;
      downloadManager.queueDownload = (job) => {
        queueCalled = true;
        setImmediate(() =>
          downloadManager.emit('download-complete', {
            id: job.id,
            success: true,
            localPath: '/d/att.pdf',
          })
        );
      };
      register();

      await invoke('attachment:download', 10);
      expect(queueCalled).toBe(true);
    });

    // (e) Page resource ignored: type='page' resource shares the external_id
    //     but the guard's type='file' predicate in the reader excludes it.
    test('(e) page resource with same external_id → not reused, queueDownload called', async () => {
      seedAttachment({ id: 10 });
      const realPath = writeFile('page.html');
      // type='page', same externalId as the attachment → must NOT be reused
      seedResourceOfType({
        id: 54,
        externalId: 'att-10',
        type: 'page',
        localPath: realPath,
      });

      let queueCalled = false;
      downloadManager.queueDownload = (job) => {
        queueCalled = true;
        setImmediate(() =>
          downloadManager.emit('download-complete', {
            id: job.id,
            success: true,
            localPath: '/d/att.pdf',
          })
        );
      };
      register();

      await invoke('attachment:download', 10);
      expect(queueCalled).toBe(true);
    });
  });

  // --- attachment:open / showInFolder ---------------------------------------

  describe('attachment:open / showInFolder', () => {
    test('open: not downloaded', async () => {
      seedAttachment({ id: 10, localPath: null });
      expect(await invoke('attachment:open', 10)).toEqual({
        success: false,
        error: 'File not downloaded',
      });
    });

    test('open: file exists → opens', async () => {
      const p = writeFile('att.pdf');
      seedAttachment({ id: 10, localPath: p });
      expect(await invoke('attachment:open', 10)).toEqual({ success: true });
      expect(mockShell.openPath).toHaveBeenCalledWith(p);
    });

    test('showInFolder: reveals the file', async () => {
      const p = writeFile('att.pdf');
      seedAttachment({ id: 10, localPath: p });
      expect(await invoke('attachment:showInFolder', 10)).toEqual({ success: true });
      expect(mockShell.showItemInFolder).toHaveBeenCalledWith(p);
    });
  });

  // --- files:clearSync ------------------------------------------------------

  test('files:clearSync wipes resources + attachments', async () => {
    seedResource({ id: 20, externalId: 'r1' });
    seedAttachment({ id: 10 });
    expect(await invoke('files:clearSync')).toEqual({ success: true });
    expect(db.executeReadOne('SELECT 1 FROM resources')).toBeUndefined();
    expect(db.executeReadOne('SELECT 1 FROM notification_attachments')).toBeUndefined();
  });

  // --- resource:showInFolder variants ---------------------------------------

  describe('resource:showInFolder', () => {
    test('missing on disk → clears local_path', async () => {
      seedResource({
        id: 20,
        externalId: 'r1',
        localPath: nodePath.join(tmpDir, 'gone'),
      });
      const res = (await invoke('resource:showInFolder', 20)) as { success: boolean };
      expect(res.success).toBe(false);
      expect(resourceLocalPath(20)).toBeNull();
    });

    test('exists → reveals', async () => {
      const p = writeFile('r.pdf');
      seedResource({ id: 20, externalId: 'r1', localPath: p });
      expect(await invoke('resource:showInFolder', 20)).toEqual({ success: true });
      expect(mockShell.showItemInFolder).toHaveBeenCalledWith(p);
    });

    test('byExternalId missing on disk → clears local_path', async () => {
      seedResource({
        id: 21,
        externalId: 'r2',
        localPath: nodePath.join(tmpDir, 'gone'),
      });
      const res = (await invoke('resource:showInFolderByExternalId', 'r2')) as {
        success: boolean;
      };
      expect(res.success).toBe(false);
      expect(resourceLocalPath(21)).toBeNull();
    });
  });

  // --- resource:deleteLocal -------------------------------------------------

  test('resource:deleteLocal removes the file and clears local_path', async () => {
    const p = writeFile('del.pdf');
    seedResource({ id: 22, externalId: 'r3', localPath: p });
    expect(await invoke('resource:deleteLocal', 22)).toEqual({ success: true });
    expect(fs.existsSync(p)).toBe(false);
    expect(resourceLocalPath(22)).toBeNull();
  });

  // --- canvas-file:open -----------------------------------------------------

  describe('canvas-file:open', () => {
    test('not found in database', async () => {
      expect(await invoke('canvas-file:open', 'nope')).toEqual({
        success: false,
        error: 'File not found in database',
      });
    });

    test('already downloaded → opens existing', async () => {
      const p = writeFile('cf.pdf');
      seedResource({ id: 30, externalId: 'cf-1', localPath: p });
      const res = (await invoke('canvas-file:open', 'cf-1')) as {
        success: boolean;
        localPath?: string;
      };
      expect(res).toEqual({ success: true, localPath: p });
    });

    test('not downloaded → downloads then opens (setLocalPath)', async () => {
      seedResource({ id: 31, externalId: 'cf-2', url: 'https://x/cf', localPath: null });
      downloadManager.queueDownload = (job) => {
        const p = writeFile('cf2.pdf');
        setImmediate(() =>
          downloadManager.emit('download-complete', { id: job.id, localPath: p })
        );
      };
      register();
      const res = (await invoke('canvas-file:open', 'cf-2')) as { success: boolean };
      expect(res.success).toBe(true);
      expect(resourceLocalPath(31)).toBeTruthy();
    });

    test('not downloaded + no url → error', async () => {
      seedResource({ id: 32, externalId: 'cf-3', url: null, localPath: null });
      expect(await invoke('canvas-file:open', 'cf-3')).toEqual({
        success: false,
        error: 'Resource has no download URL',
      });
    });
  });
});

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = mockIpc.__getHandler(channel);
  if (!handler) throw new Error(`No handler registered for ${channel}`);
  return Promise.resolve(handler({} as unknown, ...args));
}
