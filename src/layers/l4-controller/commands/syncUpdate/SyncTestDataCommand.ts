/**
 * SyncTestDataCommand — dev-only writes for the sync-update notification-dot
 * test harness, extracted from syncUpdatesHandlers (ADR-0007). Backs the
 * `syncUpdates:createTestData` / `syncUpdates:clearTestData` debug channels.
 *
 * SQL preserved verbatim. The handler keeps the orchestration (picking a
 * course/task/file and shaping the test-update array); this command owns the
 * `sync_sessions` / `sync_updates` writes.
 */

import type { Database } from '../../../l1-persistence/Database';

/** One test sync-update row (column-for-column with the INSERT below). */
export interface TestSyncUpdateInput {
  sync_session_id: string;
  course_id: number;
  entity_type: string;
  entity_id: number;
  change_type: string;
  changed_field: string | null;
  title: string;
  subtitle: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

export class SyncTestDataCommand {
  constructor(private readonly db: Database) {}

  /**
   * Create a test sync session (required by the `sync_updates.sync_session_id`
   * NOT NULL FK → `sync_sessions.id`). Mirrors the production shape in
   * `SyncUpdateRecorder.createSyncSession` — a TEXT `id` (NOT a `status` column,
   * which `sync_sessions` has never had) — and returns that id so the caller can
   * use it as `sync_session_id`. `now` is an ISO timestamp string, which doubles
   * as a unique enough id for this dev-only test harness.
   */
  createTestSession(now: string): string {
    const sessionId = `test-${now}`;
    this.db.executeWrite(
      `INSERT OR IGNORE INTO sync_sessions (id, started_at, created_at)
         VALUES (?, ?, ?)`,
      [sessionId, now, now],
      'sync_sessions'
    );
    return sessionId;
  }

  /** Insert one test sync-update row. */
  insertTestUpdate(update: TestSyncUpdateInput): void {
    this.db.executeWrite(
      `INSERT INTO sync_updates (
            sync_session_id, course_id, entity_type, entity_id, change_type, changed_field,
            title, subtitle, old_value, new_value, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        update.sync_session_id,
        update.course_id,
        update.entity_type,
        update.entity_id,
        update.change_type,
        update.changed_field,
        update.title,
        update.subtitle,
        update.old_value,
        update.new_value,
        update.created_at,
      ],
      'sync_updates'
    );
  }

  /** Delete all [TEST]-prefixed sync updates. Returns rows deleted. */
  clearTestData(): number {
    const result = this.db.executeWrite(
      `DELETE FROM sync_updates WHERE title LIKE '[TEST]%'`,
      [],
      'sync_updates'
    );
    return result.changes;
  }
}
