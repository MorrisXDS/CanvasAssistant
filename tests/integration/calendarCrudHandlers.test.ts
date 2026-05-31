/**
 * calendarCrudHandlers — IPC handler behavior tests (ADR-0007).
 *
 * Electron is mocked so the handler file (which imports `ipcMain`) loads in
 * the Node test environment. Verifies the seven imported-calendar channels
 * delegate to the reader/commands and preserve the original contracts.
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
import { registerCalendarCrudHandlers } from '../../src/lifecycle/ipc-handlers/calendar/calendarCrudHandlers';
import type { IpcContext } from '../../src/lifecycle/ipc-handlers/IpcContext';

interface IpcMainMock {
  __getHandler: (channel: string) => ((...args: unknown[]) => unknown) | undefined;
  __reset: () => void;
}

const mockIpc = ipcMain as unknown as IpcMainMock;

/** Build a minimal valid ICS string from a list of events. */
function makeICS(events: Array<{ uid: string; summary: string }>): string {
  const body = events
    .map(
      (e) => `BEGIN:VEVENT
UID:${e.uid}
DTSTART:20260115T100000Z
DTEND:20260115T110000Z
SUMMARY:${e.summary}
END:VEVENT`
    )
    .join('\n');
  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
${body}
END:VCALENDAR`;
}

describe('calendarCrudHandlers (ADR-0007)', () => {
  let db: Database;

  beforeEach(() => {
    mockIpc.__reset();
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    registerCalendarCrudHandlers(buildCtx(db));
  });

  afterEach(() => {
    db.close();
  });

  test('registers all seven channels', () => {
    for (const channel of [
      'calendar:getImportedCalendars',
      'calendar:parseICSPreview',
      'calendar:importICS',
      'calendar:deleteCalendar',
      'calendar:updateCalendar',
      'calendar:toggleVisibility',
      'calendar:reimport',
    ]) {
      expect(mockIpc.__getHandler(channel)).toBeDefined();
    }
  });

  test('parseICSPreview returns a preview without importing', async () => {
    const preview = (await invoke(
      'calendar:parseICSPreview',
      makeICS([{ uid: 'u1', summary: 'Event' }]),
      'term.ics'
    )) as { filename: string; events: unknown[] };
    expect(preview.filename).toBe('term.ics');
    expect(preview.events).toHaveLength(1);

    // Nothing was persisted
    const cals = (await invoke('calendar:getImportedCalendars')) as unknown[];
    expect(cals).toHaveLength(0);
  });

  test('importICS persists, getImportedCalendars maps DTOs', async () => {
    const result = (await invoke('calendar:importICS', {
      content: makeICS([
        { uid: 'u1', summary: 'E1' },
        { uid: 'u2', summary: 'E2' },
      ]),
      filename: 'term.ics',
      name: 'My Term',
      color: '#abcdef',
    })) as { success: boolean; calendar: { id: number } };
    expect(result.success).toBe(true);

    const cals = (await invoke('calendar:getImportedCalendars')) as Array<{
      id: number;
      name: string;
      color: string;
      eventCount: number;
      isVisible: boolean;
    }>;
    expect(cals).toHaveLength(1);
    expect(cals[0]).toMatchObject({
      name: 'My Term',
      color: '#abcdef',
      eventCount: 2,
      isVisible: true,
    });
  });

  test('importICS returns a duplicate error for identical content', async () => {
    const content = makeICS([{ uid: 'u1', summary: 'E' }]);
    await invoke('calendar:importICS', { content, filename: 'a.ics', name: 'First' });
    const second = (await invoke('calendar:importICS', {
      content,
      filename: 'b.ics',
      name: 'Second',
    })) as { success: boolean; error: string };
    expect(second.success).toBe(false);
    expect(second.error).toBe('duplicate');
  });

  test('updateCalendar + toggleVisibility mutate the row', async () => {
    const imp = (await invoke('calendar:importICS', {
      content: makeICS([{ uid: 'u1', summary: 'E' }]),
      filename: 'a.ics',
      name: 'Before',
    })) as { calendar: { id: number } };
    const id = imp.calendar.id;

    expect(await invoke('calendar:updateCalendar', id, { name: 'After' })).toEqual({
      success: true,
    });
    expect(await invoke('calendar:toggleVisibility', id, false)).toEqual({
      success: true,
    });

    const cal = (
      (await invoke('calendar:getImportedCalendars')) as Array<{
        name: string;
        isVisible: boolean;
      }>
    )[0];
    expect(cal.name).toBe('After');
    expect(cal.isVisible).toBe(false);
  });

  test('reimport replaces events, deleteCalendar removes everything', async () => {
    const imp = (await invoke('calendar:importICS', {
      content: makeICS([{ uid: 'u1', summary: 'Old' }]),
      filename: 'a.ics',
    })) as { calendar: { id: number } };
    const id = imp.calendar.id;

    const re = (await invoke(
      'calendar:reimport',
      id,
      makeICS([
        { uid: 'u2', summary: 'New1' },
        { uid: 'u3', summary: 'New2' },
      ])
    )) as { success: boolean; eventCount: number };
    expect(re).toEqual({ success: true, eventCount: 2 });

    expect(await invoke('calendar:deleteCalendar', id)).toEqual({ success: true });
    expect((await invoke('calendar:getImportedCalendars')) as unknown[]).toHaveLength(0);
  });
});

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = mockIpc.__getHandler(channel);
  if (!handler) throw new Error(`No handler registered for ${channel}`);
  return Promise.resolve(handler({} as unknown, ...args));
}

function buildCtx(database: Database): IpcContext {
  const unused = (name: string) => () => {
    throw new Error(`IpcContext.${name} should not be called by calendar CRUD handlers`);
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
