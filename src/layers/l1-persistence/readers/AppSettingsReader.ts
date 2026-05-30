/**
 * AppSettingsReader — the only SQL read surface for the `app_settings`
 * key-value table.
 *
 * Per ADR-0007, IPC handlers MUST route reads through this reader. Writes
 * go through `SetAppSettingCommand` / `DeleteAppSettingCommand` (L4).
 *
 * Note: `app_settings` is a distinct table from `user_preferences` (which
 * has its own `UserPreferencesReader`) — see CONTEXT.md on the settings
 * storage duality. Returns the raw stored `value` string (callers parse it)
 * or null when the key is absent.
 */

import type { Database } from '../Database';

export class AppSettingsReader {
  constructor(private readonly db: Database) {}

  /**
   * The stored value string for an app-setting key, or null if unset.
   */
  get(key: string): string | null {
    const row = this.db.executeReadOne<{ value: string }>(
      `SELECT value FROM app_settings WHERE key = ?`,
      [key]
    );
    return row?.value ?? null;
  }
}
