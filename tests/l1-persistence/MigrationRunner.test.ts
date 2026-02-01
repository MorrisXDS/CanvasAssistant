import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  Migration,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';
import fs from 'fs';
import path from 'path';

describe('MigrationRunner', () => {
  const TEST_DB_DIR = 'test-db-migrations';
  const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');
  let db: Database;
  let runner: MigrationRunner;

  beforeEach(() => {
    // Clean up any existing test database
    if (fs.existsSync(TEST_DB_DIR)) {
      fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    }

    db = new Database({ dbPath: TEST_DB_PATH });
    db.initialize();
    runner = new MigrationRunner(db);
  });

  afterEach(() => {
    // Only close if db was successfully initialized
    if (db) {
      try {
        db.close();
      } catch {
        // Ignore close errors during cleanup
      }
    }

    // Clean up test database directory
    if (fs.existsSync(TEST_DB_DIR)) {
      fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    }
  });

  describe('Migration Loading', () => {
    it('should load programmatic migrations', () => {
      const migrations: Migration[] = [
        { version: 1, description: 'Test 1', up: 'SELECT 1' },
        { version: 2, description: 'Test 2', up: 'SELECT 1' },
      ];

      runner.loadMigrations(migrations);
      const status = runner.getStatus();

      expect(status.migrations.length).toBe(2);
    });

    it('should sort migrations by version', () => {
      const migrations: Migration[] = [
        { version: 3, description: 'Test 3', up: 'SELECT 1' },
        { version: 1, description: 'Test 1', up: 'SELECT 1' },
        { version: 2, description: 'Test 2', up: 'SELECT 1' },
      ];

      runner.loadMigrations(migrations);
      const status = runner.getStatus();

      expect(status.migrations[0].version).toBe(1);
      expect(status.migrations[1].version).toBe(2);
      expect(status.migrations[2].version).toBe(3);
    });
  });

  describe('Pending Migrations', () => {
    it('should return all migrations when database is fresh', () => {
      const migrations: Migration[] = [
        { version: 1, description: 'Test 1', up: 'SELECT 1' },
        { version: 2, description: 'Test 2', up: 'SELECT 1' },
      ];

      runner.loadMigrations(migrations);
      const pending = runner.getPendingMigrations();

      expect(pending.length).toBe(2);
    });

    it('should exclude already applied migrations', () => {
      const migrations: Migration[] = [
        { version: 1, description: 'Test 1', up: 'SELECT 1' },
        { version: 2, description: 'Test 2', up: 'SELECT 1' },
        { version: 3, description: 'Test 3', up: 'SELECT 1' },
      ];

      db.recordMigration(1, 'Test 1');
      db.recordMigration(2, 'Test 2');

      runner.loadMigrations(migrations);
      const pending = runner.getPendingMigrations();

      expect(pending.length).toBe(1);
      expect(pending[0].version).toBe(3);
    });
  });

  describe('Running Migrations', () => {
    it('should run a single migration', () => {
      const migrations: Migration[] = [
        {
          version: 1,
          description: 'Create test table',
          up: 'CREATE TABLE test_table (id INTEGER PRIMARY KEY)',
        },
      ];

      runner.loadMigrations(migrations);
      const result = runner.runAll();

      expect(result.applied).toBe(1);
      expect(result.errors.length).toBe(0);
      expect(db.getSchemaVersion()).toBe(1);
    });

    it('should run multiple migrations in order', () => {
      const migrations: Migration[] = [
        {
          version: 1,
          description: 'Create users table',
          up: 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)',
        },
        {
          version: 2,
          description: 'Create posts table',
          up: 'CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, FOREIGN KEY(user_id) REFERENCES users(id))',
        },
      ];

      runner.loadMigrations(migrations);
      const result = runner.runAll();

      expect(result.applied).toBe(2);
      expect(db.getSchemaVersion()).toBe(2);

      // Verify tables exist
      const tables = db.executeRead<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users', 'posts')"
      );
      expect(tables.length).toBe(2);
    });

    it('should stop on migration error', () => {
      const migrations: Migration[] = [
        {
          version: 1,
          description: 'Create test table',
          up: 'CREATE TABLE test_table (id INTEGER PRIMARY KEY)',
        },
        {
          version: 2,
          description: 'Invalid SQL',
          up: 'THIS IS NOT VALID SQL',
        },
        {
          version: 3,
          description: 'Another migration',
          up: 'CREATE TABLE another_table (id INTEGER PRIMARY KEY)',
        },
      ];

      runner.loadMigrations(migrations);
      const result = runner.runAll();

      expect(result.applied).toBe(1);
      expect(result.errors.length).toBe(1);
      expect(db.getSchemaVersion()).toBe(1);
    });
  });

  describe('Rollback', () => {
    it('should rollback single migration', () => {
      const migrations: Migration[] = [
        {
          version: 1,
          description: 'Create test table',
          up: 'CREATE TABLE test_table (id INTEGER PRIMARY KEY)',
          down: 'DROP TABLE test_table',
        },
        {
          version: 2,
          description: 'Create another table',
          up: 'CREATE TABLE another_table (id INTEGER PRIMARY KEY)',
          down: 'DROP TABLE another_table',
        },
      ];

      runner.loadMigrations(migrations);
      runner.runAll();

      expect(db.getSchemaVersion()).toBe(2);

      const result = runner.rollbackTo(1);

      expect(result.rolledBack).toBe(1);
      expect(db.getSchemaVersion()).toBe(1);

      // Verify another_table is dropped
      const tables = db.executeRead<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='another_table'"
      );
      expect(tables.length).toBe(0);
    });

    it('should fail rollback if no down SQL provided', () => {
      const migrations: Migration[] = [
        {
          version: 1,
          description: 'Create test table',
          up: 'CREATE TABLE test_table (id INTEGER PRIMARY KEY)',
        },
      ];

      runner.loadMigrations(migrations);
      runner.runAll();

      const result = runner.rollbackTo(0);

      expect(result.rolledBack).toBe(0);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('no rollback SQL');
    });
  });

  describe('Migration Status', () => {
    it('should report correct status after running migrations', () => {
      const migrations: Migration[] = [
        { version: 1, description: 'Test 1', up: 'SELECT 1' },
        { version: 2, description: 'Test 2', up: 'SELECT 1' },
        { version: 3, description: 'Test 3', up: 'SELECT 1' },
      ];

      runner.loadMigrations(migrations);
      runner.runAll();

      const status = runner.getStatus();

      expect(status.currentVersion).toBe(3);
      expect(status.pendingCount).toBe(0);
      expect(status.migrations[0].applied).toBe(true);
      expect(status.migrations[1].applied).toBe(true);
      expect(status.migrations[2].applied).toBe(true);
    });

    it('should show pending migrations correctly', () => {
      const migrations: Migration[] = [
        { version: 1, description: 'Test 1', up: 'SELECT 1' },
        { version: 2, description: 'Test 2', up: 'SELECT 1' },
        { version: 3, description: 'Test 3', up: 'SELECT 1' },
      ];

      // Manually record only first migration
      db.recordMigration(1, 'Test 1');

      runner.loadMigrations(migrations);
      const status = runner.getStatus();

      expect(status.currentVersion).toBe(1);
      expect(status.pendingCount).toBe(2);
      expect(status.migrations[0].applied).toBe(true);
      expect(status.migrations[1].applied).toBe(false);
      expect(status.migrations[2].applied).toBe(false);
    });
  });

  describe('Core Migrations', () => {
    it('should have valid core migrations', () => {
      expect(coreMigrations.length).toBeGreaterThan(0);

      // All migrations should have version, description, and up
      for (const migration of coreMigrations) {
        expect(migration.version).toBeGreaterThan(0);
        expect(migration.description).toBeTruthy();
        expect(migration.up).toBeTruthy();
      }
    });

    it('should have sequential version numbers', () => {
      const versions = coreMigrations.map((m) => m.version);
      for (let i = 0; i < versions.length; i++) {
        expect(versions[i]).toBe(i + 1);
      }
    });

    it('should successfully run all core migrations', () => {
      runner.loadMigrations(coreMigrations);
      const result = runner.runAll();

      expect(result.errors.length).toBe(0);
      expect(result.applied).toBe(coreMigrations.length);
      expect(db.getSchemaVersion()).toBe(coreMigrations.length);
    });

    it('should create all expected tables', () => {
      runner.loadMigrations(coreMigrations);
      runner.runAll();

      const expectedTables = [
        'courses',
        'tasks',
        'calendar_events',
        'notifications',
        'resources',
        'grade_history',
        'user_preferences',
        'sync_metadata',
        'course_policies',
        'course_pages',
        'modules',
        'module_items',
      ];

      for (const tableName of expectedTables) {
        const tables = db.executeRead<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
          [tableName]
        );
        expect(tables.length).toBe(1);
      }
    });

    it('should create performance indexes', () => {
      runner.loadMigrations(coreMigrations);
      runner.runAll();

      const indexes = db.executeRead<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'"
      );

      // Should have at least the indexes we defined (15 indexes in migration 14)
      expect(indexes.length).toBeGreaterThanOrEqual(15);
    });
  });
});
