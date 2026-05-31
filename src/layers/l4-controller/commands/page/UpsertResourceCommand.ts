/**
 * UpsertResourceCommand — writes rows into the `resources` table for the
 * page-download flow.
 *
 * Extracted from pagesHandlers (ADR-0007). Two distinct upserts are
 * preserved verbatim because their ON CONFLICT update column sets differ:
 *   - `upsertPageDependency` — a file downloaded as a page's dependency
 *     (type 'file', context_type 'page_dependency'); on conflict refreshes
 *     local_path / size_bytes / synced_at only.
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

export class UpsertResourceCommand {
  constructor(private readonly db: Database) {}

  /** Upsert a file downloaded as a page dependency. */
  upsertPageDependency(input: UpsertPageDependencyInput): void {
    this.db.executeWrite(
      `INSERT INTO resources (external_id, course_id, type, title, local_path, folder_path, size_bytes, mime_type, context_type, context_id, synced_at)
       VALUES (?, ?, 'file', ?, ?, ?, ?, ?, 'page_dependency', ?, CURRENT_TIMESTAMP)
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
