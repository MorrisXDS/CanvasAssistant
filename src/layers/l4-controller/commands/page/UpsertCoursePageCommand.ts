/**
 * UpsertCoursePageCommand — persists a mapped Canvas page into the
 * `course_pages` table for offline access.
 *
 * Extracted from pagesHandlers (ADR-0007). Thin wrapper over
 * `Database.upsert` so the IPC handler holds no direct persistence calls.
 * The caller maps the Canvas payload (via `mapPage`) before passing it in.
 */

import type { Database } from '../../../l1-persistence/Database';

export class UpsertCoursePageCommand {
  constructor(private readonly db: Database) {}

  execute(page: Record<string, unknown>): void {
    this.db.upsert('course_pages', page);
  }
}
