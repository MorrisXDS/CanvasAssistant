/**
 * Sync Update Recorder
 * Handles creating sync sessions and recording sync updates for the notification system.
 */

import type { OrchestratorContext } from './OrchestratorTypes';

export interface RecordSyncUpdateParams {
  syncSessionId: string;
  courseId: number;
  entityType: 'task' | 'announcement' | 'grade' | 'file' | 'page' | 'conflict';
  entityId: number;
  externalId?: string;
  changeType: 'new' | 'updated' | 'grade_changed' | 'conflict';
  title: string;
  subtitle?: string;
  oldValue?: string;
  newValue?: string;
  conflictField?: string;
  changedField?: string;
  isActionRequired?: boolean;
}

/**
 * Create a sync session for tracking updates.
 */
export function createSyncSession(ctx: OrchestratorContext, syncId: string): void {
  try {
    ctx.db.executeWrite(
      `INSERT OR IGNORE INTO sync_sessions (id, started_at, created_at)
       VALUES (?, datetime('now'), datetime('now'))`,
      [syncId],
      'sync_sessions'
    );
  } catch (error) {
    ctx.log?.debug('Failed to create sync session', { error });
  }
}

/**
 * Complete a sync session with counts.
 */
export function completeSyncSession(
  ctx: OrchestratorContext,
  syncId: string,
  counts: {
    newTasks: number;
    updatedTasks: number;
    newAnnouncements: number;
    gradeChanges: number;
    newFiles: number;
  }
): void {
  try {
    ctx.db.executeWrite(
      `UPDATE sync_sessions SET
         completed_at = datetime('now'),
         total_new_tasks = ?,
         total_updated_tasks = ?,
         total_new_announcements = ?,
         total_grade_changes = ?,
         total_new_files = ?
       WHERE id = ?`,
      [
        counts.newTasks,
        counts.updatedTasks,
        counts.newAnnouncements,
        counts.gradeChanges,
        counts.newFiles,
        syncId,
      ],
      'sync_sessions'
    );
  } catch (error) {
    ctx.log?.debug('Failed to complete sync session', { error });
  }
}

/**
 * Record a sync update (new item, update, grade change, etc.).
 */
