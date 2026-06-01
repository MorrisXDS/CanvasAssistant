/**
 * syncHandlers — IPC handler behavior tests (ADR-0007).
 *
 * Electron is mocked so the handler file loads in Node. Focuses on the
 * DB-touching channels: sync:folderByPath, sync:resolveConflict (the hardened
 * dynamic UPDATE), sync:resolveAllConflicts, sync:getLastSyncTime, and the
 * auto-sync preference get/set.
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
import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';
import { registerSyncHandlers } from '../../src/lifecycle/ipc-handlers/syncHandlers';
import type { IpcContext } from '../../src/lifecycle/ipc-handlers/IpcContext';

interface IpcMainMock {
  __getHandler: (channel: string) => ((...args: unknown[]) => unknown) | undefined;
  __reset: () => void;
}
const mockIpc = ipcMain as unknown as IpcMainMock;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any;

describe('syncHandlers (ADR-0007)', () => {
  let db: Database;
  let syncEngine: AnyObj;
  let autoSyncStarted: boolean;

  beforeEach(() => {
    mockIpc.__reset();
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    // Runtime-added sync_preferences columns (SyncConflictResolver.ensureTable).
    db.executeWrite(
      'ALTER TABLE sync_preferences ADD COLUMN prefer_canvas INTEGER NOT NULL DEFAULT 1',
      []
    );
    db.executeWrite(
      'ALTER TABLE sync_preferences ADD COLUMN expires_at TEXT DEFAULT NULL',
      []
    );

    db.executeWrite(
      `INSERT INTO courses (id, external_id, code, name) VALUES (1, '4242', 'CS101', 'Intro')`,
      [],
      'courses'
    );
    db.executeWrite(
      `INSERT INTO sync_sessions (id, started_at, created_at) VALUES ('s1', '2026-01-01', '2026-01-01')`,
      [],
      'sync_sessions'
    );

    syncEngine = null;
    autoSyncStarted = false;
    register();
  });

  afterEach(() => db.close());

  function register(): void {
    mockIpc.__reset();
    registerSyncHandlers(buildCtx());
  }

  function buildCtx(): IpcContext {
    const unused = (name: string) => () => {
      throw new Error(`IpcContext.${name} should not be called by sync handlers`);
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
      getSystemMonitor: () =>
        ({ getState: () => ({ canSync: true }) }) as unknown as ReturnType<
          IpcContext['getSystemMonitor']
        >,
      getSyncEngine: (() => syncEngine) as unknown as IpcContext['getSyncEngine'],
      getMainWindow: () => null,
      getSyncPreferences: (() => ({})) as unknown as IpcContext['getSyncPreferences'],
      startAutoSync: (() => {
        autoSyncStarted = true;
      }) as unknown as IpcContext['startAutoSync'],
      stopAutoSync: (() => {
        autoSyncStarted = false;
      }) as unknown as IpcContext['stopAutoSync'],
      getMetricsCollector: unused(
        'getMetricsCollector'
      ) as IpcContext['getMetricsCollector'],
      getCredentialManager: unused(
        'getCredentialManager'
      ) as IpcContext['getCredentialManager'],
      getFileDownloadManager: unused(
        'getFileDownloadManager'
      ) as IpcContext['getFileDownloadManager'],
      getVisibilityOracle: unused(
        'getVisibilityOracle'
      ) as IpcContext['getVisibilityOracle'],
      getFileEntityProvider: () => null,
      getCanvasClient: unused(
        'getCanvasClient'
      ) as unknown as IpcContext['getCanvasClient'],
      getLocalHtmlPathsSettings: unused(
        'getLocalHtmlPathsSettings'
      ) as IpcContext['getLocalHtmlPathsSettings'],
      getFilesDir: unused('getFilesDir') as IpcContext['getFilesDir'],
      getHealthCheck: unused('getHealthCheck') as IpcContext['getHealthCheck'],
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
    } as unknown as IpcContext;
  }

  function seedConflict(opts: {
    id: number;
    externalId: string;
    entityId: number;
    field: string;
    canvasJson: string;
  }): void {
    db.executeWrite(
      `INSERT INTO sync_updates
         (id, sync_session_id, course_id, entity_type, entity_id, change_type, conflict_field, old_value, new_value, external_id, title, resolved_at)
       VALUES (?, 's1', 1, 'conflict', ?, 'conflict', ?, '"old"', ?, ?, 'C', NULL)`,
      [opts.id, opts.entityId, opts.field, opts.canvasJson, opts.externalId],
      'sync_updates'
    );
  }

  // --- sync:getLastSyncTime / auto-sync prefs -------------------------------

  test('sync:getLastSyncTime returns the max cursor', async () => {
    db.executeWrite(
      `INSERT INTO sync_metadata (endpoint, last_synced_at) VALUES ('/a', '2026-05-01')`,
      [],
      'sync_metadata'
    );
    expect(await invoke('sync:getLastSyncTime')).toBe('2026-05-01');
  });

  test('sync:getAutoSyncPreferences reads stored prefs (or defaults)', async () => {
    expect(await invoke('sync:getAutoSyncPreferences')).toMatchObject({
      autoSyncEnabled: true,
    });
    db.executeWrite(
      `INSERT INTO user_preferences (key, value) VALUES ('syncPreferences', ?)`,
      [JSON.stringify({ autoSyncEnabled: false, autoSyncInterval: 30 })],
      'user_preferences'
    );
    expect(await invoke('sync:getAutoSyncPreferences')).toMatchObject({
      autoSyncEnabled: false,
      autoSyncInterval: 30,
    });
  });

  test('sync:setAutoSyncPreferences writes prefs + toggles auto-sync', async () => {
    const res = (await invoke('sync:setAutoSyncPreferences', {
      autoSyncEnabled: true,
      autoSyncInterval: 20,
    })) as { success: boolean };
    expect(res.success).toBe(true);
    expect(autoSyncStarted).toBe(true);
    const row = db.executeReadOne<{ value: string }>(
      "SELECT value FROM user_preferences WHERE key = 'syncPreferences'"
    );
    expect(JSON.parse(row!.value).autoSyncInterval).toBe(20);
  });

  // --- sync:folderByPath ----------------------------------------------------

  describe('sync:folderByPath', () => {
    test('folder not in DB → success with 0 count', async () => {
      syncEngine = { syncFolderFiles: jest.fn() };
      register();
      const res = (await invoke('sync:folderByPath', {
        courseId: 1,
        folderPath: 'Nope',
      })) as AnyObj;
      expect(res.data.count).toBe(0);
      expect(syncEngine.syncFolderFiles).not.toHaveBeenCalled();
    });

    test('folder found → resolves Canvas id + delegates to syncEngine', async () => {
      db.executeWrite(
        `INSERT INTO resources (id, external_id, course_id, type, title, folder_path)
         VALUES (10, '77', 1, 'folder', 'Wk1', 'Week 1')`,
        [],
        'resources'
      );
      syncEngine = {
        syncFolderFiles: jest
          .fn()
          .mockResolvedValue({ success: true, count: 3, errors: [] }),
      };
      register();
      const res = (await invoke('sync:folderByPath', {
        courseId: 1,
        folderPath: 'Week 1',
      })) as AnyObj;
      expect(res.success).toBe(true);
      expect(syncEngine.syncFolderFiles).toHaveBeenCalledWith(77, 1);
    });
  });

  // --- sync:resolveConflict -------------------------------------------------

  describe('sync:resolveConflict', () => {
    test('conflict not in DB → error', async () => {
      const res = (await invoke('sync:resolveConflict', {
        conflictId: 'missing',
        useCanvasValue: true,
        rememberChoice: false,
        rememberForAll: false,
      })) as AnyObj;
      expect(res).toEqual({ success: false, error: 'Conflict not found in database' });
    });

    test('task conflict → applies Canvas value + marks resolved (syncEngine null)', async () => {
      db.executeWrite(
        `INSERT INTO tasks (id, external_id, course_id, title) VALUES (100, 't1', 1, 'Local Title')`,
        [],
        'tasks'
      );
      seedConflict({
        id: 1,
        externalId: 'cf-1',
        entityId: 100,
        field: 'title',
        canvasJson: '"Canvas Title"',
      });
      const res = (await invoke('sync:resolveConflict', {
        conflictId: 'cf-1',
        useCanvasValue: true,
        rememberChoice: false,
        rememberForAll: false,
      })) as AnyObj;
      expect(res).toEqual({ success: true });
      expect(
        db.executeReadOne<{ title: string }>('SELECT title FROM tasks WHERE id = 100')
          ?.title
      ).toBe('Canvas Title');
      expect(
        db.executeReadOne<{ resolved_at: string | null }>(
          'SELECT resolved_at FROM sync_updates WHERE id = 1'
        )?.resolved_at
      ).not.toBeNull();
    });

    test('course conflict → entity-type falls through to course branch', async () => {
      // entity_id 1 is a course (no task with id 1) → courseReader.getById path
      seedConflict({
        id: 1,
        externalId: 'cf-2',
        entityId: 1,
        field: 'name',
        canvasJson: '"Canvas Course"',
      });
      const res = (await invoke('sync:resolveConflict', {
        conflictId: 'cf-2',
        useCanvasValue: true,
        rememberChoice: false,
        rememberForAll: false,
      })) as AnyObj;
      expect(res).toEqual({ success: true });
      expect(
        db.executeReadOne<{ name: string }>('SELECT name FROM courses WHERE id = 1')?.name
      ).toBe('Canvas Course');
    });

    test('rememberChoice persists a preference when resolver throws', async () => {
      db.executeWrite(
        `INSERT INTO tasks (id, external_id, course_id, title) VALUES (100, 't1', 1, 'Local')`,
        [],
        'tasks'
      );
      seedConflict({
        id: 1,
        externalId: 'cf-3',
        entityId: 100,
        field: 'title',
        canvasJson: '"Canvas"',
      });
      // syncEngine present, but resolveConflict throws → manual preference save path
      syncEngine = {
        getConflictResolver: () => ({
          getPendingConflicts: () => [],
          resolveConflict: () => {
            throw new Error('not in memory');
          },
          clearFieldModified: jest.fn(),
        }),
      };
      register();
      const res = (await invoke('sync:resolveConflict', {
        conflictId: 'cf-3',
        useCanvasValue: true,
        rememberChoice: true,
        rememberForAll: false,
      })) as AnyObj;
      expect(res).toEqual({ success: true });
      const pref = db.executeReadOne<{ prefer_canvas: number }>(
        `SELECT prefer_canvas FROM sync_preferences WHERE entity = 'task' AND entity_id = 100 AND field = 'title'`
      );
      expect(pref?.prefer_canvas).toBe(1);
    });
  });

  // --- sync:resolveAllConflicts ---------------------------------------------

  test('sync:resolveAllConflicts applies each + marks resolved (transaction)', async () => {
    db.executeWrite(
      `INSERT INTO tasks (id, external_id, course_id, title) VALUES (100, 't1', 1, 'Local')`,
      [],
      'tasks'
    );
    seedConflict({
      id: 1,
      externalId: 'cf-1',
      entityId: 100,
      field: 'title',
      canvasJson: '"Canvas"',
    });
    syncEngine = {
      getConflictResolver: () => ({
        getPendingConflicts: () => [{ entity: 'task', entityId: 100, field: 'title' }],
        resolveAllConflicts: () => [{ field: 'title', value: 'Canvas' }],
        clearFieldModified: jest.fn(),
      }),
    };
    register();
    const res = (await invoke('sync:resolveAllConflicts', true)) as { success: boolean };
    expect(res.success).toBe(true);
    expect(
      db.executeReadOne<{ title: string }>('SELECT title FROM tasks WHERE id = 100')
        ?.title
    ).toBe('Canvas');
    expect(
      db.executeReadOne<{ conflict_resolution: string | null }>(
        'SELECT conflict_resolution FROM sync_updates WHERE id = 1'
      )?.conflict_resolution
    ).toBe('canvas');
  });
});

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = mockIpc.__getHandler(channel);
  if (!handler) throw new Error(`No handler registered for ${channel}`);
  return Promise.resolve(handler({} as unknown, ...args));
}
