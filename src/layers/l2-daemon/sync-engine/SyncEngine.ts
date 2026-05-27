/**
 * Sync Engine - Orchestrates data synchronization from Canvas to local database
 *
 * Responsibilities:
 * - Fetches data from Canvas API via CanvasClient
 * - Transforms data using DataMappers
 * - Upserts data into local SQLite database
 * - Handles incremental sync using ETags
 * - Tracks sync metadata for optimization
 */

import { EventEmitter } from 'events';
import { CanvasClient } from '../client/CanvasClient';
import { RateLimiter } from '../resilience/RateLimiter';
import { Database, VisibilityOracle } from '../../l1-persistence';
import {
  CanvasCourse,
  CanvasAssignment,
  CanvasAnnouncement,
  CanvasModule,
  CanvasPage,
  CanvasFile,
  CanvasFolder,
  mapCourse,
} from '../data/DataMappers';
import {
  SyncConflictResolver,
  SyncConflict,
  ConflictResolution,
} from './SyncConflictResolver';
import { HtmlFileExtractor } from '../html/HtmlFileExtractor';
import { HtmlContentSync } from '../html/HtmlContentSync';
import { OperationCoordinator } from './OperationCoordinator';
import { FileDownloadManager } from '../../l0-utilities/FileDownloadManager';
import { HtmlContentSyncConfig } from '../DaemonConfig';
import type { ComponentLogger } from '../../l0-utilities/Logger';
import crypto from 'crypto';

// Import types from extracted types file
import type {
  SyncEngineConfig,
  SyncResult,
  FullSyncResult,
  SyncOptions,
  SyncCheckpoint,
  SyncMetadata,
  SyncDiagnosticEntry,
  EndpointBackoff,
} from './SyncEngineTypes';
import { SyncCheckpointManager } from './SyncCheckpointManager';
import { SyncBackoffManager } from './SyncBackoffManager';
import type { SyncOperationContext, SyncOperationHelpers } from './SyncOperationContext';
import {
  SyncCourseOperations,
  SyncTaskOperations,
  SyncContentOperations,
  SyncFileOperations,
} from './operations';
import { SyncFileRefExtractor } from '../html/SyncFileRefExtractor';
import { SyncOrchestrator } from './SyncOrchestrator';

// Re-export types for backwards compatibility
export type {
  SyncEngineConfig,
  SyncResult,
  FullSyncResult,
  SyncOptions,
  SyncCheckpoint,
  SyncMetadata,
  SyncDiagnosticEntry,
} from './SyncEngineTypes';

export class SyncEngine extends EventEmitter {
  private client: CanvasClient;
  private db: Database;
  private rateLimiter: RateLimiter;
  private conflictResolver: SyncConflictResolver;
  private htmlFileExtractor: HtmlFileExtractor;
  private htmlContentSync: HtmlContentSync | null = null;
  private downloadManager: FileDownloadManager | null = null;
  private filesBaseDir: string | null = null;
  private isSyncing: boolean = false;
  private syncMutex: Promise<void> = Promise.resolve();
  private syncMutexRelease: (() => void) | null = null;
  // Abort controller for cancelling in-flight operations
  private abortController: AbortController | null = null;
  private isAborted: boolean = false;
  // Store event handler references for cleanup
  private rateLimitedHandler: ((info: unknown) => void) | null = null;
  private diagnosticsEnabled: boolean = false;
  private diagnosticLog: SyncDiagnosticEntry[] = [];
  private pausedForConflicts: boolean = false;
  private pendingConflictData: Map<
    string,
    { tableName: string; data: Record<string, unknown> }
  > = new Map();
  private log: ComponentLogger | null;
  // Store courses from last sync for deferred file processing
  private lastSyncedCourses: CanvasCourse[] = [];
  // Store file snapshot for deferred file processing
  private lastFileSnapshot: Map<
    string,
    {
      id: number;
      remote_updated_at: string | null;
      course_id: number;
      title: string;
      type: 'file' | 'page';
    }
  > | null = null;
  // Store syncId for deferred file processing
  private lastSyncId: string | null = null;
  // Visible data provider for filtering courses
  private visibilityOracle: VisibilityOracle | null = null;
  // Operation coordinator for sync/download conflict prevention
  private operationCoordinator: OperationCoordinator | null = null;
  // Extracted managers
  private checkpointManager: SyncCheckpointManager;
  private backoffManager: SyncBackoffManager;
  // Extracted operation classes
  private courseOps!: SyncCourseOperations;
  private taskOps!: SyncTaskOperations;
  private contentOps!: SyncContentOperations;
  private fileOps!: SyncFileOperations;
  // File reference extractor
  private fileRefExtractor!: SyncFileRefExtractor;
  // Sync orchestrator for two-phase sync
  private syncOrchestrator!: SyncOrchestrator;

  constructor(config: SyncEngineConfig) {
    super();
    this.client = config.client;
    this.db = config.db;
    this.rateLimiter = config.rateLimiter || new RateLimiter();
    this.conflictResolver = new SyncConflictResolver(this.db);
    this.htmlFileExtractor = new HtmlFileExtractor({ deduplicate: true });
    this.downloadManager = config.downloadManager || null;
    this.filesBaseDir = config.filesBaseDir || null;
    this.log = config.logger ?? null;
    this.visibilityOracle = config.visibilityOracle || null;
    this.operationCoordinator = config.operationCoordinator || null;

    // Initialize HTML content sync if configured
    this.log?.debug(
      `Init: htmlContentSyncConfig=${!!config.htmlContentSyncConfig}, downloadManager=${!!this.downloadManager}, filesBaseDir=${this.filesBaseDir}`
    );
    if (config.htmlContentSyncConfig && this.downloadManager && this.filesBaseDir) {
      this.htmlContentSync = new HtmlContentSync({
        db: this.db,
        downloadManager: this.downloadManager,
        config: config.htmlContentSyncConfig,
        authToken: this.client.getAuthToken(),
        baseUrl: this.client.getBaseUrl(),
        logger: this.log ?? undefined,
      });
      this.log?.debug('HtmlContentSync initialized');
    } else {
      this.log?.debug('HtmlContentSync NOT initialized - missing config');
    }

    // Ensure conflict resolver table exists
    this.conflictResolver.ensureTable();

    // Forward rate limit events (store handler for cleanup)
    this.rateLimitedHandler = (info) => {
      this.emit('rate-limited', info);
    };
    this.rateLimiter.on('rate-limited', this.rateLimitedHandler);

    // Initialize checkpoint and backoff managers
    this.checkpointManager = new SyncCheckpointManager({
      db: this.db,
      logger: this.log ?? undefined,
    });
    this.backoffManager = new SyncBackoffManager({
      db: this.db,
      logger: this.log ?? undefined,
    });

    // Ensure backoff table exists
    this.backoffManager.ensureBackoffTable();

    // Forward backoff manager events
    this.backoffManager.on('endpoint-backoff', (info) =>
      this.emit('endpoint-backoff', info)
    );
    this.backoffManager.on('endpoint-backoff-reset', (info) =>
      this.emit('endpoint-backoff-reset', info)
    );
    this.backoffManager.on('endpoint-skipped', (info) =>
      this.emit('endpoint-skipped', info)
    );

    // Initialize operation classes with context and helpers
    this.initializeOperationClasses();

    // Ensure pending sync data table exists and load any persisted conflicts
    this.ensurePendingSyncDataTable();
    this.loadPersistedConflictData();
  }

