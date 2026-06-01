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
export { CanvasFileReader } from './readers/CanvasFileReader';
export { AnnouncementAttachmentReader } from './readers/AnnouncementAttachmentReader';
export { TaskReader } from './readers/TaskReader';
export { CanvasTaskQueueReader } from './readers/CanvasTaskQueueReader';
export { NotificationReader } from './readers/NotificationReader';
export { PolicyReader } from './readers/PolicyReader';
export { TaskTypeReader } from './readers/TaskTypeReader';
export { LinkSuggestionReader } from './readers/LinkSuggestionReader';
export { UserPreferencesReader } from './readers/UserPreferencesReader';
export { AppSettingsReader } from './readers/AppSettingsReader';
export { ExportHistoryReader } from './readers/ExportHistoryReader';
export type { ExportHistoryRow } from './readers/ExportHistoryReader';
export { HtmlExportReader } from './readers/HtmlExportReader';
export type { HtmlExportRow } from './readers/HtmlExportReader';
export { DiagnosticsReader } from './readers/DiagnosticsReader';
export { CalendarReader } from './readers/CalendarReader';
export type {
  CalendarEventRangeRow,
  CalendarEventExportRow,
  GetEventsForRangeOptions,
  GetExportEventsOptions,
} from './readers/CalendarReader';
export { ImportedCalendarReader } from './readers/ImportedCalendarReader';
export type { ImportedCalendarRow } from './readers/ImportedCalendarReader';
export { ModuleReader } from './readers/ModuleReader';
export type { ModuleItemReaderRow, ModuleInfoRow } from './readers/ModuleReader';
export { ResourceReader } from './readers/ResourceReader';
export type {
  ResourceDownloadRow,
  ResourceOpenByExternalIdRow,
  ResourceOpenByIdRow,
  ResourceDependencyFileRow,
  ResourceHtmlDownloadRow,
} from './readers/ResourceReader';
export { CoursePageReader } from './readers/CoursePageReader';
export type {
  CoursePageUrlSlugRow,
  CoursePageContentRow,
  CoursePageContentWithSlugRow,
  CoursePageHashSourceRow,
} from './readers/CoursePageReader';
export { HtmlDependencyReader } from './readers/HtmlDependencyReader';
export type {
  HtmlDependencyChildRow,
  HtmlDependencyChildWithHashRow,
} from './readers/HtmlDependencyReader';
export { SyncUpdateReader } from './readers/SyncUpdateReader';
export type {
  SyncUpdateCounts,
  SyncUpdateStatus,
  SyncUpdateStatusStat,
  SyncSeedEntityRow,
} from './readers/SyncUpdateReader';

// L1 Providers — see docs/adr/0008 (ADR-0008)
export { FileEntityProvider } from './FileEntityProvider';

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
  CustomTaskTypeRow,
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
  LinkSuggestionWithTasksRow,
  // Field source tracking
  TaskTypeFieldSource,
} from './DatabaseRowTypes';

// Re-export types for convenience
export type { Database as SQLiteDatabase } from 'better-sqlite3';
