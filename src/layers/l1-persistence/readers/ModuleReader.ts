/**
 * ModuleReader — SQL read surface for the `modules` and `module_items`
 * tables (read-only from the app's perspective; populated by sync).
 *
 * Per ADR-0007, IPC handlers MUST route reads through this reader rather
 * than calling `database.execute*` directly. Narrow projections match the
 * fields the page/module handlers actually consume. Single-id lookups
 * intentionally bypass visibility (ADR-0007 sub-decision α).
 *
 * NOTE: the projection here is intentionally NOT the shared `ModuleItemRow`
 * from DatabaseRowTypes — that type is the JOIN-shaped row (with course /
 * module name columns) and does not carry `module_id` / `page_url`, which
 * these handlers need. This local row is the raw `module_items` projection.
 */

import type { Database } from '../Database';

/** Raw `module_items` projection used by the page handlers. */
export interface ModuleItemReaderRow {
  id: number;
  module_id: number;
  title: string;
  item_type: string;
  page_url: string | null;
  url: string | null;
}

export interface ModuleInfoRow {
  course_id: number;
  name: string;
}

/** Module item joined with module + course context for the Files-page list. */
export interface ModuleItemListRow {
  id: number;
  external_id: string;
  title: string;
  item_type: string;
  content_id: string | null;
  url: string | null;
  external_url: string | null;
  page_url: string | null;
  position: number;
  indent: number;
  module_name: string;
  module_position: number;
  course_id: number;
  course_code: string;
  course_name: string;
  has_local_content: number;
}

const MODULE_ITEM_COLUMNS = 'id, module_id, title, item_type, page_url, url';

export class ModuleReader {
  constructor(private readonly db: Database) {}

  /** A single module item by id, or null. */
  getModuleItemById(id: number): ModuleItemReaderRow | null {
    return (
      this.db.executeReadOne<ModuleItemReaderRow>(
        `SELECT ${MODULE_ITEM_COLUMNS} FROM module_items WHERE id = ?`,
        [id]
      ) ?? null
    );
  }

  /** A single module's course id + name by module id, or null. */
  getModuleById(id: number): ModuleInfoRow | null {
    return (
      this.db.executeReadOne<ModuleInfoRow>(
        'SELECT course_id, name FROM modules WHERE id = ?',
        [id]
      ) ?? null
    );
  }

  /**
   * Module items across the given (non-empty) course ids, joined to module +
   * course context, with a `has_local_content` flag derived per item type
   * (Page → course_pages body present; File → resource downloaded). Ordered by
   * course, module position, item position; excludes SubHeaders.
   * Backs `data:getModuleItems`.
   */
  getItemsForCourses(courseIds: readonly number[]): ModuleItemListRow[] {
    if (courseIds.length === 0) return [];
    const placeholders = courseIds.map(() => '?').join(', ');
    return this.db.executeRead<ModuleItemListRow>(
      `SELECT
          mi.id, mi.external_id, mi.title, mi.item_type,
          mi.content_id, mi.url, mi.external_url, mi.page_url,
          mi.position, mi.indent,
          m.name as module_name, m.position as module_position,
          c.id as course_id, c.code as course_code, c.name as course_name,
          CASE
            WHEN mi.item_type = 'Page' THEN (
              SELECT CASE WHEN cp.body_html IS NOT NULL THEN 1 ELSE 0 END
              FROM course_pages cp
              WHERE (cp.url_slug = mi.page_url OR cp.title = mi.title) AND cp.course_id = c.id
              LIMIT 1
            )
            WHEN mi.item_type = 'File' THEN (
              SELECT CASE WHEN r.local_path IS NOT NULL THEN 1 ELSE 0 END
              FROM resources r
              WHERE r.external_id = mi.content_id
              LIMIT 1
            )
            ELSE 0
          END as has_local_content
        FROM module_items mi
        JOIN modules m ON mi.module_id = m.id
        JOIN courses c ON m.course_id = c.id
        WHERE c.id IN (${placeholders})
          AND mi.item_type != 'SubHeader'
        ORDER BY c.id, m.position, mi.position`,
      [...courseIds]
    );
  }
}
