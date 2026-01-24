/**
 * MessageProbationService - Duplicate Prevention with Exponential Backoff
 *
 * Prevents the same insight or recommendation from being shown too frequently.
 * Uses exponential backoff for grounding time when messages repeat.
 *
 * Algorithm:
 * - First occurrence: Show immediately, no grounding
 * - Second occurrence within window: Ground for BASE_GROUNDING_HOURS
 * - Each subsequent occurrence: Double the grounding time (exponential backoff)
 * - After QUIET_PERIOD_HOURS without showing: Reset occurrence count
 */

import { Database } from '../../l1-persistence/Database';
import crypto from 'crypto';

/**
 * Configuration for probation behavior
 */
export interface MessageProbationConfig {
  /** Base grounding time in hours after second occurrence (default: 2) */
  baseGroundingHours?: number;
  /** Maximum grounding time in hours (default: 168 = 1 week) */
  maxGroundingHours?: number;
  /** Quiet period before resetting count (default: 72 = 3 days) */
  quietPeriodHours?: number;
  /** Time window for counting occurrences (default: 24) */
  windowHours?: number;
}

const DEFAULT_CONFIG: Required<MessageProbationConfig> = {
  baseGroundingHours: 2,
  maxGroundingHours: 168, // 1 week
  quietPeriodHours: 72, // 3 days
  windowHours: 24,
};

type MessageType = 'insight' | 'recommendation';

interface DisplayHistoryRow {
  id: number;
  message_type: string;
  content_hash: string;
  display_count: number;
  first_shown_at: string;
  last_shown_at: string;
  grounded_until: string | null;
  quiet_period_start: string | null;
}

/**
 * MessageProbationService manages duplicate prevention with exponential backoff
 */
export class MessageProbationService {
  private db: Database;
  private config: Required<MessageProbationConfig>;

  constructor(db: Database, config?: MessageProbationConfig) {
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate a content hash for deduplication
   * Uses type + title + key data fields to create unique identifier
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
   * Check if a message is currently grounded (should not be shown)
   */
  isGrounded(messageType: MessageType, contentHash: string): boolean {
    const now = new Date();

    // First check for quiet period reset
    this.checkQuietPeriodReset(messageType, contentHash);

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
  private checkQuietPeriodReset(messageType: MessageType, contentHash: string): void {
    const now = new Date();
    const row = this.db.executeReadOne<DisplayHistoryRow>(
      `SELECT * FROM message_display_history
       WHERE message_type = ? AND content_hash = ?`,
      [messageType, contentHash]
    );

    if (!row || !row.quiet_period_start) {
      return;
    }

    const quietStart = new Date(row.quiet_period_start);
    const quietEndTime = quietStart.getTime() + this.config.quietPeriodHours * 60 * 60 * 1000;

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
  recordDisplay(messageType: MessageType, contentHash: string): void {
    const now = new Date();

    const existing = this.db.executeReadOne<DisplayHistoryRow>(
      `SELECT * FROM message_display_history
       WHERE message_type = ? AND content_hash = ?`,
      [messageType, contentHash]
    );

    if (!existing) {
      // First time seeing this message - no grounding
      this.db.executeWrite(
        `INSERT INTO message_display_history
         (message_type, content_hash, display_count, first_shown_at, last_shown_at, quiet_period_start)
         VALUES (?, ?, 1, ?, ?, ?)`,
        [messageType, contentHash, now.toISOString(), now.toISOString(), now.toISOString()],
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
      groundingHours = this.config.baseGroundingHours * Math.pow(2, newCount - 2);
      groundingHours = Math.min(groundingHours, this.config.maxGroundingHours);
    }

    const groundedUntil = groundingHours > 0
      ? new Date(now.getTime() + groundingHours * 60 * 60 * 1000)
      : null;

    this.db.executeWrite(
      `UPDATE message_display_history
       SET display_count = ?,
           last_shown_at = ?,
           grounded_until = ?,
           quiet_period_start = ?
       WHERE message_type = ? AND content_hash = ?`,
      [
        newCount,
        now.toISOString(),
        groundedUntil?.toISOString() ?? null,
        now.toISOString(), // Reset quiet period on each display
        messageType,
        contentHash,
      ],
      'message_display_history'
    );
  }

  /**
   * Get grounding info for a message
   */
  getGroundingInfo(messageType: MessageType, contentHash: string): {
    isGrounded: boolean;
    displayCount: number;
    groundedUntil: Date | null;
    hoursRemaining: number | null;
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
    };
  }

  /**
   * Filter a list of items, removing grounded ones
   * @param items Array of items with content hash
   * @param getHash Function to extract content hash from item
   * @param messageType Type of message (insight or recommendation)
   * @returns Filtered array with non-grounded items only
   */
  filterGrounded<T>(
    items: T[],
    messageType: MessageType,
    getHash: (item: T) => string
  ): T[] {
    return items.filter((item) => {
      const hash = getHash(item);
      return !this.isGrounded(messageType, hash);
    });
  }

  /**
   * Record display for multiple items at once
   */
  recordDisplayBatch(messageType: MessageType, contentHashes: string[]): void {
    for (const hash of contentHashes) {
      this.recordDisplay(messageType, hash);
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

    return {
      totalTracked: total?.count ?? 0,
      currentlyGrounded: grounded?.count ?? 0,
      byType,
      averageDisplayCount: avgCount?.avg ?? 0,
    };
  }
}