export function recordSyncUpdate(
  ctx: OrchestratorContext,
  params: RecordSyncUpdateParams
): void {
  try {
    // For conflicts, check if an unresolved conflict for same entity/field already exists
    if (params.entityType === 'conflict' && params.conflictField) {
      const existing = ctx.db.executeReadOne<{ id: number; new_value: string | null }>(
        `SELECT id, new_value FROM sync_updates
         WHERE entity_type = 'conflict'
         AND entity_id = ?
         AND conflict_field = ?
         AND resolved_at IS NULL`,
        [params.entityId, params.conflictField]
      );
      if (existing) {
        // Update existing conflict instead of creating duplicate
        // Set updated_at if the Canvas value (new_value) actually changed
        const canvasValueChanged = existing.new_value !== (params.newValue ?? null);
        ctx.db.executeWrite(
          `UPDATE sync_updates SET
             old_value = ?,
             new_value = ?,
             sync_session_id = ?${canvasValueChanged ? ", updated_at = datetime('now')" : ''}
           WHERE id = ?`,
          [
            params.oldValue ?? null,
            params.newValue ?? null,
            params.syncSessionId,
            existing.id,
          ],
          'sync_updates'
        );
        return;
      }
    }

    ctx.db.executeWrite(
      `INSERT INTO sync_updates (
         sync_session_id, course_id, entity_type, entity_id, external_id,
         change_type, title, subtitle, old_value, new_value, conflict_field,
         changed_field, is_action_required, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        params.syncSessionId,
        params.courseId,
        params.entityType,
        params.entityId,
        params.externalId ?? null,
        params.changeType,
        params.title,
        params.subtitle ?? null,
        params.oldValue ?? null,
        params.newValue ?? null,
        params.conflictField ?? null,
        params.changedField ?? null,
        params.isActionRequired ? 1 : 0,
      ],
      'sync_updates'
    );
  } catch (error) {
    ctx.log?.debug('Failed to record sync update', { error, params });
  }
}

/**
 * Snapshot current file and page state before sync for comparison later.
 * Returns a map of external_id -> { id, remote_updated_at, course_id, title, type }
 */
export function snapshotFileState(ctx: OrchestratorContext): Map<
  string,
  {
    id: number;
    remote_updated_at: string | null;
    course_id: number;
    title: string;
    type: 'file' | 'page';
  }
> {
  const resources = ctx.db.executeRead<{
    id: number;
    external_id: string;
    remote_updated_at: string | null;
    course_id: number;
    title: string;
    type: string;
  }>(
    `SELECT id, external_id, remote_updated_at, course_id, title, type
     FROM resources WHERE type IN ('file', 'page')`
  );

  const snapshot = new Map<
    string,
    {
      id: number;
      remote_updated_at: string | null;
      course_id: number;
      title: string;
      type: 'file' | 'page';
    }
  >();
  for (const resource of resources) {
    snapshot.set(resource.external_id, {
      id: resource.id,
      remote_updated_at: resource.remote_updated_at,
      course_id: resource.course_id,
      title: resource.title,
      type: resource.type as 'file' | 'page',
    });
  }

  const fileCount = [...snapshot.values()].filter((r) => r.type === 'file').length;
  const pageCount = [...snapshot.values()].filter((r) => r.type === 'page').length;
  ctx.log?.info(
    `[SyncOrchestrator] Resource snapshot: ${fileCount} files, ${pageCount} pages`
  );
  return snapshot;
}

/**
 * Record file and page sync_updates by comparing current state with snapshot.
 * Call this AFTER all file processing (commit, file refs, HTML sync) is complete.
 */
export function recordFileUpdates(
  ctx: OrchestratorContext,
  syncSessionId: string,
  snapshot: Map<
    string,
    {
      id: number;
      remote_updated_at: string | null;
      course_id: number;
      title: string;
      type: 'file' | 'page';
    }
  >
): { newFiles: number; updatedFiles: number; newPages: number; updatedPages: number } {
  const counts = { newFiles: 0, updatedFiles: 0, newPages: 0, updatedPages: 0 };

  // Get current file and page state
  const currentResources = ctx.db.executeRead<{
    id: number;
    external_id: string;
    remote_updated_at: string | null;
    course_id: number;
    title: string;
    size_bytes: number | null;
    type: string;
  }>(
    `SELECT id, external_id, remote_updated_at, course_id, title, size_bytes, type
     FROM resources WHERE type IN ('file', 'page')`
  );

  for (const resource of currentResources) {
    const previous = snapshot.get(resource.external_id);
    const isFile = resource.type === 'file';
    const entityType = isFile ? 'file' : 'page';

    // Format size for subtitle (files only)
    const sizeStr =
      isFile && resource.size_bytes
        ? resource.size_bytes >= 1024 * 1024
          ? `${(resource.size_bytes / (1024 * 1024)).toFixed(1)} MB`
          : `${Math.round(resource.size_bytes / 1024)} KB`
        : undefined;

    if (!previous) {
      // New resource - didn't exist before sync
      recordSyncUpdate(ctx, {
        syncSessionId,
        courseId: resource.course_id,
        entityType,
        entityId: resource.id,
        externalId: resource.external_id,
        changeType: 'new',
        title: resource.title || (isFile ? 'New File' : 'New Page'),
        subtitle: sizeStr,
      });
      if (isFile) {
        counts.newFiles++;
      } else {
        counts.newPages++;
      }
    } else if (
      resource.remote_updated_at &&
      previous.remote_updated_at &&
      resource.remote_updated_at !== previous.remote_updated_at
    ) {
      // Updated resource - remote_updated_at changed
      recordSyncUpdate(ctx, {
        syncSessionId,
        courseId: resource.course_id,
        entityType,
        entityId: resource.id,
        externalId: resource.external_id,
        changeType: 'updated',
        title: resource.title || (isFile ? 'Updated File' : 'Updated Page'),
        subtitle: sizeStr,
        oldValue: previous.remote_updated_at,
        newValue: resource.remote_updated_at,
      });
      if (isFile) {
        counts.updatedFiles++;
      } else {
        counts.updatedPages++;
      }
    }
  }

  ctx.log?.info(
    `[SyncOrchestrator] Resource updates recorded: ${counts.newFiles} new files, ${counts.updatedFiles} updated files, ${counts.newPages} new pages, ${counts.updatedPages} updated pages`
  );
  return counts;
}