  /**
   * Initialize operation classes with shared context and helpers
   */
  private initializeOperationClasses(): void {
    const ctx = this.createOperationContext();
    const helpers = this.createOperationHelpers();

    this.courseOps = new SyncCourseOperations(ctx, helpers);
    this.taskOps = new SyncTaskOperations(ctx, helpers);
    this.contentOps = new SyncContentOperations(ctx, helpers);
    this.fileOps = new SyncFileOperations(ctx, helpers);

    // Initialize file reference extractor
    this.fileRefExtractor = new SyncFileRefExtractor({
      db: this.db,
      client: this.client,
      rateLimiter: this.rateLimiter,
      htmlFileExtractor: this.htmlFileExtractor,
    });

    // Initialize sync orchestrator
    this.syncOrchestrator = new SyncOrchestrator({
      client: this.client,
      db: this.db,
      rateLimiter: this.rateLimiter,
      conflictResolver: this.conflictResolver,
      checkpointManager: this.checkpointManager,
      backoffManager: this.backoffManager,
      visibilityOracle: this.visibilityOracle,
      emitter: this,
      log: this.log,
      getDefaultTargetGrade: () => this.getDefaultTargetGrade(),
      getCourseSettings: (courseId) => this.getCourseSettings(courseId),
      getTodayEndTime: () => this.getTodayEndTime(),
      persistConflictData: (conflictId, tableName, data) =>
        this.persistConflictData(conflictId, tableName, data),
      pendingConflictData: this.pendingConflictData,
      hasActiveDownloadFor: (sourceType, sourceId) =>
        this.hasActiveDownloadFor(sourceType, sourceId),
      computeContentHash: (content) => this.computeContentHash(content),
      updateContentHashAndDependencies: (sourceType, sourceId, content, courseId) =>
        this.updateContentHashAndDependencies(sourceType, sourceId, content, courseId),
    });
  }

  /**
   * Create shared context for operation classes
   */
  private createOperationContext(): SyncOperationContext {
    return {
      client: this.client,
      db: this.db,
      rateLimiter: this.rateLimiter,
      conflictResolver: this.conflictResolver,
      backoffManager: this.backoffManager,
      log: this.log,
      emitter: this,
      diagnosticsEnabled: this.diagnosticsEnabled,
      pendingConflictData: this.pendingConflictData,
    };
  }

  /**
   * Create helpers for operation classes
   */
  private createOperationHelpers(): SyncOperationHelpers {
    return {
      getDefaultTargetGrade: () => this.getDefaultTargetGrade(),
      getCourseSettings: (courseId: number) => this.getCourseSettings(courseId),
      getTodayEndTime: () => this.getTodayEndTime(),
      getSyncPreferences: () => this.getSyncPreferences(),
      updateSyncMetadata: (endpoint: string, etag?: string) =>
        this.updateSyncMetadata(endpoint, etag),
      logDiagnostic: (entry) => this.logDiagnostic(entry),
      persistConflictData: (conflictId, tableName, data) =>
        this.persistConflictData(conflictId, tableName, data),
      computeContentHash: (content) => this.computeContentHash(content),
      updateContentHashAndDependencies: (sourceType, sourceId, content, courseId) =>
        this.updateContentHashAndDependencies(sourceType, sourceId, content, courseId),
    };
  }

  /**
   * Safe wrapper for database writes that checks if database is available.
   * Logs a warning and returns false if database is not open or is locked.
   * Use for non-critical writes that can be skipped without breaking sync.
   *
   * @param sql SQL statement to execute
   * @param params Query parameters
   * @param table Table name for commit event emission
   * @returns true if write succeeded, false if skipped
   */
  private safeWrite(sql: string, params: unknown[], table: string): boolean {
    if (!this.db.isOpen) {
      this.log?.warn(`Skipping write to ${table} - database is closed`);
      return false;
    }
    if (this.db.isWriteLocked()) {
      this.log?.debug(`Skipping write to ${table} - database is locked`);
      return false;
    }
    try {
      this.db.executeWrite(sql, params, table);
      return true;
    } catch (error) {
      this.log?.error(
        `Failed to write to ${table}`,
        error instanceof Error ? error : undefined
      );
      return false;
    }
  }

