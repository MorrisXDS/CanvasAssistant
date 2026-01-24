/**
 * Layer 1 - Persistence
 *
 * SQLite database with WAL mode for offline-first data storage.
 *
 * Features:
 * - WAL mode for concurrent reads/writes
 * - <1ms write latency with PRAGMA synchronous = NORMAL
 * - Event emission on commits for reactive updates
 * - Migration system with version tracking
 * - Idempotent upserts via external_id
 * - Repository pattern for data access
 */

export { Database, DatabaseConfig, CommitEvent } from './Database';
export {
  MigrationRunner,
  Migration,
  coreMigrations,
} from './MigrationRunner';

// Repositories
export {
  BaseRepository,
  CourseRepository,
  TaskRepository,
  PolicyRepository,
  NotificationRepository,
} from './repositories';

export type {
  CourseRow,
  TaskRow,
  PolicyRow,
  NotificationRow,
  CourseUpdates,
  TaskUpdates,
  CreateTaskParams,
  PolicyConfig,
  GraceTokenConfig,
  PolicyUpdates,
  CreatePolicyParams,
  NotificationUpdates,
} from './repositories';

// Re-export types for convenience
export type { Database as SQLiteDatabase } from 'better-sqlite3';
