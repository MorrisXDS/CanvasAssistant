/**
 * HtmlExportReader — the only SQL read surface for the `html_exports`
 * table.
 *
 * Per ADR-0007, IPC handlers MUST route reads through this reader. Writes
 * go through `UpsertHtmlExportCommand` (L4).
 *
 * Stateless. Returns raw DB rows (snake_case); consumers map to DTOs.
 */

import type { Database } from '../Database';

export interface HtmlExportRow {
  id: number;
  course_id: number;
  source_type: string;
  source_id: string;
  title: string;
  content_hash: string | null;
  local_path: string | null;
  exported_at: string | null;
}

export class HtmlExportReader {
  constructor(private readonly db: Database) {}

  /**
   * The export row for one (course, source_type, source_id) tuple, or
   * null. Used to reuse an existing local path on re-export.
   */
  getByContext(
    courseId: number,
    sourceType: string,
    sourceId: string
  ): HtmlExportRow | null {
    return (
      this.db.executeReadOne<HtmlExportRow>(
        `SELECT * FROM html_exports
         WHERE course_id = ? AND source_type = ? AND source_id = ?`,
        [courseId, sourceType, sourceId]
      ) ?? null
    );
  }

  /**
   * All exports for a course that have a materialized local file
   * (`local_path IS NOT NULL`) — drives the Files-page download status.
   */
  getByCourseWithPath(courseId: number): HtmlExportRow[] {
    return this.db.executeRead<HtmlExportRow>(
      `SELECT * FROM html_exports
       WHERE course_id = ? AND local_path IS NOT NULL`,
      [courseId]
    );
  }
}
