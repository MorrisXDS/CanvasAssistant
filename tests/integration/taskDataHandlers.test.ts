/**
 * taskDataHandlers — IPC handler behavior tests (ADR-0007/0008 PR-D).
 *
 * Covers the read-side handlers migrated to TaskReader / CanvasTaskQueueReader
 * plus the debug handlers. Write handlers (acceptQueuedTask, rejectQueuedTask,
 * bulkAcceptQueuedTasks, mergeQueuedTask) are unchanged by PR-D and have
 * their own command-level tests under tests/l4-controller/.
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
import { VisibilityOracle } from '../../src/layers/l1-persistence/VisibilityOracle';
import { registerTaskDataHandlers } from '../../src/lifecycle/ipc-handlers/taskDataHandlers';
import type { IpcContext } from '../../src/lifecycle/ipc-handlers/IpcContext';

interface IpcMainMock {
  __getHandler: (channel: string) => ((...args: unknown[]) => unknown) | undefined;
  __reset: () => void;
}

const mockIpc = ipcMain as unknown as IpcMainMock;

describe('taskDataHandlers (ADR-0007/0008 PR-D)', () => {
  let db: Database;
  let oracle: VisibilityOracle;

  beforeEach(() => {
    mockIpc.__reset();
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();

    oracle = new VisibilityOracle(db);
    oracle.setTermSelection('all');

    seedCourse(db, 1, 'CS101');
    seedCourse(db, 2, 'MAT201');

    registerTaskDataHandlers(buildCtx(db, oracle));
  });

  afterEach(() => {
    oracle.stop();
    db.close();
  });

  // ============ data:getTasks ============

  describe('data:getTasks', () => {
    test('returns tasks from visible courses, sorted by priority_score DESC', async () => {
      seedTask(db, { courseId: 1, title: 'low', priorityScore: 1 });
      seedTask(db, { courseId: 1, title: 'high', priorityScore: 10 });

      const rows = (await invoke('data:getTasks')) as Array<{ title: string }>;

      expect(rows.map((r) => r.title)).toEqual(['high', 'low']);
    });

    test('excludes soft-deleted tasks', async () => {
      seedTask(db, { courseId: 1, title: 'live' });
      seedTask(db, { courseId: 1, title: 'dead', deletedAt: '2026-01-01' });

      const rows = (await invoke('data:getTasks')) as Array<{ title: string }>;

      expect(rows.map((r) => r.title)).toEqual(['live']);
    });

    test('excludes tasks in hidden courses', async () => {
      db.executeWrite(`UPDATE courses SET is_hidden = 1 WHERE id = 2`, [], 'courses');
      seedTask(db, { courseId: 1, title: 'in-visible' });
      seedTask(db, { courseId: 2, title: 'in-hidden' });

      const rows = (await invoke('data:getTasks')) as Array<{ title: string }>;

      expect(rows.map((r) => r.title)).toEqual(['in-visible']);
    });

    test('filters by explicit courseIds and intersects with visible', async () => {
      seedTask(db, { courseId: 1, title: 'cs' });
      seedTask(db, { courseId: 2, title: 'mat' });

      const rows = (await invoke('data:getTasks', { courseIds: [1] })) as Array<{
        title: string;
      }>;

      expect(rows.map((r) => r.title)).toEqual(['cs']);
    });

    test('legacy single-courseId form bypasses if course is hidden', async () => {
      db.executeWrite(`UPDATE courses SET is_hidden = 1 WHERE id = 1`, [], 'courses');
      seedTask(db, { courseId: 1, title: 'hidden-course-task' });

      expect(await invoke('data:getTasks', 1)).toEqual([]);
    });
  });

  // ============ data:getTasksForArchivedCourse ============

  describe('data:getTasksForArchivedCourse', () => {
    test('returns tasks for an archived course including soft-deleted', async () => {
      db.executeWrite(
        `UPDATE courses SET archived_at = '2026-01-01' WHERE id = 1`,
        [],
        'courses'
      );
      seedTask(db, { courseId: 1, title: 'live', priorityScore: 5 });
      seedTask(db, {
        courseId: 1,
        title: 'dead',
        priorityScore: 1,
        deletedAt: '2026-01-01',
      });

      const rows = (await invoke('data:getTasksForArchivedCourse', 1)) as Array<{
        title: string;
      }>;

      expect(rows.map((r) => r.title)).toEqual(['live', 'dead']);
    });

    test('returns [] when course is not archived', async () => {
      seedTask(db, { courseId: 1, title: 't' });
      expect(await invoke('data:getTasksForArchivedCourse', 1)).toEqual([]);
    });
  });

  // ============ data:getTaskQueue ============

  describe('data:getTaskQueue', () => {
    test('defaults to pending; sorted by due_at then first_seen_at', async () => {
      seedQueue(db, {
        courseId: 1,
        externalId: 'late',
        dueAt: '2026-12-01T00:00:00Z',
      });
      seedQueue(db, {
        courseId: 1,
        externalId: 'soon',
        dueAt: '2026-06-01T00:00:00Z',
      });
      seedQueue(db, {
        courseId: 1,
        externalId: 'rejected',
        status: 'rejected',
      });

      const rows = (await invoke('data:getTaskQueue')) as Array<{
        externalId: string;
      }>;

      expect(rows.map((r) => r.externalId).filter(Boolean)).not.toContain('rejected');
    });

    test('filters by explicit status', async () => {
      seedQueue(db, { courseId: 1, externalId: 'p', status: 'pending' });
      seedQueue(db, { courseId: 1, externalId: 'r', status: 'rejected' });

      const rows = (await invoke('data:getTaskQueue', { status: 'rejected' })) as Array<{
        externalId: string;
      }>;

      expect(rows.map((r) => r.externalId)).toEqual(['r']);
    });

    test('excludes hidden courses', async () => {
      db.executeWrite(`UPDATE courses SET is_hidden = 1 WHERE id = 2`, [], 'courses');
      seedQueue(db, { courseId: 1, externalId: 'visible' });
      seedQueue(db, { courseId: 2, externalId: 'hidden' });

      const rows = (await invoke('data:getTaskQueue')) as Array<{ externalId: string }>;

      expect(rows.map((r) => r.externalId)).toEqual(['visible']);
    });
  });

  // ============ data:getTaskQueueCount ============

  describe('data:getTaskQueueCount', () => {
    test('counts pending across visible courses', async () => {
      seedQueue(db, { courseId: 1, externalId: 'a', status: 'pending' });
      seedQueue(db, { courseId: 1, externalId: 'b', status: 'rejected' });
      seedQueue(db, { courseId: 2, externalId: 'c', status: 'pending' });

      expect(await invoke('data:getTaskQueueCount')).toBe(2);
    });

    test('scopes to one course when courseId provided', async () => {
      seedQueue(db, { courseId: 1, externalId: 'a' });
      seedQueue(db, { courseId: 2, externalId: 'b' });

      expect(await invoke('data:getTaskQueueCount', { courseId: 1 })).toBe(1);
    });

    test('returns 0 when targeting a hidden course', async () => {
      db.executeWrite(`UPDATE courses SET is_hidden = 1 WHERE id = 1`, [], 'courses');
      seedQueue(db, { courseId: 1, externalId: 'a' });

      expect(await invoke('data:getTaskQueueCount', { courseId: 1 })).toBe(0);
    });
  });

  // ============ data:getTaskQueueForCourse ============

  describe('data:getTaskQueueForCourse', () => {
    test('returns pending for one visible course', async () => {
      seedQueue(db, { courseId: 1, externalId: 'p', status: 'pending' });
      seedQueue(db, { courseId: 1, externalId: 'r', status: 'rejected' });

      const rows = (await invoke('data:getTaskQueueForCourse', 1)) as Array<{
        externalId: string;
      }>;

      expect(rows.map((r) => r.externalId)).toEqual(['p']);
    });

    test('returns [] when course is hidden', async () => {
      db.executeWrite(`UPDATE courses SET is_hidden = 1 WHERE id = 1`, [], 'courses');
      seedQueue(db, { courseId: 1, externalId: 'p' });

      expect(await invoke('data:getTaskQueueForCourse', 1)).toEqual([]);
    });
  });

  // ============ data:checkQueueDuplicates ============

  describe('data:checkQueueDuplicates', () => {
    test('returns exact match when titles are case-insensitively equal', async () => {
      seedTask(db, {
        courseId: 1,
        title: 'Lab 1',
        sourceType: 'user',
        externalId: null,
      });

      const result = (await invoke('data:checkQueueDuplicates', [
        {
          queueId: 999,
          courseId: 1,
          title: 'lab 1',
          dueAt: null,
          taskType: null,
        },
      ])) as Array<{ queueId: number; match: { type: string } | null }>;

      expect(result[0].match?.type).toBe('exact');
    });

    test('excludes Canvas-sourced tasks from match candidates', async () => {
      seedTask(db, {
        courseId: 1,
        title: 'Lab 1',
        sourceType: 'canvas',
        externalId: 'canvas-123',
      });

      const result = (await invoke('data:checkQueueDuplicates', [
        {
          queueId: 999,
          courseId: 1,
          title: 'Lab 1',
          dueAt: null,
          taskType: null,
        },
      ])) as Array<{ match: unknown | null }>;

      expect(result[0].match).toBeNull();
    });

    test('returns null match when no candidates exist', async () => {
      const result = (await invoke('data:checkQueueDuplicates', [
        {
          queueId: 999,
          courseId: 1,
          title: 'New Task',
          dueAt: null,
          taskType: null,
        },
      ])) as Array<{ match: unknown | null }>;

      expect(result[0].match).toBeNull();
    });
  });

  // ============ debug handlers ============

  describe('debug:getCourseSettings', () => {
    test('returns all courses with autoAccept setting', async () => {
      db.executeWrite(
        `UPDATE courses SET auto_accept_canvas_tasks = 1 WHERE id = 1`,
        [],
        'courses'
      );

      const result = (await invoke('debug:getCourseSettings')) as Array<{
        id: number;
        autoAccept: number | null;
      }>;

      expect(result.find((c) => c.id === 1)?.autoAccept).toBe(1);
    });
  });

  describe('debug:forceDeleteTask', () => {
    test('hard-deletes a task by id', async () => {
      const id = seedTask(db, { courseId: 1, title: 'gone' });

      const result = (await invoke('debug:forceDeleteTask', id)) as {
        success: boolean;
        deleted?: { id: number; title: string };
      };

      expect(result.success).toBe(true);
      expect(result.deleted?.title).toBe('gone');

      const after = db.executeReadOne(`SELECT id FROM tasks WHERE id = ?`, [id]);
      expect(after).toBeUndefined();
    });

    test('returns Task not found when id does not exist', async () => {
      const result = (await invoke('debug:forceDeleteTask', 99999)) as {
        success: boolean;
        error?: string;
      };
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not found/i);
    });
  });

  describe('debug:getQueueState', () => {
    test('returns both queue entries and tasks (scoped or not)', async () => {
      seedQueue(db, { courseId: 1, externalId: 'q1' });
      seedTask(db, { courseId: 1, title: 't1' });

      const all = (await invoke('debug:getQueueState')) as {
        queueEntries: Array<{ externalId: string }>;
        tasks: Array<{ title: string }>;
      };

      expect(all.queueEntries.map((q) => q.externalId)).toContain('q1');
      expect(all.tasks.map((t) => t.title)).toContain('t1');
    });

    test('scopes to one course when courseId provided', async () => {
      seedTask(db, { courseId: 1, title: 'cs' });
      seedTask(db, { courseId: 2, title: 'mat' });

      const scoped = (await invoke('debug:getQueueState', 1)) as {
        tasks: Array<{ title: string }>;
      };

      expect(scoped.tasks.map((t) => t.title)).toEqual(['cs']);
    });
  });
});

// ============ Helpers ============

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = mockIpc.__getHandler(channel);
  if (!handler) throw new Error(`No handler registered for ${channel}`);
  return Promise.resolve(handler({} as unknown, ...args));
}

function buildCtx(database: Database, oracle: VisibilityOracle): IpcContext {
  const unused = (name: string) => () => {
    throw new Error(`IpcContext.${name} should not be called by task handlers`);
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
    getVisibilityOracle: () => oracle,
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

function seedCourse(db: Database, id: number, code: string): void {
  db.executeWrite(
    `INSERT INTO courses (id, external_id, code, name, is_hidden, target_grade)
     VALUES (?, ?, ?, ?, 0, 85)`,
    [id, `ext_${id}`, code, `Course ${code}`]
  );
}

let taskCounter = 1;

function seedTask(
  db: Database,
  data: {
    courseId: number;
    title?: string;
    sourceType?: 'canvas' | 'user';
    externalId?: string | null;
    priorityScore?: number;
    deletedAt?: string | null;
  }
): number {
  const externalId =
    data.externalId === null ? null : (data.externalId ?? `ext_task_${taskCounter++}`);
  const result = db.executeWrite(
    `INSERT INTO tasks (course_id, external_id, source_type, title, priority_score, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.courseId,
      externalId,
      data.sourceType ?? 'canvas',
      data.title ?? 'task',
      data.priorityScore ?? 0,
      data.deletedAt ?? null,
    ]
  );
  return Number(result.lastInsertRowid);
}

function seedQueue(
  db: Database,
  data: {
    courseId: number;
    externalId: string;
    status?: 'pending' | 'accepted' | 'rejected' | 'merged';
    firstSeenAt?: string;
    dueAt?: string | null;
  }
): void {
  db.executeWrite(
    `INSERT INTO canvas_task_queue (
       course_id, external_id, title, status, due_at, first_seen_at, last_synced_at, canvas_data
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.courseId,
      data.externalId,
      `Title ${data.externalId}`,
      data.status ?? 'pending',
      data.dueAt === undefined ? null : data.dueAt,
      data.firstSeenAt ?? '2026-01-01T00:00:00Z',
      data.firstSeenAt ?? '2026-01-01T00:00:00Z',
      JSON.stringify({ id: data.externalId, name: `Title ${data.externalId}` }),
    ]
  );
}
