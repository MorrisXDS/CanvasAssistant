/**
 * CoursePageReader — SQL read surface for the `course_pages` table as consumed
 * by the resource open/dependency-walk IPC handlers.
 *
 * Per ADR-0007, IPC handlers MUST route reads through this reader. Both lookups
 * resolve a page by EITHER its url_slug OR its external_id (the caller passes
 * the same token for both, matching the original `(url_slug = ? OR external_id
 * = ?)` predicate). Single-page point lookups bypass visibility (sub-decision
 * α). Projections are reader-local — distinct from the minimal `CoursePageRow`
 * in DatabaseRowTypes, which lacks `external_id` / `url_slug`.
 */

import type { Database } from '../Database';

/** Just the url_slug, used to construct a Canvas page URL. */
export interface CoursePageUrlSlugRow {
  url_slug: string | null;
}

/** Page identity + body, used while walking page dependencies. */
export interface CoursePageContentRow {
  id: number;
  external_id: string;
  title: string;
  body_html: string | null;
}

export class CoursePageReader {
  constructor(private readonly db: Database) {}

  /**
   * The page's url_slug by course + slug-or-external-id, or null. `courseId`
   * may be null/undefined (preserves the original handler binding, which used
   * an optional course id) — a null course id simply matches nothing.
   */
  getUrlSlug(
    courseId: number | null | undefined,
    slugOrExternalId: string
  ): CoursePageUrlSlugRow | null {
    return (
      this.db.executeReadOne<CoursePageUrlSlugRow>(
        `SELECT url_slug FROM course_pages WHERE course_id = ? AND (external_id = ? OR url_slug = ?)`,
        [courseId ?? null, slugOrExternalId, slugOrExternalId]
      ) ?? null
    );
  }

  /**
   * The page's identity + body_html by course + slug-or-external-id, or null.
   * `courseId` may be null/undefined (see `getUrlSlug`).
   */
  getContent(
    courseId: number | null | undefined,
    slugOrExternalId: string
  ): CoursePageContentRow | null {
    return (
      this.db.executeReadOne<CoursePageContentRow>(
        `SELECT id, external_id, title, body_html FROM course_pages
         WHERE course_id = ? AND (url_slug = ? OR external_id = ?)`,
        [courseId ?? null, slugOrExternalId, slugOrExternalId]
      ) ?? null
    );
  }
}
