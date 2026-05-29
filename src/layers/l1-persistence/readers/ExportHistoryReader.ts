/**
 * ExportHistoryReader — the only SQL read surface for the `export_history`
 * table.
 *
 * Per ADR-0007, IPC handlers MUST route reads through this reader. Writes
 * go through `RecordExportHistoryCommand` (L4).
 *
 * Stateless. Returns raw DB rows (snake_case); consumers map to DTOs.
 */

import type { Database } from '../Database';

export interface ExportHistoryRow {
  id: number;
  export_type: string;
  file_path: string | null;
  file_size: number | null;
  encrypted: number;
  courses_included: string | null;
  tasks_exported: number;
  files_exported: number;
  status: string;
  error_message: string | null;
  created_at: string;
}

export class ExportHistoryReader {
  constructor(private readonly db: Database) {}

  /**
   * Most-recent export-history rows, newest first. Defaults to the latest
   * 50 (matching the prior IPC behaviour).
   */
  getRecent(limit = 50): ExportHistoryRow[] {
    return this.db.executeRead<ExportHistoryRow>(
      `SELECT * FROM export_history ORDER BY created_at DESC LIMIT ?`,
      [limit]
    );
  }
}
