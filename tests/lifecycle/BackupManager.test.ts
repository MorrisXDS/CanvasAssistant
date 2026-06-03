/**
 * BackupManager.checkAndRunBackup — covers the migration-112 rewire of the
 * 3 settings-table reads/writes from raw `app_settings` SQL to the
 * `UserPreferencesReader` / `SetUserPreferenceCommand` path:
 *
 *   1. read `exportSchedule`              (UserPreferencesReader.get)
 *   2. read `backupEncryptionPassword`    (UserPreferencesReader.get)
 *   3. write back `exportSchedule.lastRun` (SetUserPreferenceCommand.execute)
 *
 * fs and the encryption helper are mocked so no real backup file is written.
 */

jest.mock('electron', () => ({ BrowserWindow: class {} }));

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: jest.fn(() => true),
    mkdirSync: jest.fn(),
    copyFileSync: jest.fn(),
    unlinkSync: jest.fn(),
    statSync: jest.fn(() => ({ size: 1234, mtime: new Date() })),
    readdirSync: jest.fn(() => []),
  };
});

jest.mock('../../src/layers/l0-utilities/BackupEncryption', () => ({
  encryptBackup: jest.fn(() => ({ success: true })),
}));

import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';
import { BackupManager } from '../../src/lifecycle/BackupManager';
import { encryptBackup } from '../../src/layers/l0-utilities/BackupEncryption';

function buildManager(db: Database): BackupManager {
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal test double
  } as any;
  return new BackupManager({
    database: db,
    dbPath: ':memory:',
    backupDir: '/tmp/backups',
    logger,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metricsCollector: { increment: jest.fn() } as any,
    getMainWindow: () => null,
  });
}

function pref(db: Database, key: string): string | undefined {
  return db.executeReadOne<{ value: string }>(
    'SELECT value FROM user_preferences WHERE key = ?',
    [key]
  )?.value;
}

describe('BackupManager.checkAndRunBackup (migration 112 — user_preferences-backed)', () => {
  let db: Database;

  beforeEach(() => {
    jest.clearAllMocks();
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
  });

  afterEach(() => db.close());

  function seedDueEncryptedSchedule(): void {
    // A daily schedule whose target hour is "now" with no prior lastRun → due.
    const schedule = {
      enabled: true,
      frequency: 'daily',
      time: `${String(new Date().getHours()).padStart(2, '0')}:00`,
      maxBackups: 5,
      encrypt: true,
    };
    db.executeWrite(
      `INSERT INTO user_preferences (key, value) VALUES ('exportSchedule', ?)`,
      [JSON.stringify(schedule)],
      'user_preferences'
    );
    db.executeWrite(
      `INSERT INTO user_preferences (key, value) VALUES ('backupEncryptionPassword', 'secret')`,
      [],
      'user_preferences'
    );
  }

  test('no-op when no exportSchedule is stored (reads user_preferences)', async () => {
    await buildManager(db).checkAndRunBackup();
    // Nothing written: no lastRun appears.
    expect(pref(db, 'exportSchedule')).toBeUndefined();
    expect(encryptBackup).not.toHaveBeenCalled();
  });

  test('runs a due encrypted backup: reads password + persists lastRun to user_preferences', async () => {
    seedDueEncryptedSchedule();

    await buildManager(db).checkAndRunBackup();

    // Read #2 (backupEncryptionPassword) reached the encryption path.
    expect(encryptBackup).toHaveBeenCalledTimes(1);
    expect(encryptBackup).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'secret'
    );

    // Write #3: the lastRun was upserted back into user_preferences (NOT app_settings).
    const stored = pref(db, 'exportSchedule');
    expect(stored).toBeDefined();
    const parsed = JSON.parse(stored as string);
    expect(typeof parsed.lastRun).toBe('string');
    expect(parsed.enabled).toBe(true);

    // The export_history row landed (the raw write that stayed in scope).
    const history = db.executeRead<{ status: string; export_type: string }>(
      "SELECT status, export_type FROM export_history WHERE export_type = 'scheduled'"
    );
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe('completed');
  });

  test('does not run when the stored schedule is disabled', async () => {
    db.executeWrite(
      `INSERT INTO user_preferences (key, value) VALUES ('exportSchedule', ?)`,
      [
        JSON.stringify({
          enabled: false,
          frequency: 'daily',
          maxBackups: 5,
          encrypt: false,
        }),
      ],
      'user_preferences'
    );

    await buildManager(db).checkAndRunBackup();

    expect(encryptBackup).not.toHaveBeenCalled();
    // lastRun never written → value unchanged (no lastRun field).
    const parsed = JSON.parse(pref(db, 'exportSchedule') as string);
    expect(parsed.lastRun).toBeUndefined();
  });
});
