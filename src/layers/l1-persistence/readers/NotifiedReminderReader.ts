/**
 * NotifiedReminderReader — SQL read surface for the `notified_reminders` table.
 *
 * Provides the seed data for `DueDateReminderManager`'s in-memory dedup Set on
 * startup so that reminders already sent in a previous app run are not re-fired
 * within the same due-date window (ADR-0016 follow-up, migration 114).
 *
 * Stateless. Write surface lives in `RecordNotifiedReminderCommand` (L4).
 */

import type { Database } from '../Database';

export class NotifiedReminderReader {
  constructor(private readonly db: Database) {}

  /**
   * All dedup keys currently stored in `notified_reminders`.
   * Used by `DueDateReminderManager.start()` to seed the in-memory Set so
   * previously-seen reminders are not re-fired after a restart.
   */
  getAllKeys(): string[] {
    const rows = this.db.executeRead<{ dedup_key: string }>(
      'SELECT dedup_key FROM notified_reminders'
    );
    return rows.map((r) => r.dedup_key);
  }
}
