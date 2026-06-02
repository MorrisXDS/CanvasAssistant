/**
 * ADR-0009 — `disableForeignKeys` migrations. A flagged migration runs with
 * `PRAGMA foreign_keys = OFF` so it can rebuild a table that has child FK
 * references; a `PRAGMA foreign_key_check` afterwards aborts a rebuild that left
 * dangling references; FK enforcement is always restored to ON afterwards.
 */

import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  Migration,
} from '../../src/layers/l1-persistence/MigrationRunner';

/** Rebuild `parent` (drop + recreate, copying rows) — the canonical move that
 *  fails under FK-on because `child` references it. */
const REBUILD_PARENT = `
  CREATE TABLE parent_new (id INTEGER PRIMARY KEY, label TEXT);
  INSERT INTO parent_new (id) SELECT id FROM parent;
  DROP TABLE parent;
  ALTER TABLE parent_new RENAME TO parent;
`;

function seedParentChild(db: Database): void {
  db.exec(`
    CREATE TABLE parent (id INTEGER PRIMARY KEY);
    CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));
    INSERT INTO parent (id) VALUES (1);
    INSERT INTO child (id, parent_id) VALUES (10, 1);
  `);
}

function fkOn(db: Database): number {
  return db.executeRead<{ foreign_keys: number }>('PRAGMA foreign_keys')[0].foreign_keys;
}

describe('MigrationRunner: disableForeignKeys (ADR-0009)', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize(); // sets PRAGMA foreign_keys = ON
    seedParentChild(db);
  });

  afterEach(() => db.close());

  function run(migration: Migration) {
    const runner = new MigrationRunner(db);
    runner.loadMigrations([migration]);
    return runner.runAll();
  }

  test('flagged migration rebuilds a table that has child FK references', () => {
    expect(fkOn(db)).toBe(1);

    const result = run({
      version: 1,
      description: 'rebuild parent (fk off)',
      up: REBUILD_PARENT,
      disableForeignKeys: true,
    });

    expect(result.errors).toEqual([]);
    expect(result.applied).toBe(1);
    // Rebuild succeeded and the child row survived.
    expect(db.executeReadOne('SELECT 1 FROM parent WHERE id = 1')).toBeDefined();
    expect(db.executeReadOne('SELECT 1 FROM child WHERE parent_id = 1')).toBeDefined();
    // FK enforcement restored.
    expect(fkOn(db)).toBe(1);
  });

  test('the SAME rebuild WITHOUT the flag fails under FK-on (control)', () => {
    const result = run({
      version: 1,
      description: 'rebuild parent (fk on — should fail)',
      up: REBUILD_PARENT,
    });

    expect(result.applied).toBe(0);
    expect(result.errors.length).toBe(1);
    // FK still on (never toggled).
    expect(fkOn(db)).toBe(1);
  });

  test('foreign_key_check aborts a rebuild that orphans a child row', () => {
    // Rebuild parent but DROP the referenced row → child(10) is now an orphan.
    const result = run({
      version: 1,
      description: 'bad rebuild (orphans child)',
      up: `
        CREATE TABLE parent_new (id INTEGER PRIMARY KEY, label TEXT);
        -- intentionally do NOT copy id=1
        DROP TABLE parent;
        ALTER TABLE parent_new RENAME TO parent;
      `,
      disableForeignKeys: true,
    });

    expect(result.applied).toBe(0);
    expect(result.errors[0]).toMatch(/foreign-key violation/i);
    // The migration was NOT recorded, and FK is restored to ON.
    expect(fkOn(db)).toBe(1);
  });

  test('FK is restored to ON even when the migration body throws', () => {
    const result = run({
      version: 1,
      description: 'throwing body',
      up: 'THIS IS NOT VALID SQL;',
      disableForeignKeys: true,
    });

    expect(result.applied).toBe(0);
    expect(result.errors.length).toBe(1);
    expect(fkOn(db)).toBe(1);
  });

  test('rollback of a flagged migration runs its down with FK off', () => {
    const runner = new MigrationRunner(db);
    const migration: Migration = {
      version: 1,
      description: 'rebuild parent',
      up: REBUILD_PARENT,
      down: `
        CREATE TABLE parent_old (id INTEGER PRIMARY KEY);
        INSERT INTO parent_old (id) SELECT id FROM parent;
        DROP TABLE parent;
        ALTER TABLE parent_old RENAME TO parent;
      `,
      disableForeignKeys: true,
    };
    runner.loadMigrations([migration]);
    expect(runner.runAll().errors).toEqual([]);

    const rollback = runner.rollbackTo(0);
    expect(rollback.errors).toEqual([]);
    expect(rollback.rolledBack).toBe(1);
    expect(db.executeReadOne('SELECT 1 FROM child WHERE parent_id = 1')).toBeDefined();
    expect(fkOn(db)).toBe(1);
  });
});
