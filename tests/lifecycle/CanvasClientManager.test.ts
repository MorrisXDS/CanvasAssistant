/**
 * CanvasClientManager — desktop-notification fork tests (settings-behavior-change).
 *
 * The fork under test: on `sync-complete` / `sync-error`, the manager only
 * constructs+shows a desktop `Notification` when BOTH
 * `notificationSettings.enabled` AND `notificationSettings.syncStatus` are true
 * (CanvasClientManager.ts:227-235 / 247-255). Flipping either setting must
 * change the behavior — and asserting only the positive branch would leave a
 * backwards-wiring blind spot, so each negative case asserts the Notification
 * was NOT constructed.
 *
 * `electron` is mocked BEFORE importing the SUT (the train gotcha — the import
 * chain pulls in `electron`), with `Notification` as a jest mock class whose
 * `.show()` is a shared spy.
 *
 * Test seam note: this test DELIBERATELY reaches the PRIVATE
 * `setupSyncEventHandlers` via bracket access, and assigns a fake `EventEmitter`
 * as the private `syncEngine` field. This is intentional and was assessed in the
 * plan — it avoids running the full `initialize()` (which needs a real
 * CanvasClient + token validation) while exercising the real notification gate.
 * No production code is changed.
 */

const showSpy = jest.fn();
const NotificationMock = jest.fn().mockImplementation(() => ({ show: showSpy }));
// Default plugged-in so the suppression predicate never suppresses unless a
// test opts a battery state in. Stubbed (never the real platform) for CI
// portability (dev=Windows, CI=Linux).
const isOnBatteryPowerMock = jest.fn(() => false);

jest.mock('electron', () => ({
  Notification: NotificationMock,
  powerMonitor: {
    isOnBatteryPower: () => isOnBatteryPowerMock(),
  },
}));

import { EventEmitter } from 'events';
import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';
import { CanvasClientManager } from '../../src/lifecycle/CanvasClientManager';
import type { CanvasClientManagerConfig } from '../../src/lifecycle/CanvasClientManager';

type SyncEventEmitter = EventEmitter;

interface PrivateAccess {
  syncEngine: SyncEventEmitter | null;
  setupSyncEventHandlers: (
    logger: unknown,
    metricsCollector: unknown,
    getMainWindow: unknown,
    getVisibilityOracle: unknown
  ) => void;
}

