/**
 * courseDataHandlers — IPC handler behavior tests.
 *
 * These tests lock down the bug-fix behavior of ADR-0007 PR-B:
 *   - `data:getCourses` must apply the FULL visibility filter (not hidden,
 *     not deleted, not archived, passes term selection).
 *   - `data:getCourse(id)` bypasses visibility for single-id getters
 *     (sub-decision α).
 *   - `data:getArchivedCourses` returns only archived, non-deleted rows
 *     in the right order.
 *
 * We mock `electron.ipcMain` so the registration call captures handlers by
 * channel name; tests invoke them directly. This is integration-style: real
 * DB, real Oracle, real Reader, real mapper, fake IPC bus.
 */

// Mock electron BEFORE any import that reaches into ipcMain.
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
import { registerCourseDataHandlers } from '../../src/lifecycle/ipc-handlers/courseDataHandlers';
import type { IpcContext } from '../../src/lifecycle/ipc-handlers/IpcContext';

interface IpcMainMock {
  __getHandler: (channel: string) => ((...args: unknown[]) => unknown) | undefined;
  __reset: () => void;
}

const mockIpc = ipcMain as unknown as IpcMainMock;

describe('courseDataHandlers (ADR-0007 PR-B)', () => {
  let db: Database;
  let oracle: VisibilityOracle;

  beforeEach(() => {
    mockIpc.__reset();
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const migrationRunner = new MigrationRunner(db);
    migrationRunner.loadMigrations(coreMigrations);
    migrationRunner.runAll();
    oracle = new VisibilityOracle(db);

    registerCourseDataHandlers(buildCtx(db, oracle));
  });

  afterEach(() => {
    oracle.stop();
    db.close();
  });

  describe('data:getCourses', () => {
    test('excludes hidden courses (regression: courseDataHandlers.ts:43 bug)', async () => {
      seedCourse(db, { id: 1, name: 'Visible', is_hidden: 0 });
      seedCourse(db, { id: 2, name: 'Hidden', is_hidden: 1 });
      oracle.setTermSelection('all'); // bypass term filter for this test

      const result = (await invoke('data:getCourses')) as Array<{
        id: number;
        isHidden: boolean;
      }>;

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
      expect(result[0].isHidden).toBe(false);
    });

    test('respects specific term selection (regression: courseDataHandlers.ts:43 bug)', async () => {
      // Course 1 is in term 100, course 2 in term 200. Selecting term 100
      // should return only course 1. The pre-PR-B handler ignored term
      // selection entirely (filtered only by archived/deleted), so it would
      // have returned BOTH.
      seedCourse(db, { id: 1, name: 'In-term', enrollment_term_id: 100 });
      seedCourse(db, { id: 2, name: 'Other-term', enrollment_term_id: 200 });

      oracle.setTermSelection(100);

      const result = (await invoke('data:getCourses')) as Array<{ id: number }>;

      expect(result.map((c) => c.id)).toEqual([1]);
    });

    test('returns empty array when all courses are hidden', async () => {
      seedCourse(db, { id: 1, is_hidden: 1 });
      seedCourse(db, { id: 2, is_hidden: 1 });
      oracle.setTermSelection('all');

      const result = await invoke('data:getCourses');

      expect(result).toEqual([]);
    });
  });

  describe('data:getCourse(id)', () => {
    test('returns a hidden course when its id is asked for (sub-decision α: single-id bypasses visibility)', async () => {
      // A user opens an announcement deep-link for a course they've since
      // hidden. data:getCourse(id) must surface the row so the page can
      // render. Visibility is a list-filter concept; single-id endpoints
      // don't apply it.
      seedCourse(db, { id: 42, name: 'Now Hidden', is_hidden: 1 });

      const result = (await invoke('data:getCourse', 42)) as {
        id: number;
        name: string;
        isHidden: boolean;
      } | null;

      expect(result).not.toBeNull();
      expect(result?.id).toBe(42);
      expect(result?.name).toBe('Now Hidden');
      expect(result?.isHidden).toBe(true);
    });

    test('returns null when the course does not exist', async () => {
      const result = await invoke('data:getCourse', 999);
      expect(result).toBeNull();
    });
  });

  describe('data:getArchivedCourses', () => {
    test('returns only archived (non-deleted) courses, ordered by term end DESC then name ASC', async () => {
      // Two enrollment terms (old + recent) plus an archived course in each,
      // and one active course that should be excluded.
      const tOld = seedEnrollmentTerm(db, {
        external_id: '100',
        name: 'Fall 2023',
        end_at: '2023-12-15T00:00:00Z',
      });
      const tRecent = seedEnrollmentTerm(db, {
        external_id: '200',
        name: 'Fall 2024',
        end_at: '2024-12-15T00:00:00Z',
      });

      seedCourse(db, {
        id: 1,
        name: 'Old',
        archived_at: '2024-01-01',
        enrollment_term_id: tOld,
      });
      seedCourse(db, {
        id: 2,
        name: 'Recent',
        archived_at: '2025-01-01',
        enrollment_term_id: tRecent,
      });
      seedCourse(db, { id: 3, name: 'Active' }); // not archived; must be excluded

      const result = (await invoke('data:getArchivedCourses')) as Array<{
        id: number;
        name: string;
        archivedAt: string | null;
      }>;

      expect(result.map((c) => c.name)).toEqual(['Recent', 'Old']);
      expect(result.every((c) => c.archivedAt !== null)).toBe(true);
    });
  });
});

