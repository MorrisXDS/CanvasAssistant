/**
 * HtmlDependencyReader — SQL read surface for the `html_dependencies` table.
 *
 * Records parent→child edges between HTML content items (page→file, page→page).
 * Per ADR-0007, IPC handlers MUST route reads through this reader. The write
 * side lives in `RecordHtmlDependencyCommand` (L4). Stateless; returns raw rows.
 */

import type { Database } from '../Database';

/** A recorded child dependency of an HTML parent. */
export interface HtmlDependencyChildRow {
  child_source_type: string;
  child_source_id: string;
}

export class HtmlDependencyReader {
  constructor(private readonly db: Database) {}

  /** All recorded child edges for a parent (type, id). Empty if none. */
  getChildren(
    parentSourceType: string,
    parentSourceId: string
  ): HtmlDependencyChildRow[] {
    return this.db.executeRead<HtmlDependencyChildRow>(
      `SELECT child_source_type, child_source_id FROM html_dependencies
       WHERE parent_source_type = ? AND parent_source_id = ?`,
      [parentSourceType, parentSourceId]
    );
  }

  /** Count of recorded child edges for a parent (type, id). */
  countChildren(parentSourceType: string, parentSourceId: string): number {
    const row = this.db.executeReadOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM html_dependencies WHERE parent_source_type = ? AND parent_source_id = ?`,
      [parentSourceType, parentSourceId]
    );
    return row?.count ?? 0;
  }
}
