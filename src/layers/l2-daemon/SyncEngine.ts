/**
 * Sync Engine - Orchestrates data synchronization from Canvas to local database
 *
 * Responsibilities:
 * - Fetches data from Canvas API via CanvasClient
 * - Transforms data using DataMappers
 * - Upserts data into local SQLite database
 * - Handles incremental sync using ETags
 * - Tracks sync metadata for optimization
 * - Detects policy-related announcements
 */

import { EventEmitter } from 'events';
import { CanvasClient } from './CanvasClient';
import { RateLimiter } from './RateLimiter';
import { Database } from '../l1-persistence/Database';
import {
  CanvasCourse,
  CanvasAssignment,
  CanvasAnnouncement,
  CanvasModule,
  CanvasModuleItem,
  CanvasPage,
  CanvasFile,
  CanvasFolder,
  mapCourse,
  mapAssignment,
  mapAnnouncement,
  mapModule,
  mapModuleItem,
  mapPage,
  mapFile,
  mapFolder,
  detectPolicyKeywords,
  calculatePolicyConfidence,
} from './DataMappers';
import { SyncConflictResolver, SyncConflict, ConflictResolution } from './SyncConflictResolver';

export interface SyncEngineConfig {
  client: CanvasClient;
  db: Database;
  rateLimiter?: RateLimiter;
}

export interface SyncResult {
  success: boolean;
  entity: string;
  count: number;
  errors: string[];
  duration: number;
}

export interface FullSyncResult {
  courses: SyncResult;
  tasks: SyncResult;
  announcements: SyncResult;
  modules: SyncResult;
  pages: SyncResult;
  folders: SyncResult;
  files: SyncResult;
  totalDuration: number;
  errors: string[];
}

export interface SyncOptions {
  /**
   * Term selection for filtering courses:
   * - 'all' or undefined: sync all courses
   * - 'auto': auto-detect current semester based on term end dates
   * - '<external-term-id>': sync only courses from specific term
   */
  termSelection?: 'all' | 'auto' | string;
  /** Whether to sync Canvas files */
  syncCanvasFiles?: boolean;
  /** Whether to sync announcement attachments */
  syncAnnouncements?: boolean;
}

export interface SyncMetadata {
  endpoint: string;
  etag: string | null;
  last_synced_at: string;
}

/**
 * SyncEngine orchestrates the synchronization of Canvas data
 */
export interface SyncDiagnosticEntry {
  entity: string;
  externalId: string;
  action: 'insert' | 'update' | 'skip' | 'error';
  preservedFields?: Record<string, { before: unknown; after: unknown }>;
  updatedFields?: Record<string, { before: unknown; after: unknown }>;
  error?: string;
  timestamp: string;
}

/**
 * Backoff configuration for auth-failed endpoints
 */
interface EndpointBackoff {
  endpoint: string;
  courseId: number | null;
  failureCount: number;
  lastFailureAt: Date;
  nextRetryAt: Date;
  lastSuccessAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
}

/**
 * Backoff constants
 */
const BACKOFF_CONFIG = {
  /** Initial backoff delay after first failure (1 hour) */
  INITIAL_DELAY_MS: 60 * 60 * 1000,
  /** Maximum backoff delay (2 days) - after this we reset */
  MAX_DELAY_MS: 2 * 24 * 60 * 60 * 1000,
  /** Multiplier for exponential backoff */
  MULTIPLIER: 2,
  /** Jitter factor (0.1 = ±10%) */
  JITTER: 0.1,
};

export class SyncEngine extends EventEmitter {
  private client: CanvasClient;
  private db: Database;
  private rateLimiter: RateLimiter;
  private conflictResolver: SyncConflictResolver;
  private isSyncing: boolean = false;
  private diagnosticsEnabled: boolean = false;
  private diagnosticLog: SyncDiagnosticEntry[] = [];
  private pausedForConflicts: boolean = false;
  private pendingConflictData: Map<string, { tableName: string; data: Record<string, unknown> }> = new Map();

  constructor(config: SyncEngineConfig) {
    super();
    this.client = config.client;
    this.db = config.db;
    this.rateLimiter = config.rateLimiter || new RateLimiter();
    this.conflictResolver = new SyncConflictResolver(this.db);

    // Ensure conflict resolver table exists
    this.conflictResolver.ensureTable();

    // Forward rate limit events
    this.rateLimiter.on('rate-limited', (info) => {
      this.emit('rate-limited', info);
    });

    // Ensure backoff table exists
    this.ensureBackoffTable();
  }

  /**
   * Ensure the endpoint_backoff table exists
   */
  private ensureBackoffTable(): void {
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS endpoint_backoff (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          endpoint TEXT NOT NULL,
          course_id INTEGER,
          failure_count INTEGER DEFAULT 1,
          last_failure_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          next_retry_at DATETIME NOT NULL,
          last_success_at DATETIME,
          error_code TEXT,
          error_message TEXT,
          UNIQUE(endpoint, course_id)
        )
      `);
    } catch {
      // Table may already exist from migration
    }
  }

  /**
   * Check if an endpoint is in backoff (should be skipped)
   */
  private isEndpointInBackoff(endpoint: string, courseId: number | null): boolean {
    const row = this.db.executeReadOne<{ next_retry_at: string; failure_count: number }>(
      `SELECT next_retry_at, failure_count FROM endpoint_backoff
       WHERE endpoint = ? AND (course_id = ? OR (course_id IS NULL AND ? IS NULL))`,
      [endpoint, courseId, courseId]
    );

    if (!row) {
      console.debug(`[Backoff] ${endpoint} (course=${courseId}): No backoff record, proceeding`);
      return false;
    }

    const nextRetry = new Date(row.next_retry_at);
    const now = new Date();

    // Check if we've waited long enough to reset (2+ days since last attempt)
    const lastAttempt = this.db.executeReadOne<{ last_failure_at: string }>(
      `SELECT last_failure_at FROM endpoint_backoff
       WHERE endpoint = ? AND (course_id = ? OR (course_id IS NULL AND ? IS NULL))`,
      [endpoint, courseId, courseId]
    );

    if (lastAttempt) {
      const timeSinceLastAttempt = now.getTime() - new Date(lastAttempt.last_failure_at).getTime();
      const daysSinceLastAttempt = timeSinceLastAttempt / (24 * 60 * 60 * 1000);
      console.debug(`[Backoff] ${endpoint} (course=${courseId}): ${daysSinceLastAttempt.toFixed(2)} days since last failure`);

      if (timeSinceLastAttempt >= BACKOFF_CONFIG.MAX_DELAY_MS) {
        // Reset backoff - we've waited long enough
        console.debug(`[Backoff] ${endpoint} (course=${courseId}): 2+ days passed, RESETTING backoff`);
        this.resetEndpointBackoff(endpoint, courseId);
        return false;
      }
    }

    const inBackoff = now < nextRetry;
    if (inBackoff) {
      const minutesRemaining = (nextRetry.getTime() - now.getTime()) / (60 * 1000);
      console.debug(`[Backoff] ${endpoint} (course=${courseId}): IN BACKOFF, ${minutesRemaining.toFixed(0)} min remaining (failures=${row.failure_count})`);
    } else {
      console.debug(`[Backoff] ${endpoint} (course=${courseId}): Backoff expired, retrying now`);
    }

    return inBackoff;
  }

  /**
   * Get backoff info for an endpoint (for logging/UI)
   */
  getEndpointBackoffInfo(endpoint: string, courseId: number | null): EndpointBackoff | null {
    const row = this.db.executeReadOne<{
      endpoint: string;
      course_id: number | null;
      failure_count: number;
      last_failure_at: string;
      next_retry_at: string;
      last_success_at: string | null;
      error_code: string | null;
      error_message: string | null;
    }>(
      `SELECT * FROM endpoint_backoff
       WHERE endpoint = ? AND (course_id = ? OR (course_id IS NULL AND ? IS NULL))`,
      [endpoint, courseId, courseId]
    );

    if (!row) return null;

    return {
      endpoint: row.endpoint,
      courseId: row.course_id,
      failureCount: row.failure_count,
      lastFailureAt: new Date(row.last_failure_at),
      nextRetryAt: new Date(row.next_retry_at),
      lastSuccessAt: row.last_success_at ? new Date(row.last_success_at) : null,
      errorCode: row.error_code,
      errorMessage: row.error_message,
    };
  }

  /**
   * Record an auth failure and calculate next retry time with exponential backoff
   */
  private recordEndpointFailure(
    endpoint: string,
    courseId: number | null,
    errorCode: string,
    errorMessage: string
  ): void {
    const existing = this.db.executeReadOne<{ failure_count: number }>(
      `SELECT failure_count FROM endpoint_backoff
       WHERE endpoint = ? AND (course_id = ? OR (course_id IS NULL AND ? IS NULL))`,
      [endpoint, courseId, courseId]
    );

    const failureCount = existing ? existing.failure_count + 1 : 1;

    // Calculate delay with exponential backoff + jitter
    let delayMs = BACKOFF_CONFIG.INITIAL_DELAY_MS * Math.pow(BACKOFF_CONFIG.MULTIPLIER, failureCount - 1);
    delayMs = Math.min(delayMs, BACKOFF_CONFIG.MAX_DELAY_MS);

    // Add jitter (±10%)
    const jitter = 1 + (Math.random() * 2 - 1) * BACKOFF_CONFIG.JITTER;
    delayMs = Math.round(delayMs * jitter);

    const nextRetryAt = new Date(Date.now() + delayMs);
    const delayHours = delayMs / (60 * 60 * 1000);

    console.debug(`[Backoff] ${endpoint} (course=${courseId}): FAILURE #${failureCount} (${errorCode})`);
    console.debug(`[Backoff] ${endpoint} (course=${courseId}): Next retry in ${delayHours.toFixed(1)} hours at ${nextRetryAt.toISOString()}`);

    this.db.executeWrite(
      `INSERT INTO endpoint_backoff (endpoint, course_id, failure_count, last_failure_at, next_retry_at, error_code, error_message)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?)
       ON CONFLICT(endpoint, course_id) DO UPDATE SET
         failure_count = excluded.failure_count,
         last_failure_at = CURRENT_TIMESTAMP,
         next_retry_at = excluded.next_retry_at,
         error_code = excluded.error_code,
         error_message = excluded.error_message`,
      [endpoint, courseId, failureCount, nextRetryAt.toISOString(), errorCode, errorMessage],
      'endpoint_backoff'
    );

    this.emit('endpoint-backoff', {
      endpoint,
      courseId,
      failureCount,
      nextRetryAt,
      delayMs,
      errorCode,
      errorMessage,
    });
  }

