/**
 * MessageProbationService - Duplicate Prevention with Exponential Backoff
 *
 * Prevents the same insight or recommendation from being shown too frequently.
 * Uses exponential backoff for grounding time when messages repeat.
 *
 * Type-specific settings are defined in MessageFrequencyConfig.ts
 *
 * Algorithm:
 * - First occurrence: Show immediately, no grounding
 * - Second occurrence: Ground for baseGroundingHours (type-specific)
 * - Each subsequent occurrence: Double the grounding time (exponential backoff)
 * - After quietPeriodHours without showing: Reset occurrence count (type-specific)
 */

import { Database } from '../../l1-persistence/Database';
import type { DisplayHistoryRow } from '../../l1-persistence/DatabaseRowTypes';
import crypto from 'crypto';
import {
  getFrequencySettings,
  type MessageFrequencySettings,
} from './MessageFrequencyConfig';

/**
 * @deprecated Use MessageFrequencyConfig instead for type-specific settings
 */
export interface MessageProbationConfig {
  /** Base grounding time in hours after second occurrence */
  baseGroundingHours?: number;
  /** Maximum grounding time in hours */
  maxGroundingHours?: number;
  /** Quiet period before resetting count */
  quietPeriodHours?: number;
  /** Time window for counting occurrences */
  windowHours?: number;
}

type MessageType = 'insight' | 'recommendation';

// DisplayHistoryRow imported from DatabaseRowTypes.ts

/**
 * MessageProbationService manages duplicate prevention with exponential backoff
 *
 * Uses centralized type-specific frequency settings from MessageFrequencyConfig.ts
 */
export class MessageProbationService {
  private db: Database;

  constructor(db: Database, _config?: MessageProbationConfig) {
    this.db = db;
    // Note: _config parameter kept for backward compatibility but is deprecated
    // Type-specific settings are now loaded from MessageFrequencyConfig
  }

