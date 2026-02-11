/**
 * SyncStrategy - Base interface for sync operations
 *
 * Each strategy handles syncing a specific entity type (courses, tasks, etc.)
 * and encapsulates the Canvas API calls and database operations for that entity.
 */

import { EventEmitter } from 'events';
import type { Database } from '../../l1-persistence';
import type { CanvasClient } from '../CanvasClient';
import type { RateLimiter } from '../RateLimiter';
import type { ComponentLogger } from '../../l0-utilities/Logger';

/**
 * Result of a sync operation
 */
export interface SyncResult {
  success: boolean;
  entity: string;
  count: number;
  errors: string[];
  duration: number;
}

/**
 * Context passed to all sync strategies
 */
export interface SyncContext {
  /** Canvas API client */
  client: CanvasClient;
  /** Database instance */
  db: Database;
  /** Rate limiter for API calls */
  rateLimiter: RateLimiter;
  /** Optional logger */
  log?: ComponentLogger;
  /** Event emitter for progress updates */
  emitter: EventEmitter;
}

/**
 * Base interface for sync strategies
 */
export interface ISyncStrategy {
  /** Entity type this strategy handles */
  readonly entityType: string;

  /**
   * Sync data for a specific course
   * @param canvasCourseId External Canvas course ID
   * @param localCourseId Local database course ID
   * @returns Sync result
   */
  syncForCourse(canvasCourseId: number, localCourseId: number): Promise<SyncResult>;
}

/**
 * Base class for sync strategies with common functionality
 */
export abstract class BaseSyncStrategy implements ISyncStrategy {
  abstract readonly entityType: string;

  protected readonly client: CanvasClient;
  protected readonly db: Database;
  protected readonly rateLimiter: RateLimiter;
  protected readonly log?: ComponentLogger;
  protected readonly emitter: EventEmitter;

  constructor(context: SyncContext) {
    this.client = context.client;
    this.db = context.db;
    this.rateLimiter = context.rateLimiter;
    this.log = context.log;
    this.emitter = context.emitter;
  }

  abstract syncForCourse(
    canvasCourseId: number,
    localCourseId: number
  ): Promise<SyncResult>;

  /**
   * Helper to create a successful result
   */
  protected successResult(
    count: number,
    duration: number,
    errors: string[] = []
  ): SyncResult {
    return {
      success: errors.length === 0,
      entity: this.entityType,
      count,
      errors,
      duration,
    };
  }

  /**
   * Helper to create a failed result
   */
  protected failedResult(error: string, duration: number): SyncResult {
    return {
      success: false,
      entity: this.entityType,
      count: 0,
      errors: [error],
      duration,
    };
  }

  /**
   * Emit progress event
   */
  protected emitProgress(phase: string, current: number, total: number): void {
    this.emitter.emit('sync-progress', {
      entity: this.entityType,
      phase,
      current,
      total,
    });
  }
}
