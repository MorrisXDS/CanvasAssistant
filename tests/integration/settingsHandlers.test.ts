/**
 * settingsHandlers — IPC handler behavior tests (ADR-0007).
 *
 * Covers the SQL-touching handlers migrated to readers/commands:
 * local-HTML-paths, default-target-grade, and course settings.
 * Confirms renderer-facing response shapes are unchanged.
 */

jest.mock('electron', () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    ipcMain: {
      handle: jest.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
        handlers.set(channel, fn);
      }),
      on: jest.fn(),
      __getHandler: (channel: string) => handlers.get(channel),
      __reset: () => handlers.clear(),
    },
    app: { getPath: () => '/tmp' },
    dialog: {},
  };
});

import { ipcMain } from 'electron';
import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';
import { registerSettingsHandlers } from '../../src/lifecycle/ipc-handlers/settingsHandlers';
import type { IpcContext } from '../../src/lifecycle/ipc-handlers/IpcContext';

interface IpcMainMock {
  __getHandler: (channel: string) => ((...args: unknown[]) => unknown) | undefined;
  __reset: () => void;
}

const mockIpc = ipcMain as unknown as IpcMainMock;

function seedCourse(db: Database, id: number): void {
  db.executeWrite(
    `INSERT INTO courses (id, external_id, code, name, target_grade) VALUES (?, ?, ?, ?, 85)`,
    [id, `ext_${id}`, `C${id}`, `Course ${id}`]
  );
}

describe('settingsHandlers (ADR-0007)', () => {
  let db: Database;

  beforeEach(() => {
    mockIpc.__reset();
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    registerSettingsHandlers(buildCtx(db));
  });

  afterEach(() => {
    db.close();
  });

  describe('settings:setLocalHtmlPathsSettings', () => {
    test('persists settings', async () => {
      const res = (await invoke('settings:setLocalHtmlPathsSettings', {
        enabled: true,
        autoRegenerate: false,
        promptForMissing: true,
      })) as { success: boolean };
      expect(res.success).toBe(true);

      const row = db.executeReadOne<{ value: string }>(
        `SELECT value FROM user_preferences WHERE key = 'localHtmlPathsSettings'`,
        []
      );
      expect(JSON.parse(row!.value)).toMatchObject({ enabled: true });
    });

    test('returns failure when the write fails', async () => {
      db.close();
      const res = (await invoke('settings:setLocalHtmlPathsSettings', {
        enabled: true,
        autoRegenerate: false,
        promptForMissing: false,
      })) as { success: boolean };
      expect(res.success).toBe(false);
    });
  });

  describe('settings:getDefaultTargetGrade', () => {
    test('returns the stored grade', async () => {
      db.executeWrite(
        `INSERT INTO user_preferences (key, value) VALUES ('academicSettings', ?)`,
        [JSON.stringify({ defaultTargetGrade: 90 })]
      );
      expect(await invoke('settings:getDefaultTargetGrade')).toEqual({
        defaultTargetGrade: 90,
      });
    });

    test('falls back to 85 when unset', async () => {
      expect(await invoke('settings:getDefaultTargetGrade')).toEqual({
        defaultTargetGrade: 85,
      });
    });
  });

  describe('settings:setDefaultTargetGrade', () => {
    test('persists the grade and propagates to courses', async () => {
      seedCourse(db, 1);
      const res = (await invoke('settings:setDefaultTargetGrade', 92)) as {
        success: boolean;
        data: { updatedCourses: number };
      };
      expect(res.success).toBe(true);
      expect(typeof res.data.updatedCourses).toBe('number');

      const row = db.executeReadOne<{ value: string }>(
        `SELECT value FROM user_preferences WHERE key = 'academicSettings'`,
        []
      );
      expect(JSON.parse(row!.value).defaultTargetGrade).toBe(92);
    });

    test('returns failure when the write fails', async () => {
      db.close();
      const res = (await invoke('settings:setDefaultTargetGrade', 50)) as {
        success: boolean;
      };
      expect(res.success).toBe(false);
    });
  });

  describe('course:getSettings', () => {
    test('returns settings DTO for an existing course', async () => {
      seedCourse(db, 1);
      const res = (await invoke('course:getSettings', 1)) as {
        success: boolean;
        data: { autoAssignDueDate: number | null; allowGuessedOverride: number };
      };
      expect(res.success).toBe(true);
      expect(res.data.allowGuessedOverride).toBe(1);
    });

    test('returns failure for a missing course', async () => {
      const res = (await invoke('course:getSettings', 9999)) as {
        success: boolean;
        error: string;
      };
      expect(res.success).toBe(false);
      expect(res.error).toContain('Course not found');
    });
  });

  describe('course:updateSettings', () => {
    test('updates the provided fields', async () => {
      seedCourse(db, 1);
      const res = (await invoke('course:updateSettings', 1, {
        autoAssignDueDate: 1,
      })) as { success: boolean };
      expect(res.success).toBe(true);

      const row = db.executeReadOne<{ auto_assign_due_date: number | null }>(
        'SELECT auto_assign_due_date FROM courses WHERE id = 1',
        []
      );
      expect(row?.auto_assign_due_date).toBe(1);
    });

    test('returns failure when the write fails', async () => {
      seedCourse(db, 1);
      db.close();
      const res = (await invoke('course:updateSettings', 1, {
        autoAssignDueDate: 1,
      })) as { success: boolean };
      expect(res.success).toBe(false);
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
    throw new Error(`IpcContext.${name} should not be called by these tests`);
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
    getMainWindow: () => null,
    getWindowBehavior: () => ({ closeAction: null, showTrayIcon: true }),
    setWindowBehavior: () => {},
    createTray: () => {},
    destroyTray: () => {},
    getLocalHtmlPathsSettings: () => ({
      enabled: false,
      autoRegenerate: false,
      promptForMissing: false,
    }),
    getIsQuitting: () => false,
    setIsQuitting: () => {},
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
    resetAppState: unused('resetAppState') as IpcContext['resetAppState'],
  };
}
