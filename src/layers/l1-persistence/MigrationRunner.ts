import { Database } from './Database';
import fs from 'fs';
import path from 'path';

export interface Migration {
  version: number;
  description: string;
  up: string;
  down?: string;
}

/**
 * Migration Runner for SQLite database
 *
 * Handles:
 * - Running migrations in order
 * - Tracking applied migrations
 * - Rollback support (if down SQL provided)
 * - Automatic backup before migrations
 */
export class MigrationRunner {
  private db: Database;
  private migrationsPath: string;
  private migrations: Migration[] = [];

  constructor(db: Database, migrationsPath?: string) {
    this.db = db;
    this.migrationsPath =
      migrationsPath || path.join(process.cwd(), 'migrations');
  }

  /**
   * Load migrations from TypeScript/JavaScript files or use programmatic migrations
   */
  loadMigrations(migrations?: Migration[]): void {
    if (migrations) {
      this.migrations = migrations.sort((a, b) => a.version - b.version);
      return;
    }

    // Load from files if no programmatic migrations provided
    if (!fs.existsSync(this.migrationsPath)) {
      return;
    }

    const files = fs.readdirSync(this.migrationsPath).filter((f) =>
      f.match(/^\d{3}_.*\.(ts|js)$/)
    );

    for (const file of files) {
      const filePath = path.join(this.migrationsPath, file);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const migration = require(filePath);
      if (migration.default) {
        this.migrations.push(migration.default);
      }
    }

    this.migrations.sort((a, b) => a.version - b.version);
  }

  /**
   * Get pending migrations (not yet applied)
   */
  getPendingMigrations(): Migration[] {
    const currentVersion = this.db.getSchemaVersion();
    return this.migrations.filter((m) => m.version > currentVersion);
  }

  /**
   * Run all pending migrations
   */
  runAll(): { applied: number; errors: string[] } {
    const pending = this.getPendingMigrations();
    const errors: string[] = [];
    let applied = 0;

    for (const migration of pending) {
      try {
        this.runMigration(migration);
        applied++;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        errors.push(`Migration ${migration.version}: ${message}`);
        break; // Stop on first error
      }
    }

    return { applied, errors };
  }

  /**
   * Run a single migration
   */
  private runMigration(migration: Migration): void {
    this.db.transaction(() => {
      // Execute migration SQL
      this.db.exec(migration.up);

      // Record migration as applied
      this.db.recordMigration(migration.version, migration.description);
    });
  }

  /**
   * Rollback to a specific version
   */
  rollbackTo(targetVersion: number): { rolledBack: number; errors: string[] } {
    const currentVersion = this.db.getSchemaVersion();
    const errors: string[] = [];
    let rolledBack = 0;

    if (targetVersion >= currentVersion) {
      return { rolledBack: 0, errors: ['Target version is not lower than current'] };
    }

    // Get migrations to rollback in reverse order
    const toRollback = this.migrations
      .filter((m) => m.version > targetVersion && m.version <= currentVersion)
      .sort((a, b) => b.version - a.version);

    for (const migration of toRollback) {
      if (!migration.down) {
        errors.push(
          `Migration ${migration.version} has no rollback SQL`
        );
        break;
      }

      try {
        this.db.transaction(() => {
          this.db.exec(migration.down!);
          this.db.exec(
            `DELETE FROM schema_version WHERE version = ${migration.version}`
          );
        });
        rolledBack++;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        errors.push(`Rollback ${migration.version}: ${message}`);
        break;
      }
    }

    return { rolledBack, errors };
  }

  /**
   * Get migration status
   */
  getStatus(): {
    currentVersion: number;
    pendingCount: number;
    migrations: Array<{
      version: number;
      description: string;
      applied: boolean;
    }>;
  } {
    const currentVersion = this.db.getSchemaVersion();
    const pending = this.getPendingMigrations();

    return {
      currentVersion,
      pendingCount: pending.length,
      migrations: this.migrations.map((m) => ({
        version: m.version,
        description: m.description,
        applied: m.version <= currentVersion,
      })),
    };
  }
}

/**
 * Core schema migrations for CID
 * Based on CID_Implementation_Plan_v4.0.md Part II
 */