describe('CanvasClientManager — desktop notification fork', () => {
  let db: Database;
  let manager: CanvasClientManager;
  let fakeSyncEngine: SyncEventEmitter;

  const noopLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: () => noopLogger,
  };
  const metricsCollector = { increment: jest.fn(), recordTiming: jest.fn() };
  const getMainWindow = () => ({
    isDestroyed: () => false,
    webContents: { send: jest.fn() },
  });
  const getVisibilityOracle = () => ({ invalidateCache: jest.fn() });

  /** Seed the notificationSettings row (or omit to test the null-settings branch). */
  function seedNotificationSettings(value: {
    enabled: boolean;
    syncStatus?: boolean;
    dueDateReminders?: boolean;
    gradeAlerts?: boolean;
    quietWhenUnplugged?: boolean;
  }): void {
    db.executeWrite(
      "INSERT INTO user_preferences (key, value) VALUES ('notificationSettings', ?)",
      [JSON.stringify(value)],
      'user_preferences'
    );
  }

  /** Construct the manager + wire a fake syncEngine + register the real handlers. */
  function wireHandlers(): void {
    const config = {
      database: db,
      logger: noopLogger,
      metricsCollector,
      getMainWindow,
      getVisibilityOracle,
    } as unknown as CanvasClientManagerConfig;

    manager = new CanvasClientManager(config);
    fakeSyncEngine = new EventEmitter();
    // Reach the private syncEngine field + private handler-setup method (see header).
    (manager as unknown as PrivateAccess).syncEngine = fakeSyncEngine;
    (manager as unknown as PrivateAccess).setupSyncEventHandlers(
      noopLogger,
      metricsCollector,
      getMainWindow,
      getVisibilityOracle
    );
  }

  beforeEach(() => {
    NotificationMock.mockClear();
    showSpy.mockClear();
    isOnBatteryPowerMock.mockReset();
    isOnBatteryPowerMock.mockReturnValue(false);
    metricsCollector.increment.mockClear();
    metricsCollector.recordTiming.mockClear();

    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
  });

  afterEach(() => {
    db.close();
  });

  describe('sync-complete', () => {
    test('enabled + syncStatus → constructs and shows a "Sync Complete" notification', () => {
      seedNotificationSettings({ enabled: true, syncStatus: true });
      wireHandlers();

      fakeSyncEngine.emit('sync-complete', {
        courses: { count: 3 },
        tasks: { count: 7 },
        totalDuration: 10,
      });

      expect(NotificationMock).toHaveBeenCalledTimes(1);
      const arg = NotificationMock.mock.calls[0][0] as { title: string; body: string };
      expect(arg.title).toBe('Sync Complete');
      expect(arg.body).toContain('3 courses');
      expect(arg.body).toContain('7 tasks');
      expect(showSpy).toHaveBeenCalledTimes(1);
    });

    test('enabled=false → NOT constructed (the enabled operand gates it off)', () => {
      seedNotificationSettings({ enabled: false, syncStatus: true });
      wireHandlers();

      fakeSyncEngine.emit('sync-complete', {
        courses: { count: 1 },
        tasks: { count: 2 },
        totalDuration: 5,
      });

      expect(NotificationMock).not.toHaveBeenCalled();
      expect(showSpy).not.toHaveBeenCalled();
    });

    test('syncStatus=false → NOT constructed (the syncStatus operand gates it off)', () => {
      seedNotificationSettings({ enabled: true, syncStatus: false });
      wireHandlers();

      fakeSyncEngine.emit('sync-complete', {
        courses: { count: 1 },
        tasks: { count: 2 },
        totalDuration: 5,
      });

      expect(NotificationMock).not.toHaveBeenCalled();
      expect(showSpy).not.toHaveBeenCalled();
    });

    test('no settings row at all → NOT constructed (getNotificationSettings null)', () => {
      // No seed.
      wireHandlers();

      fakeSyncEngine.emit('sync-complete', {
        courses: { count: 1 },
        tasks: { count: 2 },
        totalDuration: 5,
      });

      expect(NotificationMock).not.toHaveBeenCalled();
      expect(showSpy).not.toHaveBeenCalled();
    });
  });

  describe('sync-error', () => {
    test('enabled + syncStatus → constructs and shows a "Sync Failed" notification', () => {
      seedNotificationSettings({ enabled: true, syncStatus: true });
      wireHandlers();

      fakeSyncEngine.emit('sync-error', { type: 'tasks', error: 'boom' });

      expect(NotificationMock).toHaveBeenCalledTimes(1);
      const arg = NotificationMock.mock.calls[0][0] as { title: string; body: string };
      expect(arg.title).toBe('Sync Failed');
      expect(arg.body).toContain('boom');
      expect(showSpy).toHaveBeenCalledTimes(1);
    });

    test('enabled=false → NOT constructed on sync-error either', () => {
      seedNotificationSettings({ enabled: false, syncStatus: true });
      wireHandlers();

      fakeSyncEngine.emit('sync-error', { type: 'tasks', error: 'boom' });

      expect(NotificationMock).not.toHaveBeenCalled();
      expect(showSpy).not.toHaveBeenCalled();
    });
  });

  describe('quiet-when-unplugged suppression on the show seam', () => {
    test('quietWhenUnplugged + on battery → sync toast SUPPRESSED', () => {
      seedNotificationSettings({
        enabled: true,
        syncStatus: true,
        quietWhenUnplugged: true,
      });
      isOnBatteryPowerMock.mockReturnValue(true);
      wireHandlers();

      fakeSyncEngine.emit('sync-complete', {
        courses: { count: 1 },
        tasks: { count: 2 },
        totalDuration: 5,
      });

      expect(NotificationMock).not.toHaveBeenCalled();
      expect(showSpy).not.toHaveBeenCalled();
    });

    test('quietWhenUnplugged + plugged in → sync toast still fires', () => {
      seedNotificationSettings({
        enabled: true,
        syncStatus: true,
        quietWhenUnplugged: true,
      });
      isOnBatteryPowerMock.mockReturnValue(false);
      wireHandlers();

      fakeSyncEngine.emit('sync-complete', {
        courses: { count: 1 },
        tasks: { count: 2 },
        totalDuration: 5,
      });

      expect(NotificationMock).toHaveBeenCalledTimes(1);
      expect(showSpy).toHaveBeenCalledTimes(1);
    });

    test('on battery but quietWhenUnplugged off → sync toast still fires', () => {
      seedNotificationSettings({
        enabled: true,
        syncStatus: true,
        quietWhenUnplugged: false,
      });
      isOnBatteryPowerMock.mockReturnValue(true);
      wireHandlers();

      fakeSyncEngine.emit('sync-complete', {
        courses: { count: 1 },
        tasks: { count: 2 },
        totalDuration: 5,
      });

      expect(NotificationMock).toHaveBeenCalledTimes(1);
      expect(showSpy).toHaveBeenCalledTimes(1);
    });

    test('powerMonitor.isOnBatteryPower throwing → treated as plugged in (fires)', () => {
      seedNotificationSettings({
        enabled: true,
        syncStatus: true,
        quietWhenUnplugged: true,
      });
      isOnBatteryPowerMock.mockImplementation(() => {
        throw new Error('headless');
      });
      wireHandlers();

      fakeSyncEngine.emit('sync-complete', {
        courses: { count: 1 },
        tasks: { count: 2 },
        totalDuration: 5,
      });

      expect(NotificationMock).toHaveBeenCalledTimes(1);
      expect(showSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('grade alerts on sync-updates', () => {
    test('gradeChanges>0 + enabled + gradeAlerts → batched notification fires', () => {
      seedNotificationSettings({ enabled: true, gradeAlerts: true });
      wireHandlers();

      fakeSyncEngine.emit('sync-updates', { total: 3, gradeChanges: 3 });

      expect(NotificationMock).toHaveBeenCalledTimes(1);
      const arg = NotificationMock.mock.calls[0][0] as { title: string; body: string };
      expect(arg.title).toBe('New grades');
      expect(arg.body).toBe('3 new grades posted');
      expect(showSpy).toHaveBeenCalledTimes(1);
    });

    test('single grade → singular body', () => {
      seedNotificationSettings({ enabled: true, gradeAlerts: true });
      wireHandlers();

      fakeSyncEngine.emit('sync-updates', { total: 1, gradeChanges: 1 });

      const arg = NotificationMock.mock.calls[0][0] as { body: string };
      expect(arg.body).toBe('1 new grade posted');
    });

    test('gradeAlerts off → no grade notification (per-kind gate)', () => {
      seedNotificationSettings({ enabled: true, gradeAlerts: false });
      wireHandlers();

      fakeSyncEngine.emit('sync-updates', { total: 3, gradeChanges: 3 });

      expect(NotificationMock).not.toHaveBeenCalled();
    });

    test('gradeChanges=0 → no notification even when gradeAlerts on', () => {
      seedNotificationSettings({ enabled: true, gradeAlerts: true });
      wireHandlers();

      fakeSyncEngine.emit('sync-updates', { total: 2, newFiles: 2 });

      expect(NotificationMock).not.toHaveBeenCalled();
    });

    test('quietWhenUnplugged + on battery → grade alert suppressed', () => {
      seedNotificationSettings({
        enabled: true,
        gradeAlerts: true,
        quietWhenUnplugged: true,
      });
      isOnBatteryPowerMock.mockReturnValue(true);
      wireHandlers();

      fakeSyncEngine.emit('sync-updates', { total: 3, gradeChanges: 3 });

      expect(NotificationMock).not.toHaveBeenCalled();
    });
  });

  describe('showDesktopNotification per-kind gate', () => {
    test('dueDate kind fires only when dueDateReminders is on', () => {
      seedNotificationSettings({
        enabled: true,
        dueDateReminders: false,
      });
      wireHandlers();

      const shownOff = manager.showDesktopNotification('T', 'B', 'dueDate');
      expect(shownOff).toBe(false);
      expect(NotificationMock).not.toHaveBeenCalled();

      // Re-seed with dueDateReminders on.
      db.executeWrite(
        "UPDATE user_preferences SET value = ? WHERE key = 'notificationSettings'",
        [JSON.stringify({ enabled: true, dueDateReminders: true })],
        'user_preferences'
      );
      const shownOn = manager.showDesktopNotification('T', 'B', 'dueDate');
      expect(shownOn).toBe(true);
      expect(NotificationMock).toHaveBeenCalledTimes(1);
    });

    test('grade kind fires only when gradeAlerts is on', () => {
      seedNotificationSettings({ enabled: true, gradeAlerts: true });
      wireHandlers();

      const shown = manager.showDesktopNotification('T', 'B', 'grade');
      expect(shown).toBe(true);
      expect(NotificationMock).toHaveBeenCalledTimes(1);
    });
  });
});
