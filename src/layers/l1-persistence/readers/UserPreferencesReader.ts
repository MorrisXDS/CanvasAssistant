/**
 * UserPreferencesReader — the only SQL read surface for the
 * `user_preferences` key-value table.
 *
 * Per ADR-0007, IPC handlers MUST route reads through this reader. Writes
 * go through `SetUserPreferenceCommand` (L4).
 *
 * Stateless. Returns the raw stored `value` string (callers JSON-parse it
 * themselves, with their own defaults) or null when the key is absent.
 */

import type { Database } from '../Database';

export class UserPreferencesReader {
  constructor(private readonly db: Database) {}

  /**
   * The stored value string for a preference key, or null if unset.
   */
  get(key: string): string | null {
    const row = this.db.executeReadOne<{ value: string }>(
      `SELECT value FROM user_preferences WHERE key = ?`,
      [key]
    );
    return row?.value ?? null;
  }
}
