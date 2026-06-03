/**
 * resetAppState — regression guard for the "Reset all data" bug.
 *
 * Bug (fixed at src/lifecycle/resetAppState.ts:102): the reset transaction
 * cleared `user_preferences` but never `app_settings`, so the backup schedule
 * and encryption password survived a full app reset and `BackupManager`
 * resurrected the scheduler on next boot. The `DELETE FROM app_settings` line
 * is the fix; the `app_settings` assertion below FAILS on the old code.
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

    // Seed one row into each top-level settings table so both start non-empty.
    db.executeWrite(
      "INSERT INTO app_settings (key, value) VALUES ('exportSchedule', '{\"enabled\":true}')",
      [],
      'app_settings'
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

  it('clears app_settings on reset (regression: backup schedule must not survive a full reset)', async () => {
    expect(countRows(db, 'app_settings')).toBe(1);

    await resetAppState(deps, { deleteToken: false });

    // The load-bearing assertion — fails on the pre-fix code that omitted
    // `DELETE FROM app_settings`.
    expect(countRows(db, 'app_settings')).toBe(0);
  });

  it('also clears user_preferences on reset (existing behavior, guarded against regression)', async () => {
    expect(countRows(db, 'user_preferences')).toBe(1);

    await resetAppState(deps, { deleteToken: false });

    expect(countRows(db, 'user_preferences')).toBe(0);
  });
});
