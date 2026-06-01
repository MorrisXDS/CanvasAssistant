/**
 * RecordHtmlDependencyCommand — records a parent→child edge in the
 * `html_dependencies` table (idempotent).
 *
 * Extracted from pagesHandlers (ADR-0007). Used for both file dependencies
 * ('page' → 'file') and page-link dependencies ('page' → 'page'). The
 * INSERT … ON CONFLICT DO NOTHING is preserved verbatim.
 */

import type { Database } from '../../../l1-persistence/Database';

export class RecordHtmlDependencyCommand {
  constructor(private readonly db: Database) {}

  execute(
    parentSourceType: string,
    parentSourceId: string,
    childSourceType: string,
    childSourceId: string
  ): void {
    this.db.executeWrite(
      `INSERT INTO html_dependencies (parent_source_type, parent_source_id, child_source_type, child_source_id)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(parent_source_type, parent_source_id, child_source_type, child_source_id) DO NOTHING`,
      [parentSourceType, parentSourceId, childSourceType, childSourceId],
      'html_dependencies'
    );
  }
}
