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
}
