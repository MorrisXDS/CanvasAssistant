/**
 * ResourceReader — SQL read surface for the `resources` table as consumed by
 * the resource download/open IPC handlers.
 *
 * Per ADR-0007, IPC handlers MUST route reads through this reader rather than
 * calling `database.execute*` directly. Narrow projections match the fields
 * each handler path actually consumes. Single-id / single-external-id lookups
 * intentionally bypass visibility (ADR-0007 sub-decision α — list endpoints
 * filter, point lookups don't).
 *
 * Stateless. Returns raw DB rows (snake_case); callers map to DTOs at their
 * boundary. The projections are reader-local (not the minimal `ResourceRow`
 * from DatabaseRowTypes) because each handler path needs a different column
 * subset — see the ModuleReader precedent for the same reasoning.
 */

import type { Database } from '../Database';

/** Fields needed to queue a Canvas-file download (download handlers). */
export interface ResourceDownloadRow {
  id: number;
  course_id: number;
  external_id: string;
  title: string;
  url: string | null;
  folder_path: string | null;
}

/** Fields needed to open a resource by external_id (module File items). */
export interface ResourceOpenByExternalIdRow {
  id: number;
  local_path: string | null;
  title: string;
}

/** Fields needed to open a resource by id (with HTML dependency checking). */
export interface ResourceOpenByIdRow {
  local_path: string | null;
  external_id: string;
  course_id: number;
  title: string;
  mime_type: string | null;
}

/** Fields needed to evaluate a file dependency during HTML dep-walking. */
export interface ResourceDependencyFileRow {
  id: number;
  local_path: string | null;
  title: string;
  size_bytes: number | null;
  url: string | null;
}

/** Fields needed to download an HTML dependency file (`html:downloadDependencies`). */
export interface ResourceHtmlDownloadRow {
  id: number;
  local_path: string | null;
  url: string | null;
  title: string;
  folder_path: string | null;
}

/** Download projection including `local_path` (`canvas-file:open`). */
export interface ResourceDownloadWithLocalPathRow {
  id: number;
  course_id: number;
  external_id: string;
  title: string;
  url: string | null;
  local_path: string | null;
  folder_path: string | null;
}

/** File/page resource row for the Files-page listings. */
export interface ResourceFileRow {
  id: number;
  external_id: string;
  course_id: number;
  parent_folder_id: number | null;
  folder_path: string | null;
  type: string;
  title: string;
  url: string | null;
  local_path: string | null;
  size_bytes: number | null;
  mime_type: string | null;
  synced_at: string | null;
}

const RESOURCE_FILE_COLUMNS =
  'id, external_id, course_id, parent_folder_id, folder_path, type, title, url, local_path, size_bytes, mime_type, synced_at';

export class ResourceReader {
  constructor(private readonly db: Database) {}

  /**
   * File + page resources for one course, folder then title (`data:getCourseFiles`).
   */
  getFilesAndPagesByCourse(courseId: number): ResourceFileRow[] {
    return this.db.executeRead<ResourceFileRow>(
      `SELECT ${RESOURCE_FILE_COLUMNS} FROM resources
       WHERE course_id = ? AND type IN ('file', 'page')
       ORDER BY folder_path, title`,
      [courseId]
    );
  }

  /**
   * File + page resources across all non-archived, non-deleted courses
   * (`data:getFiles`). The course JOIN is only the archived/deleted gate; the
   * caller maps resource fields only.
   */
  getVisibleFilesAndPages(): ResourceFileRow[] {
    return this.db.executeRead<ResourceFileRow>(
      `SELECT ${RESOURCE_FILE_COLUMNS.split(', ')
        .map((c) => `r.${c}`)
        .join(', ')}
       FROM resources r
       JOIN courses c ON r.course_id = c.id
       WHERE r.type IN ('file', 'page')
         AND c.archived_at IS NULL AND c.deleted_at IS NULL
       ORDER BY r.course_id, r.folder_path, r.title`
    );
  }

  /** external_id + course_id for a resource by primary key, or null. */
  getExternalIdCourseById(id: number): { external_id: string; course_id: number } | null {
    return (
      this.db.executeReadOne<{ external_id: string; course_id: number }>(
        `SELECT external_id, course_id FROM resources WHERE id = ?`,
        [id]
      ) ?? null
    );
  }

  /**
   * Download-relevant fields for a resource by primary key, or null.
   * (Original handler did `SELECT *` but only read these six columns.)
   */
  getDownloadInfoById(id: number): ResourceDownloadRow | null {
    return (
      this.db.executeReadOne<ResourceDownloadRow>(
        `SELECT id, course_id, external_id, title, url, folder_path FROM resources WHERE id = ?`,
        [id]
      ) ?? null
    );
  }