// =============================================================================
// Helpers
// =============================================================================

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = mockIpc.__getHandler(channel);
  if (!handler) throw new Error(`No handler registered for ${channel}`);
  // ipcMain.handle invokes with (event, ...args)
  return Promise.resolve(handler({} as unknown, ...args));
}

function buildCtx(database: Database, oracle: VisibilityOracle): IpcContext {
  // Only the getters courseDataHandlers actually calls. Everything else
  // throws if reached, surfacing accidental coupling.
  const unused = (name: string) => () => {
    throw new Error(`IpcContext.${name} should not be called by course handlers`);
  };
  return {
    getDatabase: () => database,
    getLogger: () =>
      ({
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
        child: () => ({
          info: () => {},
          warn: () => {},
          error: () => {},
          debug: () => {},
        }),
      }) as unknown as ReturnType<IpcContext['getLogger']>,
    getVisibilityOracle: () => oracle,
    getFileEntityProvider: unused(
      'getFileEntityProvider'
    ) as IpcContext['getFileEntityProvider'],
    // Everything else: not used by course handlers, surface accidental coupling.
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
    getCanvasClient: unused('getCanvasClient') as IpcContext['getCanvasClient'],
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

function seedCourse(
  database: Database,
  data: {
    id: number;
    name?: string;
    code?: string;
    is_hidden?: number;
    deleted_at?: string | null;
    archived_at?: string | null;
    enrollment_term_id?: number | null;
  }
): void {
  database.executeWrite(
    `INSERT INTO courses (
       id, external_id, code, name, is_hidden, deleted_at, archived_at,
       enrollment_term_id, target_grade
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.id,
      `ext_${data.id}`,
      data.code ?? `C${data.id}`,
      data.name ?? `Course ${data.id}`,
      data.is_hidden ?? 0,
      data.deleted_at ?? null,
      data.archived_at ?? null,
      data.enrollment_term_id ?? null,
      85,
    ]
  );
}

function seedEnrollmentTerm(
  database: Database,
  data: { external_id: string; name: string; end_at: string }
): number {
  const result = database.executeWrite(
    `INSERT INTO enrollment_terms (external_id, name, end_at) VALUES (?, ?, ?)`,
    [data.external_id, data.name, data.end_at]
  );
  return Number(result.lastInsertRowid);
}
