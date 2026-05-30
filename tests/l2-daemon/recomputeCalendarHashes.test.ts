/**
 * recomputeCalendarHashes tests.
 *
 * (Relocated from src/lifecycle/ipc-handlers/calendar/ to l2-daemon under
 * ADR-0007 — it's calendar daemon logic, not an IPC handler. Previously
 * untested; this suite is added alongside the move.)
 */

import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';
import { recomputeCalendarHashes } from '../../src/layers/l2-daemon/calendar/recomputeCalendarHashes';
// Barrel re-exports + the handler import — loaded so the wiring lines are exercised.
import { recomputeCalendarHashes as fromL2Barrel } from '../../src/layers/l2-daemon';
import { recomputeCalendarHashes as fromCalendarBarrel } from '../../src/layers/l2-daemon/calendar';
import { registerCalendarHandlers } from '../../src/lifecycle/ipc-handlers/calendarHandlers';

function makeLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child() {
      return this;
    },
  };
}

function seedCalendar(db: Database, name: string): number {
  const r = db.executeWrite(
    `INSERT INTO imported_calendars (name, filename) VALUES (?, ?)`,
    [name, `${name}.ics`]
  );
  return Number(r.lastInsertRowid);
}

function seedEvent(db: Database, calendarId: number, title: string): void {
  db.executeWrite(
    `INSERT INTO calendar_events (source_type, imported_calendar_id, title, start_at)
     VALUES ('imported', ?, ?, '2026-01-01T00:00:00.000Z')`,
    [calendarId, title]
  );
}

describe('recomputeCalendarHashes', () => {
  let db: Database;
  let logger: ReturnType<typeof makeLogger>;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    logger = makeLogger();
  });

  afterEach(() => {
    db.close();
  });

  test('recomputes the hash for a calendar that has events', () => {
    const id = seedCalendar(db, 'Cal');
    seedEvent(db, id, 'Event A');

    // sanity: no hash yet
    recomputeCalendarHashes(db, logger as never);

    const row = db.executeReadOne<{ file_hash: string | null }>(
      'SELECT file_hash FROM imported_calendars WHERE id = ?',
      [id]
    );
    expect(row?.file_hash).toBeTruthy();
    expect(logger.info).toHaveBeenCalled();
  });

  test('is a no-op when there are no calendars', () => {
    recomputeCalendarHashes(db, logger as never);
    expect(logger.info).not.toHaveBeenCalled();
  });

  test('skips a calendar with no events (no hash written)', () => {
    const id = seedCalendar(db, 'Empty');

    recomputeCalendarHashes(db, logger as never);

    const row = db.executeReadOne<{ file_hash: string | null }>(
      'SELECT file_hash FROM imported_calendars WHERE id = ?',
      [id]
    );
    expect(row?.file_hash).toBeNull();
    expect(logger.info).not.toHaveBeenCalled();
  });

  test('warns (does not throw) when the database read fails', () => {
    db.close();
    expect(() => recomputeCalendarHashes(db, logger as never)).not.toThrow();
    expect(logger.warn).toHaveBeenCalled();
  });

  test('is re-exported from the l2-daemon barrels and consumed by the handler', () => {
    expect(typeof fromL2Barrel).toBe('function');
    expect(typeof fromCalendarBarrel).toBe('function');
    expect(typeof registerCalendarHandlers).toBe('function');
  });
});
