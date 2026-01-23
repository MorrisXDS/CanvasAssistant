/**
 * TriggerSyncCommand - Manually trigger a sync operation
 *
 * Allows users to request a manual sync with Canvas.
 * This command validates system state before allowing sync.
 *
 * Note: Actual sync execution is handled by L2 (SyncEngine).
 * This command validates and emits a request event.
 */

import { EventEmitter } from 'events';
import {
  Command,
  CommandContext,
  CommandResult,
  TriggerSyncParams,
} from '../types';

/**
 * Sync request event payload
 */
export interface SyncRequestEvent {
  type: TriggerSyncParams['type'];
  courseId?: number;
  requestedAt: Date;
}

/**
 * TriggerSyncCommand emits events for the sync engine to handle
 */
export class TriggerSyncCommand
  extends EventEmitter
  implements Command<TriggerSyncParams, { requestedAt: Date }>
{
  readonly name = 'TriggerSync';

  private lastSyncRequest: Date | null = null;
  private minSyncIntervalMs: number = 30000; // 30 seconds minimum between syncs

  validate(params: TriggerSyncParams): { valid: boolean; error?: string } {
    const validTypes = ['full', 'courses', 'tasks', 'notifications'];
    if (!validTypes.includes(params.type)) {
      return { valid: false, error: `Invalid sync type: ${params.type}` };
    }

    if (params.courseId !== undefined) {
      // Validate courseId is a positive integer
      if (typeof params.courseId !== 'number' || !Number.isInteger(params.courseId) || params.courseId < 1) {
        return { valid: false, error: 'Invalid course ID: must be a positive integer' };
      }
      // Reasonable upper bound check (SQLite INTEGER max is 2^63-1, but IDs should be reasonable)
      if (params.courseId > 2147483647) {
        return { valid: false, error: 'Invalid course ID: exceeds maximum value' };
      }
    }

    return { valid: true };
  }

  async execute(
    context: CommandContext,
    params: TriggerSyncParams
  ): Promise<CommandResult<{ requestedAt: Date }>> {
    const validation = this.validate(params);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      // Check rate limiting
      if (this.lastSyncRequest) {
        const timeSinceLastSync = Date.now() - this.lastSyncRequest.getTime();
        if (timeSinceLastSync < this.minSyncIntervalMs) {
          const waitTime = Math.ceil((this.minSyncIntervalMs - timeSinceLastSync) / 1000);
          return {
            success: false,
            error: `Please wait ${waitTime} seconds before syncing again`,
          };
        }
      }

      // If syncing specific course, verify it exists
      if (params.courseId) {
        const course = context.db.executeReadOne<{ id: number }>(
          'SELECT id FROM courses WHERE id = ?',
          [params.courseId]
        );

        if (!course) {
          return { success: false, error: 'Course not found' };
        }
      }

      const requestedAt = new Date();
      this.lastSyncRequest = requestedAt;

      // Emit sync request event
      const event: SyncRequestEvent = {
        type: params.type,
        courseId: params.courseId,
        requestedAt,
      };

      this.emit('sync-requested', event);

      return {
        success: true,
        data: { requestedAt },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to trigger sync: ${error}`,
      };
    }
  }

  /**
   * Set minimum interval between sync requests
   */
  setMinSyncInterval(ms: number): void {
    this.minSyncIntervalMs = ms;
  }

  /**
   * Reset rate limiting (for testing)
   */
  resetRateLimit(): void {
    this.lastSyncRequest = null;
  }
}
