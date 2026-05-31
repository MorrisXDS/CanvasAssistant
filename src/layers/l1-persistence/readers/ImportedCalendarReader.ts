/**
 * ImportedCalendarReader — the SQL read surface for `imported_calendars`
 * (ICS calendars the user has imported).
 *
 * Per ADR-0007, IPC handlers MUST route reads through this reader rather
 * than calling `database.execute*` directly. Writes go through the L4
 * imported-calendar commands (Import/Reimport/Delete/Update/ToggleVisibility).
 *
 * Stateless. Returns raw DB rows (snake_case); consumers map to DTOs.
 */

import type { Database } from '../Database';

export interface ImportedCalendarRow {
  id: number;
  name: string;
  filename: string;
  file_hash: string | null;
  color: string;
  event_count: number;
  is_visible: number;
  imported_at: string;
  updated_at: string;
}

export class ImportedCalendarReader {
  constructor(private readonly db: Database) {}

  /** All imported calendars, ordered by name. */
  getAll(): ImportedCalendarRow[] {
    return this.db.executeRead<ImportedCalendarRow>(
      'SELECT * FROM imported_calendars ORDER BY name'
    );
  }

  /**
   * The imported calendar matching a content hash (for duplicate detection),
   * or null. Narrow projection used by the import flow.
   */
  getByHash(fileHash: string): {
    id: number;
    name: string;
    color: string;
    event_count: number;
    imported_at: string;
  } | null {
    return (
      this.db.executeReadOne<{
        id: number;
        name: string;
        color: string;
        event_count: number;
        imported_at: string;
      }>(
        'SELECT id, name, color, event_count, imported_at FROM imported_calendars WHERE file_hash = ?',
        [fileHash]
      ) ?? null
    );
  }
}
