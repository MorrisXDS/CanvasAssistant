/**
 * syncUpdatesHandlers — IPC handler behavior tests (ADR-0007).
 *
 * Electron is mocked so the handler file (which imports `ipcMain`) loads in
 * the Node test environment. Exercises the visibility-gated reads, the seen /
 * conflict / cleanup write delegations, and the debug channels — including the
 * pre-existing `createTestData` schema bug (no `sync_sessions.status` column),
 * which is preserved verbatim and surfaces as a swallowed error.
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
import { registerSyncUpdatesHandlers } from '../../src/lifecycle/ipc-handlers/syncUpdatesHandlers';
import type { IpcContext } from '../../src/lifecycle/ipc-handlers/IpcContext';

interface IpcMainMock {
  __getHandler: (channel: string) => ((...args: unknown[]) => unknown) | undefined;
  __reset: () => void;
}
const mockIpc = ipcMain as unknown as IpcMainMock;

describe('syncUpdatesHandlers (ADR-0007)', () => {
  let db: Database;
  let visibleCourseIds: number[];

  beforeEach(() => {
    mockIpc.__reset();
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();

    db.executeWrite(
      `INSERT INTO courses (id, external_id, code, name, color) VALUES (1, '4242', 'CS101', 'Intro', '#abc')`,
      [],
      'courses'
    );
    db.executeWrite(
      `INSERT INTO sync_sessions (id, started_at, created_at) VALUES ('s1', '2026-01-01', '2026-01-01')`,
      [],
      'sync_sessions'
    );

    visibleCourseIds = [1];
    registerSyncUpdatesHandlers(buildCtx());
  });

  afterEach(() => {
    db.close();
  });

  function buildCtx(): IpcContext {
    const unused = (name: string) => () => {
      throw new Error(`IpcContext.${name} should not be called by syncUpdates handlers`);
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
      getVisibilityOracle: (() => ({
        getVisibleCourseIds: () => visibleCourseIds,
      })) as unknown as IpcContext['getVisibilityOracle'],
      getMainWindow: () => null,
      getMetricsCollector: unused(
        'getMetricsCollector'
      ) as IpcContext['getMetricsCollector'],
      getCredentialManager: unused(
        'getCredentialManager'
      ) as IpcContext['getCredentialManager'],
      getFileDownloadManager: unused(
        'getFileDownloadManager'
      ) as IpcContext['getFileDownloadManager'],
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

  function seedUpdate(opts: {
    id: number;
    entityType?: string;
    entityId?: number;
    changeType?: string;
    changedField?: string | null;
    conflictField?: string | null;
    title?: string;
    isActionRequired?: number;
    seenAt?: string | null;
    resolvedAt?: string | null;
  }): void {
    db.executeWrite(
      `INSERT INTO sync_updates
         (id, sync_session_id, course_id, entity_type, entity_id, change_type, changed_field,
          conflict_field, title, is_action_required, seen_at, resolved_at, created_at)
       VALUES (?, 's1', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, '2026-01-02')`,
      [
        opts.id,
        opts.entityType ?? 'task',
        opts.entityId ?? 100,
        opts.changeType ?? 'updated',
        opts.changedField ?? null,
        opts.conflictField ?? null,
        opts.title ?? `Update ${opts.id}`,
        opts.isActionRequired ?? 0,
        opts.seenAt ?? null,
        opts.resolvedAt ?? null,
      ],
      'sync_updates'
    );
  }

  test('registers all ten channels', () => {
    for (const ch of [
      'syncUpdates:getAll',
      'syncUpdates:getCount',
      'syncUpdates:markSeen',
      'syncUpdates:markAllSeen',
      'syncUpdates:markSeenByEntity',
      'syncUpdates:resolveConflict',
      'syncUpdates:cleanup',
      'syncUpdates:createTestData',
      'syncUpdates:clearTestData',
      'syncUpdates:getStatus',
    ]) {
      expect(mockIpc.__getHandler(ch)).toBeDefined();
    }
  });

  describe('getAll', () => {
    test('no visible courses → empty', async () => {
      visibleCourseIds = [];
      expect(await invoke('syncUpdates:getAll')).toEqual([]);
    });

    test('maps rows to camelCase DTOs', async () => {
      seedUpdate({ id: 1, entityType: 'task' });
      const rows = (await invoke('syncUpdates:getAll')) as Array<{
        id: number;
        courseCode: string;
        entityType: string;
      }>;
      expect(rows).toHaveLength(1);
      expect(rows[0].courseCode).toBe('CS101');
      expect(rows[0].entityType).toBe('task');
    });
  });

  describe('getCount', () => {
    test('no visible courses → zeroed', async () => {
      visibleCourseIds = [];
      expect(await invoke('syncUpdates:getCount')).toEqual({
        total: 0,
        conflicts: 0,
        informational: 0,
        byCourse: {},
        byType: {},
      });
    });

    test('aggregates totals', async () => {
      seedUpdate({ id: 1, entityType: 'task' });
      seedUpdate({ id: 2, entityType: 'conflict', changeType: 'conflict' });
      const res = (await invoke('syncUpdates:getCount')) as {
        total: number;
        conflicts: number;
        informational: number;
      };
      expect(res.informational).toBe(1);
      expect(res.conflicts).toBe(1);
      expect(res.total).toBe(2);
    });
  });

  describe('markSeen', () => {
    test('empty ids → marked 0, no error', async () => {
      expect(await invoke('syncUpdates:markSeen', { ids: [] })).toEqual({
        success: true,
        data: { marked: 0 },
      });
    });

    test('marks the given ids', async () => {
      seedUpdate({ id: 1 });
      seedUpdate({ id: 2 });
      expect(await invoke('syncUpdates:markSeen', { ids: [1, 2] })).toEqual({
        success: true,
        data: { marked: 2 },
      });
    });
  });

  describe('markAllSeen', () => {
    test('no visible courses → marked 0', async () => {
      visibleCourseIds = [];
      expect(await invoke('syncUpdates:markAllSeen', {})).toEqual({
        success: true,
        data: { marked: 0 },
      });
    });

    test('marks all unseen informational (excludes action-required)', async () => {
      seedUpdate({ id: 1 });
      seedUpdate({ id: 2, isActionRequired: 1 });
      expect(await invoke('syncUpdates:markAllSeen', {})).toEqual({
        success: true,
        data: { marked: 1 },
      });
    });
  });

  describe('markSeenByEntity', () => {
    test('marks updates for one entity', async () => {
      seedUpdate({ id: 1, entityId: 100 });
      seedUpdate({ id: 2, entityId: 100 });
      expect(
        await invoke('syncUpdates:markSeenByEntity', {
          entityType: 'task',
          entityId: 100,
        })
      ).toEqual({
        success: true,
        data: { marked: 2 },
      });
    });
  });

  describe('resolveConflict', () => {
    test('conflict not found → error', async () => {
      expect(
        await invoke('syncUpdates:resolveConflict', { updateId: 99, resolution: 'local' })
      ).toEqual({
        success: false,
        error: 'Conflict not found',
      });
    });

    test('resolves + persists preference', async () => {
      seedUpdate({
        id: 1,
        entityType: 'conflict',
        changeType: 'conflict',
        entityId: 100,
        conflictField: 'due_at',
      });
      const res = await invoke('syncUpdates:resolveConflict', {
        updateId: 1,
        resolution: 'local',
        rememberChoice: true,
      });
      expect(res).toEqual({ success: true });
      const pref = db.executeReadOne<{ prefer_local: number }>(
        `SELECT prefer_local FROM sync_preferences WHERE field = 'due_at'`
      );
      expect(pref?.prefer_local).toBe(1);
    });
  });

  describe('cleanup', () => {
    test('deletes old seen updates', async () => {
      seedUpdate({ id: 1, seenAt: '2020-01-01' });
      const res = (await invoke('syncUpdates:cleanup', { olderThanDays: 30 })) as {
        success: boolean;
        data: { deleted: number };
      };
      expect(res).toEqual({ success: true, data: { deleted: 1 } });
    });
  });

  describe('debug channels', () => {
    test('createTestData surfaces the pre-existing schema bug as a swallowed error', async () => {
      // No visible course guard passes (course 1 visible) and a task exists, so
      // the handler reaches createTestSession, whose INSERT names the missing
      // sync_sessions.status column → throws → caught → { success: false }.
      db.executeWrite(
        `INSERT INTO tasks (id, external_id, course_id, title) VALUES (200, 't1', 1, 'HW1')`,
        [],
        'tasks'
      );
      const res = (await invoke('syncUpdates:createTestData')) as { success: boolean };
      expect(res.success).toBe(false);
    });

    test('createTestData: no visible courses → error', async () => {
      visibleCourseIds = [];
      expect(await invoke('syncUpdates:createTestData')).toEqual({
        success: false,
        error: 'No visible courses found',
      });
    });

    test('createTestData: no tasks → error', async () => {
      // Visible course but no tasks seeded.
      expect(await invoke('syncUpdates:createTestData')).toEqual({
        success: false,
        error: 'No tasks found in visible courses',
      });
    });

    test('createTestData happy path (patched schema) inserts the test updates', async () => {
      // Give sync_sessions the `status` column the debug INSERT expects, and
      // drop FK enforcement (the session row inserts a NULL TEXT id). This
      // exercises the handler's test-update array build + insert loop.
      db.executeWrite('ALTER TABLE sync_sessions ADD COLUMN status TEXT', []);
      db.executeWrite('PRAGMA foreign_keys = OFF', []);
      db.executeWrite(
        `INSERT INTO tasks (id, external_id, course_id, title) VALUES (200, 't1', 1, 'HW1')`,
        [],
        'tasks'
      );
      db.executeWrite(
        `INSERT INTO resources (id, external_id, course_id, type, title) VALUES (300, 'r1', 1, 'file', 'notes.pdf')`,
        [],
        'resources'
      );

      const res = (await invoke('syncUpdates:createTestData')) as {
        success: boolean;
        data?: { created: number };
      };
      expect(res.success).toBe(true);
      expect(res.data?.created).toBe(4); // 3 task/grade updates + 1 file update
      const count = db.executeReadOne<{ c: number }>(
        "SELECT COUNT(*) as c FROM sync_updates WHERE title LIKE '[TEST]%'"
      );
      expect(count?.c).toBe(4);
    });

    test('clearTestData removes [TEST] rows', async () => {
      seedUpdate({ id: 1, title: '[TEST] x' });
      seedUpdate({ id: 2, title: 'real' });
      const res = (await invoke('syncUpdates:clearTestData')) as {
        success: boolean;
        data: { deleted: number };
      };
      expect(res).toEqual({ success: true, data: { deleted: 1 } });
    });

    test('getStatus returns totals', async () => {
      seedUpdate({ id: 1, changeType: 'updated' });
      seedUpdate({ id: 2, changeType: 'updated', seenAt: '2026-01-05' });
      const res = (await invoke('syncUpdates:getStatus')) as {
        success: boolean;
        data: { totalUnseen: number; byType: Array<{ change_type: string }> };
      };
      expect(res.success).toBe(true);
      expect(res.data.totalUnseen).toBe(1);
    });
  });
});

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = mockIpc.__getHandler(channel);
  if (!handler) throw new Error(`No handler registered for ${channel}`);
  return Promise.resolve(handler({} as unknown, ...args));
}
