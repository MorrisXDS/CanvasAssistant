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

/** A recorded child dependency plus the content hash captured when it was recorded. */
export interface HtmlDependencyChildWithHashRow {
  child_source_type: string;
  child_source_id: string;
  recorded_content_hash: string | null;
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

  /**
   * Child edges for a parent including each edge's recorded content hash.
   * Used by `html:downloadDependencies` to detect stale cached dependencies.
   */
  getChildrenWithHash(
    parentSourceType: string,
    parentSourceId: string
  ): HtmlDependencyChildWithHashRow[] {
    return this.db.executeRead<HtmlDependencyChildWithHashRow>(
      `SELECT child_source_type, child_source_id, recorded_content_hash FROM html_dependencies
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
