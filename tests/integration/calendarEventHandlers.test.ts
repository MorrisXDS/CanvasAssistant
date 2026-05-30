/**
 * calendarEventHandlers — IPC handler behavior tests (ADR-0007).
 *
 * Electron is mocked so the handler file (which imports `ipcMain`) loads in
 * the Node test environment. Verifies the thin adapters delegate to the
 * reader/commands and preserve the original channel contracts.
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
    dialog: { showSaveDialog: jest.fn() },
  };
});

import { ipcMain, dialog } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as nodePath from 'path';
import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';
import { registerCalendarEventHandlers } from '../../src/lifecycle/ipc-handlers/calendar/calendarEventHandlers';
import type { IpcContext } from '../../src/lifecycle/ipc-handlers/IpcContext';

interface IpcMainMock {
  __getHandler: (channel: string) => ((...args: unknown[]) => unknown) | undefined;
  __reset: () => void;
}

const mockIpc = ipcMain as unknown as IpcMainMock;
const mockShowSaveDialog = dialog.showSaveDialog as jest.Mock;

describe('calendarEventHandlers (ADR-0007)', () => {
  let db: Database;

  beforeEach(() => {
    mockIpc.__reset();
    mockShowSaveDialog.mockReset();
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    seedCourse(db, 1, 'CS101');
    registerCalendarEventHandlers(buildCtx(db));
  });

  afterEach(() => {
    db.close();
  });

  test('registers all six channels', () => {
    for (const channel of [
      'calendar:getEventsForRange',
      'calendar:createEvent',
      'calendar:updateEvent',
      'calendar:deleteEvent',
      'calendar:addEventException',
      'calendar:exportBatch',
    ]) {
      expect(mockIpc.__getHandler(channel)).toBeDefined();
    }
  });

  test('createEvent persists and getEventsForRange returns the expanded event', async () => {
    const created = (await invoke('calendar:createEvent', {
      title: 'Lecture',
      startAt: '2026-01-10T10:00:00.000Z',
      endAt: '2026-01-10T11:00:00.000Z',
      courseId: 1,
    })) as { success: boolean; data: { id: number } };
    expect(created.success).toBe(true);

    const events = (await invoke('calendar:getEventsForRange', {
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-31T00:00:00.000Z',
    })) as Array<{ title: string; courseCode?: string }>;

    expect(events.map((e) => e.title)).toContain('Lecture');
    expect(events.find((e) => e.title === 'Lecture')?.courseCode).toBe('CS101');
  });

  test('updateEvent edits an existing event', async () => {
    const created = (await invoke('calendar:createEvent', {
      title: 'Before',
      startAt: '2026-01-10T10:00:00.000Z',
    })) as { data: { id: number } };

    const res = (await invoke('calendar:updateEvent', created.data.id, {
      title: 'After',
    })) as { success: boolean };
    expect(res.success).toBe(true);

    const row = db.executeReadOne<{ title: string }>(
      'SELECT title FROM calendar_events WHERE id = ?',
      [created.data.id]
    );
    expect(row?.title).toBe('After');
  });

  test('deleteEvent removes a user event but refuses canvas events', async () => {
    const created = (await invoke('calendar:createEvent', {
      title: 'Deletable',
      startAt: '2026-01-10T10:00:00.000Z',
    })) as { data: { id: number } };
    expect(await invoke('calendar:deleteEvent', created.data.id)).toEqual({
      success: true,
    });

    const canvasId = db.executeWrite(
      `INSERT INTO calendar_events (source_type, title, start_at)
       VALUES ('canvas', 'CanvasEvt', '2026-01-10T10:00:00.000Z')`,
      [],
      'calendar_events'
    ).lastInsertRowid as number;
    expect(await invoke('calendar:deleteEvent', canvasId)).toEqual({
      success: false,
      error: 'Cannot delete Canvas-synced events directly',
    });
  });

  test('addEventException appends an exception date', async () => {
    const created = (await invoke('calendar:createEvent', {
      title: 'Recurring',
      startAt: '2026-01-10T10:00:00.000Z',
      recurrenceRule: 'FREQ=WEEKLY',
    })) as { data: { id: number } };

    expect(
      await invoke('calendar:addEventException', created.data.id, '2026-01-17')
    ).toEqual({
      success: true,
    });
    const row = db.executeReadOne<{ recurrence_exception_dates: string }>(
      'SELECT recurrence_exception_dates FROM calendar_events WHERE id = ?',
      [created.data.id]
    );
    expect(row?.recurrence_exception_dates).toBe('2026-01-17');
  });

  describe('exportBatch', () => {
    test('returns canceled when the save dialog is dismissed', async () => {
      mockShowSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined });

      const result = await invoke('calendar:exportBatch', { includeCustom: true });
      expect(result).toEqual({ success: false, canceled: true });
    });

    test('writes an ICS file with the matching event count', async () => {
      await invoke('calendar:createEvent', {
        title: 'Exam',
        startAt: '2026-01-10T10:00:00.000Z',
        endAt: '2026-01-10T11:00:00.000Z',
        location: 'Hall A',
      });

      const outPath = nodePath.join(
        os.tmpdir(),
        `cid-export-test-${process.pid}-${Date.now()}.ics`
      );
      mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: outPath });

      try {
        const result = (await invoke('calendar:exportBatch', {
          includeCustom: true,
        })) as { success: boolean; path: string; eventCount: number };

        expect(result.success).toBe(true);
        expect(result.eventCount).toBe(1);
        expect(fs.existsSync(outPath)).toBe(true);
        const content = fs.readFileSync(outPath, 'utf-8');
        expect(content).toContain('BEGIN:VCALENDAR');
        expect(content).toContain('SUMMARY:Exam');
        expect(content).toContain('LOCATION:Hall A');
      } finally {
        if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
      }
    });
  });
});

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = mockIpc.__getHandler(channel);
  if (!handler) throw new Error(`No handler registered for ${channel}`);
  return Promise.resolve(handler({} as unknown, ...args));
}

function seedCourse(db: Database, id: number, code: string): void {
  db.executeWrite(
    `INSERT INTO courses (id, external_id, code, name, is_hidden, target_grade)
     VALUES (?, ?, ?, ?, 0, 85)`,
    [id, `ext_${id}`, code, `Course ${code}`]
  );
}

function buildCtx(database: Database): IpcContext {
  const unused = (name: string) => () => {
    throw new Error(`IpcContext.${name} should not be called by calendar event handlers`);
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
    getMainWindow: () => null,
    getVisibilityOracle: unused(
      'getVisibilityOracle'
    ) as IpcContext['getVisibilityOracle'],
    getFileEntityProvider: () => null,
    getCanvasClient: () => null,
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