  /**
   * Record a successful endpoint access (clears backoff)
   */
  private recordEndpointSuccess(endpoint: string, courseId: number | null): void {
    const existing = this.db.executeReadOne<{ failure_count: number }>(
      `SELECT failure_count FROM endpoint_backoff
       WHERE endpoint = ? AND (course_id = ? OR (course_id IS NULL AND ? IS NULL))`,
      [endpoint, courseId, courseId]
    );

    if (existing && existing.failure_count > 0) {
      console.debug(`[Backoff] ${endpoint} (course=${courseId}): SUCCESS after ${existing.failure_count} failures, clearing backoff`);
    }

    this.db.executeWrite(
      `UPDATE endpoint_backoff SET
         failure_count = 0,
         last_success_at = CURRENT_TIMESTAMP,
         next_retry_at = CURRENT_TIMESTAMP
       WHERE endpoint = ? AND (course_id = ? OR (course_id IS NULL AND ? IS NULL))`,
      [endpoint, courseId, courseId],
      'endpoint_backoff'
    );
  }

  /**
   * Reset backoff for an endpoint (called after 2+ days of waiting)
   */
  private resetEndpointBackoff(endpoint: string, courseId: number | null): void {
    console.debug(`[Backoff] ${endpoint} (course=${courseId}): RESET - backoff record deleted`);

    this.db.executeWrite(
      `DELETE FROM endpoint_backoff
       WHERE endpoint = ? AND (course_id = ? OR (course_id IS NULL AND ? IS NULL))`,
      [endpoint, courseId, courseId],
      'endpoint_backoff'
    );

    this.emit('endpoint-backoff-reset', { endpoint, courseId });
  }

  /**
   * Get all endpoints currently in backoff
   */
  getAllEndpointsInBackoff(): EndpointBackoff[] {
    const rows = this.db.executeRead<{
      endpoint: string;
      course_id: number | null;
      failure_count: number;
      last_failure_at: string;
      next_retry_at: string;
      last_success_at: string | null;
      error_code: string | null;
      error_message: string | null;
    }>(`SELECT * FROM endpoint_backoff WHERE next_retry_at > CURRENT_TIMESTAMP`);

    return rows.map((row) => ({
      endpoint: row.endpoint,
      courseId: row.course_id,
      failureCount: row.failure_count,
      lastFailureAt: new Date(row.last_failure_at),
      nextRetryAt: new Date(row.next_retry_at),
      lastSuccessAt: row.last_success_at ? new Date(row.last_success_at) : null,
      errorCode: row.error_code,
      errorMessage: row.error_message,
    }));
  }

  /**
   * Helper to fetch with backoff tracking
   * Returns null if endpoint is in backoff or auth fails
   */
  private async fetchWithBackoff<T>(
    endpoint: string,
    courseId: number | null,
    fetcher: () => Promise<T>
  ): Promise<{ data: T | null; skipped: boolean; error?: string }> {
    console.debug(`[Backoff] Fetching: ${endpoint} (course=${courseId})`);

    // Check if in backoff
    if (this.isEndpointInBackoff(endpoint, courseId)) {
      const info = this.getEndpointBackoffInfo(endpoint, courseId);
      console.debug(`[Backoff] ${endpoint} (course=${courseId}): SKIPPED - in backoff until ${info?.nextRetryAt?.toISOString()}`);
      this.emit('endpoint-skipped', {
        endpoint,
        courseId,
        reason: 'backoff',
        nextRetryAt: info?.nextRetryAt,
        failureCount: info?.failureCount,
      });
      return { data: null, skipped: true, error: `Skipped: in backoff until ${info?.nextRetryAt?.toISOString()}` };
    }

    try {
      const data = await fetcher();
      // Success - clear any backoff
      this.recordEndpointSuccess(endpoint, courseId);
      console.debug(`[Backoff] ${endpoint} (course=${courseId}): SUCCESS`);
      return { data, skipped: false };
    } catch (err) {
      // Extract status from error object (CanvasApiError has status property)
      const status = (err as { status?: number })?.status;
      const errorMessage = (err as { message?: string })?.message || String(err);

      console.debug(`[Backoff] ${endpoint} (course=${courseId}): Error status=${status}, message="${errorMessage.slice(0, 100)}"`);

      // Handle auth/access errors with backoff (401, 403, 404)
      // 404 can mean "page disabled for this course" - not a fatal error
      if (status === 401 || status === 403 || status === 404) {
        const errorCode = String(status);
        console.debug(`[Backoff] ${endpoint} (course=${courseId}): BACKOFF ERROR ${errorCode}`);
        this.recordEndpointFailure(endpoint, courseId, errorCode, errorMessage.slice(0, 200));
        return { data: null, skipped: false, error: `Error ${errorCode}: ${errorMessage.slice(0, 100)}` };
      }

      // Non-backoff error - rethrow (5xx server errors, network errors, etc.)
      console.debug(`[Backoff] ${endpoint} (course=${courseId}): NON-BACKOFF ERROR (status=${status}) - rethrowing`);
      throw err;
    }
  }

