/**
 * CanvasTaskQueueReader — the only SQL surface for `canvas_task_queue`
 * (per ADR-0007 / ADR-0008 PR-D).
 *
 * Stateless. Returns raw DB rows (snake_case). Visibility filtering is
 * the caller's job — list endpoints compose with
 * `VisibilityOracle.getVisibleCourseIds()` at the IPC layer.
 *
 * Status semantics:
 *   - omit `opts.status` → all rows regardless of QueuedTaskStatus
 *   - pass `'pending' | 'accepted' | 'rejected' | 'merged'` → filter
 *
 * The queue is a separate physical table from `tasks` (see CONTEXT.md
 * "Tasks & the accept queue" — they have different schemas, different
 * lifecycles, different identity).
 */

import type { Database } from '../Database';
import type { CanvasTaskQueueRow } from '../DatabaseRowTypes';
import type { QueuedTaskStatus } from '../../../shared/ipc-contract';

export class CanvasTaskQueueReader {
  constructor(private readonly db: Database) {}

  /**
   * Queue entries in the given courses. Empty input → empty output.
   * Ordered by first_seen_at DESC (the standard "newest first" feed
   * ordering); the legacy handler used `ORDER BY first_seen_at DESC`
   * implicitly via its own queries.
   */
  getByCourseIds(
    courseIds: readonly number[],
    opts: { status?: QueuedTaskStatus } = {}
  ): CanvasTaskQueueRow[] {
    if (courseIds.length === 0) return [];
    const placeholders = courseIds.map(() => '?').join(', ');
    const statusClause = opts.status ? 'AND status = ?' : '';
    const params: Array<number | string> = [...courseIds];
    if (opts.status) params.push(opts.status);
    return this.db.executeRead<CanvasTaskQueueRow>(
      `SELECT * FROM canvas_task_queue
       WHERE course_id IN (${placeholders}) ${statusClause}
       ORDER BY first_seen_at DESC`,
      params
    );
  }

  /**
   * Count queue entries in the given courses. Empty input → 0.
   * Same status semantics as `getByCourseIds`.
   */
  countByCourseIds(
    courseIds: readonly number[],
    opts: { status?: QueuedTaskStatus } = {}
  ): number {
    if (courseIds.length === 0) return 0;
    const placeholders = courseIds.map(() => '?').join(', ');
    const statusClause = opts.status ? 'AND status = ?' : '';
    const params: Array<number | string> = [...courseIds];
    if (opts.status) params.push(opts.status);
    const row = this.db.executeReadOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM canvas_task_queue
       WHERE course_id IN (${placeholders}) ${statusClause}`,
      params
    );
    return row?.count ?? 0;
  }
}
