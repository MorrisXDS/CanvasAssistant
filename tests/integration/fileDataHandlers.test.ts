/**
 * fileDataHandlers — IPC handler behavior tests (ADR-0008 PR-F.3).
 *
 * Covers the handlers migrated/added by PR-F.3:
 *   - data:getAttachments  (migrated from raw SQL to AnnouncementAttachmentReader)
 *   - data:getFileEntity                        (new; FileEntity by canvasId)
 *   - data:getFileEntitiesByCourse              (new; FileEntity[] for one course)
 *   - data:getFileEntitiesForVisibleCourses     (new; composes Oracle)
 *
 * Same mock-ipcMain / capture-by-channel pattern as
 * courseDataHandlers.test.ts (PR-B).
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
import { FileEntityProvider } from '../../src/layers/l1-persistence/FileEntityProvider';
import { CanvasFileReader } from '../../src/layers/l1-persistence/readers/CanvasFileReader';
import { AnnouncementAttachmentReader } from '../../src/layers/l1-persistence/readers/AnnouncementAttachmentReader';
import { registerFileDataHandlers } from '../../src/lifecycle/ipc-handlers/fileDataHandlers';
import type { IpcContext } from '../../src/lifecycle/ipc-handlers/IpcContext';
import type { FileEntity } from '../../src/shared/ipc-contract';
import type { ComponentLogger } from '../../src/layers/l0-utilities/Logger';

interface IpcMainMock {
  __getHandler: (channel: string) => ((...args: unknown[]) => unknown) | undefined;
  __reset: () => void;
}

const mockIpc = ipcMain as unknown as IpcMainMock;

describe('fileDataHandlers (ADR-0008 PR-F.3)', () => {
  let db: Database;
  let oracle: VisibilityOracle;
  let provider: FileEntityProvider;

  beforeEach(() => {
    mockIpc.__reset();
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const migrationRunner = new MigrationRunner(db);
    migrationRunner.loadMigrations(coreMigrations);
    migrationRunner.runAll();

    oracle = new VisibilityOracle(db);
    provider = new FileEntityProvider(
      new CanvasFileReader(db),
      new AnnouncementAttachmentReader(db),
      makeNoopLogger() as unknown as ComponentLogger
    );

    seedCourse(db, 1, 'CS101');
    seedCourse(db, 2, 'MAT201');

    registerFileDataHandlers(buildCtx(db, oracle, provider));
  });

  afterEach(() => {
    oracle.stop();
    db.close();
  });

  // ============ data:getAttachments ============

  describe('data:getAttachments', () => {
    test("returns the announcement's attachments as camelCase DTOs", async () => {
      const a1 = seedAnnouncement(db, 1);
      seedAttachment(db, {
        notifId: a1,
        courseId: 1,
        externalId: '111',
        filename: 'lab1.pdf',
      });

      const rows = (await invoke('data:getAttachments', a1)) as Array<{
        externalId: string;
        notificationId: number;
        filename: string;
      }>;

      expect(rows).toHaveLength(1);
      expect(rows[0].externalId).toBe('111');
      expect(rows[0].notificationId).toBe(a1);
      expect(rows[0].filename).toBe('lab1.pdf');
    });

    test('returns empty array when the announcement has no attachments', async () => {
      const a1 = seedAnnouncement(db, 1);
      expect(await invoke('data:getAttachments', a1)).toEqual([]);
    });
  });

  // ============ data:getFileEntity ============

  describe('data:getFileEntity', () => {
    test('returns FileEntity for a file-only blob', async () => {
      seedFile(db, { externalId: '111', courseId: 1, title: 'lab1.pdf' });

      const entity = (await invoke('data:getFileEntity', '111')) as FileEntity;

      expect(entity).not.toBeNull();
      expect(entity.canvasId).toBe('111');
      expect(entity.presences.canvasFile).not.toBeNull();
      expect(entity.presences.attachments).toEqual([]);
    });

    test('returns FileEntity for an attachment-only blob (no course file row)', async () => {
      const a1 = seedAnnouncement(db, 1);
      seedAttachment(db, {
        notifId: a1,
        courseId: 1,
        externalId: '222',
        filename: 'attached.pdf',
      });

      const entity = (await invoke('data:getFileEntity', '222')) as FileEntity;

      expect(entity.presences.canvasFile).toBeNull();
      expect(entity.presences.attachments).toHaveLength(1);
    });

    test('returns null when no presence exists in either source', async () => {
      expect(await invoke('data:getFileEntity', 'nope')).toBeNull();
    });

    test('bypasses visibility (ADR-0007 sub-decision alpha)', async () => {
      // Seed file in a HIDDEN course; single-id lookup should still return it.
      db.executeWrite(`UPDATE courses SET is_hidden = 1 WHERE id = ?`, [1], 'courses');
      seedFile(db, { externalId: '333', courseId: 1, title: 'still.pdf' });

      const entity = (await invoke('data:getFileEntity', '333')) as FileEntity;

      expect(entity).not.toBeNull();
      expect(entity.canvasId).toBe('333');
    });
  });

  // ============ data:getFileEntitiesByCourse ============

  describe('data:getFileEntitiesByCourse', () => {
    test('returns entities scoped to one course, sorted by displayName', async () => {
      seedFile(db, { externalId: '111', courseId: 1, title: 'cherry.pdf' });
      seedFile(db, { externalId: '222', courseId: 1, title: 'apple.pdf' });
      seedFile(db, { externalId: '333', courseId: 2, title: 'banana.pdf' });

      const entities = (await invoke('data:getFileEntitiesByCourse', 1)) as FileEntity[];

      expect(entities.map((e) => e.displayName)).toEqual(['apple.pdf', 'cherry.pdf']);
    });

    test('returns empty array for course with no files or attachments', async () => {
      expect(await invoke('data:getFileEntitiesByCourse', 1)).toEqual([]);
    });
  });

  // ============ data:getFileEntitiesForVisibleCourses ============

  describe('data:getFileEntitiesForVisibleCourses', () => {
    test('returns entities for every visible course', async () => {
      oracle.setTermSelection('all');
      seedFile(db, { externalId: '111', courseId: 1, title: 'a.pdf' });
      seedFile(db, { externalId: '222', courseId: 2, title: 'b.pdf' });

      const entities = (await invoke(
        'data:getFileEntitiesForVisibleCourses'
      )) as FileEntity[];

      expect(entities.map((e) => e.canvasId).sort()).toEqual(['111', '222']);
    });

    test('excludes files from archived courses', async () => {
      oracle.setTermSelection('all');
      seedFile(db, { externalId: '111', courseId: 1, title: 'visible.pdf' });
      seedFile(db, { externalId: '222', courseId: 2, title: 'archived.pdf' });
      db.executeWrite(
        `UPDATE courses SET archived_at = '2026-01-01' WHERE id = ?`,
        [2],
        'courses'
      );

      const entities = (await invoke(
        'data:getFileEntitiesForVisibleCourses'
      )) as FileEntity[];

      expect(entities.map((e) => e.canvasId)).toEqual(['111']);
    });

    test('excludes files from hidden courses', async () => {
      oracle.setTermSelection('all');
      seedFile(db, { externalId: '111', courseId: 1, title: 'visible.pdf' });
      seedFile(db, { externalId: '222', courseId: 2, title: 'hidden.pdf' });
      db.executeWrite(`UPDATE courses SET is_hidden = 1 WHERE id = ?`, [2], 'courses');

      const entities = (await invoke(
        'data:getFileEntitiesForVisibleCourses'
      )) as FileEntity[];

      expect(entities.map((e) => e.canvasId)).toEqual(['111']);
    });

    test('returns empty when there are no visible courses', async () => {
      oracle.setTermSelection('all');
      db.executeWrite(`UPDATE courses SET is_hidden = 1`, [], 'courses');

      expect(await invoke('data:getFileEntitiesForVisibleCourses')).toEqual([]);
    });
  });
});

// ============ Helpers ============

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = mockIpc.__getHandler(channel);
  if (!handler) throw new Error(`No handler registered for ${channel}`);
  return Promise.resolve(handler({} as unknown, ...args));
}

function makeNoopLogger(): {
  info: () => void;
  warn: () => void;
  error: () => void;
  debug: () => void;
  child: () => ReturnType<typeof makeNoopLogger>;
} {
  const inner = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    child: () => inner,
  };
  return inner;
}

function buildCtx(
  database: Database,
  oracle: VisibilityOracle,
  provider: FileEntityProvider
): IpcContext {
  const unused = (name: string) => () => {
    throw new Error(`IpcContext.${name} should not be called by file handlers`);
  };
  const noopLogger = makeNoopLogger();
  return {
    getDatabase: () => database,
    getLogger: () => noopLogger as unknown as ReturnType<IpcContext['getLogger']>,
    getVisibilityOracle: () => oracle,
    getFileEntityProvider: () => provider,
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

function seedFile(
  db: Database,
  data: { externalId: string; courseId: number; title?: string }
): void {
  db.executeWrite(
    `INSERT INTO resources (external_id, course_id, type, title)
     VALUES (?, ?, 'file', ?)`,
    [data.externalId, data.courseId, data.title ?? `file_${data.externalId}.pdf`]
  );
}

function seedAnnouncement(db: Database, courseId: number): number {
  const result = db.executeWrite(
    `INSERT INTO notifications
       (source_type, source_id, course_id, title, message, published_at)
     VALUES ('canvas', ?, ?, 'a', 'm', '2026-01-01T00:00:00Z')`,
    [`ann_${Date.now()}_${Math.random()}`, courseId]
  );
  return Number(result.lastInsertRowid);
}

function seedAttachment(
  db: Database,
  data: {
    notifId: number;
    courseId: number;
    externalId: string;
    filename?: string;
  }
): void {
  db.executeWrite(
    `INSERT INTO notification_attachments
       (notification_id, course_id, external_id, display_name, filename, url, download_status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
    [
      data.notifId,
      data.courseId,
      data.externalId,
      data.filename ?? `file_${data.externalId}.pdf`,
      data.filename ?? `file_${data.externalId}.pdf`,
      `https://canvas.example.com/files/${data.externalId}`,
    ]
  );
}
