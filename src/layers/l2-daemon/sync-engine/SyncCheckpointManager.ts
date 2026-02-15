/**
 * Sync Checkpoint Manager
 * Handles checkpoint creation, progress tracking, and resume functionality for sync operations.
 */

import type { Database } from '../../l1-persistence';
import type { ComponentLogger } from '../../l0-utilities/Logger';
import type { SyncOptions, SyncCheckpoint } from './SyncEngineTypes';
import type {
  CanvasCourse,
  CanvasAssignment,
  CanvasAnnouncement,
  CanvasModule,
  CanvasPage,
  CanvasFolder,
  CanvasFile,
} from '../data/DataMappers';

export interface SyncCheckpointManagerConfig {
  db: Database;
  logger?: ComponentLogger;
}

export class SyncCheckpointManager {
  private db: Database;
  private log: ComponentLogger | null;

  constructor(config: SyncCheckpointManagerConfig) {
    this.db = config.db;
    this.log = config.logger ?? null;
  }

  /**
   * Generate a unique sync ID
   */
  generateSyncId(): string {
    return `sync-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Create a new sync checkpoint
   */
  createCheckpoint(syncId: string, options: SyncOptions, totalCourses: number): void {
    try {
      this.db.executeWrite(
        `INSERT INTO sync_checkpoints (sync_id, phase, options_json, total_courses)
         VALUES (?, 'fetch', ?, ?)`,
        [syncId, JSON.stringify(options), totalCourses],
        'sync_checkpoints'
      );
      this.log?.debug(`Created sync checkpoint: ${syncId}`);
    } catch (error) {
      this.log?.error(
        'Failed to create sync checkpoint',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Update checkpoint with fetched course data
   */
  updateCheckpointProgress(
    syncId: string,
    courseId: number,
    fetchedData: {
      tasks?: CanvasAssignment[];
      announcements?: CanvasAnnouncement[];
      modules?: CanvasModule[];
      pages?: CanvasPage[];
      folders?: CanvasFolder[];
      files?: CanvasFile[];
    }
  ): void {
    try {
      // Get current checkpoint
      const checkpoint = this.db.executeReadOne<{
        fetched_course_ids: string;
        fetched_data_json: string | null;
        completed_courses: number;
      }>(
        'SELECT fetched_course_ids, fetched_data_json, completed_courses FROM sync_checkpoints WHERE sync_id = ?',
        [syncId]
      );

      if (!checkpoint) return;

      // Parse existing data
      const fetchedCourseIds: number[] = JSON.parse(
        checkpoint.fetched_course_ids || '[]'
      );
      const existingData = checkpoint.fetched_data_json
        ? JSON.parse(checkpoint.fetched_data_json)
        : {
            tasks: {},
            announcements: {},
            modules: {},
            pages: {},
            folders: {},
            files: {},
          };

      // Add new course data
      if (!fetchedCourseIds.includes(courseId)) {
        fetchedCourseIds.push(courseId);
      }

      if (fetchedData.tasks) existingData.tasks[courseId] = fetchedData.tasks;
      if (fetchedData.announcements)
        existingData.announcements[courseId] = fetchedData.announcements;
      if (fetchedData.modules) existingData.modules[courseId] = fetchedData.modules;
      if (fetchedData.pages) existingData.pages[courseId] = fetchedData.pages;
      if (fetchedData.folders) existingData.folders[courseId] = fetchedData.folders;
      if (fetchedData.files) existingData.files[courseId] = fetchedData.files;

      // Update checkpoint
      this.db.executeWrite(
        `UPDATE sync_checkpoints
         SET fetched_course_ids = ?,
             fetched_data_json = ?,
             completed_courses = ?,
             last_updated_at = CURRENT_TIMESTAMP
         WHERE sync_id = ?`,
        [
          JSON.stringify(fetchedCourseIds),
          JSON.stringify(existingData),
          fetchedCourseIds.length,
          syncId,
        ],
        'sync_checkpoints'
      );
    } catch (error) {
      this.log?.error(
        'Failed to update checkpoint progress',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Update checkpoint with courses data (after initial course fetch)
   */
  updateCheckpointCourses(syncId: string, courses: CanvasCourse[]): void {
    try {
      const checkpoint = this.db.executeReadOne<{ fetched_data_json: string | null }>(
        'SELECT fetched_data_json FROM sync_checkpoints WHERE sync_id = ?',
        [syncId]
      );

      const existingData = checkpoint?.fetched_data_json
        ? JSON.parse(checkpoint.fetched_data_json)
        : {
            courses: [],
            tasks: {},
            announcements: {},
            modules: {},
            pages: {},
            folders: {},
            files: {},
          };

      existingData.courses = courses;

      this.db.executeWrite(
        `UPDATE sync_checkpoints
         SET fetched_data_json = ?,
             last_updated_at = CURRENT_TIMESTAMP
         WHERE sync_id = ?`,
        [JSON.stringify(existingData), syncId],
        'sync_checkpoints'
      );
    } catch (error) {
      this.log?.error(
        'Failed to update checkpoint courses',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Mark checkpoint as entering commit phase
   */
  markCheckpointCommitting(syncId: string): void {
    try {
      this.db.executeWrite(
        `UPDATE sync_checkpoints SET phase = 'commit', last_updated_at = CURRENT_TIMESTAMP WHERE sync_id = ?`,
        [syncId],
        'sync_checkpoints'
      );
    } catch (error) {
      this.log?.error(
        'Failed to mark checkpoint as committing',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Mark checkpoint as completed and clean up
   */
  completeCheckpoint(syncId: string): void {
    try {
      this.db.executeWrite(
        `UPDATE sync_checkpoints
         SET phase = 'completed',
             completed_at = CURRENT_TIMESTAMP,
             last_updated_at = CURRENT_TIMESTAMP
         WHERE sync_id = ?`,
        [syncId],
        'sync_checkpoints'
      );

      // Clean up old completed checkpoints (keep last 5)
      this.db.executeWrite(
        `DELETE FROM sync_checkpoints
         WHERE phase = 'completed'
         AND id NOT IN (
           SELECT id FROM sync_checkpoints
           WHERE phase = 'completed'
           ORDER BY completed_at DESC
           LIMIT 5
         )`,
        [],
        'sync_checkpoints'
      );

      this.log?.debug(`Completed sync checkpoint: ${syncId}`);
    } catch (error) {
      this.log?.error(
        'Failed to complete checkpoint',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Mark checkpoint as failed
   */
  failCheckpoint(syncId: string, errorMessage: string): void {
    try {
      this.db.executeWrite(
        `UPDATE sync_checkpoints
         SET phase = 'failed',
             last_error = ?,
             error_count = error_count + 1,
             last_updated_at = CURRENT_TIMESTAMP
         WHERE sync_id = ?`,
        [errorMessage, syncId],
        'sync_checkpoints'
      );
    } catch (err) {
      this.log?.error(
        'Failed to mark checkpoint as failed',
        err instanceof Error ? err : undefined
      );
    }
  }

  /**
   * Get the most recent incomplete checkpoint that can be resumed
   */
  getIncompleteCheckpoint(): SyncCheckpoint | null {
    try {
      const row = this.db.executeReadOne<{
        sync_id: string;
        started_at: string;
        phase: string;
        options_json: string;
        fetched_course_ids: string;
        fetched_data_json: string | null;
        total_courses: number;
        completed_courses: number;
        last_error: string | null;
        error_count: number;
        last_updated_at: string;
      }>(
        `SELECT * FROM sync_checkpoints
         WHERE phase IN ('fetch', 'commit')
         AND error_count < 3
         AND started_at > datetime('now', '-1 hour')
         ORDER BY started_at DESC
         LIMIT 1`
      );

      if (!row) return null;

      const fetchedData = row.fetched_data_json
        ? JSON.parse(row.fetched_data_json)
        : {
            courses: [],
            tasks: {},
            announcements: {},
            modules: {},
            pages: {},
            folders: {},
            files: {},
          };

      return {
        syncId: row.sync_id,
        startedAt: row.started_at,
        phase: row.phase as SyncCheckpoint['phase'],
        options: JSON.parse(row.options_json || '{}'),
        fetchedCourseIds: JSON.parse(row.fetched_course_ids || '[]'),
        fetchedData: {
          courses: fetchedData.courses || [],
          tasks: fetchedData.tasks || {},
          announcements: fetchedData.announcements || {},
          modules: fetchedData.modules || {},
          pages: fetchedData.pages || {},
          folders: fetchedData.folders || {},
          files: fetchedData.files || {},
        },
        totalCourses: row.total_courses,
        completedCourses: row.completed_courses,
        lastError: row.last_error || undefined,
        errorCount: row.error_count,
        lastUpdatedAt: row.last_updated_at,
      };
    } catch (error) {
      this.log?.error(
        'Failed to get incomplete checkpoint',
        error instanceof Error ? error : undefined
      );
      return null;
    }
  }

  /**
   * Clear all incomplete checkpoints (for manual reset)
   */
  clearIncompleteCheckpoints(): void {
    try {
      this.db.executeWrite(
        `UPDATE sync_checkpoints SET phase = 'failed', last_error = 'Manually cleared' WHERE phase IN ('fetch', 'commit')`,
        [],
        'sync_checkpoints'
      );
      this.log?.debug('Cleared incomplete checkpoints');
    } catch (error) {
      this.log?.error(
        'Failed to clear incomplete checkpoints',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Check if there's an incomplete sync that can be resumed
   */
  hasResumableSync(): boolean {
    return this.getIncompleteCheckpoint() !== null;
  }
}
