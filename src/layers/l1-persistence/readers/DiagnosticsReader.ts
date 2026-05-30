/**
 * DiagnosticsReader — read surface for the database-diagnostics endpoint.
 *
 * Per ADR-0007, the `data:getDatabaseDiagnostics` IPC handler routes its
 * reads through here rather than issuing raw SQL. This reader deliberately
 * owns the fixed list of entity tables it counts so no table name is ever
 * interpolated from caller input.
 *
 * Stateless. Returns raw shapes; the handler composes them with the schema
 * version (a `Database` method, not SQL).
 */

import type { Database } from '../Database';

/** Entity tables surfaced in the diagnostics row-count summary. */
const DIAGNOSTIC_TABLES = [
  'courses',
  'tasks',
  'calendar_events',
  'imported_calendars',
  'notifications',
  'resources',
] as const;

export class DiagnosticsReader {
  constructor(private readonly db: Database) {}

  /**
   * Row counts for each diagnostic entity table. A table that fails to read
   * yields the string `'error'` for that key (matching the prior handler's
   * per-table defensive behaviour).
   */
  getEntityCounts(): Record<string, number | 'error'> {
    const counts: Record<string, number | 'error'> = {};
    for (const table of DIAGNOSTIC_TABLES) {
      try {
        const result = this.db.executeReadOne<{ count: number }>(
          `SELECT COUNT(*) as count FROM ${table}`
        );
        counts[table] = result?.count ?? 0;
      } catch {
        counts[table] = 'error';
      }
    }
    return counts;
  }

  /**
   * Per-calendar detail (id, name, cached event count).
   */
  getImportedCalendarsDetail(): Array<{ id: number; name: string; event_count: number }> {
    return this.db.executeRead<{ id: number; name: string; event_count: number }>(
      'SELECT id, name, event_count FROM imported_calendars'
    );
  }

  /**
   * Calendar-event counts grouped by `source_type`.
   */
  getCalendarEventsByType(): Array<{ source_type: string; count: number }> {
    return this.db.executeRead<{ source_type: string; count: number }>(
      `SELECT source_type, COUNT(*) as count FROM calendar_events GROUP BY source_type`
    );
  }
}