  /**
   * Get the conflict resolver instance
   */
  getConflictResolver(): SyncConflictResolver {
    return this.conflictResolver;
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
          this.conflictResolver.clearFieldModified(conflict.tableName, entityId, result.field);
        }
      }

      this.pendingConflictData.delete(resolution.conflictId);
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
    this.pausedForConflicts = false;
    this.emit('conflicts-resolved');
  }

  /**
   * Auto-complete tasks that have both weight > 0 and grade set.
   * When a task has been graded, it should be considered complete.
   */
  private autoCompleteGradedTasks(courseId?: number): void {
    const whereClause = courseId
      ? 'WHERE course_id = ? AND weight > 0 AND grade IS NOT NULL AND is_completed = 0'
      : 'WHERE weight > 0 AND grade IS NOT NULL AND is_completed = 0';
    const params = courseId ? [courseId] : [];

    const result = this.db.executeWrite(
      `UPDATE tasks SET
        is_completed = 1,
        completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
        updated_at = CURRENT_TIMESTAMP
      ${whereClause}`,
      params,
      'tasks'
    );

    if (result.changes > 0) {
      this.emit('tasks-auto-completed', { count: result.changes, courseId });
    }
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
    if (this.isSyncing) {
      throw new Error('Sync already in progress');
    }

    this.isSyncing = true;
    const startTime = Date.now();
    const errors: string[] = [];

    // Default options
    const syncCanvasFiles = options?.syncCanvasFiles ?? true;
    const syncAnnouncements = options?.syncAnnouncements ?? true;
    const termSelection = options?.termSelection ?? 'all';

    this.emit('sync-start', { type: 'full' });

    // ============ PHASE 1: FETCH ALL DATA ============
    // Collect all data from Canvas API before writing anything
    // If any API call fails, we abort without touching the database

    interface FetchedData {
      courses: CanvasCourse[];
      tasks: Map<number, CanvasAssignment[]>; // canvasCourseId -> assignments
      announcements: Map<number, CanvasAnnouncement[]>;
      modules: Map<number, CanvasModule[]>;
      pages: Map<number, CanvasPage[]>;
      folders: Map<number, CanvasFolder[]>;
      files: Map<number, CanvasFile[]>;
    }

    const fetched: FetchedData = {
      courses: [],
      tasks: new Map(),
      announcements: new Map(),
      modules: new Map(),
      pages: new Map(),
      folders: new Map(),
      files: new Map(),
    };

    try {
      this.emit('sync-phase', { phase: 'fetch', status: 'started' });

      // Fetch courses first
      fetched.courses = await this.rateLimiter.enqueue(
        () =>
          this.client.getAll<CanvasCourse>('/courses', {
            enrollment_state: 'active',
            include: ['total_scores', 'current_grading_period_scores', 'syllabus_body', 'term'],
          }),
        10
      );

      // Filter courses based on term selection
      let coursesToSync = fetched.courses;
      console.debug(`[SyncEngine] Fetched ${fetched.courses.length} courses from Canvas`);
      console.debug(`[SyncEngine] termSelection=${termSelection}, syncCanvasFiles=${syncCanvasFiles}, syncAnnouncements=${syncAnnouncements}`);

      if (termSelection !== 'all') {
        if (termSelection === 'auto') {
          // Auto-detect current semester based on term end dates
          // Canvas end_at is usually ~1 month after actual course end
          const DAYS_BUFFER = 30;
          const now = new Date();

          // Find current term IDs from fetched courses
          const currentTermIds = new Set<number>();
          for (const course of fetched.courses) {
            if (course.term) {
              const termId = course.term.id;
              const termName = course.term.name;

              // Skip "Default Term" - these are non-academic courses
              if (termName === 'Default Term' || termId === 1) {
                console.debug(`[SyncEngine] Term "${termName}" (${termId}): skipping Default Term`);
                continue;
              }

              if (!course.term.end_at) {
                console.debug(`[SyncEngine] Term "${termName}" (${termId}): no end_at, skipping`);
                continue;
              }

              // Subtract buffer days from end_at to get actual course end
              const endDate = new Date(course.term.end_at);
              const adjustedEndDate = new Date(endDate.getTime() - DAYS_BUFFER * 24 * 60 * 60 * 1000);
              const isCurrent = adjustedEndDate > now;

              console.debug(`[SyncEngine] Term "${termName}" (${termId}): end_at=${course.term.end_at}, adjusted=${adjustedEndDate.toISOString()}, isCurrent=${isCurrent}`);

              if (isCurrent) {
                currentTermIds.add(termId);
              }
            }
          }

          console.debug(`[SyncEngine] Auto-detected current term IDs: ${Array.from(currentTermIds).join(', ')}`);

          if (currentTermIds.size > 0) {
            coursesToSync = fetched.courses.filter((c) =>
              c.term && currentTermIds.has(c.term.id)
            );
            console.debug(`[SyncEngine] After auto-filter: ${coursesToSync.length} courses in current semester(s)`);
          } else {
            console.debug(`[SyncEngine] No current semesters detected, syncing all courses`);
          }
        } else {
          // Specific term selected - filter by term ID
          const selectedTermId = parseInt(termSelection, 10);
          if (!isNaN(selectedTermId)) {
            coursesToSync = fetched.courses.filter((c) =>
              c.term && c.term.id === selectedTermId
            );
            console.debug(`[SyncEngine] After term filter (${selectedTermId}): ${coursesToSync.length} courses`);
          }
        }
      }

      console.debug(`[SyncEngine] Will sync data for ${coursesToSync.length} courses: ${coursesToSync.map(c => c.name).join(', ')}`);


      // Fetch data for each course in parallel
      for (const course of coursesToSync) {
        console.debug(`[SyncEngine] Syncing course: id=${course.id}, name="${course.name}"`);

        const canvasCourseId = course.id;

        // Build fetch promises
        const fetchPromises: Promise<void>[] = [];

        // Tasks (assignments)
        fetchPromises.push(
          this.rateLimiter.enqueue(
            () => this.client.getAll<CanvasAssignment>(
              `/courses/${canvasCourseId}/assignments`,
              { order_by: 'due_at' }
            ),
            5
          ).then((data) => { fetched.tasks.set(canvasCourseId, data); })
        );

        // Modules (with backoff tracking)
        fetchPromises.push(
          (async () => {
            const endpoint = `/courses/${canvasCourseId}/modules`;
            const result = await this.fetchWithBackoff(
              endpoint,
              canvasCourseId,
              () => this.rateLimiter.enqueue(
                () => this.client.getAll<CanvasModule>(endpoint, { include: ['items'] }),
                3
              )
            );
            fetched.modules.set(canvasCourseId, result.data || []);
          })()
        );

        // Pages (with backoff tracking)
        fetchPromises.push(
          (async () => {
            const endpoint = `/courses/${canvasCourseId}/pages`;
            const result = await this.fetchWithBackoff(
              endpoint,
              canvasCourseId,
              () => this.rateLimiter.enqueue(
                () => this.client.getAll<CanvasPage>(endpoint),
                2
              )
            );
            fetched.pages.set(canvasCourseId, result.data || []);
          })()
        );

        // Announcements (if enabled)
        if (syncAnnouncements) {
          fetchPromises.push(
            this.rateLimiter.enqueue(
              () => this.client.getAll<CanvasAnnouncement>(
                `/courses/${canvasCourseId}/discussion_topics`,
                { only_announcements: true }
              ),
              3
            ).then((data) => { fetched.announcements.set(canvasCourseId, data); })
          );
        }

        // Folders and Files (if enabled, with backoff tracking)
        if (syncCanvasFiles) {
          console.debug(`[FileSync] syncAll: Queuing folder/file fetch for course ${canvasCourseId}`);
          fetchPromises.push(
            (async () => {
              const endpoint = `/courses/${canvasCourseId}/folders`;
              console.debug(`[FileSync] syncAll: Fetching folders for course ${canvasCourseId}`);
              const result = await this.fetchWithBackoff(
                endpoint,
                canvasCourseId,
                () => this.rateLimiter.enqueue(
                  () => this.client.getAll<CanvasFolder>(endpoint),
                  2
                )
              );
              const folders = result.data || [];
              console.debug(`[FileSync] syncAll: Got ${folders.length} folders for course ${canvasCourseId}`);
              fetched.folders.set(canvasCourseId, folders);
            })()
          );

          fetchPromises.push(
            (async () => {
              const endpoint = `/courses/${canvasCourseId}/files`;
              console.debug(`[FileSync] syncAll: Fetching files for course ${canvasCourseId}`);
              const result = await this.fetchWithBackoff(
                endpoint,
                canvasCourseId,
                () => this.rateLimiter.enqueue(
                  () => this.client.getAll<CanvasFile>(endpoint),
                  2
                )
              );
              const files = result.data || [];
              console.debug(`[FileSync] syncAll: Got ${files.length} files for course ${canvasCourseId}`);
              fetched.files.set(canvasCourseId, files);
            })()
          );
        }

        // Wait for all fetches for this course
        console.debug(`[SyncEngine] Waiting for ${fetchPromises.length} fetch promises for course ${course.id}`);
        await Promise.all(fetchPromises);
        console.debug(`[SyncEngine] Completed fetches for course ${course.id}`);
      }

      // Summary of fetched data
      console.debug(`[SyncEngine] FETCH PHASE COMPLETE - Summary:`);
      console.debug(`[SyncEngine]   courses: ${fetched.courses.length}`);
      console.debug(`[SyncEngine]   tasks: ${Array.from(fetched.tasks.values()).reduce((a, b) => a + b.length, 0)} across ${fetched.tasks.size} courses`);
      console.debug(`[SyncEngine]   announcements: ${Array.from(fetched.announcements.values()).reduce((a, b) => a + b.length, 0)} across ${fetched.announcements.size} courses`);
      console.debug(`[SyncEngine]   modules: ${Array.from(fetched.modules.values()).reduce((a, b) => a + b.length, 0)} across ${fetched.modules.size} courses`);
      console.debug(`[SyncEngine]   pages: ${Array.from(fetched.pages.values()).reduce((a, b) => a + b.length, 0)} across ${fetched.pages.size} courses`);
      console.debug(`[SyncEngine]   folders: ${Array.from(fetched.folders.values()).reduce((a, b) => a + b.length, 0)} across ${fetched.folders.size} courses`);
      console.debug(`[SyncEngine]   files: ${Array.from(fetched.files.values()).reduce((a, b) => a + b.length, 0)} across ${fetched.files.size} courses`);

      this.emit('sync-phase', { phase: 'fetch', status: 'complete' });

    } catch (fetchError) {
      // FETCH FAILED - Abort without writing anything
      this.isSyncing = false;
      const message = fetchError instanceof Error ? fetchError.message : String(fetchError);
      errors.push(`Fetch failed: ${message}`);

      this.emit('sync-error', { type: 'fetch', error: message });
      this.emit('sync-aborted', { reason: 'fetch_failed', error: message });

      return {
        courses: { success: false, entity: 'courses', count: 0, errors: [`Fetch failed: ${message}`], duration: Date.now() - startTime },
        tasks: { success: false, entity: 'tasks', count: 0, errors: [], duration: 0 },
        announcements: { success: false, entity: 'announcements', count: 0, errors: [], duration: 0 },
        modules: { success: false, entity: 'modules', count: 0, errors: [], duration: 0 },
        pages: { success: false, entity: 'pages', count: 0, errors: [], duration: 0 },
        folders: { success: false, entity: 'folders', count: 0, errors: [], duration: 0 },
        files: { success: false, entity: 'files', count: 0, errors: [], duration: 0 },
        totalDuration: Date.now() - startTime,
        errors,
      };
    }

    // ============ PHASE 2: COMMIT ALL DATA ============
    // All data fetched successfully - now write in a single atomic transaction

    const counts = {
      courses: 0,
      tasks: 0,
      announcements: 0,
      modules: 0,
      pages: 0,
      folders: 0,
      files: 0,
    };

    try {
      this.emit('sync-phase', { phase: 'commit', status: 'started' });

      const baseUrl = this.client.getBaseUrl();

      // Single atomic transaction for all writes
      this.db.transaction(() => {
        // --- Write Enrollment Terms ---
        const termsMap = new Map<number, { id: number; name: string; start_at: string | null; end_at: string | null }>();
        for (const course of fetched.courses) {
          if (course.term) {
            if (!termsMap.has(course.term.id)) {
              termsMap.set(course.term.id, {
                id: course.term.id,
                name: course.term.name,
                start_at: course.term.start_at,
                end_at: course.term.end_at,
              });
            }
          } else if (course.enrollment_term_id && !termsMap.has(course.enrollment_term_id)) {
            termsMap.set(course.enrollment_term_id, {
              id: course.enrollment_term_id,
              name: `Semester ${course.enrollment_term_id}`,
              start_at: null,
              end_at: null,
            });
          }
        }

        for (const [termId, term] of termsMap) {
          this.db.executeWrite(
            `INSERT INTO enrollment_terms (external_id, name, start_at, end_at) VALUES (?, ?, ?, ?)
             ON CONFLICT(external_id) DO UPDATE SET name = excluded.name, start_at = excluded.start_at, end_at = excluded.end_at`,
            [String(termId), term.name, term.start_at, term.end_at],
            'enrollment_terms'
          );
        }

        // --- Write Courses ---
        for (const course of fetched.courses) {
          const localCourse = mapCourse(course, baseUrl);
          const existing = this.db.executeReadOne<Record<string, unknown>>(
            'SELECT * FROM courses WHERE external_id = ?',
            [localCourse.external_id]
          );

          const { autoResolved, conflicts, preservedFields } = this.conflictResolver.detectConflicts(
            'course', 'courses', existing?.id as number || 0,
            localCourse.external_id, localCourse.name, existing, localCourse
          );

          if (conflicts.length > 0) {
            this.emit('sync-conflicts', { entity: 'course', conflicts });
            for (const conflict of conflicts) {
              this.pendingConflictData.set(conflict.id, { tableName: 'courses', data: { ...localCourse, id: existing?.id } });
            }
          }

          const finalData: Record<string, unknown> = { ...localCourse };
          for (const [field, value] of Object.entries(autoResolved)) {
            finalData[field] = value;
          }
          if (existing) {
            for (const field of preservedFields) {
              if (existing[field] !== undefined) {
                finalData[field] = existing[field];
              }
            }
          }

          this.db.upsert('courses', finalData, 'external_id', true, preservedFields);
          counts.courses++;
        }

        // --- Build course ID lookup ---
        const courseIdMap = new Map<number, number>(); // canvasId -> localId
        for (const course of fetched.courses) {
          const row = this.db.executeReadOne<{ id: number }>(
            'SELECT id FROM courses WHERE external_id = ?',
            [String(course.id)]
          );
          if (row) {
            courseIdMap.set(course.id, row.id);
          }
        }

        // --- Write Tasks ---
        for (const [canvasCourseId, assignments] of fetched.tasks) {
          const localCourseId = courseIdMap.get(canvasCourseId);
          if (!localCourseId) continue;

          for (const assignment of assignments) {
            const localTask = mapAssignment(assignment, localCourseId);
            const existing = this.db.executeReadOne<Record<string, unknown>>(
              'SELECT * FROM tasks WHERE external_id = ?',
              [localTask.external_id]
            );

            const { autoResolved, conflicts, preservedFields } = this.conflictResolver.detectConflicts(
              'task', 'tasks', existing?.id as number || 0,
              localTask.external_id, localTask.title, existing, localTask
            );

            if (conflicts.length > 0) {
              this.emit('sync-conflicts', { entity: 'task', conflicts });
            }

            const finalData: Record<string, unknown> = { ...localTask };
            for (const [field, value] of Object.entries(autoResolved)) {
              finalData[field] = value;
            }
            if (existing) {
              for (const field of preservedFields) {
                if (existing[field] !== undefined) {
                  finalData[field] = existing[field];
                }
              }
            }

            this.db.upsert('tasks', finalData, 'external_id', true, preservedFields);
            counts.tasks++;
          }

          // Auto-complete graded tasks
          this.db.executeWrite(
            `UPDATE tasks SET is_completed = 1, completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
             WHERE course_id = ? AND weight > 0 AND grade IS NOT NULL AND is_completed = 0`,
            [localCourseId],
            'tasks'
          );
        }

        // --- Write Announcements ---
        for (const [canvasCourseId, announcements] of fetched.announcements) {
          const localCourseId = courseIdMap.get(canvasCourseId);
          if (!localCourseId) continue;

          for (const announcement of announcements) {
            const mapped = mapAnnouncement(announcement, localCourseId, baseUrl, String(canvasCourseId));
            this.db.upsert('notifications', mapped.notification, ['source_type', 'source_id'], false);
            counts.announcements++;

            // Handle attachments
            const notificationRow = this.db.executeReadOne<{ id: number }>(
              'SELECT id FROM notifications WHERE source_id = ?',
              [String(announcement.id)]
            );

            if (notificationRow) {
              for (const attachment of mapped.attachments) {
                this.db.executeWrite(
                  `INSERT INTO notification_attachments
                   (notification_id, course_id, external_id, display_name, filename, url, size_bytes, content_type, download_status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(notification_id, external_id) DO UPDATE SET
                     display_name = excluded.display_name, filename = excluded.filename, url = excluded.url,
                     size_bytes = excluded.size_bytes, content_type = excluded.content_type`,
                  [notificationRow.id, attachment.course_id, attachment.external_id, attachment.display_name,
                   attachment.filename, attachment.url, attachment.size_bytes, attachment.content_type, 'pending'],
                  'notification_attachments'
                );
              }
            }
          }
        }

        // --- Write Modules ---
        for (const [canvasCourseId, modules] of fetched.modules) {
          const localCourseId = courseIdMap.get(canvasCourseId);
          if (!localCourseId) continue;

          for (const module of modules) {
            const localModule = mapModule(module, localCourseId);
            this.db.upsert('modules', localModule);
            counts.modules++;
          }
        }

        // --- Write Pages ---
        for (const [canvasCourseId, pages] of fetched.pages) {
          const localCourseId = courseIdMap.get(canvasCourseId);
          if (!localCourseId) continue;

          for (const page of pages) {
            const pageType = page.front_page ? 'landing' : 'content';
            const localPage = mapPage(page, localCourseId, pageType);
            this.db.upsert('course_pages', localPage);
            counts.pages++;
          }
        }

        // --- Write Folders ---
        console.debug(`[FileSync] syncAll COMMIT: Writing folders for ${fetched.folders.size} courses`);
        for (const [canvasCourseId, folders] of fetched.folders) {
          const localCourseId = courseIdMap.get(canvasCourseId);
          if (!localCourseId) {
            console.debug(`[FileSync] syncAll COMMIT: No local course ID for canvas course ${canvasCourseId}, skipping folders`);
            continue;
          }

          console.debug(`[FileSync] syncAll COMMIT: Writing ${folders.length} folders for course ${canvasCourseId} -> ${localCourseId}`);
          for (const folder of folders) {
            const localFolder = mapFolder(folder, localCourseId);
            console.debug(`[FileSync] syncAll COMMIT: Folder id=${folder.id}, name="${folder.name}", path="${folder.full_name}"`);
            this.db.upsert('resources', localFolder as Record<string, unknown>);
            counts.folders++;
          }
        }

        // --- Write Files ---
        console.debug(`[FileSync] syncAll COMMIT: Writing files for ${fetched.files.size} courses`);
        for (const [canvasCourseId, files] of fetched.files) {
          const localCourseId = courseIdMap.get(canvasCourseId);
          if (!localCourseId) {
            console.debug(`[FileSync] syncAll COMMIT: No local course ID for canvas course ${canvasCourseId}, skipping files`);
            continue;
          }

          // Build folder path lookup
          const folderPathMap = new Map<number, string>();
          const dbFolders = this.db.executeRead<{ external_id: string; folder_path: string | null }>(
            'SELECT external_id, folder_path FROM resources WHERE course_id = ? AND type = ?',
            [localCourseId, 'folder']
          );
          for (const folder of dbFolders) {
            folderPathMap.set(parseInt(folder.external_id, 10), folder.folder_path || '');
          }
          console.debug(`[FileSync] syncAll COMMIT: Built folder path map with ${folderPathMap.size} entries for course ${localCourseId}`);

          console.debug(`[FileSync] syncAll COMMIT: Writing ${files.length} files for course ${canvasCourseId} -> ${localCourseId}`);
          for (const file of files) {
            const folderPath = folderPathMap.get(file.folder_id) ?? null;
            const localFile = mapFile(file, localCourseId, null, folderPath);

            // Check existing record
            const existing = this.db.executeReadOne<{ id: number; local_path: string | null }>(
              'SELECT id, local_path FROM resources WHERE external_id = ?',
              [String(file.id)]
            );
            console.debug(`[FileSync] syncAll COMMIT: File id=${file.id}, name="${file.display_name}", folder_id=${file.folder_id}, folderPath="${folderPath}", existing_local_path="${existing?.local_path || 'none'}"`);

            this.db.upsert('resources', localFile as Record<string, unknown>, 'external_id', true);
            counts.files++;
          }
        }

        // --- Update Sync Metadata ---
        this.updateSyncMetadata('/courses');
        for (const course of fetched.courses) {
          this.updateSyncMetadata(`/courses/${course.id}/assignments`);
          this.updateSyncMetadata(`/courses/${course.id}/discussion_topics`);
          this.updateSyncMetadata(`/courses/${course.id}/modules`);
          this.updateSyncMetadata(`/courses/${course.id}/pages`);
          this.updateSyncMetadata(`/courses/${course.id}/folders`);
          this.updateSyncMetadata(`/courses/${course.id}/files`);
        }
      });

      this.emit('sync-phase', { phase: 'commit', status: 'complete' });

    } catch (commitError) {
      // COMMIT FAILED - Transaction automatically rolled back
      this.isSyncing = false;
      const message = commitError instanceof Error ? commitError.message : String(commitError);
      errors.push(`Commit failed (rolled back): ${message}`);

      this.emit('sync-error', { type: 'commit', error: message });
      this.emit('sync-rollback', { reason: 'commit_failed', error: message });

      return {
        courses: { success: false, entity: 'courses', count: 0, errors: [`Commit failed: ${message}`], duration: Date.now() - startTime },
        tasks: { success: false, entity: 'tasks', count: 0, errors: [], duration: 0 },
        announcements: { success: false, entity: 'announcements', count: 0, errors: [], duration: 0 },
        modules: { success: false, entity: 'modules', count: 0, errors: [], duration: 0 },
        pages: { success: false, entity: 'pages', count: 0, errors: [], duration: 0 },
        folders: { success: false, entity: 'folders', count: 0, errors: [], duration: 0 },
        files: { success: false, entity: 'files', count: 0, errors: [], duration: 0 },
        totalDuration: Date.now() - startTime,
        errors,
      };
    } finally {
      this.isSyncing = false;
    }

    // ============ SUCCESS ============
    const result: FullSyncResult = {
      courses: { success: true, entity: 'courses', count: counts.courses, errors: [], duration: 0 },
      tasks: { success: true, entity: 'tasks', count: counts.tasks, errors: [], duration: 0 },
      announcements: { success: true, entity: 'announcements', count: counts.announcements, errors: [], duration: 0 },
      modules: { success: true, entity: 'modules', count: counts.modules, errors: [], duration: 0 },
      pages: { success: true, entity: 'pages', count: counts.pages, errors: [], duration: 0 },
      folders: { success: true, entity: 'folders', count: counts.folders, errors: [], duration: 0 },
      files: { success: true, entity: 'files', count: counts.files, errors: [], duration: 0 },
      totalDuration: Date.now() - startTime,
      errors,
    };

    this.emit('sync-complete', result);
    return result;
  }

  /**
   * Sync courses from Canvas
   */
  async syncCourses(): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let count = 0;

    this.emit('sync-entity-start', { entity: 'courses' });

    try {
      const courses = await this.rateLimiter.enqueue(
        () =>
          this.client.getAll<CanvasCourse>('/courses', {
            enrollment_state: 'active',
            include: ['total_scores', 'current_grading_period_scores', 'syllabus_body', 'term'],
          }),
        10 // High priority
      );

      const baseUrl = this.client.getBaseUrl();

      this.db.transaction(() => {
        // Extract enrollment terms from courses (Canvas includes term data with include[]=term)
        const termsMap = new Map<number, { id: number; name: string; start_at: string | null; end_at: string | null }>();

        console.debug('[SyncEngine] Processing courses for term extraction...');
        for (const course of courses) {
          console.debug(`[SyncEngine] Course ${course.course_code}: term=${JSON.stringify(course.term)}, enrollment_term_id=${course.enrollment_term_id}`);

          if (course.term) {
            if (!termsMap.has(course.term.id)) {
              termsMap.set(course.term.id, {
                id: course.term.id,
                name: course.term.name,
                start_at: course.term.start_at,
                end_at: course.term.end_at,
              });
              console.debug(`[SyncEngine] Added term: ${course.term.name} (${course.term.id}), end_at=${course.term.end_at}`);
            }
          } else if (course.enrollment_term_id) {
            // Fallback if term object not included
            if (!termsMap.has(course.enrollment_term_id)) {
              termsMap.set(course.enrollment_term_id, {
                id: course.enrollment_term_id,
                name: `Semester ${course.enrollment_term_id}`,
                start_at: null,
                end_at: null,
              });
              console.debug(`[SyncEngine] Added fallback term: Semester ${course.enrollment_term_id} (no term object)`);
            }
          }
        }

        console.debug('[SyncEngine] Terms extracted:', Array.from(termsMap.values()));

        // Upsert enrollment terms with full data
        for (const [termId, term] of termsMap) {
          this.db.executeWrite(
            `INSERT INTO enrollment_terms (external_id, name, start_at, end_at) VALUES (?, ?, ?, ?)
             ON CONFLICT(external_id) DO UPDATE SET name = excluded.name, start_at = excluded.start_at, end_at = excluded.end_at`,
            [String(termId), term.name, term.start_at, term.end_at],
            'enrollment_terms'
          );
        }

        for (const course of courses) {
          try {
            const localCourse = mapCourse(course, baseUrl);

            // Get existing record
            const existing = this.db.executeReadOne<Record<string, unknown>>(
              'SELECT * FROM courses WHERE external_id = ?',
              [localCourse.external_id]
            );

            // Detect conflicts
            const { autoResolved, conflicts, preservedFields } = this.conflictResolver.detectConflicts(
              'course',
              'courses',
              existing?.id as number || 0,
              localCourse.external_id,
              localCourse.name,
              existing,
              localCourse
            );

            if (conflicts.length > 0) {
              // Emit conflicts for UI to handle
              this.emit('sync-conflicts', { entity: 'course', conflicts });

              // Store pending data for when conflicts are resolved
              for (const conflict of conflicts) {
                this.pendingConflictData.set(conflict.id, {
                  tableName: 'courses',
                  data: { ...localCourse, id: existing?.id },
                });
              }
            }

            // Build final data: start with local course, apply auto-resolved values
            const finalData: Record<string, unknown> = { ...localCourse };

            // Apply auto-resolved Canvas values
            for (const [field, value] of Object.entries(autoResolved)) {
              finalData[field] = value;
            }

            // Preserve local-only fields from existing record
            if (existing) {
              for (const field of preservedFields) {
                if (existing[field] !== undefined) {
                  finalData[field] = existing[field];
                }
              }
            }

            // Upsert the course (conflicts will be resolved separately)
            this.db.upsert('courses', finalData, 'external_id', true, preservedFields);

            // Log diagnostic
            if (this.diagnosticsEnabled) {
              this.logDiagnostic({
                entity: 'course',
                externalId: localCourse.external_id,
                action: existing ? 'update' : 'insert',
                preservedFields: preservedFields.length > 0 ?
                  Object.fromEntries(preservedFields.map(f => [f, { before: existing?.[f], after: finalData[f] }])) :
                  undefined,
              });
            }

            count++;
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            errors.push(`Course ${course.id}: ${errorMsg}`);
            this.logDiagnostic({
              entity: 'course',
              externalId: String(course.id),
              action: 'error',
              error: errorMsg,
            });
          }
        }
      });


      // Update sync metadata
      this.updateSyncMetadata('/courses');

      this.emit('sync-entity-complete', { entity: 'courses', count });

      return {
        success: errors.length === 0,
        entity: 'courses',
        count,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to sync courses: ${message}`);
      return {
        success: false,
        entity: 'courses',
        count,
        errors,
        duration: Date.now() - startTime,
      };
    }
  }


  /**
   * Sync tasks (assignments) for a specific course
   *
   * Conflict Resolution Strategy:
   * - If a local task exists with same title (user-created), merge fields
   * - Canvas provides: title, description, due_at, points_possible, submission_types
   * - Preserve local fields: weight (user-set), priority_score (calculated), local_modified_at
   * - If Canvas provides null for a field, keep the local value
   */
  async syncTasks(canvasCourseId: number, localCourseId: number): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let count = 0;

    try {
      const assignments = await this.rateLimiter.enqueue(
        () =>
          this.client.getAll<CanvasAssignment>(
            `/courses/${canvasCourseId}/assignments`,
            { order_by: 'due_at' }
          ),
        5 // Medium priority
      );

      this.db.transaction(() => {
        for (const assignment of assignments) {
          try {
            const localTask = mapAssignment(assignment, localCourseId);

            // Check for existing local task by title (for user-created tasks)
            const existingByTitle = this.db.executeReadOne<{
              id: number;
              source_type: string;
              weight: number;
              priority_score: number;
              local_modified_at: string | null;
            }>(
              'SELECT id, source_type, weight, priority_score, local_modified_at FROM tasks WHERE course_id = ? AND title = ? AND external_id IS NULL',
              [localCourseId, localTask.title]
            );

            if (existingByTitle && existingByTitle.source_type === 'user') {
              // Merge: link the user task to Canvas, preserve user-set fields
              this.db.executeWrite(
                `UPDATE tasks SET
                  external_id = ?,
                  source_type = 'canvas',
                  description = COALESCE(?, description),
                  due_at = COALESCE(?, due_at),
                  unlock_at = COALESCE(?, unlock_at),
                  points_possible = COALESCE(?, points_possible),
                  submission_types = COALESCE(?, submission_types),
                  is_completed = ?,
                  updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
                [
                  localTask.external_id,
                  localTask.description,
                  localTask.due_at,
                  localTask.unlock_at,
                  localTask.points_possible,
                  localTask.submission_types,
                  localTask.is_completed,
                  existingByTitle.id,
                ],
                'tasks'
              );

              this.emit('task-merged', {
                localTaskId: existingByTitle.id,
                canvasId: assignment.id,
                title: localTask.title,
              });
            } else {
              // Get existing record
              const existing = this.db.executeReadOne<Record<string, unknown>>(
                'SELECT * FROM tasks WHERE external_id = ?',
                [localTask.external_id]
              );

              // Detect conflicts
              const { autoResolved, conflicts, preservedFields } = this.conflictResolver.detectConflicts(
                'task',
                'tasks',
                existing?.id as number || 0,
                localTask.external_id,
                localTask.title,
                existing,
                localTask
              );

              if (conflicts.length > 0) {
                // Emit conflicts for UI to handle
                this.emit('sync-conflicts', { entity: 'task', conflicts });

                // Store pending data for when conflicts are resolved
                for (const conflict of conflicts) {
                  this.pendingConflictData.set(conflict.id, {
                    tableName: 'tasks',
                    data: { ...localTask, id: existing?.id },
                  });
                }
              }

              // Build final data
              const finalData: Record<string, unknown> = { ...localTask };

              // Apply auto-resolved Canvas values
              for (const [field, value] of Object.entries(autoResolved)) {
                finalData[field] = value;
              }

              // Preserve local-only fields from existing record
              if (existing) {
                for (const field of preservedFields) {
                  if (existing[field] !== undefined) {
                    finalData[field] = existing[field];
                  }
                }
              }

              // Upsert the task
              this.db.upsert('tasks', finalData, 'external_id', true, preservedFields);

              // Log diagnostic
              if (this.diagnosticsEnabled) {
                this.logDiagnostic({
                  entity: 'task',
                  externalId: localTask.external_id,
                  action: existing ? 'update' : 'insert',
                  preservedFields: preservedFields.length > 0 ?
                    Object.fromEntries(preservedFields.map(f => [f, { before: existing?.[f], after: finalData[f] }])) :
                    undefined,
                });
              }
            }

            count++;
          } catch (error) {
            errors.push(`Task ${assignment.id}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      });

      // Auto-complete tasks that have both weight > 0 and grade set
      // This ensures graded assignments are marked as complete
      this.autoCompleteGradedTasks(localCourseId);

      this.updateSyncMetadata(`/courses/${canvasCourseId}/assignments`);

      return {
        success: errors.length === 0,
        entity: 'tasks',
        count,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to sync tasks for course ${canvasCourseId}: ${message}`);
      return {
        success: false,
        entity: 'tasks',
        count,
        errors,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Sync announcements for a specific course
   */
  async syncAnnouncements(canvasCourseId: number, localCourseId: number): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let count = 0;

    try {
      const announcements = await this.rateLimiter.enqueue(
        () =>
          this.client.getAll<CanvasAnnouncement>(
            `/courses/${canvasCourseId}/discussion_topics`,
            { only_announcements: true }
          ),
        3 // Lower priority
      );

      const baseUrl = this.client.getBaseUrl();

      this.db.transaction(() => {
        for (const announcement of announcements) {
          try {
            const mapped = mapAnnouncement(
              announcement,
              localCourseId,
              baseUrl,
              String(canvasCourseId)
            );

            // Insert notification
            this.db.upsert('notifications', mapped.notification, ['source_type', 'source_id'], false);
            count++;

            // Get the notification ID for attachments and policy tracking
            const notificationRow = this.db.executeReadOne<{ id: number }>(
              'SELECT id FROM notifications WHERE source_id = ?',
              [String(announcement.id)]
            );

            if (notificationRow) {
              // Insert attachments
              for (const attachment of mapped.attachments) {
                this.db.executeWrite(
                  `INSERT INTO notification_attachments
                   (notification_id, course_id, external_id, display_name, filename, url, size_bytes, content_type, download_status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(notification_id, external_id) DO UPDATE SET
                     display_name = excluded.display_name,
                     filename = excluded.filename,
                     url = excluded.url,
                     size_bytes = excluded.size_bytes,
                     content_type = excluded.content_type,
                     download_status = COALESCE(notification_attachments.download_status, excluded.download_status)`,
                  [
                    notificationRow.id,
                    attachment.course_id,
                    attachment.external_id,
                    attachment.display_name,
                    attachment.filename,
                    attachment.url,
                    attachment.size_bytes,
                    attachment.content_type,
                    'pending',
                  ],
                  'notification_attachments'
                );
              }

              // Emit event for pending downloads
              if (mapped.attachments.length > 0) {
                this.emit('attachments-pending', {
                  notificationId: notificationRow.id,
                  courseId: localCourseId,
                  attachmentCount: mapped.attachments.length,
                });
              }

              // Insert file references (linking to attachments by external_id)
              if (mapped.fileReferences.length > 0) {
                // First, clear existing file references for this notification
                this.db.executeWrite(
                  'DELETE FROM announcement_file_references WHERE notification_id = ?',
                  [notificationRow.id],
                  'announcement_file_references'
                );

                for (const fileRef of mapped.fileReferences) {
                  // Find attachment_id by external_id if we have a match
                  let attachmentId: number | null = null;
                  if (fileRef.attachmentExternalId) {
                    const attRow = this.db.executeReadOne<{ id: number }>(
                      'SELECT id FROM notification_attachments WHERE notification_id = ? AND external_id = ?',
                      [notificationRow.id, fileRef.attachmentExternalId]
                    );
                    attachmentId = attRow?.id || null;
                  }

                  this.db.executeWrite(
                    `INSERT INTO announcement_file_references
                     (notification_id, attachment_id, start_position, end_position, matched_text, original_url)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                      notificationRow.id,
                      attachmentId,
                      fileRef.startPosition,
                      fileRef.endPosition,
                      fileRef.matchedText,
                      fileRef.originalUrl,
                    ],
                    'announcement_file_references'
                  );
                }
              }

              // If policy-related, create policy_announcement record
              if (mapped.notification.is_policy_related) {
                const detection = detectPolicyKeywords(announcement.title + ' ' + announcement.message);
                const confidence = calculatePolicyConfidence(
                  announcement.title + ' ' + announcement.message,
                  detection.keywords
                );

                this.db.executeWrite(
                  `INSERT INTO policy_announcements
                   (notification_id, course_id, detected_policy_type, confidence_score, extracted_rules, is_confirmed)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(notification_id) DO UPDATE SET
                     detected_policy_type = excluded.detected_policy_type,
                     confidence_score = excluded.confidence_score,
                     extracted_rules = excluded.extracted_rules`,
                  [
                    notificationRow.id,
                    localCourseId,
                    detection.categories[0] || null,
                    confidence,
                    JSON.stringify({
                      keywords: detection.keywords,
                      categories: detection.categories,
                    }),
                    0, // SQLite boolean: false = 0
                  ],
                  'policy_announcements'
                );

                this.emit('policy-detected', {
                  notificationId: notificationRow.id,
                  courseId: localCourseId,
                  title: announcement.title,
                  keywords: detection.keywords,
                  confidence,
                });
              }
            }
          } catch (error) {
            errors.push(`Announcement ${announcement.id}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      });

      this.updateSyncMetadata(`/courses/${canvasCourseId}/discussion_topics`);

      return {
        success: errors.length === 0,
        entity: 'announcements',
        count,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to sync announcements for course ${canvasCourseId}: ${message}`);
      return {
        success: false,
        entity: 'announcements',
        count,
        errors,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Sync modules for a specific course (with backoff tracking)
   */
  async syncModules(canvasCourseId: number, localCourseId: number): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let count = 0;
    const endpoint = `/courses/${canvasCourseId}/modules`;

    try {
      const result = await this.fetchWithBackoff(
        endpoint,
        canvasCourseId,
        () => this.rateLimiter.enqueue(
          () => this.client.getAll<CanvasModule>(endpoint, { include: ['items'] }),
          3
        )
      );

      if (result.skipped || !result.data) {
        return {
          success: true,
          entity: 'modules',
          count: 0,
          errors: result.error ? [result.error] : [],
          duration: Date.now() - startTime,
        };
      }

      const modules = result.data;

      this.db.transaction(() => {
        for (const module of modules) {
          try {
            const localModule = mapModule(module, localCourseId);
            this.db.upsert('modules', localModule);
            count++;

            // Get local module ID for items
            const insertedModule = this.db.executeReadOne<{ id: number }>(
              'SELECT id FROM modules WHERE external_id = ?',
              [String(module.id)]
            );

            // Sync module items
            if (insertedModule && module.items_count > 0) {
              this.syncModuleItems(canvasCourseId, module.id, insertedModule.id);
            }
          } catch (error) {
            errors.push(`Module ${module.id}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      });

      this.updateSyncMetadata(`/courses/${canvasCourseId}/modules`);

      return {
        success: errors.length === 0,
        entity: 'modules',
        count,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to sync modules for course ${canvasCourseId}: ${message}`);
      return {
        success: false,
        entity: 'modules',
        count,
        errors,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Sync module items (called from within syncModules transaction)
   */
  private async syncModuleItems(
    canvasCourseId: number,
    canvasModuleId: number,
    localModuleId: number
  ): Promise<void> {
    try {
      const items = await this.rateLimiter.enqueue(
        () =>
          this.client.getAll<CanvasModuleItem>(
            `/courses/${canvasCourseId}/modules/${canvasModuleId}/items`
          ),
        2 // Low priority
      );

      for (const item of items) {
        const localItem = mapModuleItem(item, localModuleId);
        this.db.upsert('module_items', localItem);
      }
    } catch (error) {
      // Log but don't fail entire module sync
      console.error(`Failed to sync items for module ${canvasModuleId}:`, error);
    }
  }

  /**
   * Sync pages for a specific course (includes syllabus and landing page)
   */
  async syncPages(canvasCourseId: number, localCourseId: number): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let count = 0;
    const endpoint = `/courses/${canvasCourseId}/pages`;

    try {
      // Sync course pages (with backoff tracking)
      const result = await this.fetchWithBackoff(
        endpoint,
        canvasCourseId,
        () => this.rateLimiter.enqueue(
          () => this.client.getAll<CanvasPage>(endpoint),
          2
        )
      );

      if (result.skipped || !result.data) {
        return {
          success: true,
          entity: 'pages',
          count: 0,
          errors: result.error ? [result.error] : [],
          duration: Date.now() - startTime,
        };
      }

      const pages = result.data;

      this.db.transaction(() => {
        for (const page of pages) {
          try {
            const pageType = page.front_page ? 'landing' : 'content';
            const localPage = mapPage(page, localCourseId, pageType);
            this.db.upsert('course_pages', localPage);
            count++;
          } catch (error) {
            errors.push(`Page ${page.url}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      });

      this.updateSyncMetadata(endpoint);

      return {
        success: errors.length === 0,
        entity: 'pages',
        count,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      errors.push(`Failed to sync pages for course ${canvasCourseId}: ${message}`);
      return {
        success: false,
        entity: 'pages',
        count,
        errors,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Sync folders for a specific course (with backoff tracking)
   * This should be called before syncFiles to establish folder paths
   */
  async syncFolders(canvasCourseId: number, localCourseId: number): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let count = 0;
    const endpoint = `/courses/${canvasCourseId}/folders`;

    console.debug(`[FileSync] syncFolders START: canvasCourse=${canvasCourseId}, localCourse=${localCourseId}`);

    try {
      // Fetch all folders for the course (with backoff tracking)
      const result = await this.fetchWithBackoff(
        endpoint,
        canvasCourseId,
        () => this.rateLimiter.enqueue(
          () => this.client.getAll<CanvasFolder>(endpoint),
          2
        )
      );

      if (result.skipped || !result.data) {
        console.debug(`[FileSync] syncFolders SKIPPED: ${result.error || 'no data'}`);
        return {
          success: true,
          entity: 'folders',
          count: 0,
          errors: result.error ? [result.error] : [],
          duration: Date.now() - startTime,
        };
      }

      const folders = result.data;
      console.debug(`[FileSync] syncFolders FETCHED: ${folders.length} folders`);

      this.db.transaction(() => {
        for (const folder of folders) {
          try {
            const localFolder = mapFolder(folder, localCourseId);
            console.debug(`[FileSync] Folder: id=${folder.id}, name="${folder.name}", path="${folder.full_name}", parent=${folder.parent_folder_id}`);
            this.db.upsert('resources', localFolder as Record<string, unknown>);
            count++;
          } catch (error) {
            console.debug(`[FileSync] Folder ERROR: ${folder.name}: ${error}`);
            errors.push(`Folder ${folder.name}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      });

      this.updateSyncMetadata(endpoint);
      console.debug(`[FileSync] syncFolders COMPLETE: ${count} folders synced in ${Date.now() - startTime}ms`);

      return {
        success: errors.length === 0,
        entity: 'folders',
        count,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      console.debug(`[FileSync] syncFolders FAILED: ${message}`);
      errors.push(`Failed to sync folders for course ${canvasCourseId}: ${message}`);
      return {
        success: false,
        entity: 'folders',
        count,
        errors,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Sync files for a specific course (with backoff tracking)
   * Requires syncFolders to be called first to establish folder paths
   */
  async syncFiles(canvasCourseId: number, localCourseId: number): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let count = 0;
    const endpoint = `/courses/${canvasCourseId}/files`;

    console.debug(`[FileSync] syncFiles START: canvasCourse=${canvasCourseId}, localCourse=${localCourseId}`);

    try {
      // Fetch all files for the course (with backoff tracking)
      const result = await this.fetchWithBackoff(
        endpoint,
        canvasCourseId,
        () => this.rateLimiter.enqueue(
          () => this.client.getAll<CanvasFile>(endpoint),
          2
        )
      );

      if (result.skipped || !result.data) {
        console.debug(`[FileSync] syncFiles SKIPPED: ${result.error || 'no data'}, trying module fallback...`);
        // Fallback: extract files from module items
        const fallbackResult = await this.syncFilesFromModules(canvasCourseId, localCourseId);
        return {
          success: fallbackResult.success,
          entity: 'files',
          count: fallbackResult.count,
          errors: [...(result.error ? [result.error] : []), ...fallbackResult.errors],
          duration: Date.now() - startTime,
        };
      }

      const files = result.data;
      console.debug(`[FileSync] syncFiles FETCHED: ${files.length} files from Canvas API`);

      // Build a lookup map from Canvas folder_id to folder_path
      // Folders should be synced before files
      const folderPathMap = new Map<number, string>();
      const dbFolders = this.db.executeRead<{ external_id: string; folder_path: string | null }>(
        'SELECT external_id, folder_path FROM resources WHERE course_id = ? AND type = ?',
        [localCourseId, 'folder']
      );
      for (const folder of dbFolders) {
        folderPathMap.set(parseInt(folder.external_id, 10), folder.folder_path || '');
      }
      console.debug(`[FileSync] Folder path map built: ${folderPathMap.size} folders`);

      this.db.transaction(() => {
        for (const file of files) {
          try {
            // Look up folder path from the folder_id
            const folderPath = folderPathMap.get(file.folder_id) ?? null;
            const localFile = mapFile(file, localCourseId, null, folderPath);

            // Check existing record to see if local_path would be preserved
            const existing = this.db.executeReadOne<{ id: number; local_path: string | null }>(
              'SELECT id, local_path FROM resources WHERE external_id = ?',
              [String(file.id)]
            );

            console.debug(`[FileSync] File: id=${file.id}, name="${file.display_name}", folder_id=${file.folder_id}, folderPath="${folderPath}", size=${file.size}, existing_local_path="${existing?.local_path || 'none'}"`);

            // Debug: verify local_path is not in the data
            if ('local_path' in localFile) {
              console.error('[FileSync] BUG: local_path should not be in mapped file data!');
            }

            // local_path is not in localFile data, so it won't be overwritten on sync
            this.db.upsert('resources', localFile as Record<string, unknown>, 'external_id', true);
            count++;
          } catch (error) {
            console.debug(`[FileSync] File ERROR: ${file.display_name}: ${error}`);
            errors.push(`File ${file.display_name}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      });

      this.updateSyncMetadata(endpoint);
      console.debug(`[FileSync] syncFiles COMPLETE: ${count} files synced in ${Date.now() - startTime}ms`);

      return {
        success: errors.length === 0,
        entity: 'files',
        count,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      console.debug(`[FileSync] syncFiles FAILED: ${message}`);
      errors.push(`Failed to sync files for course ${canvasCourseId}: ${message}`);
      return {
        success: false,
        entity: 'files',
        count,
        errors,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Fallback: Sync files by extracting content_ids from module items
   * Used when /files endpoint returns 403 (user not authorized)
   */
  private async syncFilesFromModules(
    canvasCourseId: number,
    localCourseId: number
  ): Promise<{ success: boolean; count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    try {
      // Get module items with type=File from the database
      const fileItems = this.db.executeRead<{
        id: number;
        content_id: string | null;
        title: string;
      }>(
        `SELECT mi.id, mi.content_id, mi.title
         FROM module_items mi
         JOIN modules m ON mi.module_id = m.id
         WHERE m.course_id = ? AND mi.type = 'File' AND mi.content_id IS NOT NULL`,
        [localCourseId]
      );

      console.debug(`[FileSync] Module fallback: found ${fileItems.length} file items for course ${canvasCourseId}`);

      if (fileItems.length === 0) {
        return { success: true, count: 0, errors: [] };
      }

      // Fetch individual file details for each content_id
      for (const item of fileItems) {
        if (!item.content_id) continue;

        try {
          const fileId = item.content_id;
          const fileEndpoint = `/courses/${canvasCourseId}/files/${fileId}`;

          // Fetch individual file (no backoff needed - these are direct file fetches)
          const response = await this.rateLimiter.enqueue(
            () => this.client.get<CanvasFile>(fileEndpoint),
            3 // Medium priority
          );

          const file = response?.data;
          if (file) {
            // Map and store the file
            const localFile = mapFile(file, localCourseId, null, 'Modules');

            this.db.upsert('resources', localFile as Record<string, unknown>, 'external_id', true);
            count++;
            console.debug(`[FileSync] Module fallback: synced file ${file.display_name} (${file.id})`);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          // Don't fail the whole sync for individual file errors
          console.debug(`[FileSync] Module fallback: failed to fetch file ${item.content_id}: ${message}`);
          errors.push(`File ${item.title}: ${message}`);
        }
      }

      console.debug(`[FileSync] Module fallback COMPLETE: ${count} files synced from modules`);
      return { success: true, count, errors };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.debug(`[FileSync] Module fallback FAILED: ${message}`);
      errors.push(`Module fallback failed: ${message}`);
      return { success: false, count, errors };
    }
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
        tasks: { success: false, entity: 'tasks', count: 0, errors: ['Course sync failed'], duration: 0 },
        announcements: { success: false, entity: 'announcements', count: 0, errors: ['Course sync failed'], duration: 0 },
        modules: { success: false, entity: 'modules', count: 0, errors: ['Course sync failed'], duration: 0 },
        pages: { success: false, entity: 'pages', count: 0, errors: ['Course sync failed'], duration: 0 },
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
        tasks: { success: false, entity: 'tasks', count: 0, errors: ['Course not found'], duration: 0 },
        announcements: { success: false, entity: 'announcements', count: 0, errors: ['Course not found'], duration: 0 },
        modules: { success: false, entity: 'modules', count: 0, errors: ['Course not found'], duration: 0 },
        pages: { success: false, entity: 'pages', count: 0, errors: ['Course not found'], duration: 0 },
      };
    }

    // Sync related data in parallel
    const [tasks, announcements, modules, pages] = await Promise.all([
      this.syncTasks(canvasCourseId, localCourse.id),
      this.syncAnnouncements(canvasCourseId, localCourse.id),
      this.syncModules(canvasCourseId, localCourse.id),
      this.syncPages(canvasCourseId, localCourse.id),
    ]);

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
      const localCourse = mapCourse(response.data, baseUrl);
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
    return this.db.executeRead<SyncMetadata>('SELECT * FROM sync_metadata ORDER BY last_synced_at DESC');
  }

  /**
   * Check if currently syncing
   */
  isBusy(): boolean {
    return this.isSyncing;
  }

  /**
   * Get rate limiter status
   */
  getRateLimitStatus() {
    return this.rateLimiter.getStatus();
  }

  /**
   * Stop any ongoing sync operations
   */
  stop(): void {
    this.rateLimiter.stop();
    this.isSyncing = false;
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
