/**
 * Sync Operation Context
 * Shared context and dependencies for sync operation modules.
 */

import type { EventEmitter } from 'events';
import type { CanvasClient } from './CanvasClient';
import type { RateLimiter } from './RateLimiter';
import type { Database } from '../l1-persistence/Database';
import type { SyncConflictResolver } from './SyncConflictResolver';
import type { SyncBackoffManager } from './SyncBackoffManager';
import type { ComponentLogger } from '../l0-utilities/Logger';
import type { SyncResult, SyncDiagnosticEntry } from './SyncEngineTypes';

/**
 * Context provided to sync operation handlers.
 * Contains all shared dependencies needed for sync operations.
 */
export interface SyncOperationContext {
  /** Canvas API client */
  client: CanvasClient;
  /** Local SQLite database */
  db: Database;
  /** Rate limiter for API requests */
  rateLimiter: RateLimiter;
  /** Conflict resolver for merge conflicts */
  conflictResolver: SyncConflictResolver;
  /** Backoff manager for failed endpoints */
  backoffManager: SyncBackoffManager;
  /** Optional logger */
  log: ComponentLogger | null;
  /** Event emitter for sync events */
  emitter: EventEmitter;
  /** Whether diagnostics are enabled */
  diagnosticsEnabled: boolean;
  /** Pending conflict data storage */
  pendingConflictData: Map<string, { tableName: string; data: Record<string, unknown> }>;
}

/**
 * Helper functions provided to sync operations
 */
export interface SyncOperationHelpers {
  /** Get user's default target grade */
  getDefaultTargetGrade: () => number;
  /** Get per-course sync settings */
  getCourseSettings: (courseId: number) => {
    autoAssignDueDate: boolean;
    allowGuessedOverride: boolean;
  };
  /** Get today's end time as ISO string */
  getTodayEndTime: () => string;
  /** Get sync preferences */
  getSyncPreferences: () => { autoAssignDueDate: boolean };
  /** Update sync metadata */
  updateSyncMetadata: (endpoint: string, etag?: string) => void;
  /** Log diagnostic entry */
  logDiagnostic: (entry: Omit<SyncDiagnosticEntry, 'timestamp'>) => void;
  /** Persist conflict data for crash safety */
  persistConflictData: (
    conflictId: string,
    tableName: string,
    data: Record<string, unknown>
  ) => void;
}

/**
 * Empty/default sync result for error cases
 */
export function createEmptySyncResult(entity: string, errors: string[] = []): SyncResult {
  return {
    success: errors.length === 0,
    entity,
    count: 0,
    errors,
    duration: 0,
  };
}

/**
 * Create a sync result with timing
 */
export function createSyncResult(
  entity: string,
  count: number,
  errors: string[],
  startTime: number
): SyncResult {
  return {
    success: errors.length === 0,
    entity,
    count,
    errors,
    duration: Date.now() - startTime,
  };
}