  /** Download-relevant fields for a resource by external_id, or null. */
  getDownloadInfoByExternalId(externalId: string): ResourceDownloadRow | null {
    return (
      this.db.executeReadOne<ResourceDownloadRow>(
        `SELECT id, course_id, external_id, title, url, folder_path FROM resources WHERE external_id = ?`,
        [externalId]
      ) ?? null
    );
  }

  /** Open-relevant fields for a resource by external_id, or null. */
  getOpenInfoByExternalId(externalId: string): ResourceOpenByExternalIdRow | null {
    return (
      this.db.executeReadOne<ResourceOpenByExternalIdRow>(
        `SELECT id, local_path, title FROM resources WHERE external_id = ?`,
        [externalId]
      ) ?? null
    );
  }

  /** Open-relevant fields for a resource by primary key, or null. */
  getOpenInfoById(id: number): ResourceOpenByIdRow | null {
    return (
      this.db.executeReadOne<ResourceOpenByIdRow>(
        `SELECT local_path, external_id, course_id, title, mime_type FROM resources WHERE id = ?`,
        [id]
      ) ?? null
    );
  }

  /**
   * File-dependency fields for a resource by external_id, or null. Used while
   * walking an HTML file's recorded/parsed dependencies. Includes `url` (used
   * by the recorded-deps path); the parsed-HTML path simply ignores it.
   */
  getDependencyFileByExternalId(externalId: string): ResourceDependencyFileRow | null {
    return (
      this.db.executeReadOne<ResourceDependencyFileRow>(
        `SELECT id, local_path, title, size_bytes, url FROM resources WHERE external_id = ?`,
        [externalId]
      ) ?? null
    );
  }

  /** Just the local_path for a resource by external_id, or null. */
  getLocalPathByExternalId(externalId: string): { local_path: string | null } | null {
    return (
      this.db.executeReadOne<{ local_path: string | null }>(
        `SELECT local_path FROM resources WHERE external_id = ?`,
        [externalId]
      ) ?? null
    );
  }

  /**
   * Download fields for an HTML dependency file by external_id, or null. Used
   * by `html:downloadDependencies` (which needs `local_path` to skip already-
   * downloaded files and `folder_path` for the download's context folder).
   */
  getHtmlDownloadInfoByExternalId(externalId: string): ResourceHtmlDownloadRow | null {
    return (
      this.db.executeReadOne<ResourceHtmlDownloadRow>(
        `SELECT id, local_path, url, title, folder_path FROM resources WHERE external_id = ?`,
        [externalId]
      ) ?? null
    );
  }

  /** Just the local_path for a resource by primary key, or null. */
  getLocalPathById(id: number): { local_path: string | null } | null {
    return (
      this.db.executeReadOne<{ local_path: string | null }>(
        `SELECT local_path FROM resources WHERE id = ?`,
        [id]
      ) ?? null
    );
  }

  /** local_path + external_id for a resource by primary key, or null. */
  getLocalPathExternalById(
    id: number
  ): { local_path: string | null; external_id: string } | null {
    return (
      this.db.executeReadOne<{ local_path: string | null; external_id: string }>(
        `SELECT local_path, external_id FROM resources WHERE id = ?`,
        [id]
      ) ?? null
    );
  }

  /**
   * Full download projection (including `local_path`) for a resource by
   * external_id, or null. Used by `canvas-file:open`, which both opens an
   * existing local file and falls back to downloading it.
   */
  getDownloadInfoWithLocalPathByExternalId(
    externalId: string
  ): ResourceDownloadWithLocalPathRow | null {
    return (
      this.db.executeReadOne<ResourceDownloadWithLocalPathRow>(
        `SELECT id, course_id, external_id, title, url, local_path, folder_path FROM resources WHERE external_id = ?`,
        [externalId]
      ) ?? null
    );
  }

  /**
   * Syllabus-display fields for a resource by primary key, or null. Used by
   * `data:getCourseSyllabus` to render a designated syllabus file.
   */
  getSyllabusInfoById(id: number): {
    id: number;
    title: string;
    url: string | null;
    local_path: string | null;
    synced_at: string | null;
  } | null {
    return (
      this.db.executeReadOne<{
        id: number;
        title: string;
        url: string | null;
        local_path: string | null;
        synced_at: string | null;
      }>(`SELECT id, title, url, local_path, synced_at FROM resources WHERE id = ?`, [
        id,
      ]) ?? null
    );
  }

  /**
   * A folder resource (`type = 'folder'`) by course + folder_path, or null.
   * Used by `sync:folderByPath` to resolve a folder's Canvas id.
   */
  getFolderByCoursePath(
    courseId: number,
    folderPath: string
  ): { external_id: string; course_id: number } | null {
    return (
      this.db.executeReadOne<{ external_id: string; course_id: number }>(
        `SELECT external_id, course_id FROM resources
         WHERE course_id = ? AND folder_path = ? AND type = 'folder'`,
        [courseId, folderPath]
      ) ?? null
    );
  }
}
