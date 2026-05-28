/**
 * notificationDataHandlers — IPC handler behavior tests (ADR-0007 PR-E).
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
import { registerNotificationDataHandlers } from '../../src/lifecycle/ipc-handlers/notificationDataHandlers';
import type { IpcContext } from '../../src/lifecycle/ipc-handlers/IpcContext';

interface IpcMainMock {
  __getHandler: (channel: string) => ((...args: unknown[]) => unknown) | undefined;
  __reset: () => void;
}

const mockIpc = ipcMain as unknown as IpcMainMock;

describe('notificationDataHandlers (ADR-0007 PR-E)', () => {
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

    registerNotificationDataHandlers(buildCtx(db, oracle));
  });

  afterEach(() => {
    oracle.stop();
    db.close();
  });

  describe('data:getNotifications', () => {
    test('returns notifications from visible courses plus system notifications', async () => {
      seedNotification(db, { courseId: 1, title: 'cs' });
      seedNotification(db, { courseId: 2, title: 'mat' });
      seedNotification(db, { courseId: null, title: 'system' });

      const rows = (await invoke('data:getNotifications')) as Array<{
        title: string;
      }>;

      expect(rows.map((r) => r.title).sort()).toEqual(['cs', 'mat', 'system']);
    });

    test('excludes notifications from hidden courses (but keeps system)', async () => {
      db.executeWrite(`UPDATE courses SET is_hidden = 1 WHERE id = 2`, [], 'courses');
      seedNotification(db, { courseId: 1, title: 'cs' });
      seedNotification(db, { courseId: 2, title: 'hidden' });
      seedNotification(db, { courseId: null, title: 'system' });

      const rows = (await invoke('data:getNotifications')) as Array<{
        title: string;
      }>;

      expect(rows.map((r) => r.title).sort()).toEqual(['cs', 'system']);
    });

    test('filters by explicit courseIds and intersects with visible', async () => {
      seedNotification(db, { courseId: 1, title: 'cs' });
      seedNotification(db, { courseId: 2, title: 'mat' });
      seedNotification(db, { courseId: null, title: 'system' });

      const rows = (await invoke('data:getNotifications', {
        courseIds: [1],
      })) as Array<{ title: string }>;

      expect(rows.map((r) => r.title).sort()).toEqual(['cs', 'system']);
    });

    test('returns only system notifications when no visible courses', async () => {
      db.executeWrite(`UPDATE courses SET is_hidden = 1`, [], 'courses');
      seedNotification(db, { courseId: 1, title: 'hidden-cs' });
      seedNotification(db, { courseId: null, title: 'system' });

      const rows = (await invoke('data:getNotifications')) as Array<{
        title: string;
      }>;

      expect(rows.map((r) => r.title)).toEqual(['system']);
    });

    test('orders by published_at DESC (newest first)', async () => {
      seedNotification(db, {
        courseId: 1,
        title: 'old',
        publishedAt: '2026-01-01T00:00:00Z',
      });
      seedNotification(db, {
        courseId: 1,
        title: 'new',
        publishedAt: '2026-05-01T00:00:00Z',
      });

      const rows = (await invoke('data:getNotifications')) as Array<{
        title: string;
      }>;

      expect(rows.map((r) => r.title)).toEqual(['new', 'old']);
    });
  });

  describe('data:getNotification', () => {
    test('returns notification by id with camelCase fields', async () => {
      const id = seedNotification(db, { courseId: 1, title: 'one' });

      const row = (await invoke('data:getNotification', id)) as {
        id: number;
        title: string;
        sourceType: string;
        publishedAt: string;
      };

      expect(row.id).toBe(id);
      expect(row.title).toBe('one');
      expect(row.sourceType).toBeDefined();
    });

    test('returns null when id does not exist', async () => {
      expect(await invoke('data:getNotification', 99999)).toBeNull();
    });

    test('bypasses visibility — returns notifications from hidden courses', async () => {
      db.executeWrite(`UPDATE courses SET is_hidden = 1 WHERE id = 1`, [], 'courses');
      const id = seedNotification(db, { courseId: 1, title: 'hidden-course-notif' });

      const row = (await invoke('data:getNotification', id)) as { title: string };
      expect(row.title).toBe('hidden-course-notif');
    });
  });

  describe('data:getCourseNotifications', () => {
    test('returns notifications for one course, newest first', async () => {
      seedNotification(db, {
        courseId: 1,
        title: 'old',
        publishedAt: '2026-01-01T00:00:00Z',
      });
      seedNotification(db, {
        courseId: 1,
        title: 'new',
        publishedAt: '2026-05-01T00:00:00Z',
      });

      const rows = (await invoke('data:getCourseNotifications', 1)) as Array<{
        title: string;
      }>;

      expect(rows.map((r) => r.title)).toEqual(['new', 'old']);
    });

    test('does not return system notifications', async () => {
      seedNotification(db, { courseId: null, title: 'system' });
      seedNotification(db, { courseId: 1, title: 'cs' });

      const rows = (await invoke('data:getCourseNotifications', 1)) as Array<{
        title: string;
      }>;

      expect(rows.map((r) => r.title)).toEqual(['cs']);
    });

    test('bypasses visibility — returns hidden-course notifications', async () => {
      db.executeWrite(`UPDATE courses SET is_hidden = 1 WHERE id = 1`, [], 'courses');
      seedNotification(db, { courseId: 1, title: 'cs-in-hidden' });

      const rows = (await invoke('data:getCourseNotifications', 1)) as Array<{
        title: string;
      }>;

      expect(rows.map((r) => r.title)).toEqual(['cs-in-hidden']);
    });

    test('returns empty array when course has no notifications', async () => {
      expect(await invoke('data:getCourseNotifications', 1)).toEqual([]);
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
    throw new Error(`IpcContext.${name} should not be called by notif handlers`);
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

let notifCounter = 1;

function seedNotification(
  db: Database,
  data: {
    courseId: number | null;
    title?: string;
    publishedAt?: string;
  }
): number {
  const sourceId = `notif_${notifCounter++}`;
  const result = db.executeWrite(
    `INSERT INTO notifications
       (source_type, source_id, course_id, title, message, published_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.courseId === null ? 'system' : 'canvas',
      sourceId,
      data.courseId,
      data.title ?? `Title ${sourceId}`,
      `Message ${sourceId}`,
      data.publishedAt ?? '2026-01-01T00:00:00Z',
    ]
  );
  return Number(result.lastInsertRowid);
}
