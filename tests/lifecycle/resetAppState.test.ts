/**
 * resetAppState — regression guard for the "Reset all data" bug.
 *
 * Original bug (#108): the reset transaction cleared `user_preferences` but
 * never `app_settings`, so the backup schedule + encryption password survived a
 * full reset and `BackupManager` resurrected the scheduler on next boot. As of
 * migration 112 the duplicate `app_settings` table was consolidated INTO
 * `user_preferences` and dropped, so the backup config (`exportSchedule`,
 * `backupEncryptionPassword`) now lives in `user_preferences` — and the reset's
 * `DELETE FROM user_preferences` covers it. This test now guards that the
 * consolidated settings table is cleared on reset.
 *
 * No React / no electron import is needed — `resetAppState` takes a deps object,
 * and `getMainWindow` / `getSyncEngine` are supplied as stubs (null) so the IPC
 * notify, file-watcher, and credential branches are exercised harmlessly against
 * a real in-memory DB + a temp filesDir.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';
import { resetAppState, type ResetAppStateDeps } from '../../src/lifecycle/resetAppState';

function countRows(db: Database, table: string): number {
  const rows = db.executeRead<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
  return rows[0]?.n ?? -1;
}

describe('resetAppState', () => {
  let db: Database;
  let tmpDir: string;
  let filesDir: string;
  let configDir: string;
  let deps: ResetAppStateDeps;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();

    // Seed the consolidated settings table with both a user-tuned setting and the
    // backup config that formerly lived in the dropped `app_settings` table, so
    // the reset must clear all of it.
    db.executeWrite(
      "INSERT INTO user_preferences (key, value) VALUES ('exportSchedule', '{\"enabled\":true}')",
      [],
      'user_preferences'
    );
    db.executeWrite(
      "INSERT INTO user_preferences (key, value) VALUES ('syncPreferences', '{\"autoSyncEnabled\":true}')",
      [],
      'user_preferences'
    );

    // Temp directories for the file/window-state cleanup branches.
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reset-app-state-'));
    filesDir = path.join(tmpDir, 'Downloads');
    configDir = path.join(tmpDir, '.config');
    fs.mkdirSync(filesDir, { recursive: true });
    fs.mkdirSync(configDir, { recursive: true });

    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    deps = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal test doubles
      database: db as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      logger: logger as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metricsCollector: { increment: jest.fn() } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      credentialManager: {
        stopBackgroundValidation: jest.fn(),
        delete: jest.fn().mockResolvedValue(undefined),
      } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fileWatcher: { stop: jest.fn(), start: jest.fn() } as any,
      configDir,
      filesDir,
      getMainWindow: () => null,
      getSyncEngine: () => null,
      canvasClientManager: null,
    };
  });

  afterEach(() => {
    db.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* best-effort temp cleanup */
    }
  });

  it('clears user_preferences (incl. consolidated backup config) on reset, so the backup schedule does not survive a full reset', async () => {
    // Two rows seeded: the user-tuned `syncPreferences` and the backup
    // `exportSchedule` that post-112 lives in user_preferences.
    expect(countRows(db, 'user_preferences')).toBe(2);

    await resetAppState(deps, { deleteToken: false });

    // The load-bearing assertion — the consolidated settings table is fully
    // cleared, so the backup schedule/password cannot survive a reset (#108).
    expect(countRows(db, 'user_preferences')).toBe(0);
  });

  it('the dropped app_settings table is gone after migration (no resurrection)', () => {
    const exists =
      db.executeRead<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = 'app_settings'"
      ).length > 0;
    expect(exists).toBe(false);
  });

  it('clears notified_reminders on reset so persisted dedup keys do not outlive a full reset (migration 114)', async () => {
    // Seed two dedup rows that simulate previously-fired reminders.
    db.executeWrite(
      "INSERT INTO notified_reminders (dedup_key, task_id, due_at) VALUES ('1|2026-06-07T12:00:00.000Z', 1, '2026-06-07T12:00:00.000Z')",
      [],
      'notified_reminders'
    );
    db.executeWrite(
      "INSERT INTO notified_reminders (dedup_key, task_id, due_at) VALUES ('2|2026-06-08T10:00:00.000Z', 2, '2026-06-08T10:00:00.000Z')",
      [],
      'notified_reminders'
    );
    expect(countRows(db, 'notified_reminders')).toBe(2);

    await resetAppState(deps, { deleteToken: false });

    // After reset the table must be empty so a fresh run can re-fire reminders.
    expect(countRows(db, 'notified_reminders')).toBe(0);
  });
});
