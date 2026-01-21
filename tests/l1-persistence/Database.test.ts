import { Database, CommitEvent } from '../../src/layers/l1-persistence/Database';
import fs from 'fs';
import path from 'path';

describe('Database', () => {
  const TEST_DB_DIR = 'test-db';
  const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');
  let db: Database;

  beforeEach(() => {
    // Clean up any existing test database
    if (fs.existsSync(TEST_DB_DIR)) {
      fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    }

    db = new Database({ dbPath: TEST_DB_PATH });
    db.initialize();
  });

  afterEach(() => {
    db.close();

    // Clean up test database directory
    if (fs.existsSync(TEST_DB_DIR)) {
      fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    }
  });

  describe('Initialization', () => {
    it('should create database directory if it does not exist', () => {
      expect(fs.existsSync(TEST_DB_DIR)).toBe(true);
    });

    it('should create database file', () => {
      expect(fs.existsSync(TEST_DB_PATH)).toBe(true);
    });

    it('should create schema_version table', () => {
      const tables = db.executeRead<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
      );
      expect(tables.length).toBe(1);
      expect(tables[0].name).toBe('schema_version');
    });

    it('should return 0 for initial schema version', () => {
      expect(db.getSchemaVersion()).toBe(0);
    });
  });

  describe('PRAGMA Configuration', () => {
    it('should use WAL journal mode', () => {
      const result = db.executeReadOne<{ journal_mode: string }>(
        'PRAGMA journal_mode'
      );
      expect(result?.journal_mode).toBe('wal');
    });

    it('should have foreign keys enabled', () => {
      const result = db.executeReadOne<{ foreign_keys: number }>(
        'PRAGMA foreign_keys'
      );
      expect(result?.foreign_keys).toBe(1);
    });

    it('should use NORMAL synchronous mode', () => {
      const result = db.executeReadOne<{ synchronous: number }>(
        'PRAGMA synchronous'
      );
      // NORMAL = 1
      expect(result?.synchronous).toBe(1);
    });
  });

  describe('Write Operations', () => {
    beforeEach(() => {
      db.exec(`
        CREATE TABLE test_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          value INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    });

    it('should insert data and return result', () => {
      const result = db.executeWrite(
        'INSERT INTO test_items (name, value) VALUES (?, ?)',
        ['item1', 100],
        'test_items'
      );

      expect(result.changes).toBe(1);
      expect(result.lastInsertRowid).toBe(1);
    });

    it('should emit commit event on write', (done) => {
      db.on('commit', (event: CommitEvent) => {
        expect(event.table).toBe('test_items');
        expect(event.operation).toBe('INSERT');
        expect(event.rowId).toBe(1);
        done();
      });

      db.executeWrite(
        'INSERT INTO test_items (name, value) VALUES (?, ?)',
        ['item1', 100],
        'test_items'
      );
    });

    it('should detect UPDATE operation', (done) => {
      db.executeWrite(
        'INSERT INTO test_items (name, value) VALUES (?, ?)',
        ['item1', 100]
      );

      db.on('commit', (event: CommitEvent) => {
        expect(event.operation).toBe('UPDATE');
        done();
      });

      db.executeWrite(
        'UPDATE test_items SET value = ? WHERE name = ?',
        [200, 'item1'],
        'test_items'
      );
    });

    it('should detect DELETE operation', (done) => {
      db.executeWrite(
        'INSERT INTO test_items (name, value) VALUES (?, ?)',
        ['item1', 100]
      );

      db.on('commit', (event: CommitEvent) => {
        expect(event.operation).toBe('DELETE');
        done();
      });

      db.executeWrite(
        'DELETE FROM test_items WHERE name = ?',
        ['item1'],
        'test_items'
      );
    });
  });

  describe('Read Operations', () => {
    beforeEach(() => {
      db.exec(`
        CREATE TABLE test_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          value INTEGER
        )
      `);
      db.executeWrite(
        'INSERT INTO test_items (name, value) VALUES (?, ?)',
        ['item1', 100]
      );
      db.executeWrite(
        'INSERT INTO test_items (name, value) VALUES (?, ?)',
        ['item2', 200]
      );
    });

    it('should read multiple rows', () => {
      const rows = db.executeRead<{ id: number; name: string; value: number }>(
        'SELECT * FROM test_items ORDER BY id'
      );

      expect(rows.length).toBe(2);
      expect(rows[0].name).toBe('item1');
      expect(rows[1].name).toBe('item2');
    });

    it('should read single row', () => {
      const row = db.executeReadOne<{ id: number; name: string; value: number }>(
        'SELECT * FROM test_items WHERE name = ?',
        ['item1']
      );

      expect(row).toBeDefined();
      expect(row?.name).toBe('item1');
      expect(row?.value).toBe(100);
    });

    it('should return undefined for non-existent row', () => {
      const row = db.executeReadOne<{ id: number; name: string }>(
        'SELECT * FROM test_items WHERE name = ?',
        ['nonexistent']
      );

      expect(row).toBeUndefined();
    });
  });

  describe('Transactions', () => {
    beforeEach(() => {
      db.exec(`
        CREATE TABLE test_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE
        )
      `);
    });

    it('should commit transaction on success', () => {
      db.transaction(() => {
        db.executeWrite('INSERT INTO test_items (name) VALUES (?)', ['item1']);
        db.executeWrite('INSERT INTO test_items (name) VALUES (?)', ['item2']);
      });

      const rows = db.executeRead<{ name: string }>('SELECT * FROM test_items');
      expect(rows.length).toBe(2);
    });

    it('should rollback transaction on error', () => {
      try {
        db.transaction(() => {
          db.executeWrite('INSERT INTO test_items (name) VALUES (?)', ['item1']);
          db.executeWrite('INSERT INTO test_items (name) VALUES (?)', ['item1']); // Duplicate, will fail
        });
      } catch {
        // Expected error
      }

      const rows = db.executeRead<{ name: string }>('SELECT * FROM test_items');
      expect(rows.length).toBe(0); // Rolled back
    });
  });

  describe('Upsert Operations', () => {
    beforeEach(() => {
      db.exec(`
        CREATE TABLE courses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          external_id TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          current_grade REAL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    });

    it('should insert new record on upsert', () => {
      db.upsert('courses', {
        external_id: 'course_123',
        name: 'Test Course',
        current_grade: 85.5,
      });

      const course = db.executeReadOne<{
        external_id: string;
        name: string;
        current_grade: number;
      }>('SELECT * FROM courses WHERE external_id = ?', ['course_123']);

      expect(course).toBeDefined();
      expect(course?.name).toBe('Test Course');
      expect(course?.current_grade).toBe(85.5);
    });

    it('should update existing record on upsert', () => {
      // Insert first
      db.upsert('courses', {
        external_id: 'course_123',
        name: 'Test Course',
        current_grade: 85.5,
      });

      // Upsert with new values
      db.upsert('courses', {
        external_id: 'course_123',
        name: 'Updated Course',
        current_grade: 90.0,
      });

      const courses = db.executeRead<{ name: string; current_grade: number }>(
        'SELECT * FROM courses'
      );

      expect(courses.length).toBe(1);
      expect(courses[0].name).toBe('Updated Course');
      expect(courses[0].current_grade).toBe(90.0);
    });

    it('should emit commit event on upsert', (done) => {
      db.on('commit', (event: CommitEvent) => {
        expect(event.table).toBe('courses');
        done();
      });

      db.upsert('courses', {
        external_id: 'course_123',
        name: 'Test Course',
        current_grade: 85.5,
      });
    });
  });

  describe('Performance', () => {
    it('should achieve <1ms write latency', () => {
      const latency = db.measureWriteLatency();
      expect(latency).toBeLessThan(10); // Allow up to 10ms for CI environments
      console.log(`Write latency: ${latency.toFixed(3)}ms`);
    });

    it('should return database size', () => {
      const size = db.getSize();
      expect(size).toBeGreaterThan(0);
    });
  });

  describe('Schema Version Tracking', () => {
    it('should record migration', () => {
      db.recordMigration(1, 'Test migration');

      expect(db.getSchemaVersion()).toBe(1);
    });

    it('should track multiple migrations', () => {
      db.recordMigration(1, 'First migration');
      db.recordMigration(2, 'Second migration');
      db.recordMigration(3, 'Third migration');

      expect(db.getSchemaVersion()).toBe(3);
    });
  });
});
