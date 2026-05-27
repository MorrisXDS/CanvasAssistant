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
export type {
  PersistenceConfig,
  DatabaseConfig as PersistenceDatabaseConfig,
} from './PersistenceConfig';
export { DEFAULT_PERSISTENCE_CONFIG } from './PersistenceConfig';
export { MigrationRunner, Migration, coreMigrations } from './MigrationRunner';
export {
  runPostImportRepairs,
  repairMissingCalendarEvents,
  verifyImportedCalendars,
} from './DatabaseRepair';
export {
  VisibilityOracle,
  VisibilityOracleConfig,
  TermSelection,
  VisibleTaskRow,
} from './VisibilityOracle';

// L1 Readers — see docs/adr/0007 (ADR-0007)
export { CourseReader } from './readers/CourseReader';

// Repositories
export {
  BaseRepository,
  CourseRepository,
  TaskRepository,
  NotificationRepository,
} from './repositories';

export type {
  CourseUpdates,
  TaskUpdates,
  CreateTaskParams,
  NotificationUpdates,
} from './repositories';

// Centralized database row types (single source of truth)
export type {
  // Core entity rows
  CourseRow,
  CourseRowMinimal,
  CourseRowSyllabusOnly,
  TaskRow,
  TaskRowMinimal,
  TaskRowWithPriority,
  TaskRowWithFieldSources,
  PolicyRow,
  PolicyRowMinimal,
  NotificationRow,
  // Grace token rows
  GraceTokenRowMinimal,
  GraceTokenRow,
  // Intelligence layer rows
  InsightRow,
  RecommendationRow,
  WorkloadSnapshotRow,
  CompletionEventRow,
  BehaviorPatternRow,
  WeightAdjustmentRow,
  CourseSyllabusRow,
  // Content analysis rows
  ContentAnalysisRow,
  CoursePageRow,
  ResourceRow,
  // Download queue rows
  PendingDownloadRow,
  // Message display history rows
  DisplayHistoryRow,
  // Grace token usage rows
  TokenUsageRow,
  // Sync tracking rows
  SyncSessionRow,
  SyncUpdateRow,
  SyncUpdateRowWithCourse,
  // Canvas task queue rows
  CanvasTaskQueueRow,
  CanvasTaskQueueRowMinimal,
  // Module/assignment group rows
  ModuleItemRow,
  AssignmentGroupRow,
  // Link suggestion rows
  LinkSuggestionRow,
  // Field source tracking
  TaskTypeFieldSource,
} from './DatabaseRowTypes';

// Re-export types for convenience
export type { Database as SQLiteDatabase } from 'better-sqlite3';
