/**
 * HtmlDependencyWriteCommand — session-aware writes to `html_dependencies`,
 * extracted from htmlDependencyHandlers (ADR-0007).
 *
 * Distinct from the simpler `RecordHtmlDependencyCommand` (page-download path,
 * `INSERT … ON CONFLICT DO NOTHING`, no session/hash columns). These writes
 * carry `download_session_id` (so a concurrent sync can't delete dependencies
 * an active download is using) and `recorded_content_hash` (for staleness
 * detection). SQL preserved verbatim.
 */

import type { Database } from '../../../l1-persistence/Database';

export class HtmlDependencyWriteCommand {
  constructor(private readonly db: Database) {}

  /**
   * Delete a parent's dependencies that are unowned or owned by this session
   * (leaves rows held by a different concurrent download untouched).
   */
  deleteForParentInSession(
    parentSourceType: string,
    parentSourceId: string,
    sessionId: string | undefined
  ): void {
    this.db.executeWrite(
      `DELETE FROM html_dependencies
         WHERE parent_source_type = ? AND parent_source_id = ?
         AND (download_session_id IS NULL OR download_session_id = ?)`,
      [parentSourceType, parentSourceId, sessionId ?? null],
      'html_dependencies'
    );
  }

  /**
   * Record (insert-or-replace) one parent→child edge with its owning session
   * and the content hash captured at record time.
   */
  replaceChild(
    parentSourceType: string,
    parentSourceId: string,
    childSourceType: 'file' | 'page',
    childSourceId: string,
    sessionId: string | undefined,
    contentHash: string | undefined
  ): void {
    this.db.executeWrite(
      `INSERT OR REPLACE INTO html_dependencies
         (parent_source_type, parent_source_id, child_source_type, child_source_id, is_cycle, download_session_id, recorded_content_hash)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
      [
        parentSourceType,
        parentSourceId,
        childSourceType,
        childSourceId,
        sessionId ?? null,
        contentHash ?? null,
      ],
      'html_dependencies'
    );
  }

  /** Delete ALL of a parent's dependencies (used when cached deps are stale). */
  deleteAllForParent(parentSourceType: string, parentSourceId: string): void {
    this.db.executeWrite(
      `DELETE FROM html_dependencies
         WHERE parent_source_type = ? AND parent_source_id = ?`,
      [parentSourceType, parentSourceId],
      'html_dependencies'
    );
  }
}
