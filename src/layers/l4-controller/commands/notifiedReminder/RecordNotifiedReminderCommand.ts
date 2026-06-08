/**
 * RecordNotifiedReminderCommand — write surface for the `notified_reminders`
 * table (ADR-0016 follow-up, migration 114).
 *
 * Two operations:
 *   - `record(key, taskId, dueAt)` — INSERT OR IGNORE (idempotent: a re-seeded
 *     key that re-enters the notify loop will not double-insert).
 *   - `pruneOlderThan(cutoffIso)` — DELETE WHERE due_at < cutoffIso (lexical
 *     ISO-UTC comparison is chronologically correct for UTC strings, same as
 *     selectDueReminders uses with new Date()).
 *
 * Note: the prune cutoff is compared against `due_at` (the task's due date),
 * NOT `notified_at`. A key can only suppress a reminder for a date in the
 * [now, now+24h] window, so once due_at is in the past the key is inert.
 * Pruning 7 days past-due is far beyond any live window and cannot suppress
 * a legitimate future reminder.
 */

import type { Database } from '../../../l1-persistence/Database';

export class RecordNotifiedReminderCommand {
  constructor(private readonly db: Database) {}

  /**
   * Persist a dedup key for a notified reminder. Idempotent: INSERT OR IGNORE
   * means a duplicate call for the same key is a no-op.
   */
  record(key: string, taskId: number, dueAt: string): void {
    this.db.executeWrite(
      `INSERT OR IGNORE INTO notified_reminders (dedup_key, task_id, due_at)
       VALUES (?, ?, ?)`,
      [key, taskId, dueAt],
      'notified_reminders'
    );
  }

  /**
   * Prune stale rows whose `due_at` is before the given ISO cutoff string.
   * Uses lexical TEXT comparison, which is chronologically correct for ISO-UTC
   * strings. Returns the number of rows deleted.
   */
  pruneOlderThan(cutoffIso: string): number {
    const result = this.db.executeWrite(
      'DELETE FROM notified_reminders WHERE due_at < ?',
      [cutoffIso],
      'notified_reminders'
    );
    return result.changes;
  }
}
