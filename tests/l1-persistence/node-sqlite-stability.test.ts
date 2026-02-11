/**
 * node:sqlite Stability Test — Practice Run
 *
 * Validates every node:sqlite capability the app relies on before
 * committing to migration from better-sqlite3.
 *
 * Requirements:
 * - Node.js >= 22.5.0
 * - May require: NODE_OPTIONS=--experimental-sqlite
 *
 * Run: npx jest --no-coverage tests/l1-persistence/node-sqlite-stability.test.ts
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// ── Runtime availability check ──────────────────────────────────────
// node:sqlite may not be present in the current Node.js version.
// We use dynamic require to gracefully skip all tests if unavailable.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let DatabaseSync: any;
let nodeSqliteAvailable = false;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ({ DatabaseSync } = require('node:sqlite'));
  nodeSqliteAvailable = true;
} catch {
  // node:sqlite not available in this Node.js version
}

// ── Helper Utilities ────────────────────────────────────────────────

/** Manual transaction helper — simulates what we'll build in migration */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transaction<T>(db: any, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** PRAGMA read helper — simulates what we'll build in migration */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pragma(db: any, pragmaStr: string): any {
  return db.prepare(`PRAGMA ${pragmaStr}`).get();
}

/** PRAGMA read-all helper (for PRAGMAs returning multiple rows) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pragmaAll(db: any, pragmaStr: string): any[] {
  return db.prepare(`PRAGMA ${pragmaStr}`).all();
}

// ── Test Suite ──────────────────────────────────────────────────────

const describeIfAvailable = nodeSqliteAvailable ? describe : describe.skip;

describeIfAvailable('node:sqlite Stability Tests', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-sqlite-stability-'));
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  let dbCounter = 0;
  function tmpDbPath(name?: string): string {
    dbCounter++;
    return path.join(tempDir, name ?? `test-${dbCounter}.db`);
  }

  // ── 1. Initialization & Connection ──────────────────────────────

  describe('1. Initialization & Connection', () => {
    it('should create a file-based database and verify file exists', () => {
      const dbPath = tmpDbPath();
      const db = new DatabaseSync(dbPath);
      db.exec('CREATE TABLE t(id INTEGER PRIMARY KEY)');
      expect(fs.existsSync(dbPath)).toBe(true);
      db.close();
    });

    it('should create an in-memory database', () => {
      const db = new DatabaseSync(':memory:');
      db.exec('CREATE TABLE t(id INTEGER PRIMARY KEY)');
      db.prepare('INSERT INTO t (id) VALUES (?)').run(1);
      const row = db.prepare('SELECT id FROM t').get();
      expect(row.id).toBe(1);
      db.close();
    });

    it('should open with readOnly and reject writes', () => {
      const dbPath = tmpDbPath();
      const writeDb = new DatabaseSync(dbPath);
      writeDb.exec('CREATE TABLE t(id INTEGER PRIMARY KEY, val TEXT)');
      writeDb.prepare('INSERT INTO t VALUES (?, ?)').run(1, 'hello');
      writeDb.close();

      const readDb = new DatabaseSync(dbPath, { readOnly: true });
      const row = readDb.prepare('SELECT val FROM t WHERE id = ?').get(1);
      expect(row.val).toBe('hello');

      expect(() => {
        readDb.prepare('INSERT INTO t VALUES (?, ?)').run(2, 'world');
      }).toThrow();
      readDb.close();
    });

    it('should open with { open: false } then .open() manually', () => {
      const dbPath = tmpDbPath();
      const db = new DatabaseSync(dbPath, { open: false });
      expect(db.isOpen).toBe(false);

      db.open();
      expect(db.isOpen).toBe(true);

      db.exec('CREATE TABLE t(id INTEGER PRIMARY KEY)');
      db.close();
    });

    it('should verify .isOpen before and after .close()', () => {
      const db = new DatabaseSync(':memory:');
      expect(db.isOpen).toBe(true);
      db.close();
      expect(db.isOpen).toBe(false);
    });

    it('should expose .location() method', () => {
      const dbPath = tmpDbPath();
      const fileDb = new DatabaseSync(dbPath);

      // .location() was added in Node v22.16.0 — may not exist yet
      if (typeof fileDb.location !== 'function') {
        fileDb.close();
        console.warn('  .location() not available in this Node version — skipping');
        return;
      }

      const location = fileDb.location();
      expect(location).not.toBeNull();
      expect(typeof location).toBe('string');
      fileDb.close();

      const memDb = new DatabaseSync(':memory:');
      const memLoc = memDb.location();
      expect(memLoc === null || memLoc === '').toBe(true);
      memDb.close();
    });

    it('should enforce foreign keys with enableForeignKeyConstraints: true', () => {
      const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
      db.exec(`
        CREATE TABLE parent(id INTEGER PRIMARY KEY);
        CREATE TABLE child(id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));
      `);

      expect(() => {
        db.prepare('INSERT INTO child (id, parent_id) VALUES (?, ?)').run(1, 999);
      }).toThrow();
      db.close();
    });
  });

  // ── 2. PRAGMA Configuration ─────────────────────────────────────

  describe('2. PRAGMA Configuration', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let db: any;

    beforeEach(() => {
      db = new DatabaseSync(tmpDbPath());
    });

    afterEach(() => {
      if (db.isOpen) db.close();
    });

    it('should set and read journal_mode = WAL', () => {
      db.exec('PRAGMA journal_mode = WAL');
      const result = pragma(db, 'journal_mode');
      expect(result.journal_mode).toBe('wal');
    });

    it('should set and read synchronous = NORMAL (value 1)', () => {
      db.exec('PRAGMA synchronous = NORMAL');
      const result = pragma(db, 'synchronous');
      expect(result.synchronous).toBe(1);
    });

    it('should set and read foreign_keys = ON (value 1)', () => {
      db.exec('PRAGMA foreign_keys = ON');
      const result = pragma(db, 'foreign_keys');
      expect(result.foreign_keys).toBe(1);
    });

    it('should set and read cache_size = -64000 (64MB)', () => {
      db.exec('PRAGMA cache_size = -64000');
      const result = pragma(db, 'cache_size');
      expect(result.cache_size).toBe(-64000);
    });

    it('should set and read mmap_size = 268435456 (256MB)', () => {
      db.exec('PRAGMA mmap_size = 268435456');
      const result = pragma(db, 'mmap_size');
      expect(result.mmap_size).toBe(268435456);
    });

    it('should set and read temp_store = MEMORY (value 2)', () => {
      db.exec('PRAGMA temp_store = MEMORY');
      const result = pragma(db, 'temp_store');
      expect(result.temp_store).toBe(2);
    });

    it('should read multiple PRAGMAs in sequence without interference', () => {
      db.exec('PRAGMA journal_mode = WAL');
      db.exec('PRAGMA synchronous = NORMAL');
      db.exec('PRAGMA foreign_keys = ON');
      db.exec('PRAGMA cache_size = -64000');
      db.exec('PRAGMA temp_store = MEMORY');

      expect(pragma(db, 'journal_mode').journal_mode).toBe('wal');
      expect(pragma(db, 'synchronous').synchronous).toBe(1);
      expect(pragma(db, 'foreign_keys').foreign_keys).toBe(1);
      expect(pragma(db, 'cache_size').cache_size).toBe(-64000);
      expect(pragma(db, 'temp_store').temp_store).toBe(2);
    });
  });

  // ── 3. Prepared Statements ──────────────────────────────────────

  describe('3. Prepared Statements', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let db: any;

    beforeEach(() => {
      db = new DatabaseSync(':memory:');
      db.exec(`
        CREATE TABLE items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          value INTEGER,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);
    });

    afterEach(() => {
      if (db.isOpen) db.close();
    });

    it('INSERT with stmt.run() returns { changes, lastInsertRowid }', () => {
      const stmt = db.prepare('INSERT INTO items (name, value) VALUES (?, ?)');
      const result = stmt.run('item1', 100);

      expect(result).toHaveProperty('changes');
      expect(result).toHaveProperty('lastInsertRowid');
      expect(result.changes).toBe(1);
      expect(result.lastInsertRowid).toBe(1);
    });

    it('lastInsertRowid is number (not bigint) by default', () => {
      const stmt = db.prepare('INSERT INTO items (name, value) VALUES (?, ?)');
      const result = stmt.run('item1', 100);

      expect(typeof result.lastInsertRowid).toBe('number');
      expect(typeof result.changes).toBe('number');
    });

    it('SELECT with stmt.get() returns object or undefined', () => {
      db.prepare('INSERT INTO items (name, value) VALUES (?, ?)').run('item1', 100);

      const row = db.prepare('SELECT * FROM items WHERE name = ?').get('item1');
      expect(row).toBeDefined();
      expect(row.name).toBe('item1');
      expect(row.value).toBe(100);
    });

    it('SELECT with stmt.all() returns array of objects', () => {
      db.prepare('INSERT INTO items (name, value) VALUES (?, ?)').run('item1', 100);
      db.prepare('INSERT INTO items (name, value) VALUES (?, ?)').run('item2', 200);

      const rows = db.prepare('SELECT * FROM items ORDER BY id').all();
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBe(2);
      expect(rows[0].name).toBe('item1');
      expect(rows[1].name).toBe('item2');
    });

    it('.get() returns undefined for no matching rows', () => {
      const row = db.prepare('SELECT * FROM items WHERE name = ?').get('nonexistent');
      expect(row).toBeUndefined();
    });

    it('.all() returns [] for no matching rows', () => {
      const rows = db.prepare('SELECT * FROM items WHERE name = ?').all('nonexistent');
      expect(rows).toEqual([]);
    });

    it('UPDATE returns .changes reflecting rows modified', () => {
      db.prepare('INSERT INTO items (name, value) VALUES (?, ?)').run('item1', 100);
      db.prepare('INSERT INTO items (name, value) VALUES (?, ?)').run('item2', 200);

      const result = db.prepare('UPDATE items SET value = ? WHERE name = ?').run(999, 'item1');
      expect(result.changes).toBe(1);

      const row = db.prepare('SELECT value FROM items WHERE name = ?').get('item1');
      expect(row.value).toBe(999);
    });

    it('DELETE returns .changes reflecting rows deleted', () => {
      db.prepare('INSERT INTO items (name, value) VALUES (?, ?)').run('item1', 100);
      db.prepare('INSERT INTO items (name, value) VALUES (?, ?)').run('item2', 200);

      const result = db.prepare('DELETE FROM items WHERE name = ?').run('item1');
      expect(result.changes).toBe(1);

      const rows = db.prepare('SELECT * FROM items').all();
      expect(rows.length).toBe(1);
    });

    it('supports positional ? placeholders', () => {
      const stmt = db.prepare('INSERT INTO items (name, value) VALUES (?, ?)');
      stmt.run('positional', 42);

      const row = db.prepare('SELECT * FROM items WHERE name = ? AND value = ?').get('positional', 42);
      expect(row).toBeDefined();
      expect(row.name).toBe('positional');
    });

    it('supports named parameters with :key syntax', () => {
      const stmt = db.prepare('INSERT INTO items (name, value) VALUES (:name, :value)');
      stmt.run({ ':name': 'named', ':value': 77 });

      const row = db.prepare('SELECT * FROM items WHERE name = :name').get({ ':name': 'named' });
      expect(row).toBeDefined();
      expect(row.value).toBe(77);
    });

    it('reuses prepared statement across multiple runs', () => {
      const stmt = db.prepare('INSERT INTO items (name, value) VALUES (?, ?)');
      stmt.run('a', 1);
      stmt.run('b', 2);
      stmt.run('c', 3);

      const rows = db.prepare('SELECT * FROM items ORDER BY id').all();
      expect(rows.length).toBe(3);
    });

    it('spread pattern stmt.run(...params) matches Database.ts usage', () => {
      const stmt = db.prepare('INSERT INTO items (name, value) VALUES (?, ?)');
      const params: unknown[] = ['spread_test', 55];
      const result = stmt.run(...params);

      expect(result.changes).toBe(1);
      expect(result.lastInsertRowid).toBe(1);

      const readStmt = db.prepare('SELECT * FROM items WHERE name = ?');
      const readParams: unknown[] = ['spread_test'];
      const row = readStmt.get(...readParams);
      expect(row.value).toBe(55);
    });

    it('.iterate() returns lazy iterator over rows', () => {
      db.prepare('INSERT INTO items (name, value) VALUES (?, ?)').run('a', 1);
      db.prepare('INSERT INTO items (name, value) VALUES (?, ?)').run('b', 2);
      db.prepare('INSERT INTO items (name, value) VALUES (?, ?)').run('c', 3);

      const names: string[] = [];
      for (const row of db.prepare('SELECT name FROM items ORDER BY id').iterate()) {
        names.push(row.name);
      }

      expect(names).toEqual(['a', 'b', 'c']);
    });
  });

  // ── 4. Raw SQL Execution ────────────────────────────────────────

  describe('4. Raw SQL Execution', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let db: any;

    beforeEach(() => {
      db = new DatabaseSync(':memory:');
    });

    afterEach(() => {
      if (db.isOpen) db.close();
    });

    it('exec() creates table with constraints (NOT NULL, DEFAULT, UNIQUE)', () => {
      db.exec(`
        CREATE TABLE test (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          code TEXT UNIQUE,
          status INTEGER DEFAULT 0
        )
      `);

      const table = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='test'"
      ).get();
      expect(table.name).toBe('test');
    });

    it('multi-statement exec() (CREATE TABLE + CREATE INDEX)', () => {
      db.exec(`
        CREATE TABLE items (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          category TEXT
        );
        CREATE INDEX idx_items_category ON items(category);
      `);

      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='items'"
      ).all();
      expect(tables.length).toBe(1);

      const indexes = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_items_category'"
      ).all();
      expect(indexes.length).toBe(1);
    });

    it('exec() handles ALTER TABLE', () => {
      db.exec('CREATE TABLE t(id INTEGER PRIMARY KEY, name TEXT)');
      db.exec('ALTER TABLE t ADD COLUMN email TEXT');

      db.prepare('INSERT INTO t (id, name, email) VALUES (?, ?, ?)').run(1, 'test', 'a@b.com');
      const row = db.prepare('SELECT email FROM t WHERE id = 1').get();
      expect(row.email).toBe('a@b.com');
    });

    it('exec() returns void (no results)', () => {
      const result = db.exec('CREATE TABLE t(id INTEGER PRIMARY KEY)');
      expect(result).toBeUndefined();
    });

    it('exec() with INSERT/UPDATE for migrations', () => {
      db.exec(`
        CREATE TABLE schema_version (
          version INTEGER PRIMARY KEY,
          applied_at TEXT DEFAULT (datetime('now')),
          description TEXT
        )
      `);

      db.exec("INSERT INTO schema_version (version, description) VALUES (1, 'initial')");
      db.exec("UPDATE schema_version SET description = 'updated' WHERE version = 1");

      const row = db.prepare('SELECT description FROM schema_version WHERE version = 1').get();
      expect(row.description).toBe('updated');
    });
  });

  // ── 5. Transactions ─────────────────────────────────────────────

  describe('5. Transactions', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let db: any;

    beforeEach(() => {
      db = new DatabaseSync(':memory:');
      db.exec('CREATE TABLE t(id INTEGER PRIMARY KEY, val TEXT)');
    });

    afterEach(() => {
      if (db.isOpen) db.close();
    });

    it('commit: BEGIN → writes → COMMIT → data persists', () => {
      db.exec('BEGIN');
      db.prepare('INSERT INTO t VALUES (?, ?)').run(1, 'a');
      db.prepare('INSERT INTO t VALUES (?, ?)').run(2, 'b');
      db.exec('COMMIT');

      const rows = db.prepare('SELECT * FROM t ORDER BY id').all();
      expect(rows.length).toBe(2);
    });

    it('rollback: BEGIN → writes → ROLLBACK → data reverted', () => {
      db.exec('BEGIN');
      db.prepare('INSERT INTO t VALUES (?, ?)').run(1, 'a');
      db.exec('ROLLBACK');

      const rows = db.prepare('SELECT * FROM t').all();
      expect(rows.length).toBe(0);
    });

    it('.isTransaction reflects transaction state', () => {
      // .isTransaction was added in Node v22.16.0 — may not exist yet
      if (db.isTransaction === undefined) {
        console.warn('  .isTransaction not available in this Node version — skipping');
        return;
      }

      expect(db.isTransaction).toBe(false);

      db.exec('BEGIN');
      expect(db.isTransaction).toBe(true);

      db.exec('COMMIT');
      expect(db.isTransaction).toBe(false);
    });

    it('SAVEPOINT/RELEASE for nested transactions', () => {
      db.exec('BEGIN');
      db.prepare('INSERT INTO t VALUES (?, ?)').run(1, 'outer');

      db.exec('SAVEPOINT inner_sp');
      db.prepare('INSERT INTO t VALUES (?, ?)').run(2, 'inner');
      db.exec('RELEASE inner_sp');

      db.exec('COMMIT');

      const rows = db.prepare('SELECT * FROM t ORDER BY id').all();
      expect(rows.length).toBe(2);
      expect(rows[0].val).toBe('outer');
      expect(rows[1].val).toBe('inner');
    });

    it('error during transaction → rollback → DB consistent', () => {
      db.prepare('INSERT INTO t VALUES (?, ?)').run(1, 'safe');

      try {
        transaction(db, () => {
          db.prepare('INSERT INTO t VALUES (?, ?)').run(2, 'risky');
          // Duplicate primary key → throws
          db.prepare('INSERT INTO t VALUES (?, ?)').run(1, 'duplicate');
        });
      } catch {
        // Expected
      }

      const rows = db.prepare('SELECT * FROM t').all();
      expect(rows.length).toBe(1);
      expect(rows[0].val).toBe('safe');
    });

    it('BEGIN IMMEDIATE for exclusive write lock', () => {
      db.exec('BEGIN IMMEDIATE');

      db.prepare('INSERT INTO t VALUES (?, ?)').run(1, 'exclusive');
      db.exec('COMMIT');

      const row = db.prepare('SELECT val FROM t WHERE id = 1').get();
      expect(row.val).toBe('exclusive');
    });
  });

  // ── 6. WAL Mode Operations ──────────────────────────────────────

  describe('6. WAL Mode Operations', () => {
    it('PRAGMA wal_checkpoint(TRUNCATE) succeeds', () => {
      const dbPath = tmpDbPath();
      const db = new DatabaseSync(dbPath);
      db.exec('PRAGMA journal_mode = WAL');
      db.exec('CREATE TABLE t(id INTEGER PRIMARY KEY, val TEXT)');
      db.prepare('INSERT INTO t VALUES (?, ?)').run(1, 'test');

      const result = pragma(db, 'wal_checkpoint(TRUNCATE)');
      expect(result).toBeDefined();
      expect(result).toHaveProperty('busy');
      expect(result).toHaveProperty('log');
      expect(result).toHaveProperty('checkpointed');
      db.close();
    });

    it('WAL + SHM files created after first write in WAL mode', () => {
      const dbPath = tmpDbPath();
      const db = new DatabaseSync(dbPath);
      db.exec('PRAGMA journal_mode = WAL');
      db.exec('CREATE TABLE t(id INTEGER PRIMARY KEY)');
      db.prepare('INSERT INTO t VALUES (?)').run(1);

      expect(fs.existsSync(`${dbPath}-wal`)).toBe(true);
      expect(fs.existsSync(`${dbPath}-shm`)).toBe(true);
      db.close();
    });

    it('fs.statSync() on WAL file works (for getDatabaseStats)', () => {
      const dbPath = tmpDbPath();
      const db = new DatabaseSync(dbPath);
      db.exec('PRAGMA journal_mode = WAL');
      db.exec('CREATE TABLE t(id INTEGER PRIMARY KEY, data TEXT)');
      db.prepare('INSERT INTO t VALUES (?, ?)').run(1, 'x'.repeat(1000));

      const walPath = `${dbPath}-wal`;
      expect(fs.existsSync(walPath)).toBe(true);

      const stats = fs.statSync(walPath);
      expect(stats.size).toBeGreaterThan(0);
      db.close();
    });

    it('checkpoint reduces WAL file size', () => {
      const dbPath = tmpDbPath();
      const db = new DatabaseSync(dbPath);
      db.exec('PRAGMA journal_mode = WAL');
      db.exec('CREATE TABLE t(id INTEGER PRIMARY KEY, data TEXT)');

      const stmt = db.prepare('INSERT INTO t VALUES (?, ?)');
      for (let i = 1; i <= 100; i++) {
        stmt.run(i, 'x'.repeat(1000));
      }

      const walPath = `${dbPath}-wal`;
      const sizeBefore = fs.statSync(walPath).size;
      expect(sizeBefore).toBeGreaterThan(0);

      pragma(db, 'wal_checkpoint(TRUNCATE)');
      const sizeAfter = fs.statSync(walPath).size;
      expect(sizeAfter).toBeLessThan(sizeBefore);
      db.close();
    });

    it('PRAGMA wal_autocheckpoint setting', () => {
      const db = new DatabaseSync(':memory:');
      db.exec('PRAGMA journal_mode = WAL');
      db.exec('PRAGMA wal_autocheckpoint = 500');

      const result = pragma(db, 'wal_autocheckpoint');
      expect(result.wal_autocheckpoint).toBe(500);
      db.close();
    });
  });

  // ── 7. Integrity Checks ─────────────────────────────────────────

  describe('7. Integrity Checks', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let db: any;

    beforeEach(() => {
      db = new DatabaseSync(':memory:');
      db.exec('CREATE TABLE t(id INTEGER PRIMARY KEY, val TEXT)');
      db.prepare('INSERT INTO t VALUES (?, ?)').run(1, 'test');
    });

    afterEach(() => {
      if (db.isOpen) db.close();
    });

    it('PRAGMA quick_check returns ok for healthy DB', () => {
      const results = pragmaAll(db, 'quick_check');
      expect(results.length).toBe(1);
      expect(results[0].quick_check).toBe('ok');
    });

    it('PRAGMA integrity_check returns ok for healthy DB', () => {
      const results = pragmaAll(db, 'integrity_check');
      expect(results.length).toBe(1);
      expect(results[0].integrity_check).toBe('ok');
    });

    it('result format: single { integrity_check: "ok" } object', () => {
      const result = pragma(db, 'integrity_check');
      expect(result).toEqual({ integrity_check: 'ok' });
    });
  });

  // ── 8. Data Types & Edge Cases ──────────────────────────────────

  describe('8. Data Types & Edge Cases', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let db: any;

    beforeEach(() => {
      db = new DatabaseSync(':memory:');
      db.exec(`
        CREATE TABLE types (
          id INTEGER PRIMARY KEY,
          int_val INTEGER,
          real_val REAL,
          text_val TEXT,
          blob_val BLOB
        )
      `);
    });

    afterEach(() => {
      if (db.isOpen) db.close();
    });

    it('NULL → JavaScript null', () => {
      db.prepare('INSERT INTO types (id, int_val) VALUES (?, ?)').run(1, null);
      const row = db.prepare('SELECT int_val FROM types WHERE id = 1').get();
      expect(row.int_val).toBeNull();
    });

    it('INTEGER → JavaScript number (default, not bigint)', () => {
      db.prepare('INSERT INTO types (id, int_val) VALUES (?, ?)').run(1, 42);
      const row = db.prepare('SELECT int_val FROM types WHERE id = 1').get();
      expect(row.int_val).toBe(42);
      expect(typeof row.int_val).toBe('number');
    });

    it('REAL → JavaScript number with decimal precision', () => {
      db.prepare('INSERT INTO types (id, real_val) VALUES (?, ?)').run(1, 3.14159);
      const row = db.prepare('SELECT real_val FROM types WHERE id = 1').get();
      expect(row.real_val).toBeCloseTo(3.14159, 5);
      expect(typeof row.real_val).toBe('number');
    });

    it('TEXT with UTF-8 (emoji, CJK, Cyrillic)', () => {
      const testStrings = [
        '\u{1F393}\u{1F4DA}\u2705',   // emoji
        '\u4F60\u597D\u4E16\u754C',   // CJK
        '\u041F\u0440\u0438\u0432\u0435\u0442', // Cyrillic
      ];

      for (let i = 0; i < testStrings.length; i++) {
        db.prepare('INSERT INTO types (id, text_val) VALUES (?, ?)').run(i + 1, testStrings[i]);
      }

      for (let i = 0; i < testStrings.length; i++) {
        const row = db.prepare('SELECT text_val FROM types WHERE id = ?').get(i + 1);
        expect(row.text_val).toBe(testStrings[i]);
      }
    });

    it('BLOB → Uint8Array round-trip', () => {
      const original = new Uint8Array([0, 1, 2, 255, 128, 64]);
      db.prepare('INSERT INTO types (id, blob_val) VALUES (?, ?)').run(1, original);

      const row = db.prepare('SELECT blob_val FROM types WHERE id = 1').get();
      expect(row.blob_val).toBeInstanceOf(Uint8Array);
      expect(Buffer.from(row.blob_val)).toEqual(Buffer.from(original));
    });

    it('empty string vs NULL distinction', () => {
      db.prepare('INSERT INTO types (id, text_val) VALUES (?, ?)').run(1, '');
      db.prepare('INSERT INTO types (id, text_val) VALUES (?, ?)').run(2, null);

      const emptyRow = db.prepare('SELECT text_val FROM types WHERE id = 1').get();
      const nullRow = db.prepare('SELECT text_val FROM types WHERE id = 2').get();

      expect(emptyRow.text_val).toBe('');
      expect(nullRow.text_val).toBeNull();
      expect(emptyRow.text_val).not.toEqual(nullRow.text_val);
    });

    it('boolean as INTEGER 0/1', () => {
      db.prepare('INSERT INTO types (id, int_val) VALUES (?, ?)').run(1, 1);
      db.prepare('INSERT INTO types (id, int_val) VALUES (?, ?)').run(2, 0);

      const trueRow = db.prepare('SELECT int_val FROM types WHERE id = 1').get();
      const falseRow = db.prepare('SELECT int_val FROM types WHERE id = 2').get();

      expect(trueRow.int_val).toBe(1);
      expect(falseRow.int_val).toBe(0);
      expect(Boolean(trueRow.int_val)).toBe(true);
      expect(Boolean(falseRow.int_val)).toBe(false);
    });

    it('ISO 8601 datetime strings', () => {
      const now = '2024-01-15T10:30:00.000Z';
      db.prepare('INSERT INTO types (id, text_val) VALUES (?, ?)').run(1, now);

      const row = db.prepare('SELECT text_val FROM types WHERE id = 1').get();
      expect(row.text_val).toBe(now);
      expect(new Date(row.text_val).toISOString()).toBe(now);
    });

    it('large TEXT (>1MB)', () => {
      const largeText = 'A'.repeat(1_500_000);
      db.prepare('INSERT INTO types (id, text_val) VALUES (?, ?)').run(1, largeText);

      const row = db.prepare('SELECT text_val FROM types WHERE id = 1').get();
      expect(row.text_val.length).toBe(1_500_000);
      expect(row.text_val).toBe(largeText);
    });

    it('large BLOB (>1MB)', () => {
      const largeBlob = new Uint8Array(1_500_000);
      for (let i = 0; i < largeBlob.length; i++) largeBlob[i] = i % 256;

      db.prepare('INSERT INTO types (id, blob_val) VALUES (?, ?)').run(1, largeBlob);

      const row = db.prepare('SELECT blob_val FROM types WHERE id = 1').get();
      expect(row.blob_val.length).toBe(1_500_000);
      expect(Buffer.from(row.blob_val)).toEqual(Buffer.from(largeBlob));
    });
  });

  // ── 9. Error Handling ───────────────────────────────────────────

  describe('9. Error Handling', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let db: any;

    beforeEach(() => {
      db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
      db.exec(`
        CREATE TABLE parent(id INTEGER PRIMARY KEY);
        CREATE TABLE child(
          id INTEGER PRIMARY KEY,
          parent_id INTEGER NOT NULL REFERENCES parent(id),
          name TEXT NOT NULL UNIQUE
        )
      `);
    });

    afterEach(() => {
      if (db.isOpen) db.close();
    });

    it('SQL syntax error throws with message', () => {
      expect(() => {
        db.exec('SELEKT * FORM nowhere');
      }).toThrow();
    });

    it('UNIQUE constraint violation throws', () => {
      db.prepare('INSERT INTO parent VALUES (?)').run(1);
      db.prepare('INSERT INTO child (id, parent_id, name) VALUES (?, ?, ?)').run(1, 1, 'unique_name');

      expect(() => {
        db.prepare('INSERT INTO child (id, parent_id, name) VALUES (?, ?, ?)').run(2, 1, 'unique_name');
      }).toThrow();
    });

    it('FK violation throws', () => {
      expect(() => {
        db.prepare('INSERT INTO child (id, parent_id, name) VALUES (?, ?, ?)').run(1, 999, 'orphan');
      }).toThrow();
    });

    it('NOT NULL violation throws', () => {
      db.prepare('INSERT INTO parent VALUES (?)').run(1);

      expect(() => {
        db.prepare('INSERT INTO child (id, parent_id, name) VALUES (?, ?, ?)').run(1, 1, null);
      }).toThrow();
    });

    it('operations on closed database throw', () => {
      const tmpDb = new DatabaseSync(':memory:');
      tmpDb.close();

      expect(() => {
        tmpDb.exec('SELECT 1');
      }).toThrow();
    });

    it('parameter count mismatch throws', () => {
      db.prepare('INSERT INTO parent VALUES (?)').run(1);

      expect(() => {
        // SQL expects 3 params, provide only 1
        db.prepare('INSERT INTO child (id, parent_id, name) VALUES (?, ?, ?)').run(1);
      }).toThrow();
    });

    it('read-only DB rejects writes', () => {
      const dbPath = tmpDbPath();
      const writeDb = new DatabaseSync(dbPath);
      writeDb.exec('CREATE TABLE t(id INTEGER PRIMARY KEY)');
      writeDb.close();

      const readDb = new DatabaseSync(dbPath, { readOnly: true });
      expect(() => {
        readDb.prepare('INSERT INTO t VALUES (?)').run(1);
      }).toThrow();
      readDb.close();
    });

    it('busy timeout option is accepted without error', () => {
      const dbPath = tmpDbPath();
      const db1 = new DatabaseSync(dbPath, { timeout: 5000 });
      db1.exec('CREATE TABLE t(id INTEGER PRIMARY KEY)');
      expect(db1.isOpen).toBe(true);
      db1.close();
    });
  });

  // ── 10. Performance Benchmarks ──────────────────────────────────

  describe('10. Performance Benchmarks', () => {
    it('1000 INSERTs in transaction: measure ops/sec', () => {
      const db = new DatabaseSync(':memory:');
      db.exec('CREATE TABLE perf(id INTEGER PRIMARY KEY, val TEXT)');

      const stmt = db.prepare('INSERT INTO perf VALUES (?, ?)');
      const start = performance.now();

      transaction(db, () => {
        for (let i = 1; i <= 1000; i++) {
          stmt.run(i, `value_${i}`);
        }
      });

      const elapsed = performance.now() - start;
      const opsPerSec = Math.round(1000 / (elapsed / 1000));

      console.log(`  INSERT: ${elapsed.toFixed(2)}ms for 1000 rows (${opsPerSec.toLocaleString()} ops/sec)`);
      expect(elapsed).toBeLessThan(5000);

      const count = db.prepare('SELECT COUNT(*) as cnt FROM perf').get();
      expect(count.cnt).toBe(1000);
      db.close();
    });

    it('1000 SELECTs: measure ops/sec', () => {
      const db = new DatabaseSync(':memory:');
      db.exec('CREATE TABLE perf(id INTEGER PRIMARY KEY, val TEXT)');

      const insertStmt = db.prepare('INSERT INTO perf VALUES (?, ?)');
      transaction(db, () => {
        for (let i = 1; i <= 1000; i++) {
          insertStmt.run(i, `value_${i}`);
        }
      });

      const selectStmt = db.prepare('SELECT * FROM perf WHERE id = ?');
      const start = performance.now();

      for (let i = 1; i <= 1000; i++) {
        selectStmt.get(i);
      }

      const elapsed = performance.now() - start;
      const opsPerSec = Math.round(1000 / (elapsed / 1000));

      console.log(`  SELECT: ${elapsed.toFixed(2)}ms for 1000 reads (${opsPerSec.toLocaleString()} ops/sec)`);
      expect(elapsed).toBeLessThan(5000);
      db.close();
    });

    it('single write latency < 10ms', () => {
      const db = new DatabaseSync(':memory:');
      db.exec('PRAGMA journal_mode = WAL');
      db.exec('PRAGMA synchronous = NORMAL');
      db.exec('CREATE TABLE perf(id INTEGER PRIMARY KEY, val TEXT)');

      const stmt = db.prepare('INSERT INTO perf VALUES (?, ?)');

      // Warm up
      stmt.run(0, 'warmup');
      db.prepare('DELETE FROM perf').run();

      const start = performance.now();
      stmt.run(1, 'test');
      const elapsed = performance.now() - start;

      console.log(`  Single write latency: ${elapsed.toFixed(3)}ms`);
      expect(elapsed).toBeLessThan(10);
      db.close();
    });

    it('transaction overhead: BEGIN/COMMIT cost', () => {
      const db = new DatabaseSync(':memory:');
      db.exec('CREATE TABLE perf(id INTEGER PRIMARY KEY, val TEXT)');

      const stmt = db.prepare('INSERT INTO perf VALUES (?, ?)');

      // Without explicit transaction (auto-commit per statement)
      const startWithout = performance.now();
      for (let i = 1; i <= 100; i++) {
        stmt.run(i, `val_${i}`);
      }
      const elapsedWithout = performance.now() - startWithout;

      db.exec('DELETE FROM perf');

      // With explicit transaction
      const startWith = performance.now();
      transaction(db, () => {
        for (let i = 1; i <= 100; i++) {
          stmt.run(i, `val_${i}`);
        }
      });
      const elapsedWith = performance.now() - startWith;

      console.log(`  100 writes without txn: ${elapsedWithout.toFixed(2)}ms`);
      console.log(`  100 writes with txn:    ${elapsedWith.toFixed(2)}ms`);
      console.log(`  Speedup: ${(elapsedWithout / elapsedWith).toFixed(1)}x`);

      expect(elapsedWith).toBeLessThan(5000);
      db.close();
    });

    it('bulk read: .all() vs .iterate() for 5000 rows', () => {
      const db = new DatabaseSync(':memory:');
      db.exec('CREATE TABLE perf(id INTEGER PRIMARY KEY, val TEXT)');

      const insertStmt = db.prepare('INSERT INTO perf VALUES (?, ?)');
      transaction(db, () => {
        for (let i = 1; i <= 5000; i++) {
          insertStmt.run(i, `value_${i}`);
        }
      });

      // .all()
      const startAll = performance.now();
      const allRows = db.prepare('SELECT * FROM perf').all();
      const elapsedAll = performance.now() - startAll;

      // .iterate()
      const startIter = performance.now();
      let iterCount = 0;
      for (const _row of db.prepare('SELECT * FROM perf').iterate()) {
        iterCount++;
      }
      const elapsedIter = performance.now() - startIter;

      console.log(`  .all() 5000 rows:     ${elapsedAll.toFixed(2)}ms`);
      console.log(`  .iterate() 5000 rows: ${elapsedIter.toFixed(2)}ms`);

      expect(allRows.length).toBe(5000);
      expect(iterCount).toBe(5000);
      db.close();
    });
  });
});

// ── Skip notice when node:sqlite is unavailable ─────────────────────

if (!nodeSqliteAvailable) {
  describe('node:sqlite', () => {
    it('is not available — all stability tests skipped', () => {
      console.warn(
        '\n  node:sqlite is not available in this Node.js version.\n' +
          '  Requires Node.js >= 22.5.0.\n' +
          '  You may need: NODE_OPTIONS=--experimental-sqlite\n'
      );
      expect(nodeSqliteAvailable).toBe(false);
    });
  });
}
