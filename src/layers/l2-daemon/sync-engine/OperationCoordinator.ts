/**
 * Operation Coordinator - Prevents sync/download conflicts
 *
 * Tracks active operations to prevent interference between:
 * - SyncEngine modifying html_dependencies while download is using them
 * - Downloads running while sync is updating HTML content
 * - Multiple simultaneous downloads of the same resource
 *
 * Uses session IDs to protect dependencies from deletion during downloads.
 */

import { Database } from '../../l1-persistence';
import type { ComponentLogger } from '../../l0-utilities/Logger';

export type OperationType = 'sync' | 'download_html' | 'download_file';

export interface ActiveOperation {
  id: number;
  operationType: OperationType;
  resourceType: string | null;
  resourceId: string | null;
  courseId: number | null;
  sessionId: string;
  startedAt: string;
  heartbeatAt: string;
  status: 'active' | 'stale' | 'completed';
}

export interface OperationCoordinatorConfig {
  /** Database instance */
  db: Database;
  /** Optional logger */
  logger?: ComponentLogger;
  /** Stale timeout in milliseconds (default: 5 minutes) */
  staleTimeoutMs?: number;
}

/**
 * OperationCoordinator manages active operations to prevent conflicts
 * between sync and download processes.
 */
export class OperationCoordinator {
  private db: Database;
  private log: ComponentLogger | null;
  private staleTimeoutMs: number;

  constructor(config: OperationCoordinatorConfig) {
    this.db = config.db;
    this.log = config.logger ?? null;
    this.staleTimeoutMs = config.staleTimeoutMs ?? 5 * 60 * 1000; // 5 minutes

    // Ensure table exists
    this.ensureTable();
  }

  /**
   * Ensure the active_operations table exists
   */
  private ensureTable(): void {
    if (!this.db.isOpen) return;
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS active_operations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          operation_type TEXT NOT NULL CHECK(operation_type IN ('sync', 'download_html', 'download_file')),
          resource_type TEXT,
          resource_id TEXT,
          course_id INTEGER,
          session_id TEXT UNIQUE,
          started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          heartbeat_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          status TEXT DEFAULT 'active' CHECK(status IN ('active', 'stale', 'completed')),
          UNIQUE(operation_type, resource_type, resource_id)
        )
      `);
    } catch {
      // Table may already exist from migration
    }
  }

  /**
   * Generate a unique session ID for an operation
   */
  private generateSessionId(type: OperationType): string {
    return `${type}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Start tracking an operation
   * @returns Session ID for the operation
   */
  startOperation(
    type: OperationType,
    resourceType?: string,
    resourceId?: string,
    courseId?: number
  ): string {
    const sessionId = this.generateSessionId(type);

    try {
      // First, clean up any stale operations
      this.cleanupStale();

      // Insert or replace the operation
      this.db.executeWrite(
        `INSERT OR REPLACE INTO active_operations
         (operation_type, resource_type, resource_id, course_id, session_id, started_at, heartbeat_at, status)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'active')`,
        [type, resourceType ?? null, resourceId ?? null, courseId ?? null, sessionId],
        'active_operations'
      );

      this.log?.debug(
        `Started operation: ${type} ${resourceType}:${resourceId} session=${sessionId}`
      );
    } catch (err) {
      this.log?.error(
        `Failed to start operation: ${type}`,
        err instanceof Error ? err : undefined
      );
    }

    return sessionId;
  }

