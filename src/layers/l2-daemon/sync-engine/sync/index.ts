/**
 * Sync Module - Strategy pattern for data synchronization
 *
 * This module provides reusable sync strategies that can be composed
 * to build custom sync flows. Each strategy handles a specific entity type.
 *
 * Usage:
 * ```typescript
 * const context: SyncContext = { client, db, rateLimiter, emitter };
 * const taskSync = new TaskSyncStrategy(context, { conflictResolver });
 * const result = await taskSync.syncForCourse(canvasCourseId, localCourseId);
 * ```
 *
 * Migration Path:
 * - SyncEngine still works as before (backward compatible)
 * - New code can use strategies directly for more control
 * - Gradually migrate SyncEngine methods to use strategies internally
 */

// Base types and interfaces
export { SyncResult, SyncContext, ISyncStrategy, BaseSyncStrategy } from './SyncStrategy';

// Strategy implementations
export { TaskSyncStrategy, TaskSyncOptions } from './TaskSyncStrategy';
export {
  AnnouncementSyncStrategy,
  AnnouncementSyncOptions,
} from './AnnouncementSyncStrategy';

// Re-export commonly used types
export type { TaskDiagnosticEntry, TaskMergedEvent } from './TaskSyncStrategy';

export type { AttachmentsPendingEvent } from './AnnouncementSyncStrategy';
