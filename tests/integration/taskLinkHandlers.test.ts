/**
 * taskLinkHandlers — IPC handler behavior tests (ADR-0007).
 *
 * Exercises the migrated handlers end-to-end: reads route through
 * LinkSuggestionReader / TaskReader, writes through the L4 link commands.
 * Confirms the renderer-facing response shapes are unchanged.
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
import { registerTaskLinkHandlers } from '../../src/lifecycle/ipc-handlers/data/taskLinkHandlers';
import type { IpcContext } from '../../src/lifecycle/ipc-handlers/IpcContext';

interface IpcMainMock {
  __getHandler: (channel: string) => ((...args: unknown[]) => unknown) | undefined;
  __reset: () => void;
}

const mockIpc = ipcMain as unknown as IpcMainMock;

let extCounter = 1;

function seedCourse(db: Database, id: number, name: string): void {
  db.executeWrite(
    `INSERT INTO courses (id, external_id, code, name, is_hidden, target_grade)
     VALUES (?, ?, ?, ?, 0, 85)`,
    [id, `ext_${id}`, name, name]
  );
}

function seedTask(
  db: Database,
  opts: {
    courseId: number;
    title: string;
    sourceType?: 'canvas' | 'user';
    externalId?: string | null;
    linkedFrom?: string | null;
    dueAt?: string | null;
  }
): number {
  const externalId =
    opts.externalId === undefined ? `ext_${extCounter++}` : opts.externalId;
  const result = db.executeWrite(
    `INSERT INTO tasks (course_id, external_id, source_type, title, linked_from_user_task, due_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      opts.courseId,
      externalId,
      opts.sourceType ?? 'user',
      opts.title,
      opts.linkedFrom ?? null,
      opts.dueAt ?? null,
    ]
  );
  return Number(result.lastInsertRowid);
}

function seedSuggestion(db: Database, userTaskId: number, canvasTaskId: number): number {
  const result = db.executeWrite(
    `INSERT INTO link_suggestions (user_task_id, canvas_task_id, confidence, status, created_at)
     VALUES (?, ?, 0.85, 'pending', '2026-01-01T00:00:00.000Z')`,
    [userTaskId, canvasTaskId]
  );
  return Number(result.lastInsertRowid);
}

describe('taskLinkHandlers (ADR-0007)', () => {
  let db: Database;

  beforeEach(() => {
    mockIpc.__reset();
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    seedCourse(db, 1, 'CS101');
    registerTaskLinkHandlers(buildCtx(db));
  });

  afterEach(() => {
    db.close();
  });

  describe('data:getLinkSuggestions', () => {
    test('returns camelCase DTOs with task titles and course name', async () => {
      const u = seedTask(db, { courseId: 1, title: 'My Essay', sourceType: 'user' });
      const c = seedTask(db, { courseId: 1, title: 'Essay', sourceType: 'canvas' });
      seedSuggestion(db, u, c);

      const rows = (await invoke('data:getLinkSuggestions')) as Array<{
        userTaskTitle: string;
        canvasTaskTitle: string;
        courseName: string;
        courseId: number;
      }>;

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        userTaskTitle: 'My Essay',
        canvasTaskTitle: 'Essay',
        courseName: 'CS101',
        courseId: 1,
      });
    });
  });

  describe('data:acceptLinkSuggestion', () => {
    test('returns success + canvasTaskId at top level', async () => {
      const u = seedTask(db, {
        courseId: 1,
        title: 'mine',
        sourceType: 'user',
        externalId: 'user_ext_1',
      });
      const c = seedTask(db, { courseId: 1, title: 'canvas', sourceType: 'canvas' });
      const sid = seedSuggestion(db, u, c);

      const res = (await invoke('data:acceptLinkSuggestion', sid)) as {
        success: boolean;
        canvasTaskId: number;
      };

      expect(res.success).toBe(true);
      expect(res.canvasTaskId).toBe(c);
    });

    test('returns failure for a missing suggestion', async () => {
      const res = (await invoke('data:acceptLinkSuggestion', 9999)) as {
        success: boolean;
        error: string;
      };
      expect(res.success).toBe(false);
      expect(res.error).toContain('Suggestion not found');
    });
  });

  describe('data:rejectLinkSuggestion', () => {
    test('returns success', async () => {
      const u = seedTask(db, { courseId: 1, title: 'u', sourceType: 'user' });
      const c = seedTask(db, { courseId: 1, title: 'c', sourceType: 'canvas' });
      const sid = seedSuggestion(db, u, c);

      const res = (await invoke('data:rejectLinkSuggestion', sid)) as {
        success: boolean;
      };
      expect(res.success).toBe(true);
    });

    test('returns failure when the write fails', async () => {
      db.close();
      const res = (await invoke('data:rejectLinkSuggestion', 1)) as {
        success: boolean;
        error: string;
      };
      expect(res.success).toBe(false);
    });
  });

  describe('data:getPendingSuggestionCount', () => {
    test('returns the pending count', async () => {
      const u = seedTask(db, { courseId: 1, title: 'u', sourceType: 'user' });
      const c = seedTask(db, { courseId: 1, title: 'c', sourceType: 'canvas' });
      seedSuggestion(db, u, c);

      expect(await invoke('data:getPendingSuggestionCount')).toBe(1);
    });
  });

  describe('data:getCanvasTasksForLinking', () => {
    test('returns unlinked Canvas tasks as DTOs', async () => {
      seedTask(db, {
        courseId: 1,
        title: 'Available',
        sourceType: 'canvas',
        dueAt: '2026-02-01',
      });
      seedTask(db, {
        courseId: 1,
        title: 'Taken',
        sourceType: 'canvas',
        linkedFrom: 'someone',
      });

      const rows = (await invoke('data:getCanvasTasksForLinking', 1)) as Array<{
        title: string;
        dueAt: string | null;
      }>;

      expect(rows.map((r) => r.title)).toEqual(['Available']);
    });
  });

  describe('data:manuallyLinkTasks', () => {
    test('returns success + canvasTaskId', async () => {
      const u = seedTask(db, {
        courseId: 1,
        title: 'mine',
        sourceType: 'user',
        externalId: 'user_ext_2',
      });
      const c = seedTask(db, { courseId: 1, title: 'canvas', sourceType: 'canvas' });

      const res = (await invoke('data:manuallyLinkTasks', u, c)) as {
        success: boolean;
        canvasTaskId: number;
      };
      expect(res.success).toBe(true);
      expect(res.canvasTaskId).toBe(c);
    });

    test('returns failure when a task is missing', async () => {
      const res = (await invoke('data:manuallyLinkTasks', 1, 2)) as {
        success: boolean;
        error: string;
      };
      expect(res.success).toBe(false);
      expect(res.error).toContain('Task not found');
    });
  });

  describe('data:unlinkTasks', () => {
    test('returns success and clears the link', async () => {
      const c = seedTask(db, {
        courseId: 1,
        title: 'canvas',
        sourceType: 'canvas',
        linkedFrom: 'user_ext_3',
      });
      seedTask(db, {
        courseId: 1,
        title: 'mine',
        sourceType: 'user',
        externalId: 'user_ext_3',
      });
      // mark the user task merged so the unlink lookup finds it
      db.executeWrite(
        `UPDATE tasks SET deleted_at = '2026-01-01', merged_into_task_id = ? WHERE external_id = 'user_ext_3'`,
        [c]
      );

      const res = (await invoke('data:unlinkTasks', c)) as { success: boolean };
      expect(res.success).toBe(true);
    });

    test('returns failure when there is no link', async () => {
      const c = seedTask(db, { courseId: 1, title: 'canvas', sourceType: 'canvas' });
      const res = (await invoke('data:unlinkTasks', c)) as {
        success: boolean;
        error: string;
      };
      expect(res.success).toBe(false);
      expect(res.error).toContain('No link found');
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
    throw new Error(`IpcContext.${name} should not be called by taskLink handlers`);
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
    getVisibilityOracle: () => null,
    getFileEntityProvider: () => null,
    getCanvasClient: () => null,
    getMainWindow: unused('getMainWindow') as IpcContext['getMainWindow'],
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
