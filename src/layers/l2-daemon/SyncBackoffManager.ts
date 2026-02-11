/**
 * Sync Backoff Manager
 * Handles exponential backoff for failed endpoint requests during sync operations.
 */

import { EventEmitter } from 'events';
import type { Database } from '../l1-persistence';
import type { ComponentLogger } from '../l0-utilities/Logger';
import { BACKOFF_CONFIG, EndpointBackoff } from './SyncEngineTypes';

export interface SyncBackoffManagerConfig {
  db: Database;
  logger?: ComponentLogger;
}

export class SyncBackoffManager extends EventEmitter {
  private db: Database;
  private log: ComponentLogger | null;

  constructor(config: SyncBackoffManagerConfig) {
    super();
    this.db = config.db;
    this.log = config.logger ?? null;
  }

  /**
   * Ensure the endpoint_backoff table exists
   */
  ensureBackoffTable(): void {
    if (!this.db.isOpen) return;
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
  isEndpointInBackoff(endpoint: string, courseId: number | null): boolean {
    const row = this.db.executeReadOne<{ next_retry_at: string; failure_count: number }>(
      `SELECT next_retry_at, failure_count FROM endpoint_backoff
       WHERE endpoint = ? AND (course_id = ? OR (course_id IS NULL AND ? IS NULL))`,
      [endpoint, courseId, courseId]
    );

    if (!row) {
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
      const timeSinceLastAttempt =
        now.getTime() - new Date(lastAttempt.last_failure_at).getTime();

      if (timeSinceLastAttempt >= BACKOFF_CONFIG.MAX_DELAY_MS) {
        // Reset backoff - we've waited long enough
        this.resetEndpointBackoff(endpoint, courseId);
        return false;
      }
    }

    return now < nextRetry;
  }

  /**
   * Get backoff info for an endpoint (for logging/UI)
   */
  getEndpointBackoffInfo(
    endpoint: string,
    courseId: number | null
  ): EndpointBackoff | null {
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
  recordEndpointFailure(
    endpoint: string,
    courseId: number | null,
    errorCode: string,
    errorMessage: string
  ): void {
    // Skip if database is closed or locked (non-critical operation)
    if (!this.db.isOpen || this.db.isWriteLocked()) return;

    const existing = this.db.executeReadOne<{ failure_count: number }>(
      `SELECT failure_count FROM endpoint_backoff
       WHERE endpoint = ? AND (course_id = ? OR (course_id IS NULL AND ? IS NULL))`,
      [endpoint, courseId, courseId]
    );

    const failureCount = existing ? existing.failure_count + 1 : 1;

    // Calculate delay with exponential backoff + jitter
    let delayMs =
      BACKOFF_CONFIG.INITIAL_DELAY_MS *
      Math.pow(BACKOFF_CONFIG.MULTIPLIER, failureCount - 1);
    delayMs = Math.min(delayMs, BACKOFF_CONFIG.MAX_DELAY_MS);

    // Add jitter (±10%)
    const jitter = 1 + (Math.random() * 2 - 1) * BACKOFF_CONFIG.JITTER;
    delayMs = Math.round(delayMs * jitter);

    const nextRetryAt = new Date(Date.now() + delayMs);

    try {
      this.db.executeWrite(
        `INSERT INTO endpoint_backoff (endpoint, course_id, failure_count, last_failure_at, next_retry_at, error_code, error_message)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?)
         ON CONFLICT(endpoint, course_id) DO UPDATE SET
           failure_count = excluded.failure_count,
           last_failure_at = CURRENT_TIMESTAMP,
           next_retry_at = excluded.next_retry_at,
           error_code = excluded.error_code,
           error_message = excluded.error_message`,
        [
          endpoint,
          courseId,
          failureCount,
          nextRetryAt.toISOString(),
          errorCode,
          errorMessage,
        ],
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
    } catch (err) {
      // Silently ignore lock errors - backoff tracking is non-critical
      if (!(err instanceof Error && err.message.includes('locked'))) throw err;
    }
  }

  /**
   * Record a successful endpoint access (clears backoff)
   */
  recordEndpointSuccess(endpoint: string, courseId: number | null): void {
    // Skip if database is closed or locked (non-critical operation)
    if (!this.db.isOpen || this.db.isWriteLocked()) return;

    try {
      this.db.executeWrite(
        `UPDATE endpoint_backoff SET
           failure_count = 0,
           last_success_at = CURRENT_TIMESTAMP,
           next_retry_at = CURRENT_TIMESTAMP
         WHERE endpoint = ? AND (course_id = ? OR (course_id IS NULL AND ? IS NULL))`,
        [endpoint, courseId, courseId],
        'endpoint_backoff'
      );
    } catch (err) {
      // Silently ignore lock/closed errors - backoff tracking is non-critical
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('locked') && !msg.includes('not open')) throw err;
    }
  }

  /**
   * Reset backoff for an endpoint (called after 2+ days of waiting)
   */
  resetEndpointBackoff(endpoint: string, courseId: number | null): void {
    // Skip if database is closed or locked (non-critical operation)
    if (!this.db.isOpen || this.db.isWriteLocked()) return;

    try {
      this.db.executeWrite(
        `DELETE FROM endpoint_backoff
         WHERE endpoint = ? AND (course_id = ? OR (course_id IS NULL AND ? IS NULL))`,
        [endpoint, courseId, courseId],
        'endpoint_backoff'
      );

      this.emit('endpoint-backoff-reset', { endpoint, courseId });
    } catch (err) {
      // Silently ignore lock/closed errors - backoff tracking is non-critical
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('locked') && !msg.includes('not open')) throw err;
    }
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
  async fetchWithBackoff<T>(
    endpoint: string,
    courseId: number | null,
    fetcher: () => Promise<T>
  ): Promise<{ data: T | null; skipped: boolean; error?: string }> {
    // Check if in backoff
    if (this.isEndpointInBackoff(endpoint, courseId)) {
      const info = this.getEndpointBackoffInfo(endpoint, courseId);
      this.emit('endpoint-skipped', {
        endpoint,
        courseId,
        reason: 'backoff',
        nextRetryAt: info?.nextRetryAt,
        failureCount: info?.failureCount,
      });
      return {
        data: null,
        skipped: true,
        error: `Skipped: in backoff until ${info?.nextRetryAt?.toISOString()}`,
      };
    }

    try {
      const data = await fetcher();
      // Success - clear any backoff
      this.recordEndpointSuccess(endpoint, courseId);
      return { data, skipped: false };
    } catch (err) {
      // Extract status from error object (CanvasApiError has status property)
      const status = (err as { status?: number })?.status;
      const errorMessage = (err as { message?: string })?.message || String(err);

      // Handle auth/access errors with backoff (401, 403, 404)
      // 404 can mean "page disabled for this course" - not a fatal error
      if (status === 401 || status === 403 || status === 404) {
        const errorCode = String(status);
        this.recordEndpointFailure(
          endpoint,
          courseId,
          errorCode,
          errorMessage.slice(0, 200)
        );
        return {
          data: null,
          skipped: false,
          error: `Error ${errorCode}: ${errorMessage.slice(0, 100)}`,
        };
      }

      // Non-backoff error - rethrow (5xx server errors, network errors, etc.)
      throw err;
    }
  }
}