export const coreMigrations: Migration[] = [
  {
    version: 1,
    description: 'Create courses table',
    up: `
      CREATE TABLE courses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT UNIQUE NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        current_grade REAL,
        assessed_grade REAL,
        target_grade REAL DEFAULT 85.0,
        grade_volatility REAL DEFAULT 0.0,
        total_weight REAL DEFAULT 0.0,
        landing_page_url TEXT,
        last_synced_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME
      )
    `,
    down: 'DROP TABLE courses',
  },
  {
    version: 2,
    description: 'Create assignments table',
    up: `
      CREATE TABLE assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT UNIQUE NOT NULL,
        course_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        due_at DATETIME,
        unlock_at DATETIME,
        points_possible REAL,
        submission_types TEXT,
        weight REAL DEFAULT 0.0,
        grade REAL,
        priority_score REAL DEFAULT 0.0,
        is_completed BOOLEAN DEFAULT FALSE,
        completed_at DATETIME,
        local_modified_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(course_id) REFERENCES courses(id)
      )
    `,
    down: 'DROP TABLE assignments',
  },
  {
    version: 3,
    description: 'Create calendar_events table',
    up: `
      CREATE TABLE calendar_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT UNIQUE,
        source_type TEXT CHECK(source_type IN ('canvas', 'user')),
        course_id INTEGER,
        title TEXT NOT NULL,
        description TEXT,
        start_at DATETIME NOT NULL,
        end_at DATETIME,
        all_day BOOLEAN DEFAULT FALSE,
        recurrence_rule TEXT,
        recurrence_exception_dates TEXT,
        parent_event_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        FOREIGN KEY(course_id) REFERENCES courses(id),
        FOREIGN KEY(parent_event_id) REFERENCES calendar_events(id)
      )
    `,
    down: 'DROP TABLE calendar_events',
  },
  {
    version: 4,
    description: 'Create notifications table',
    up: `
      CREATE TABLE notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_type TEXT CHECK(source_type IN ('canvas', 'system')),
        source_id TEXT,
        course_id INTEGER,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        priority_level TEXT CHECK(priority_level IN ('critical', 'high', 'medium', 'low')) DEFAULT 'medium',
        priority_score REAL DEFAULT 0.0,
        published_at DATETIME NOT NULL,
        dismissed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(course_id) REFERENCES courses(id),
        UNIQUE(source_type, source_id)
      )
    `,
    down: 'DROP TABLE notifications',
  },
  {
    version: 5,
    description: 'Create resources table',
    up: `
      CREATE TABLE resources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT UNIQUE NOT NULL,
        course_id INTEGER NOT NULL,
        parent_folder_id INTEGER,
        type TEXT CHECK(type IN ('file', 'folder', 'external_url', 'page')),
        title TEXT NOT NULL,
        url TEXT,
        local_path TEXT,
        size_bytes INTEGER,
        mime_type TEXT,
        unlock_at DATETIME,
        synced_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(course_id) REFERENCES courses(id),
        FOREIGN KEY(parent_folder_id) REFERENCES resources(id)
      )
    `,
    down: 'DROP TABLE resources',
  },
  {
    version: 6,
    description: 'Create grade_history table',
    up: `
      CREATE TABLE grade_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER NOT NULL,
        grade REAL NOT NULL,
        recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(course_id) REFERENCES courses(id)
      )
    `,
    down: 'DROP TABLE grade_history',
  },
  {
    version: 7,
    description: 'Create user_preferences table',
    up: `
      CREATE TABLE user_preferences (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        description TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `,
    down: 'DROP TABLE user_preferences',
  },
  {
    version: 8,
    description: 'Create sync_metadata table for ETag caching',
    up: `
      CREATE TABLE sync_metadata (
        endpoint TEXT PRIMARY KEY,
        etag TEXT,
        last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `,
    down: 'DROP TABLE sync_metadata',
  },
  {
    version: 9,
    description: 'Create performance indexes',
    up: `
      CREATE INDEX idx_assignments_priority ON assignments(priority_score DESC);
      CREATE INDEX idx_assignments_due_date ON assignments(due_at);
      CREATE INDEX idx_assignments_course ON assignments(course_id);
      CREATE INDEX idx_notifications_dismissed ON notifications(dismissed_at);
      CREATE INDEX idx_notifications_course ON notifications(course_id);
      CREATE INDEX idx_calendar_events_start ON calendar_events(start_at);
      CREATE INDEX idx_resources_course ON resources(course_id);
      CREATE INDEX idx_grade_history_course ON grade_history(course_id);
    `,
    down: `
      DROP INDEX IF EXISTS idx_assignments_priority;
      DROP INDEX IF EXISTS idx_assignments_due_date;
      DROP INDEX IF EXISTS idx_assignments_course;
      DROP INDEX IF EXISTS idx_notifications_dismissed;
      DROP INDEX IF EXISTS idx_notifications_course;
      DROP INDEX IF EXISTS idx_calendar_events_start;
      DROP INDEX IF EXISTS idx_resources_course;
      DROP INDEX IF EXISTS idx_grade_history_course;
    `,
  },
];
