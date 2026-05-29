/**
 * taskTypesHandlers — IPC handler behavior tests (ADR-0007).
 *
 * Exercises the migrated handlers end-to-end: reads route through
 * TaskTypeReader, writes through Create/DeleteTaskTypeCommand. Confirms
 * the response DTO shape the renderer depends on is unchanged.
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
import { registerTaskTypesHandlers } from '../../src/lifecycle/ipc-handlers/taskTypesHandlers';
import type { IpcContext } from '../../src/lifecycle/ipc-handlers/IpcContext';

interface IpcMainMock {
  __getHandler: (channel: string) => ((...args: unknown[]) => unknown) | undefined;
  __reset: () => void;
}

const mockIpc = ipcMain as unknown as IpcMainMock;

interface TaskTypeDto {
  id: number;
  name: string;
  displayName: string;
  courseId: number | null;
  createdAt: string;
}

interface HandlerResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

describe('taskTypesHandlers (ADR-0007)', () => {
  let db: Database;

  beforeEach(() => {
    mockIpc.__reset();
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();

    seedCourse(db, 1, 'CS101');

    registerTaskTypesHandlers(buildCtx(db));
  });

  afterEach(() => {
    db.close();
  });

  describe('taskTypes:getAll', () => {
    test('returns camelCase DTOs ordered by display name', async () => {
      await invoke('taskTypes:create', { name: 'Zeta', displayName: 'Zeta' });
      await invoke('taskTypes:create', { name: 'Alpha', displayName: 'Alpha' });

      const res = (await invoke('taskTypes:getAll')) as HandlerResult<TaskTypeDto[]>;

      expect(res.success).toBe(true);
      expect(res.data?.map((t) => t.displayName)).toEqual(['Alpha', 'Zeta']);
      expect(res.data?.[0]).toMatchObject({
        name: 'alpha',
        displayName: 'Alpha',
        courseId: null,
      });
      expect(typeof res.data?.[0].createdAt).toBe('string');
    });

    test('narrows to a course plus globals when courseId given', async () => {
      await invoke('taskTypes:create', { name: 'global', displayName: 'Global' });
      await invoke('taskTypes:create', {
        name: 'cs',
        displayName: 'CS Only',
        courseId: 1,
      });

      const res = (await invoke('taskTypes:getAll', 1)) as HandlerResult<TaskTypeDto[]>;

      expect(res.success).toBe(true);
      expect(res.data?.map((t) => t.displayName).sort()).toEqual(['CS Only', 'Global']);
    });

    test('reports failure when the read throws', async () => {
      db.close(); // force the reader to throw
      const res = (await invoke('taskTypes:getAll')) as HandlerResult<TaskTypeDto[]>;
      expect(res.success).toBe(false);
      expect(res.error).toContain('Failed to get task types');
    });
  });

  describe('taskTypes:create', () => {
    test('creates a global task type with normalized name', async () => {
      const res = (await invoke('taskTypes:create', {
        name: 'Lab Report',
        displayName: 'Lab Report',
      })) as HandlerResult<TaskTypeDto>;

      expect(res.success).toBe(true);
      expect(res.data?.name).toBe('lab_report');
      expect(res.data?.courseId).toBeNull();
    });

    test('returns failure on a duplicate name', async () => {
      await invoke('taskTypes:create', { name: 'quiz', displayName: 'Quiz' });
      const res = (await invoke('taskTypes:create', {
        name: 'quiz',
        displayName: 'Quiz 2',
      })) as HandlerResult<TaskTypeDto>;

      expect(res.success).toBe(false);
      expect(res.error).toContain('already exists');
    });
  });

  describe('taskTypes:delete', () => {
    test('deletes an existing task type', async () => {
      const created = (await invoke('taskTypes:create', {
        name: 'midterm',
        displayName: 'Midterm',
      })) as HandlerResult<TaskTypeDto>;

      const res = (await invoke(
        'taskTypes:delete',
        created.data!.id
      )) as HandlerResult<undefined>;
      expect(res.success).toBe(true);

      const all = (await invoke('taskTypes:getAll')) as HandlerResult<TaskTypeDto[]>;
      expect(all.data).toHaveLength(0);
    });

    test('returns failure for an unknown id', async () => {
      const res = (await invoke('taskTypes:delete', 9999)) as HandlerResult<undefined>;
      expect(res.success).toBe(false);
      expect(res.error).toContain('not found');
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
    throw new Error(`IpcContext.${name} should not be called by taskTypes handlers`);
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

function seedCourse(db: Database, id: number, code: string): void {
  db.executeWrite(
    `INSERT INTO courses (id, external_id, code, name, is_hidden, target_grade)
     VALUES (?, ?, ?, ?, 0, 85)`,
    [id, `ext_${id}`, code, `Course ${code}`]
  );
}
