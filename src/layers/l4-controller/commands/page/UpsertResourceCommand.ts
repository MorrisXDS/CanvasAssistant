/**
 * UpsertResourceCommand — writes rows into the `resources` table for the
 * page-download flow.
 *
 * Extracted from pagesHandlers (ADR-0007). Two distinct upserts are
 * preserved verbatim because their ON CONFLICT update column sets differ:
 *   - `upsertPageDependency` — a file downloaded as a page's dependency
 *     (type 'file', context_type 'files'); on conflict refreshes
 *     local_path / size_bytes / synced_at only. (context_type was previously
 *     'page_dependency', which the resources.context_type CHECK rejects — so
 *     the row never landed and the dependency was re-downloaded each time. The
 *     CHECK only allows page/assignment/syllabus/module/announcement/files, and
 *     widening it needs a resources table rebuild that the migration engine
 *     can't currently do under FK-on; 'files' is the closest allowed value.
 *     Trade-off: these dependency files now appear in the Files page, which
 *     lists `type IN ('file','page')`.)
 *   - `upsertPage` — the saved page HTML itself (type 'page',
 *     mime 'text/html'); on conflict also refreshes title / folder_path.
 */

import type { Database } from '../../../l1-persistence/Database';

export interface UpsertPageDependencyInput {
  externalId: string;
  courseId: number;
  title: string;
  localPath: string;
  folderPath: string;
  sizeBytes: number;
  mimeType: string | null;
  contextId: string;
}

export interface UpsertPageResourceInput {
  externalId: string;
  courseId: number;
  title: string;
  localPath: string;
  folderPath: string;
  sizeBytes: number;
  contextId: string;
}

/**
 * Input for `upsertPageContent`. Distinct from `UpsertPageResourceInput` only
 * in `contextId`, which the HTML download path supplies as the page's numeric
 * id (`course_pages.id`) rather than a slug string.
 */
export interface UpsertPageContentInput {
  externalId: string;
  courseId: number;
  title: string;
  localPath: string;
  folderPath: string;
  sizeBytes: number;
  contextId: number | null;
}

export class UpsertResourceCommand {
  constructor(private readonly db: Database) {}

  /** Upsert a file downloaded as a page dependency. */
  upsertPageDependency(input: UpsertPageDependencyInput): void {
    this.db.executeWrite(
      `INSERT INTO resources (external_id, course_id, type, title, local_path, folder_path, size_bytes, mime_type, context_type, context_id, synced_at)
       VALUES (?, ?, 'file', ?, ?, ?, ?, ?, 'files', ?, CURRENT_TIMESTAMP)
       ON CONFLICT(external_id) DO UPDATE SET
         local_path = excluded.local_path,
         size_bytes = excluded.size_bytes,
         synced_at = CURRENT_TIMESTAMP`,
      [
        input.externalId,
        input.courseId,
        input.title,
        input.localPath,
        input.folderPath,
        input.sizeBytes,
        input.mimeType,
        input.contextId,
      ],
      'resources'
    );
  }

  /**
   * Upsert a generated page-HTML resource where, on conflict, ONLY
   * local_path / size_bytes / synced_at refresh (title + folder_path are
   * left as-is). Distinct from `upsertPage`, which also refreshes title +
   * folder_path. Used by `html:downloadDependencies` when registering a page
   * it generated mid-download. SQL preserved verbatim from that handler.
   */
  upsertPageContent(input: UpsertPageContentInput): void {
    this.db.executeWrite(
      `INSERT INTO resources (external_id, course_id, type, title, local_path, folder_path, size_bytes, mime_type, context_type, context_id, synced_at)
       VALUES (?, ?, 'page', ?, ?, ?, ?, 'text/html', 'page', ?, CURRENT_TIMESTAMP)
       ON CONFLICT(external_id) DO UPDATE SET
         local_path = excluded.local_path,
         size_bytes = excluded.size_bytes,
         synced_at = CURRENT_TIMESTAMP`,
      [
        input.externalId,
        input.courseId,
        input.title,
        input.localPath,
        input.folderPath,
        input.sizeBytes,
        input.contextId,
      ],
      'resources'
    );
  }

  /** Upsert the saved page HTML as a resource (for Files-page visibility). */
  upsertPage(input: UpsertPageResourceInput): void {
    this.db.executeWrite(
      `INSERT INTO resources (external_id, course_id, type, title, local_path, folder_path, size_bytes, mime_type, context_type, context_id, synced_at)
       VALUES (?, ?, 'page', ?, ?, ?, ?, 'text/html', 'page', ?, CURRENT_TIMESTAMP)
       ON CONFLICT(external_id) DO UPDATE SET
         title = excluded.title,
         local_path = excluded.local_path,
         folder_path = excluded.folder_path,
         size_bytes = excluded.size_bytes,
         synced_at = CURRENT_TIMESTAMP`,
      [
        input.externalId,
        input.courseId,
        input.title,
        input.localPath,
        input.folderPath,
        input.sizeBytes,
        input.contextId,
      ],
      'resources'
    );
  }
}
