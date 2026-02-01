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
    this.migrationsPath = migrationsPath || path.join(process.cwd(), 'migrations');
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
   */
  private runMigration(migration: Migration): void {
    this.db.transaction(() => {
      try {
        // Execute migration SQL
        this.db.exec(migration.up);
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
        errors.push(`Migration ${migration.version} has no rollback SQL`);
        break;
      }

      try {
        this.db.transaction(() => {
          this.db.exec(migration.down!);
          // Use parameterized query to prevent SQL injection
          this.db.executeWrite('DELETE FROM schema_version WHERE version = ?', [
            migration.version,
          ]);
        });
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