  /**
   * Generate a content hash for deduplication
   * Uses type + subType + title + key data fields to create unique identifier
   */
  generateContentHash(
    messageType: MessageType,
    subType: string,
    title: string,
    keyData: Record<string, unknown>
  ): string {
    const content = JSON.stringify({
      messageType,
      subType,
      title: title.toLowerCase().trim(),
      keyData,
    });
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 32);
  }

  /**
   * Get frequency settings for a message type
   */
  private getSettings(
    messageType: MessageType,
    subType: string
  ): MessageFrequencySettings {
    return getFrequencySettings(messageType, subType);
  }

  /**
   * Check if a message is currently grounded (should not be shown)
   */
  isGrounded(messageType: MessageType, contentHash: string, subType: string): boolean {
    const now = new Date();

    // First check for quiet period reset
    this.checkQuietPeriodReset(messageType, contentHash, subType);

    const row = this.db.executeReadOne<DisplayHistoryRow>(
      `SELECT * FROM message_display_history
       WHERE message_type = ? AND content_hash = ?`,
      [messageType, contentHash]
    );

    if (!row || !row.grounded_until) {
      return false;
    }

    const groundedUntil = new Date(row.grounded_until);
    return now < groundedUntil;
  }

  /**
   * Check if quiet period has passed and reset if so
   */
  private checkQuietPeriodReset(
    messageType: MessageType,
    contentHash: string,
    subType: string
  ): void {
    const now = new Date();
    const row = this.db.executeReadOne<DisplayHistoryRow>(
      `SELECT * FROM message_display_history
       WHERE message_type = ? AND content_hash = ?`,
      [messageType, contentHash]
    );

    if (!row || !row.quiet_period_start) {
      return;
    }

    // Use type-specific quiet period, or stored subType if available
    const settings = this.getSettings(messageType, row.sub_type || subType);
    const quietStart = new Date(row.quiet_period_start);
    const quietEndTime =
      quietStart.getTime() + settings.quietPeriodHours * 60 * 60 * 1000;

    if (now.getTime() >= quietEndTime) {
      // Reset the record - quiet period has passed
      this.db.executeWrite(
        `UPDATE message_display_history
         SET display_count = 0, grounded_until = NULL, quiet_period_start = NULL
         WHERE message_type = ? AND content_hash = ?`,
        [messageType, contentHash],
        'message_display_history'
      );
    }
  }

  /**
   * Record that a message was displayed and calculate grounding
   */
  recordDisplay(messageType: MessageType, contentHash: string, subType: string): void {
    const now = new Date();
    const settings = this.getSettings(messageType, subType);

    const existing = this.db.executeReadOne<DisplayHistoryRow>(
      `SELECT * FROM message_display_history
       WHERE message_type = ? AND content_hash = ?`,
      [messageType, contentHash]
    );

    if (!existing) {
      // First time seeing this message - no grounding
      this.db.executeWrite(
        `INSERT INTO message_display_history
         (message_type, sub_type, content_hash, display_count, first_shown_at, last_shown_at, quiet_period_start)
         VALUES (?, ?, ?, 1, ?, ?, ?)`,
        [
          messageType,
          subType,
          contentHash,
          now.toISOString(),
          now.toISOString(),
          now.toISOString(),
        ],
        'message_display_history'
      );
      return;
    }

    // Increment count and calculate grounding
    const newCount = existing.display_count + 1;

    // Calculate grounding time with exponential backoff
    // count 1: no grounding
    // count 2: base hours
    // count 3: base * 2
    // count 4: base * 4
    // etc.
    let groundingHours = 0;
    if (newCount >= 2) {
      groundingHours = settings.baseGroundingHours * Math.pow(2, newCount - 2);
      groundingHours = Math.min(groundingHours, settings.maxGroundingHours);
    }

    const groundedUntil =
      groundingHours > 0
        ? new Date(now.getTime() + groundingHours * 60 * 60 * 1000)
        : null;

    // Update record with new grounding, also update sub_type in case it changed
    this.db.executeWrite(
      `UPDATE message_display_history
       SET display_count = ?,
           sub_type = ?,
           last_shown_at = ?,
           grounded_until = ?
       WHERE message_type = ? AND content_hash = ?`,
      [
        newCount,
        subType,
        now.toISOString(),
        groundedUntil?.toISOString() ?? null,
        messageType,
        contentHash,
      ],
      'message_display_history'
    );
  }

  /**
   * Get grounding info for a message
   */
  getGroundingInfo(
    messageType: MessageType,
    contentHash: string
  ): {
    isGrounded: boolean;
    displayCount: number;
    groundedUntil: Date | null;
    hoursRemaining: number | null;
    subType: string | null;
  } | null {
    const row = this.db.executeReadOne<DisplayHistoryRow>(
      `SELECT * FROM message_display_history
       WHERE message_type = ? AND content_hash = ?`,
      [messageType, contentHash]
    );

    if (!row) {
      return null;
    }

    const now = new Date();
    const groundedUntil = row.grounded_until ? new Date(row.grounded_until) : null;
    const isGrounded = groundedUntil !== null && now < groundedUntil;
    const hoursRemaining = isGrounded
      ? Math.ceil((groundedUntil!.getTime() - now.getTime()) / (60 * 60 * 1000))
      : null;

    return {
      isGrounded,
      displayCount: row.display_count,
      groundedUntil,
      hoursRemaining,
      subType: row.sub_type || null,
    };
  }

  /**
   * Filter a list of items, removing grounded ones
   * @param items Array of items to filter
   * @param messageType Type of message (insight or recommendation)
   * @param getHash Function to extract content hash from item
   * @param getSubType Function to extract subType from item
   * @returns Filtered array with non-grounded items only
   */
  filterGrounded<T>(
    items: T[],
    messageType: MessageType,
    getHash: (item: T) => string,
    getSubType?: (item: T) => string
  ): T[] {
    return items.filter((item) => {
      const hash = getHash(item);
      const subType = getSubType ? getSubType(item) : '';
      return !this.isGrounded(messageType, hash, subType);
    });
  }

  /**
   * Record display for multiple items at once
   */
  recordDisplayBatch(
    messageType: MessageType,
    items: Array<{ contentHash: string; subType: string }>
  ): void {
    for (const item of items) {
      this.recordDisplay(messageType, item.contentHash, item.subType);
    }
  }

  /**
   * Clear all grounding (for debugging/reset)
   */
  clearAllGrounding(): void {
    this.db.executeWrite(
      `UPDATE message_display_history SET grounded_until = NULL, display_count = 0`,
      [],
      'message_display_history'
    );
  }

  /**
   * Get statistics about message display history
   */
  getStatistics(): {
    totalTracked: number;
    currentlyGrounded: number;
    byType: Record<MessageType, number>;
    bySubType: Record<string, number>;
    averageDisplayCount: number;
  } {
    const now = new Date();

    const total = this.db.executeReadOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM message_display_history`
    );

    const grounded = this.db.executeReadOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM message_display_history
       WHERE grounded_until IS NOT NULL AND grounded_until > ?`,
      [now.toISOString()]
    );

    const byTypeCounts = this.db.executeRead<{ message_type: string; count: number }>(
      `SELECT message_type, COUNT(*) as count FROM message_display_history GROUP BY message_type`
    );

    const bySubTypeCounts = this.db.executeRead<{ sub_type: string; count: number }>(
      `SELECT sub_type, COUNT(*) as count FROM message_display_history WHERE sub_type IS NOT NULL GROUP BY sub_type`
    );

    const avgCount = this.db.executeReadOne<{ avg: number }>(
      `SELECT AVG(display_count) as avg FROM message_display_history`
    );

    const byType: Record<MessageType, number> = {
      insight: 0,
      recommendation: 0,
    };
    for (const row of byTypeCounts) {
      byType[row.message_type as MessageType] = row.count;
    }

    const bySubType: Record<string, number> = {};
    for (const row of bySubTypeCounts) {
      bySubType[row.sub_type] = row.count;
    }

    return {
      totalTracked: total?.count ?? 0,
      currentlyGrounded: grounded?.count ?? 0,
      byType,
      bySubType,
      averageDisplayCount: avgCount?.avg ?? 0,
    };
  }
}
