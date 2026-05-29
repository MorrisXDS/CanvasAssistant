/**
 * LinkSuggestionReader — the only SQL read surface for the
 * `link_suggestions` table.
 *
 * Per ADR-0007, IPC handlers MUST route reads through this reader. Writes
 * (accept / reject / manual-link / unlink) go through the L4 link commands.
 *
 * Stateless. `getByStatusWithTasks` returns a join projection (suggestion
 * + task titles + course name); the single-id getter returns the raw row.
 */

import type { Database } from '../Database';
import type { LinkSuggestionRow, LinkSuggestionWithTasksRow } from '../DatabaseRowTypes';

export class LinkSuggestionReader {
  constructor(private readonly db: Database) {}

  /**
   * Suggestions in the given status, joined with the user/Canvas task
   * titles and owning course. Ordered by confidence DESC, then newest
   * first. Defaults to `pending`.
   */
  getByStatusWithTasks(status = 'pending'): LinkSuggestionWithTasksRow[] {
    return this.db.executeRead<LinkSuggestionWithTasksRow>(
      `SELECT
        ls.id,
        ls.user_task_id,
        ls.canvas_task_id,
        ls.confidence,
        ls.status,
        ls.created_at,
        ut.title as user_task_title,
        ut.course_id,
        ct.title as canvas_task_title,
        c.name as course_name
      FROM link_suggestions ls
      JOIN tasks ut ON ls.user_task_id = ut.id
      JOIN tasks ct ON ls.canvas_task_id = ct.id
      JOIN courses c ON ut.course_id = c.id
      WHERE ls.status = ?
      ORDER BY ls.confidence DESC, ls.created_at DESC`,
      [status]
    );
  }

  /**
   * Count of suggestions in the given status (for badges). Defaults to
   * `pending`.
   */
  countByStatus(status = 'pending'): number {
    const result = this.db.executeReadOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM link_suggestions WHERE status = ?`,
      [status]
    );
    return result?.count ?? 0;
  }

  /**
   * One suggestion by primary key, or null.
   */
  getById(id: number): LinkSuggestionRow | null {
    return (
      this.db.executeReadOne<LinkSuggestionRow>(
        `SELECT * FROM link_suggestions WHERE id = ?`,
        [id]
      ) ?? null
    );
  }
}
