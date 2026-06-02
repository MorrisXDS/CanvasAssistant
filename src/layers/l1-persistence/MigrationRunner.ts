import { Database } from './Database';
import fs from 'fs';
import path from 'path';

export interface Migration {
  version: number;
  description: string;
  /** SQL string to run, or a function for complex migrations */
  up: string | ((db: Database) => void);
  down?: string;
  /**
   * Run this migration with `PRAGMA foreign_keys = OFF` (see ADR-0009). Required
   * for SQLite "12-step" table rebuilds — dropping a column that participates in
   * a foreign key, or changing a CHECK/constraint — because the rebuild must DROP
   * the old table, which fails under FK-on when other tables reference it.
   *
   * Default (false/undefined): the migration runs inside the normal FK-on
   * transaction, unchanged. Only set this for genuine table rebuilds; a
   * `PRAGMA foreign_key_check` runs after the body and aborts the migration if it
   * left any dangling references.
   */
  disableForeignKeys?: boolean;
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
    this.migrationsPath = migrationsPath || '';
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
    if (!this.migrationsPath || !fs.existsSync(this.migrationsPath)) {
      return;
    }

    const files = fs
      .readdirSync(this.migrationsPath)
      .filter((f) => f.match(/^\d{3}_.*\.(ts|js)$/));

    for (const file of files) {
      const filePath = path.join(this.migrationsPath, file);

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
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`Migration ${migration.version}: ${message}`);
        break; // Stop on first error
      }
    }

    return { applied, errors };
  }

  /**
   * Run a single migration
   * Handles common SQLite errors like duplicate columns gracefully
   * Supports both SQL string and function-based migrations
   */
  private runMigration(migration: Migration): void {
    const runBody = (): void => {
      this.db.transaction(() => {
        try {
          // Execute migration - either SQL string or function
          if (typeof migration.up === 'function') {
            migration.up(this.db);
          } else {
            this.db.exec(migration.up);
          }
        } catch (error) {
          // Handle "duplicate column name" errors gracefully
          // This happens when a column was manually added or migration was partially applied
          const message = error instanceof Error ? error.message : String(error);
          if (message.includes('duplicate column name')) {
            // Column already exists - this is OK, continue with migration silently
          } else {
            throw error;
          }
        }

        // Verify a foreign-keys-off rebuild left no dangling references before
        // it commits (see ADR-0009). Runs inside the transaction so a violation
        // aborts the whole migration.
        if (migration.disableForeignKeys) {
          this.assertNoForeignKeyViolations(migration.version);
        }

        // Record migration as applied
        this.db.recordMigration(migration.version, migration.description);
      });
    };

    if (migration.disableForeignKeys) {
      this.withForeignKeysOff(runBody);
    } else {
      runBody();
    }
  }

  /**
   * Run `fn` with `PRAGMA foreign_keys = OFF`, always restoring it afterwards
   * (ADR-0009). The pragma must be toggled OUTSIDE a transaction — it is a no-op
   * inside one — so this wraps the transaction, not the reverse.
   */
  private withForeignKeysOff(fn: () => void): void {
    this.db.exec('PRAGMA foreign_keys = OFF');
    try {
      fn();
    } finally {
      this.db.exec('PRAGMA foreign_keys = ON');
    }
  }

  /** Throw if `PRAGMA foreign_key_check` reports any dangling references. */
  private assertNoForeignKeyViolations(version: number): void {
    const violations = this.db.executeRead<Record<string, unknown>>(
      'PRAGMA foreign_key_check'
    );
    if (violations.length > 0) {
      throw new Error(
        `Migration ${version} left ${violations.length} foreign-key violation(s): ` +
          JSON.stringify(violations.slice(0, 5))
      );
    }
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
        errors.push(`Migration ${migration.version} has no rollback SQL`);
        break;
      }

      try {
        const rollbackBody = (): void => {
          this.db.transaction(() => {
            this.db.exec(migration.down!);
            if (migration.disableForeignKeys) {
              this.assertNoForeignKeyViolations(migration.version);
            }
            // Use parameterized query to prevent SQL injection
            this.db.executeWrite('DELETE FROM schema_version WHERE version = ?', [
              migration.version,
            ]);
          });
        };

        // A foreign-keys-off migration's `down` (e.g. re-creating the rebuilt
        // table) needs the same FK-off treatment as its `up` (ADR-0009).
        if (migration.disableForeignKeys) {
          this.withForeignKeysOff(rollbackBody);
        } else {
          rollbackBody();
        }
        rolledBack++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
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

// Re-export coreMigrations from dedicated file for backwards compatibility
export { coreMigrations } from './coreMigrations';
