/**
 * policyHandlers — IPC handler behavior tests (ADR-0007 PR-H).
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
import { registerPolicyHandlers } from '../../src/lifecycle/ipc-handlers/data/policyHandlers';
import type { IpcContext } from '../../src/lifecycle/ipc-handlers/IpcContext';

interface IpcMainMock {
  __getHandler: (channel: string) => ((...args: unknown[]) => unknown) | undefined;
  __reset: () => void;
}

const mockIpc = ipcMain as unknown as IpcMainMock;

describe('policyHandlers (ADR-0007 PR-H)', () => {
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

    registerPolicyHandlers(buildCtx(db, oracle));
  });

  afterEach(() => {
    oracle.stop();
    db.close();
  });

  describe('data:getPolicies', () => {
    test('returns active policies for one course, camelCase DTOs', async () => {
      seedPolicy(db, { courseId: 1, policyType: 'late', policyName: 'Late' });

      const rows = (await invoke('data:getPolicies', 1)) as Array<{
        policyType: string;
        policyName: string;
        isActive: boolean;
      }>;

      expect(rows).toHaveLength(1);
      expect(rows[0].policyType).toBe('late');
      expect(rows[0].policyName).toBe('Late');
      expect(rows[0].isActive).toBe(true);
    });

    test('bypasses visibility — returns policies for hidden courses', async () => {
      db.executeWrite(`UPDATE courses SET is_hidden = 1 WHERE id = 1`, [], 'courses');
      seedPolicy(db, { courseId: 1, policyType: 'late' });

      const rows = (await invoke('data:getPolicies', 1)) as Array<unknown>;
      expect(rows).toHaveLength(1);
    });

    test('returns empty when course has no active policies', async () => {
      expect(await invoke('data:getPolicies', 1)).toEqual([]);
    });
  });

  describe('data:getAllPolicies', () => {
    test('returns policies across visible courses', async () => {
      seedPolicy(db, { courseId: 1, policyType: 'cs' });
      seedPolicy(db, { courseId: 2, policyType: 'mat' });

      const rows = (await invoke('data:getAllPolicies')) as Array<{
        policyType: string;
      }>;

      expect(rows.map((r) => r.policyType).sort()).toEqual(['cs', 'mat']);
    });

    test('excludes hidden courses', async () => {
      db.executeWrite(`UPDATE courses SET is_hidden = 1 WHERE id = 2`, [], 'courses');
      seedPolicy(db, { courseId: 1, policyType: 'cs' });
      seedPolicy(db, { courseId: 2, policyType: 'hidden' });

      const rows = (await invoke('data:getAllPolicies')) as Array<{
        policyType: string;
      }>;

      expect(rows.map((r) => r.policyType)).toEqual(['cs']);
    });

    test('intersects explicit courseIds with visible', async () => {
      seedPolicy(db, { courseId: 1, policyType: 'cs' });
      seedPolicy(db, { courseId: 2, policyType: 'mat' });

      const rows = (await invoke('data:getAllPolicies', {
        courseIds: [1],
      })) as Array<{ policyType: string }>;

      expect(rows.map((r) => r.policyType)).toEqual(['cs']);
    });

    test('returns [] when no visible courses', async () => {
      db.executeWrite(`UPDATE courses SET is_hidden = 1`, [], 'courses');
      seedPolicy(db, { courseId: 1, policyType: 'x' });

      expect(await invoke('data:getAllPolicies')).toEqual([]);
    });
  });
});

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = mockIpc.__getHandler(channel);
  if (!handler) throw new Error(`No handler registered for ${channel}`);
  return Promise.resolve(handler({} as unknown, ...args));
}

function buildCtx(database: Database, oracle: VisibilityOracle): IpcContext {
  const unused = (name: string) => () => {
    throw new Error(`IpcContext.${name} should not be called by policy handlers`);
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

function seedPolicy(
  db: Database,
  data: {
    courseId: number;
    policyType: string;
    policyName?: string;
    isActive?: number;
  }
): void {
  db.executeWrite(
    `INSERT INTO course_policies
       (course_id, policy_type, policy_name, policy_config, is_active)
     VALUES (?, ?, ?, ?, ?)`,
    [
      data.courseId,
      data.policyType,
      data.policyName ?? `Policy ${data.policyType}`,
      '{}',
      data.isActive ?? 1,
    ]
  );
}