  /**
   * Compute MD5 hash of content for change detection.
   * Returns null if content is null/undefined.
   */
  private computeContentHash(content: string | null | undefined): string | null {
    if (!content) return null;
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Check if there's an active download for a specific HTML resource.
   * If so, skip updating that resource to prevent conflicts.
   */
  private hasActiveDownloadFor(sourceType: string, sourceId: string): boolean {
    if (!this.operationCoordinator) return false;
    return this.operationCoordinator.hasActiveDownload(sourceType, sourceId);
  }

  /**
   * Update content hash and re-extract dependencies when HTML content changes.
   * This ensures dependency resolver sees current file references.
   */
  private updateContentHashAndDependencies(
    sourceType: 'page' | 'assignment' | 'syllabus' | 'announcement',
    sourceId: string,
    newContent: string | null,
    _courseId: number
  ): void {
    if (!newContent) return;

    const newHash = this.computeContentHash(newContent);
    if (!newHash) return;

    // Update content hash in appropriate table
    if (sourceType === 'page') {
      this.db.executeWrite(
        'UPDATE course_pages SET content_hash = ? WHERE external_id = ?',
        [newHash, sourceId],
        'course_pages'
      );
    } else if (sourceType === 'assignment') {
      this.db.executeWrite(
        'UPDATE tasks SET description_hash = ? WHERE external_id = ?',
        [newHash, sourceId],
        'tasks'
      );
    } else if (sourceType === 'syllabus') {
      this.db.executeWrite(
        'UPDATE courses SET syllabus_hash = ? WHERE external_id = ?',
        [newHash, sourceId],
        'courses'
      );
    }

    // Re-extract and update dependencies (only if html_dependencies table exists)
    try {
      // Extract file references from new content
      const fileRefs = this.htmlFileExtractor.extract(newContent);

      // Delete old dependencies (only those without active download session)
      this.db.executeWrite(
        `DELETE FROM html_dependencies
         WHERE parent_source_type = ? AND parent_source_id = ?
         AND download_session_id IS NULL`,
        [sourceType, sourceId],
        'html_dependencies'
      );

      // Insert new file dependencies with current content hash
      for (const ref of fileRefs) {
        this.db.executeWrite(
          `INSERT OR REPLACE INTO html_dependencies
           (parent_source_type, parent_source_id, child_source_type, child_source_id, is_cycle, recorded_content_hash)
           VALUES (?, ?, 'file', ?, 0, ?)`,
          [sourceType, sourceId, ref.canvasFileId, newHash],
          'html_dependencies'
        );
      }

      this.log?.debug(
        `Updated ${fileRefs.length} dependencies for ${sourceType}:${sourceId} (hash=${newHash.substring(0, 8)})`
      );
    } catch {
      // html_dependencies table may not exist yet (migration not run)
      // This is fine - dependencies will be created on first download
    }
  }

  /**
   * Ensure the pending_sync_data table exists for crash-safe conflict resolution
   */
  private ensurePendingSyncDataTable(): void {
    if (!this.db.isOpen) return;
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS pending_sync_data (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          conflict_id TEXT UNIQUE NOT NULL,
          table_name TEXT NOT NULL,
          entity_id INTEGER,
          data_json TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } catch {
      // Table may already exist from migration
    }
  }

  /**
   * Load persisted conflict data from database on startup
   * This recovers state after a crash during sync pause for conflict resolution
   */
  private loadPersistedConflictData(): void {
    try {
      const rows = this.db.executeRead<{
        conflict_id: string;
        table_name: string;
        data_json: string;
      }>('SELECT conflict_id, table_name, data_json FROM pending_sync_data');

      for (const row of rows) {
        try {
          const data = JSON.parse(row.data_json);
          this.pendingConflictData.set(row.conflict_id, {
            tableName: row.table_name,
            data,
          });
        } catch {
          // Skip invalid JSON entries
        }
      }

      if (rows.length > 0) {
        this.log?.info(
          `Loaded ${rows.length} pending conflict data entries from database`
        );
        this.pausedForConflicts = this.conflictResolver.getPendingConflicts().length > 0;
      }
    } catch (err) {
      this.log?.debug(`Failed to load persisted conflict data: ${err}`);
    }
  }

  /**
   * Persist conflict data to database for crash safety
   */
  private persistConflictData(
    conflictId: string,
    tableName: string,
    data: Record<string, unknown>
  ): void {
    try {
      this.db.executeWrite(
        `INSERT OR REPLACE INTO pending_sync_data (conflict_id, table_name, data_json)
         VALUES (?, ?, ?)`,
        [conflictId, tableName, JSON.stringify(data)],
        'pending_sync_data'
      );
    } catch (err) {
      this.log?.debug(`Failed to persist conflict data: ${err}`);
    }
  }

  /**
   * Remove conflict data from database after resolution
   */
  private removePersistedConflictData(conflictId: string): void {
    try {
      this.db.executeWrite(
        'DELETE FROM pending_sync_data WHERE conflict_id = ?',
        [conflictId],
        'pending_sync_data'
      );
    } catch (err) {
      this.log?.debug(`Failed to remove persisted conflict data: ${err}`);
    }
  }

  /**
   * Clear all persisted conflict data (used when resolving all conflicts)
   */
  private clearAllPersistedConflictData(): void {
    try {
      this.db.executeWrite('DELETE FROM pending_sync_data', [], 'pending_sync_data');
    } catch (err) {
      this.log?.debug(`Failed to clear persisted conflict data: ${err}`);
    }
  }

  /**
   * Get the user's default target grade from user_preferences.
   * Used when creating new courses to apply the correct default.
   * @returns Default target grade (85 if not set)
   */
  private getDefaultTargetGrade(): number {
    if (!this.db.isOpen) return 85;
    try {
      const prefs = this.db.executeReadOne<{ value: string }>(
        "SELECT value FROM user_preferences WHERE key = 'academicSettings'"
      );
      if (prefs?.value) {
        const settings = JSON.parse(prefs.value);
        return settings.defaultTargetGrade ?? 85;
      }
    } catch {
      // Fall through to default
    }
    return 85;
  }

  /**
   * Acquire the sync mutex lock atomically.
   * Returns a release function that must be called when done.
   * This prevents race conditions between concurrent syncAll() calls.
   */
  private acquireSyncMutex(): Promise<() => void> {
    let release: () => void;
    const newMutex = new Promise<void>((resolve) => {
      release = resolve;
    });

    const previousMutex = this.syncMutex;
    this.syncMutex = newMutex;

    return previousMutex.then(() => release!);
  }

  /**
   * Release the sync mutex and reset syncing state
   */
  private releaseSyncMutex(): void {
    this.isSyncing = false;
    if (this.syncMutexRelease) {
      this.syncMutexRelease();
      this.syncMutexRelease = null;
    }
  }

  // ============ CHECKPOINT METHODS (delegated to SyncCheckpointManager) ============

  /**
   * Get the most recent incomplete checkpoint that can be resumed
   */
  getIncompleteCheckpoint(): SyncCheckpoint | null {
    return this.checkpointManager.getIncompleteCheckpoint();
  }

  /**
   * Clear all incomplete checkpoints (for manual reset)
   */
  clearIncompleteCheckpoints(): void {
    this.checkpointManager.clearIncompleteCheckpoints();
  }

  /**
   * Check if there's an incomplete sync that can be resumed
   */
  hasResumableSync(): boolean {
    return this.checkpointManager.getIncompleteCheckpoint() !== null;
  }

  // ============ BACKOFF METHODS (delegated to SyncBackoffManager) ============

  /**
   * Get backoff info for an endpoint (for logging/UI)
   */
  getEndpointBackoffInfo(
    endpoint: string,
    courseId: number | null
  ): EndpointBackoff | null {
    return this.backoffManager.getEndpointBackoffInfo(endpoint, courseId);
  }

  /**
   * Get all endpoints currently in backoff
   */
  getAllEndpointsInBackoff(): EndpointBackoff[] {
    return this.backoffManager.getAllEndpointsInBackoff();
  }

  /**
   * Get the conflict resolver instance
   */
  getConflictResolver(): SyncConflictResolver {
    return this.conflictResolver;
  }

  /**
   * Get sync preferences from user_preferences table
   */
  private getSyncPreferences(): { autoAssignDueDate: boolean } {
    try {
      const prefs = this.db.executeReadOne<{ value: string }>(
        "SELECT value FROM user_preferences WHERE key = 'syncPreferences'"
      );
      this.log?.debug(`[getSyncPreferences] Raw DB result: ${JSON.stringify(prefs)}`);
      if (prefs?.value) {
        const parsed = JSON.parse(prefs.value);
        this.log?.debug(`[getSyncPreferences] Parsed: ${JSON.stringify(parsed)}`);
        return {
          autoAssignDueDate: parsed.autoAssignDueDate ?? false,
        };
      }
      this.log?.debug('[getSyncPreferences] No prefs found, using defaults');
    } catch (e) {
      this.log?.debug(`[getSyncPreferences] Error: ${e}`);
      // Use defaults
    }
    return { autoAssignDueDate: false };
  }

  /**
   * Get per-course settings for sync behavior
   * @param courseId - Local course ID
   * @returns Course-specific settings or defaults
   */
  private getCourseSettings(courseId: number): {
    autoAssignDueDate: boolean; // Resolved value (per-course or app default)
    allowGuessedOverride: boolean;
  } {
    const course = this.db.executeReadOne<{
      auto_assign_due_date: number | null;
      allow_guessed_override: number | null;
    }>('SELECT auto_assign_due_date, allow_guessed_override FROM courses WHERE id = ?', [
      courseId,
    ]);

    const appDefaults = this.getSyncPreferences();

    // Per-course setting: NULL = inherit, 0 = disabled, 1 = enabled
    let autoAssignDueDate = appDefaults.autoAssignDueDate;
    if (
      course?.auto_assign_due_date !== null &&
      course?.auto_assign_due_date !== undefined
    ) {
      autoAssignDueDate = course.auto_assign_due_date === 1;
    }

    // Allow guessed override defaults to true
    const allowGuessedOverride = course?.allow_guessed_override !== 0;

    return { autoAssignDueDate, allowGuessedOverride };
  }

  /**
   * Get today's end time (23:59:00) as ISO string in local timezone
   * Format: YYYY-MM-DDTHH:MM:SS (no Z suffix to indicate local time)
   */
  private getTodayEndTime(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    // Return as local time without timezone indicator
    return `${year}-${month}-${day}T23:59:00`;
  }

  /**
   * Check if sync is paused waiting for conflict resolution
   */
  isPausedForConflicts(): boolean {
    return this.pausedForConflicts;
  }

  /**
   * Get pending conflicts that need user decision
   */
  getPendingConflicts(): SyncConflict[] {
    return this.conflictResolver.getPendingConflicts();
  }

  /**
   * Resolve a conflict and continue syncing
   */
  resolveConflict(resolution: ConflictResolution): void {
    const result = this.conflictResolver.resolveConflict(resolution);
    if (!result) return;

    // Apply the resolution to pending data
    const conflict = this.pendingConflictData.get(resolution.conflictId);
    if (conflict) {
      // Update the field with resolved value
      conflict.data[result.field] = result.value;

      // If user chose local value, keep it marked as modified
      // If user chose Canvas value, clear the modified flag
      if (resolution.useCanvasValue) {
        const entityId = conflict.data.id as number;
        if (entityId) {
          this.conflictResolver.clearFieldModified(
            conflict.tableName,
            entityId,
            result.field
          );
        }
      }

      this.pendingConflictData.delete(resolution.conflictId);
      // Remove from database for crash safety
      this.removePersistedConflictData(resolution.conflictId);
    }

    // Check if all conflicts are resolved
    if (this.conflictResolver.getPendingConflicts().length === 0) {
      this.pausedForConflicts = false;
      this.emit('conflicts-resolved');
    }
  }

  /**
   * Resolve all pending conflicts at once
   */
  resolveAllConflicts(useCanvasValues: boolean): void {
    this.conflictResolver.resolveAllConflicts(useCanvasValues);
    this.pendingConflictData.clear();
    // Clear all persisted conflict data from database
    this.clearAllPersistedConflictData();
    this.pausedForConflicts = false;
    this.emit('conflicts-resolved');
  }

  /**
   * Auto-complete tasks that have both weight > 0 and grade set.
   */
  private autoCompleteGradedTasks(courseId?: number): void {
    this.taskOps.autoCompleteGradedTasks(courseId);
  }

  /**
   * Perform a full sync of all data with atomic commit/rollback
   *
   * Two-phase sync:
   * 1. FETCH PHASE: Get all data from Canvas API (no DB writes)
   * 2. COMMIT PHASE: Write all data in a single transaction
   *
   * If any API call fails, no data is written (rollback).
   *
   * @param options Optional sync options to filter courses and content types
   */
  async syncAll(options?: SyncOptions): Promise<FullSyncResult> {
    this.log?.debug(
      `syncAll called, htmlContentSync=${!!this.htmlContentSync}, filesBaseDir=${this.filesBaseDir}`
    );

    // Skip sync if database is not open
    if (!this.db.isOpen) {
      this.log?.warn('Sync skipped: database is not open');
      this.emit('sync-error', { type: 'full', error: 'Database is not available' });
      return this.createSkippedResult(['Database not available'], false);
    }

    // Skip sync if database is locked (e.g., during app reset)
    if (this.db.isWriteLocked()) {
      this.log?.debug('Sync skipped: database is locked for writes');
      return this.createSkippedResult([], true);
    }

    // Check synchronously first - immediate rejection avoids redundant queueing
    if (this.isSyncing) {
      throw new Error('Sync already in progress');
    }
    this.isSyncing = true;

    // Acquire mutex for sequencing concurrent syncAll() calls
    const release = await this.acquireSyncMutex();
    this.syncMutexRelease = release;

    // Initialize abort controller for this sync session
    this.abortController = new AbortController();
    this.isAborted = false;

    const startTime = Date.now();
    const errors: string[] = [];
    const resumeFromCheckpoint = options?.resumeFromCheckpoint ?? false;

    // Check for resumable checkpoint
    let checkpoint: SyncCheckpoint | null = null;
    let syncId: string;

    if (resumeFromCheckpoint) {
      checkpoint = this.checkpointManager.getIncompleteCheckpoint();
      if (checkpoint) {
        syncId = checkpoint.syncId;
        this.log?.info(
          `Resuming sync from checkpoint: ${syncId}, phase: ${checkpoint.phase}, progress: ${checkpoint.completedCourses}/${checkpoint.totalCourses}`
        );
        this.emit('sync-resume', { syncId, checkpoint });
      } else {
        syncId = this.checkpointManager.generateSyncId();
        this.log?.debug('No resumable checkpoint found, starting fresh sync');
      }
    } else {
      syncId = this.checkpointManager.generateSyncId();
      // Clear any old incomplete checkpoints when starting fresh
      this.checkpointManager.clearIncompleteCheckpoints();
    }

    this.emit('sync-start', { type: 'full', syncId, resuming: !!checkpoint });

    // Set abort state on orchestrator
    this.syncOrchestrator.setAborted(false);

    // ============ PHASE 1: FETCH ALL DATA ============
    let fetched: {
      courses: CanvasCourse[];
      tasks: Map<number, CanvasAssignment[]>;
      announcements: Map<number, CanvasAnnouncement[]>;
      modules: Map<number, CanvasModule[]>;
      pages: Map<number, CanvasPage[]>;
      folders: Map<number, CanvasFolder[]>;
      files: Map<number, CanvasFile[]>;
      assignmentGroups: Map<
        number,
        {
          id: number;
          name: string;
          position: number;
          group_weight: number | null;
          rules?: { drop_lowest?: number; drop_highest?: number; never_drop?: number[] };
        }[]
      >;
    };

    try {
      const fetchResult = await this.syncOrchestrator.executeFetchPhase(
        options || {},
        syncId,
        checkpoint
      );
      fetched = fetchResult.fetched;
      errors.push(...fetchResult.errors);

      // Check for abort before commit phase
      this.checkAborted();
    } catch (fetchError) {
      // FETCH FAILED - Mark checkpoint as failed
      this.checkpointManager.failCheckpoint(
        syncId,
        fetchError instanceof Error ? fetchError.message : String(fetchError)
      );
      this.releaseSyncMutex();
      const message =
        fetchError instanceof Error ? fetchError.message : String(fetchError);
      errors.push(`Fetch failed: ${message}`);

      this.emit('sync-error', { type: 'fetch', error: message });
      this.emit('sync-aborted', { reason: 'fetch_failed', error: message });

      return this.createFailedResult(
        'courses',
        `Fetch failed: ${message}`,
        startTime,
        errors
      );
    }

    // ============ PHASE 2: COMMIT ALL DATA ============
    let counts: Record<string, number>;

    // Snapshot file state BEFORE commit for comparison after all file processing
    const fileSnapshot = this.syncOrchestrator.snapshotFileState();

    try {
      // Check if database was locked during fetch phase (e.g., app reset occurred)
      if (this.db.isWriteLocked()) {
        this.log?.debug('Sync aborted before commit: database is locked for writes');
        this.releaseSyncMutex();
        return this.createSkippedResult([], true, Date.now() - startTime);
      }

      const commitResult = this.syncOrchestrator.executeCommitPhase(fetched, syncId);
      counts = commitResult.counts;
      errors.push(...commitResult.errors);
    } catch (commitError) {
      // COMMIT FAILED - Transaction automatically rolled back
      const message =
        commitError instanceof Error ? commitError.message : String(commitError);

      // Mark checkpoint as failed
      this.checkpointManager.failCheckpoint(syncId, message);
      this.releaseSyncMutex();

      // If database was locked (e.g., during app reset), treat as graceful skip, not error
      if (message.includes('Database is locked for writes')) {
        this.log?.debug('Sync aborted during commit: database is locked for writes');
        return this.createSkippedResult([], true, Date.now() - startTime);
      }

      errors.push(`Commit failed (rolled back): ${message}`);

      this.emit('sync-error', { type: 'commit', error: message });
      this.emit('sync-rollback', { reason: 'commit_failed', error: message });

      return this.createFailedResult(
        'courses',
        `Commit failed: ${message}`,
        startTime,
        errors
      );
    } finally {
      // Clean up abort controller
      this.abortController = null;
      this.releaseSyncMutex();
    }

    // Check if we were aborted before continuing to file refs phase
    if (this.isAborted) {
      this.log?.info('Sync aborted before file reference extraction');
      return this.createAbortedResult(startTime, errors);
    }

    // ============ PHASE 3 & 4: FILE PROCESSING ============
    // Can be deferred for faster perceived sync time (optimization #8)
    if (options?.deferFileProcessing) {
      return this.handleDeferredFileProcessing(
        fetched.courses,
        counts,
        errors,
        syncId,
        startTime,
        fileSnapshot
      );
    }

    // Execute file processing phases
    await this.executeFileProcessingPhases(fetched.courses, errors, options);

    // Record file and page sync_updates AFTER all file processing is complete
    // This captures files/pages from: direct API, module items, HTML content sync
    const resourceCounts = this.syncOrchestrator.recordFileUpdates(syncId, fileSnapshot);

    // Emit sync-updates event with file and page counts
    const totalResourceUpdates =
      resourceCounts.newFiles +
      resourceCounts.updatedFiles +
      resourceCounts.newPages +
      resourceCounts.updatedPages;
    if (totalResourceUpdates > 0) {
      this.log?.info(
        `[SyncEngine] Emitting resource updates: ${resourceCounts.newFiles} new files, ${resourceCounts.updatedFiles} updated files, ${resourceCounts.newPages} new pages, ${resourceCounts.updatedPages} updated pages`
      );
      this.emit('sync-updates', {
        total: totalResourceUpdates,
        newFiles: resourceCounts.newFiles,
        updatedFiles: resourceCounts.updatedFiles,
        newPages: resourceCounts.newPages,
        updatedPages: resourceCounts.updatedPages,
      });
    }

    // ============ SUCCESS ============
    const result = this.createSuccessResult(counts, errors, startTime);

    // Mark sync checkpoint as completed
    this.checkpointManager.completeCheckpoint(syncId);

    // Check for syllabus changes after files are synced
    await this.checkSyllabusChanges();

    // Auto-create/update calendar events for all tasks
    this.syncTaskCalendarEvents();

    // Auto-archive courses with expired term end dates
    this.autoArchiveExpiredCourses();

    this.emit('sync-complete', result);
    return result;
  }

  /**
   * Create a skipped result when sync cannot proceed
   */
  private createSkippedResult(
    errors: string[],
    success: boolean,
    duration: number = 0
  ): FullSyncResult {
    const skippedResult: SyncResult = {
      success,
      entity: '',
      count: 0,
      errors,
      duration,
    };
    return {
      courses: { ...skippedResult, entity: 'courses' },
      tasks: { ...skippedResult, entity: 'tasks' },
      announcements: { ...skippedResult, entity: 'announcements' },
      modules: { ...skippedResult, entity: 'modules' },
      pages: { ...skippedResult, entity: 'pages' },
      folders: { ...skippedResult, entity: 'folders' },
      files: { ...skippedResult, entity: 'files' },
      totalDuration: duration,
      errors,
    };
  }

  /**
   * Create a failed result for a specific phase
   */
  private createFailedResult(
    entity: string,
    errorMessage: string,
    startTime: number,
    errors: string[]
  ): FullSyncResult {
    return {
      courses: {
        success: false,
        entity: 'courses',
        count: 0,
        errors: entity === 'courses' ? [errorMessage] : [],
        duration: Date.now() - startTime,
      },
      tasks: { success: false, entity: 'tasks', count: 0, errors: [], duration: 0 },
      announcements: {
        success: false,
        entity: 'announcements',
        count: 0,
        errors: [],
        duration: 0,
      },
      modules: { success: false, entity: 'modules', count: 0, errors: [], duration: 0 },
      pages: { success: false, entity: 'pages', count: 0, errors: [], duration: 0 },
      folders: { success: false, entity: 'folders', count: 0, errors: [], duration: 0 },
      files: { success: false, entity: 'files', count: 0, errors: [], duration: 0 },
      totalDuration: Date.now() - startTime,
      errors,
    };
  }

  /**
   * Create an aborted result
   */
  private createAbortedResult(startTime: number, errors: string[]): FullSyncResult {
    const abortedResult: SyncResult = {
      success: false,
      entity: '',
      count: 0,
      errors: ['Sync aborted'],
      duration: 0,
    };
    return {
      courses: { ...abortedResult, entity: 'courses' },
      tasks: { ...abortedResult, entity: 'tasks' },
      announcements: { ...abortedResult, entity: 'announcements' },
      modules: { ...abortedResult, entity: 'modules' },
      pages: { ...abortedResult, entity: 'pages' },
      folders: { ...abortedResult, entity: 'folders' },
      files: { ...abortedResult, entity: 'files' },
      totalDuration: Date.now() - startTime,
      errors: [...errors, 'Sync aborted'],
    };
  }

  /**
   * Create a success result
   */
  private createSuccessResult(
    counts: Record<string, number>,
    errors: string[],
    startTime: number
  ): FullSyncResult {
    return {
      courses: {
        success: true,
        entity: 'courses',
        count: counts.courses || 0,
        errors: [],
        duration: 0,
      },
      tasks: {
        success: true,
        entity: 'tasks',
        count: counts.tasks || 0,
        errors: [],
        duration: 0,
      },
      announcements: {
        success: true,
        entity: 'announcements',
        count: counts.announcements || 0,
        errors: [],
        duration: 0,
      },
      modules: {
        success: true,
        entity: 'modules',
        count: counts.modules || 0,
        errors: [],
        duration: 0,
      },
      pages: {
        success: true,
        entity: 'pages',
        count: counts.pages || 0,
        errors: [],
        duration: 0,
      },
      folders: {
        success: true,
        entity: 'folders',
        count: counts.folders || 0,
        errors: [],
        duration: 0,
      },
      files: {
        success: true,
        entity: 'files',
        count: counts.files || 0,
        errors: [],
        duration: 0,
      },
      totalDuration: Date.now() - startTime,
      errors,
    };
  }

  /**
   * Handle deferred file processing mode
   */
  private handleDeferredFileProcessing(
    courses: CanvasCourse[],
    counts: Record<string, number>,
    errors: string[],
    syncId: string,
    startTime: number,
    fileSnapshot: Map<
      string,
      {
        id: number;
        remote_updated_at: string | null;
        course_id: number;
        title: string;
        type: 'file' | 'page';
      }
    >
  ): FullSyncResult {
    this.log?.info(
      'File processing deferred - call processFileReferencesBackground() to complete'
    );
    this.emit('sync-phase', { phase: 'file-refs', status: 'deferred' });
    this.emit('sync-phase', { phase: 'html-content', status: 'deferred' });

    // Store synced courses and file snapshot for deferred processing
    this.lastSyncedCourses = courses;
    this.lastFileSnapshot = fileSnapshot;
    this.lastSyncId = syncId;

    const deferredResult = this.createSuccessResult(counts, errors, startTime);

    this.checkpointManager.completeCheckpoint(syncId);

    // Auto-create/update calendar events for all tasks (even in deferred mode)
    this.syncTaskCalendarEvents();

    // Auto-archive courses with expired term end dates
    this.autoArchiveExpiredCourses();

    this.emit('sync-complete', deferredResult);
    return deferredResult;
  }

  /**
   * Execute file processing phases (Phase 3 and 4)
   */
  private async executeFileProcessingPhases(
    courses: CanvasCourse[],
    errors: string[],
    options?: SyncOptions
  ): Promise<void> {
    // ============ PHASE 3: EXTRACT FILE REFERENCES ============
    this.emit('sync-phase', { phase: 'file-refs', status: 'started' });

    const fileRefCounts = {
      pages: 0,
      assignments: 0,
      syllabus: 0,
      announcements: 0,
      modules: 0,
      fetched: 0,
    };

    // Build course lookup map once (optimization: avoid per-course DB queries)
    const allCourses = this.db.executeRead<{
      id: number;
      external_id: string;
      is_hidden: number;
      code: string;
    }>('SELECT id, external_id, is_hidden, code FROM courses');
    const courseMap = new Map(allCourses.map((c) => [c.external_id, c]));

    // Extract file references from visible synced courses only
    for (const course of courses) {
      const localCourse = courseMap.get(String(course.id));

      // Skip hidden courses for detailed file processing
      if (!localCourse || localCourse.is_hidden === 1) {
        continue;
      }

      const extracted = await this.extractAllFileReferences(localCourse.id);
      fileRefCounts.pages += extracted.pages.count;
      fileRefCounts.assignments += extracted.assignments.count;
      fileRefCounts.syllabus += extracted.syllabus.count;
      fileRefCounts.announcements += extracted.announcements.count;
      fileRefCounts.modules += extracted.modules.count;

      // Fetch missing files discovered in HTML (pass canvasCourseId to avoid re-query)
      const fetchedRefs = await this.fetchMissingFileReferences(
        localCourse.id,
        course.id,
        localCourse.code
      );
      fileRefCounts.fetched += fetchedRefs.count;
    }

    this.emit('sync-phase', {
      phase: 'file-refs',
      status: 'complete',
      counts: fileRefCounts,
    });

    // ============ PHASE 4: HTML CONTENT REGISTRATION ============
    this.log?.debug(
      `Phase 4: htmlContentSync=${!!this.htmlContentSync}, filesBaseDir=${this.filesBaseDir}`
    );

    if (this.htmlContentSync && this.filesBaseDir) {
      this.emit('sync-phase', { phase: 'html-content', status: 'started' });

      const htmlSyncCounts = { itemsRegistered: 0, resourcesFound: 0 };

      // Filter courses for file sync - only visible courses
      let coursesForFileSync = courses;
      if (options?.courseIds && options.courseIds.length > 0) {
        const courseIdSet = new Set(options.courseIds);
        coursesForFileSync = courses.filter((c) => courseIdSet.has(c.id));
        this.log?.debug(
          `Files sync filtered to ${coursesForFileSync.length} courses based on courseIds selection`
        );
      }

      // Build list of visible courses for HTML sync (use cached courseMap)
      const visibleCoursesForHtml: { localCourseId: number }[] = [];
      for (const course of coursesForFileSync) {
        const localCourse = courseMap.get(String(course.id));

        // Skip hidden courses for HTML content sync
        if (localCourse && localCourse.is_hidden !== 1) {
          visibleCoursesForHtml.push({ localCourseId: localCourse.id });
        }
      }

      // Process courses in parallel batches
      const HTML_BATCH_SIZE = 3;
      for (let i = 0; i < visibleCoursesForHtml.length; i += HTML_BATCH_SIZE) {
        const batch = visibleCoursesForHtml.slice(i, i + HTML_BATCH_SIZE);

        const results = await Promise.all(
          batch.map(async ({ localCourseId }) => {
            return this.htmlContentSync!.syncCourseHtmlContent(
              localCourseId,
              this.filesBaseDir!
            );
          })
        );

        // Aggregate results
        for (const htmlResult of results) {
          htmlSyncCounts.itemsRegistered += htmlResult.itemsRegistered;
          htmlSyncCounts.resourcesFound += htmlResult.resourcesFound;

          if (htmlResult.errors.length > 0) {
            errors.push(...htmlResult.errors.map((e) => `HTML sync: ${e}`));
          }
        }
      }

      this.emit('sync-phase', {
        phase: 'html-content',
        status: 'complete',
        counts: htmlSyncCounts,
      });
    }
  }

  /**
   * Check for syllabus file changes and update change_detected_at if needed.
   * Called after sync completes to detect when syllabus files have been modified.
   */
  private async checkSyllabusChanges(): Promise<void> {
    try {
      // Get all designated syllabuses with their current resource info
      const syllabuses = this.db.executeRead<{
        id: number;
        course_id: number;
        resource_id: number;
        resource_updated_at: string | null;
        change_detected_at: string | null;
      }>(
        'SELECT id, course_id, resource_id, resource_updated_at, change_detected_at FROM course_syllabuses'
      );

      for (const syllabus of syllabuses) {
        // Get current resource updated_at
        const resource = this.db.executeReadOne<{ remote_updated_at: string | null }>(
          'SELECT remote_updated_at FROM resources WHERE id = ?',
          [syllabus.resource_id]
        );

        if (!resource) continue;

        // Check if file was modified since we last recorded
        const currentUpdatedAt = resource.remote_updated_at;
        const recordedUpdatedAt = syllabus.resource_updated_at;

        if (
          currentUpdatedAt &&
          recordedUpdatedAt &&
          currentUpdatedAt !== recordedUpdatedAt
        ) {
          // Syllabus file has changed - set change_detected_at if not already set
          if (!syllabus.change_detected_at) {
            this.db.executeWrite(
              `UPDATE course_syllabuses
               SET change_detected_at = CURRENT_TIMESTAMP,
                   resource_updated_at = ?
               WHERE id = ?`,
              [currentUpdatedAt, syllabus.id],
              'course_syllabuses'
            );

            this.emit('syllabus-changed', {
              courseId: syllabus.course_id,
              resourceId: syllabus.resource_id,
            });
          }
        }
      }
    } catch (_err) {
      // Non-critical - log and continue
      // Silently ignore errors to not disrupt sync flow
    }
  }

  /**
   * Sync courses from Canvas
   */
  async syncCourses(): Promise<SyncResult> {
    return this.courseOps.syncCourses();
  }

  /**
   * Sync tasks (assignments) for a specific course
   */
  async syncTasks(canvasCourseId: number, localCourseId: number): Promise<SyncResult> {
    return this.taskOps.syncTasks(canvasCourseId, localCourseId);
  }

  /**
   * Sync calendar events for all tasks.
   */
  syncTaskCalendarEvents(): { created: number; updated: number; errors: string[] } {
    return this.taskOps.syncTaskCalendarEvents();
  }

  /**
   * Auto-archive courses whose enrollment term end_at date has passed.
   */
  autoArchiveExpiredCourses(): { archived: number; errors: string[] } {
    return this.courseOps.autoArchiveExpiredCourses();
  }

  /**
   * Sync announcements for a specific course
   */
  async syncAnnouncements(
    canvasCourseId: number,
    localCourseId: number
  ): Promise<SyncResult> {
    return this.contentOps.syncAnnouncements(canvasCourseId, localCourseId);
  }

  /**
   * Sync modules for a specific course
   */
  async syncModules(canvasCourseId: number, localCourseId: number): Promise<SyncResult> {
    return this.contentOps.syncModules(canvasCourseId, localCourseId);
  }

  /**
   * Sync pages for a specific course
   */
  async syncPages(canvasCourseId: number, localCourseId: number): Promise<SyncResult> {
    return this.contentOps.syncPages(canvasCourseId, localCourseId);
  }

  /**
   * Sync folders for a specific course
   */
  async syncFolders(canvasCourseId: number, localCourseId: number): Promise<SyncResult> {
    return this.fileOps.syncFolders(canvasCourseId, localCourseId);
  }

  /**
   * Sync files for a specific course
   */
  async syncFiles(canvasCourseId: number, localCourseId: number): Promise<SyncResult> {
    return this.fileOps.syncFiles(canvasCourseId, localCourseId);
  }

  /**
   * Sync files for a specific folder by folder ID
   */
  async syncFolderFiles(
    canvasFolderId: number,
    localCourseId: number,
    options: { forceRefresh?: boolean } = {}
  ): Promise<SyncResult> {
    return this.fileOps.syncFolderFiles(canvasFolderId, localCourseId, options);
  }

  /**
   * Sync a single course by Canvas ID
   */
  async syncCourse(canvasCourseId: number): Promise<{
    course: SyncResult;
    tasks: SyncResult;
    announcements: SyncResult;
    modules: SyncResult;
    pages: SyncResult;
  }> {
    // Fetch and upsert the course
    const courseResult = await this.syncSingleCourse(canvasCourseId);

    if (!courseResult.success) {
      return {
        course: courseResult,
        tasks: {
          success: false,
          entity: 'tasks',
          count: 0,
          errors: ['Course sync failed'],
          duration: 0,
        },
        announcements: {
          success: false,
          entity: 'announcements',
          count: 0,
          errors: ['Course sync failed'],
          duration: 0,
        },
        modules: {
          success: false,
          entity: 'modules',
          count: 0,
          errors: ['Course sync failed'],
          duration: 0,
        },
        pages: {
          success: false,
          entity: 'pages',
          count: 0,
          errors: ['Course sync failed'],
          duration: 0,
        },
      };
    }

    // Get local course ID
    const localCourse = this.db.executeReadOne<{ id: number }>(
      'SELECT id FROM courses WHERE external_id = ?',
      [String(canvasCourseId)]
    );

    if (!localCourse) {
      return {
        course: courseResult,
        tasks: {
          success: false,
          entity: 'tasks',
          count: 0,
          errors: ['Course not found'],
          duration: 0,
        },
        announcements: {
          success: false,
          entity: 'announcements',
          count: 0,
          errors: ['Course not found'],
          duration: 0,
        },
        modules: {
          success: false,
          entity: 'modules',
          count: 0,
          errors: ['Course not found'],
          duration: 0,
        },
        pages: {
          success: false,
          entity: 'pages',
          count: 0,
          errors: ['Course not found'],
          duration: 0,
        },
      };
    }

    // Sync related data in parallel - use allSettled to handle partial failures
    const results = await Promise.allSettled([
      this.syncTasks(canvasCourseId, localCourse.id),
      this.syncAnnouncements(canvasCourseId, localCourse.id),
      this.syncModules(canvasCourseId, localCourse.id),
      this.syncPages(canvasCourseId, localCourse.id),
    ]);

    // Extract results, using error fallback for rejected promises
    const makeFailedResult = (entity: string, error: unknown): SyncResult => ({
      success: false,
      entity,
      count: 0,
      errors: [error instanceof Error ? error.message : String(error)],
      duration: 0,
    });

    const tasks =
      results[0].status === 'fulfilled'
        ? results[0].value
        : makeFailedResult('tasks', results[0].reason);
    const announcements =
      results[1].status === 'fulfilled'
        ? results[1].value
        : makeFailedResult('announcements', results[1].reason);
    const modules =
      results[2].status === 'fulfilled'
        ? results[2].value
        : makeFailedResult('modules', results[2].reason);
    const pages =
      results[3].status === 'fulfilled'
        ? results[3].value
        : makeFailedResult('pages', results[3].reason);

    return { course: courseResult, tasks, announcements, modules, pages };
  }

  /**
   * Sync a single course (helper)
   */
  private async syncSingleCourse(canvasCourseId: number): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    try {
      const response = await this.rateLimiter.enqueue(
        () =>
          this.client.get<CanvasCourse>(`/courses/${canvasCourseId}`, {
            include: ['total_scores', 'current_grading_period_scores', 'syllabus_body'],
          }),
        10
      );

      const baseUrl = this.client.getBaseUrl();
      const defaultTargetGrade = this.getDefaultTargetGrade();
      const localCourse = mapCourse(response.data, baseUrl, defaultTargetGrade);

      // For existing courses, preserve their target_grade and target_grade_source
      const existing = this.db.executeReadOne<{
        target_grade: number;
        target_grade_source: string;
      }>('SELECT target_grade, target_grade_source FROM courses WHERE external_id = ?', [
        localCourse.external_id,
      ]);
      if (existing) {
        // Keep existing target grade settings
        localCourse.target_grade = existing.target_grade;
        localCourse.target_grade_source = existing.target_grade_source as
          | 'default'
          | 'manual';
      }

      this.db.upsert('courses', localCourse);

      return {
        success: true,
        entity: 'courses',
        count: 1,
        errors: [],
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to sync course ${canvasCourseId}: ${message}`);
      return {
        success: false,
        entity: 'courses',
        count: 0,
        errors,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Update sync metadata for an endpoint
   */
  private updateSyncMetadata(endpoint: string, etag?: string): void {
    this.db.executeWrite(
      `INSERT INTO sync_metadata (endpoint, etag, last_synced_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(endpoint) DO UPDATE SET
         etag = excluded.etag,
         last_synced_at = CURRENT_TIMESTAMP`,
      [endpoint, etag || null],
      'sync_metadata'
    );
  }

  /**
   * Get sync metadata for an endpoint
   */
  getSyncMetadata(endpoint: string): SyncMetadata | undefined {
    return this.db.executeReadOne<SyncMetadata>(
      'SELECT * FROM sync_metadata WHERE endpoint = ?',
      [endpoint]
    );
  }

  /**
   * Get last sync time for all endpoints
   */
  getAllSyncMetadata(): SyncMetadata[] {
    return this.db.executeRead<SyncMetadata>(
      'SELECT * FROM sync_metadata ORDER BY last_synced_at DESC'
    );
  }

  /**
   * Check if currently syncing
   */
  isBusy(): boolean {
    return this.isSyncing;
  }

  /**
   * Cancel any pending sync operations
   * Used when system is about to suspend
   */
  async cancelPendingSync(): Promise<void> {
    if (!this.isSyncing) {
      return;
    }

    this.log?.info('[SyncEngine] Cancelling pending sync for system suspend');
    this.emit('sync:cancelling');

    // Mark as no longer syncing
    this.releaseSyncMutex();

    // Give a moment for any in-flight requests to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    this.emit('sync:cancelled');
    this.log?.info('[SyncEngine] Sync cancelled successfully');
  }

  /**
   * Get rate limiter status
   */
  getRateLimitStatus() {
    return this.rateLimiter.getStatus();
  }

  /**
   * Fetch files that were discovered in HTML but not in resources table
   */
  async fetchMissingFileReferences(
    localCourseId: number,
    canvasCourseId?: number,
    _courseCode?: string
  ): Promise<{ count: number; errors: string[] }> {
    return this.fileRefExtractor.fetchMissingFileReferences(
      localCourseId,
      canvasCourseId
    );
  }

  /**
   * Get context folder path based on source type
   */
  private getContextFolder(sourceType: string, sourceId: string): string {
    return this.fileRefExtractor.getContextFolder(sourceType, sourceId);
  }

  /**
   * Extract all file references for a course
   */
  async extractAllFileReferences(localCourseId: number): Promise<{
    pages: { count: number; errors: string[] };
    assignments: { count: number; errors: string[] };
    syllabus: { count: number; errors: string[] };
    announcements: { count: number; errors: string[] };
    modules: { count: number; errors: string[] };
    total: number;
  }> {
    return this.fileRefExtractor.extractAllFileReferences(localCourseId);
  }

  /**
   * Configure HTML content sync
   */
  configureHtmlContentSync(config: {
    downloadManager: FileDownloadManager;
    htmlContentSyncConfig: HtmlContentSyncConfig;
    filesBaseDir: string;
  }): void {
    this.downloadManager = config.downloadManager;
    this.filesBaseDir = config.filesBaseDir;
    this.htmlContentSync = new HtmlContentSync({
      db: this.db,
      downloadManager: config.downloadManager,
      config: config.htmlContentSyncConfig,
      authToken: this.client.getAuthToken(),
      baseUrl: this.client.getBaseUrl(),
    });
  }

  /**
   * Process file references in the background (for deferred file processing)
   * Call this after fullSync with deferFileProcessing: true
   */
  async processFileReferencesBackground(): Promise<{
    fileRefs: { count: number; errors: string[] };
    htmlContent: { itemsRegistered: number; resourcesFound: number; errors: string[] };
  }> {
    const errors: string[] = [];

    // Use courses from last sync, or get all visible courses
    const coursesToProcess =
      this.lastSyncedCourses.length > 0
        ? this.lastSyncedCourses
        : this.db
            .executeRead<{
              external_id: string;
              id: number;
              code: string;
            }>('SELECT external_id, id, code FROM courses WHERE is_hidden = 0')
            .map((c) => ({ id: parseInt(c.external_id, 10) }) as CanvasCourse);

    if (coursesToProcess.length === 0) {
      return {
        fileRefs: { count: 0, errors: [] },
        htmlContent: { itemsRegistered: 0, resourcesFound: 0, errors: [] },
      };
    }

    // Build course lookup map
    const allCourses = this.db.executeRead<{
      id: number;
      external_id: string;
      is_hidden: number;
      code: string;
    }>('SELECT id, external_id, is_hidden, code FROM courses');
    const courseMap = new Map(allCourses.map((c) => [c.external_id, c]));

    // ============ PHASE 3: EXTRACT FILE REFERENCES ============
    this.emit('sync-phase', { phase: 'file-refs', status: 'started' });

    const fileRefCounts = {
      pages: 0,
      assignments: 0,
      syllabus: 0,
      announcements: 0,
      modules: 0,
      fetched: 0,
    };

    for (const course of coursesToProcess) {
      const localCourse = courseMap.get(String(course.id));
      if (!localCourse || localCourse.is_hidden === 1) continue;

      const extracted = await this.extractAllFileReferences(localCourse.id);
      fileRefCounts.pages += extracted.pages.count;
      fileRefCounts.assignments += extracted.assignments.count;
      fileRefCounts.syllabus += extracted.syllabus.count;
      fileRefCounts.announcements += extracted.announcements.count;
      fileRefCounts.modules += extracted.modules.count;

      const fetchedRefs = await this.fetchMissingFileReferences(
        localCourse.id,
        course.id,
        localCourse.code
      );
      fileRefCounts.fetched += fetchedRefs.count;
      if (fetchedRefs.errors.length > 0) {
        errors.push(...fetchedRefs.errors);
      }
    }

    this.emit('sync-phase', {
      phase: 'file-refs',
      status: 'complete',
      counts: fileRefCounts,
    });

    // ============ PHASE 4: HTML CONTENT REGISTRATION ============
    const htmlSyncCounts = { itemsRegistered: 0, resourcesFound: 0 };
    const htmlErrors: string[] = [];

    if (this.htmlContentSync && this.filesBaseDir) {
      this.emit('sync-phase', { phase: 'html-content', status: 'started' });

      const visibleCourses = coursesToProcess
        .map((c) => courseMap.get(String(c.id)))
        .filter((c) => c && c.is_hidden !== 1) as typeof allCourses;

      // Process in parallel batches
      const HTML_BATCH_SIZE = 3;
      for (let i = 0; i < visibleCourses.length; i += HTML_BATCH_SIZE) {
        const batch = visibleCourses.slice(i, i + HTML_BATCH_SIZE);
        const results = await Promise.all(
          batch.map((c) =>
            this.htmlContentSync!.syncCourseHtmlContent(c.id, this.filesBaseDir!)
          )
        );

        for (const htmlResult of results) {
          htmlSyncCounts.itemsRegistered += htmlResult.itemsRegistered;
          htmlSyncCounts.resourcesFound += htmlResult.resourcesFound;
          if (htmlResult.errors.length > 0) {
            htmlErrors.push(...htmlResult.errors);
          }
        }
      }

      this.emit('sync-phase', {
        phase: 'html-content',
        status: 'complete',
        counts: htmlSyncCounts,
      });
    }

    // Record file and page sync_updates AFTER all file processing is complete
    if (this.lastFileSnapshot && this.lastSyncId) {
      const resourceCounts = this.syncOrchestrator.recordFileUpdates(
        this.lastSyncId,
        this.lastFileSnapshot
      );

      // Emit sync-updates event with file and page counts
      const totalResourceUpdates =
        resourceCounts.newFiles +
        resourceCounts.updatedFiles +
        resourceCounts.newPages +
        resourceCounts.updatedPages;
      if (totalResourceUpdates > 0) {
        this.log?.info(
          `[SyncEngine] Background: Emitting resource updates: ${resourceCounts.newFiles} new files, ${resourceCounts.updatedFiles} updated files, ${resourceCounts.newPages} new pages, ${resourceCounts.updatedPages} updated pages`
        );
        this.emit('sync-updates', {
          total: totalResourceUpdates,
          newFiles: resourceCounts.newFiles,
          updatedFiles: resourceCounts.updatedFiles,
          newPages: resourceCounts.newPages,
          updatedPages: resourceCounts.updatedPages,
        });
      }
    }

    // Clear stored data for deferred processing
    this.lastSyncedCourses = [];
    this.lastFileSnapshot = null;
    this.lastSyncId = null;

    // Check for syllabus changes
    await this.checkSyllabusChanges();

    return {
      fileRefs: { count: fileRefCounts.fetched, errors },
      htmlContent: { ...htmlSyncCounts, errors: htmlErrors },
    };
  }

  /**
   * Stop any ongoing sync operations and cleanup resources
   */
  stop(): void {
    // Remove event listeners to prevent memory leaks
    if (this.rateLimitedHandler) {
      this.rateLimiter.off('rate-limited', this.rateLimitedHandler);
      this.rateLimitedHandler = null;
    }
    this.rateLimiter.stop();
    this.releaseSyncMutex();
  }

  /**
   * Abort the current sync operation immediately
   * Use this for emergency shutdown or crash recovery
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isAborted = true;
    this.emit('sync-aborted', { reason: 'manual_abort', error: null });
    this.log?.info('[SyncEngine] Sync aborted');
    this.releaseSyncMutex();
  }

  /**
   * Check if sync has been aborted
   * Call this at key points during sync to enable early termination
   */
  private checkAborted(): void {
    if (this.isAborted) {
      throw new Error('Sync aborted');
    }
  }

  /**
   * Get the current abort signal for passing to fetch/async operations
   * Returns null if no sync is in progress
   */
  getAbortSignal(): AbortSignal | null {
    return this.abortController?.signal ?? null;
  }

  /**
   * Enable sync diagnostics logging
   */
  enableDiagnostics(): void {
    this.diagnosticsEnabled = true;
    this.diagnosticLog = [];
  }

  /**
   * Disable sync diagnostics logging
   */
  disableDiagnostics(): void {
    this.diagnosticsEnabled = false;
  }

  /**
   * Get diagnostic log entries
   */
  getDiagnosticLog(): SyncDiagnosticEntry[] {
    return [...this.diagnosticLog];
  }

  /**
   * Clear diagnostic log
   */
  clearDiagnosticLog(): void {
    this.diagnosticLog = [];
  }

  /**
   * Log a diagnostic entry
   */
  private logDiagnostic(entry: Omit<SyncDiagnosticEntry, 'timestamp'>): void {
    if (!this.diagnosticsEnabled) return;

    this.diagnosticLog.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });

    // Emit for real-time monitoring
    this.emit('sync-diagnostic', {
      ...entry,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Compare before/after values for a record
   */
  private compareRecords(
    before: Record<string, unknown> | undefined,
    after: Record<string, unknown>,
    preservedFields: string[]
  ): {
    preserved: Record<string, { before: unknown; after: unknown }>;
    updated: Record<string, { before: unknown; after: unknown }>;
  } {
    const preserved: Record<string, { before: unknown; after: unknown }> = {};
    const updated: Record<string, { before: unknown; after: unknown }> = {};

    if (!before) {
      return { preserved, updated };
    }

    for (const key of Object.keys(after)) {
      if (key === 'id' || key === 'external_id') continue;

      const beforeVal = before[key];
      const afterVal = after[key];

      if (beforeVal !== afterVal) {
        if (preservedFields.includes(key)) {
          preserved[key] = { before: beforeVal, after: beforeVal }; // Kept the before value
        } else {
          updated[key] = { before: beforeVal, after: afterVal };
        }
      }
    }

    return { preserved, updated };
  }
}