  /**
   * Check if there's an active download for a specific resource
   */
  hasActiveDownload(resourceType: string, resourceId: string): boolean {
    try {
      const result = this.db.executeReadOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM active_operations
         WHERE operation_type = 'download_html'
           AND resource_type = ?
           AND resource_id = ?
           AND status = 'active'`,
        [resourceType, resourceId]
      );
      return (result?.count ?? 0) > 0;
    } catch {
      return false;
    }
  }

  /**
   * Check if there's an active sync operation
   */
  hasActiveSync(): boolean {
    try {
      const result = this.db.executeReadOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM active_operations
         WHERE operation_type = 'sync'
           AND status = 'active'`
      );
      return (result?.count ?? 0) > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get the session ID for an active download, if any
   */
  getActiveDownloadSession(resourceType: string, resourceId: string): string | null {
    try {
      const result = this.db.executeReadOne<{ session_id: string }>(
        `SELECT session_id FROM active_operations
         WHERE operation_type = 'download_html'
           AND resource_type = ?
           AND resource_id = ?
           AND status = 'active'`,
        [resourceType, resourceId]
      );
      return result?.session_id ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Update heartbeat for an active operation
   */
  heartbeat(sessionId: string): void {
    try {
      this.db.executeWrite(
        `UPDATE active_operations
         SET heartbeat_at = CURRENT_TIMESTAMP
         WHERE session_id = ?`,
        [sessionId],
        'active_operations'
      );
    } catch (err) {
      this.log?.debug(`Failed to update heartbeat: ${err}`);
    }
  }

  /**
   * Mark an operation as completed
   */
  completeOperation(sessionId: string): void {
    try {
      this.db.executeWrite(
        `UPDATE active_operations
         SET status = 'completed'
         WHERE session_id = ?`,
        [sessionId],
        'active_operations'
      );

      this.log?.debug(`Completed operation: session=${sessionId}`);
    } catch (err) {
      this.log?.debug(`Failed to complete operation: ${err}`);
    }
  }

  /**
   * Remove a completed operation from tracking
   */
  removeOperation(sessionId: string): void {
    try {
      this.db.executeWrite(
        `DELETE FROM active_operations WHERE session_id = ?`,
        [sessionId],
        'active_operations'
      );
    } catch (err) {
      this.log?.debug(`Failed to remove operation: ${err}`);
    }
  }

  /**
   * Clean up stale operations (older than staleTimeoutMs)
   */
  cleanupStale(): void {
    try {
      const timeoutSeconds = Math.floor(this.staleTimeoutMs / 1000);

      // Mark operations as stale if heartbeat is too old
      this.db.executeWrite(
        `UPDATE active_operations
         SET status = 'stale'
         WHERE heartbeat_at < datetime('now', '-${timeoutSeconds} seconds')
           AND status = 'active'`,
        [],
        'active_operations'
      );

      // Delete operations that have been stale for a while or completed
      this.db.executeWrite(
        `DELETE FROM active_operations
         WHERE status IN ('stale', 'completed')
           AND heartbeat_at < datetime('now', '-${timeoutSeconds * 2} seconds')`,
        [],
        'active_operations'
      );
    } catch (err) {
      this.log?.debug(`Failed to cleanup stale operations: ${err}`);
    }
  }

  /**
   * Get all active operations (for debugging/monitoring)
   */
  getActiveOperations(): ActiveOperation[] {
    try {
      const rows = this.db.executeRead<{
        id: number;
        operation_type: OperationType;
        resource_type: string | null;
        resource_id: string | null;
        course_id: number | null;
        session_id: string;
        started_at: string;
        heartbeat_at: string;
        status: 'active' | 'stale' | 'completed';
      }>(
        `SELECT id, operation_type, resource_type, resource_id, course_id,
                session_id, started_at, heartbeat_at, status
         FROM active_operations
         WHERE status = 'active'
         ORDER BY started_at DESC`
      );

      return rows.map((row) => ({
        id: row.id,
        operationType: row.operation_type,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        courseId: row.course_id,
        sessionId: row.session_id,
        startedAt: row.started_at,
        heartbeatAt: row.heartbeat_at,
        status: row.status,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Check if a resource has any active operation (sync or download)
   */
  hasActiveOperation(resourceType: string, resourceId: string): boolean {
    try {
      const result = this.db.executeReadOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM active_operations
         WHERE resource_type = ?
           AND resource_id = ?
           AND status = 'active'`,
        [resourceType, resourceId]
      );
      return (result?.count ?? 0) > 0;
    } catch {
      return false;
    }
  }

  /**
   * Clear all completed and stale operations
   */
  clearCompleted(): void {
    try {
      this.db.executeWrite(
        `DELETE FROM active_operations WHERE status IN ('completed', 'stale')`,
        [],
        'active_operations'
      );
    } catch (err) {
      this.log?.debug(`Failed to clear completed operations: ${err}`);
    }
  }
}
