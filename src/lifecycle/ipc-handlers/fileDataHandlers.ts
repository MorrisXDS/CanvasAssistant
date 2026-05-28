/**
 * File Data IPC Handlers
 * Handlers for file, module item, attachment, and Canvas URL data operations
 */

import { ipcMain } from 'electron';
import type { IpcContext } from './IpcContext';
import type { Database } from '../../layers/l1-persistence/Database';
import { AnnouncementAttachmentReader } from '../../layers/l1-persistence';

/** Maps html-{sourceType} to Canvas URL path segment */
const HTML_SOURCE_PATHS: Record<string, string> = {
  assignment: 'assignments',
  announcement: 'discussion_topics',
  quiz: 'quizzes',
  syllabus: 'assignments/syllabus', // syllabus ignores sourceId
};

/**
 * Build the correct Canvas URL for a resource based on its external_id format.
 * HTML content items (html-page-*, html-assignment-*, etc.) map to their
 * respective Canvas endpoints; regular file IDs map to /files/{id}.
 */
function buildCanvasResourceUrl(
  baseUrl: string,
  courseExternalId: string,
  resourceExternalId: string,
  courseId: number,
  database: Database
): string {
  const courseBase = `${baseUrl}/courses/${courseExternalId}`;
  const htmlMatch = resourceExternalId.match(/^html-(\w+)-(.+)$/);

  if (!htmlMatch) {
    return `${courseBase}/files/${resourceExternalId}?wrap=1`;
  }

  const [, sourceType, sourceId] = htmlMatch;

  // Pages need a slug lookup
  if (sourceType === 'page') {
    const page = database.executeReadOne<{ url_slug: string | null }>(
      `SELECT url_slug FROM course_pages WHERE course_id = ? AND (external_id = ? OR url_slug = ?)`,
      [courseId, sourceId, sourceId]
    );
    return `${courseBase}/pages/${page?.url_slug || sourceId}`;
  }

  // Syllabus is a fixed path
  if (sourceType === 'syllabus') {
    return `${courseBase}/assignments/syllabus`;
  }

  const pathSegment = HTML_SOURCE_PATHS[sourceType];
  if (pathSegment) {
    return `${courseBase}/${pathSegment}/${sourceId}`;
  }

  // Unknown html type — fall back to files
  return `${courseBase}/files/${resourceExternalId}?wrap=1`;
}

/**
 * Register file data handlers
 */
export function registerFileDataHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();
  const getVisibilityOracle = ctx.getVisibilityOracle;
  const getFileEntityProvider = ctx.getFileEntityProvider;
  const getCanvasClient = ctx.getCanvasClient;

  // ============ File Data Handlers ============

  // Get files for a specific course (for syllabus selection)
  ipcMain.handle('data:getCourseFiles', (_event, courseId: number) => {
    try {
      const resources = database.executeRead<{
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
        remote_updated_at: string | null;
      }>(
        `SELECT * FROM resources
         WHERE course_id = ? AND type IN ('file', 'page')
         ORDER BY folder_path, title`,
        [courseId]
      );

      logger.info(
        `getCourseFiles for course ${courseId}: found ${resources.length} resources`
      );

      const attachments = database.executeRead<{
        id: number;
        notification_id: number;
        course_id: number;
        external_id: string;
        display_name: string;
        filename: string;
        url: string;
        size_bytes: number | null;
        content_type: string | null;
        local_path: string | null;
        download_status: string;
        downloaded_at: string | null;
      }>(
        `SELECT na.* FROM notification_attachments na WHERE na.course_id = ? ORDER BY na.display_name`,
        [courseId]
      );

      const resourceFiles = resources.map((row) => ({
        id: row.id,
        externalId: row.external_id,
        courseId: row.course_id,
        parentFolderId: row.parent_folder_id,
        folderPath: row.folder_path,
        type: row.type,
        title: row.title,
        url: row.url,
        localPath: row.local_path,
        sizeBytes: row.size_bytes,
        mimeType: row.mime_type,
        syncedAt: row.synced_at,
        source: 'resource' as const,
      }));

      const attachmentFiles = attachments.map((row) => ({
        id: -row.id,
        externalId: row.external_id,
        courseId: row.course_id,
        parentFolderId: null,
        folderPath: 'Announcement Attachments',
        type: 'file',
        title: row.display_name,
        url: row.url,
        localPath: row.local_path,
        sizeBytes: row.size_bytes,
        mimeType: row.content_type,
        syncedAt: row.downloaded_at,
        source: 'attachment' as const,
      }));

      return [...resourceFiles, ...attachmentFiles];
    } catch (error) {
      logger.error(`Failed to get course files: ${error}`);
      throw error;
    }
  });

  // Get all files (resources + notification attachments)
  ipcMain.handle('data:getFiles', () => {
    try {
      const resources = database.executeRead<{
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
      }>(`
        SELECT r.*, c.code as course_code, c.name as course_name
        FROM resources r
        JOIN courses c ON r.course_id = c.id
        WHERE r.type IN ('file', 'page')
          AND c.archived_at IS NULL AND c.deleted_at IS NULL
        ORDER BY r.course_id, r.folder_path, r.title
      `);

      const attachments = database.executeRead<{
        id: number;
        notification_id: number;
        course_id: number;
        external_id: string;
        display_name: string;
        filename: string;
        url: string;
        size_bytes: number | null;
        content_type: string | null;
        local_path: string | null;
        download_status: string;
        downloaded_at: string | null;
        course_code: string;
        course_name: string;
        notification_title: string;
      }>(`
        SELECT na.*, c.code as course_code, c.name as course_name, n.title as notification_title
        FROM notification_attachments na
        JOIN courses c ON na.course_id = c.id
        JOIN notifications n ON na.notification_id = n.id
        WHERE c.archived_at IS NULL AND c.deleted_at IS NULL
        ORDER BY na.course_id, na.display_name
      `);

      const downloadedResources = resources.filter((r) => r.local_path !== null).length;
      const downloadedAttachments = attachments.filter(
        (a) => a.download_status === 'completed'
      ).length;
      logger.info(
        `Found ${resources.length} files (${downloadedResources} downloaded), ${attachments.length} attachments (${downloadedAttachments} downloaded)`
      );

      return {
        resources: resources.map((r) => ({
          id: r.id,
          externalId: r.external_id,
          courseId: r.course_id,
          parentFolderId: r.parent_folder_id,
          folderPath: r.folder_path,
          type: r.type,
          title: r.title,
          url: r.url,
          localPath: r.local_path,
          sizeBytes: r.size_bytes,
          mimeType: r.mime_type,
          syncedAt: r.synced_at,
          source: 'resource' as const,
        })),
        attachments: attachments.map((a) => ({
          id: a.id,
          notificationId: a.notification_id,
          courseId: a.course_id,
          externalId: a.external_id,
          displayName: a.display_name,
          filename: a.filename,
          url: a.url,
          sizeBytes: a.size_bytes,
          contentType: a.content_type,
          localPath: a.local_path,
          downloadStatus: a.download_status,
          downloadedAt: a.downloaded_at,
          courseCode: a.course_code,
          courseName: a.course_name,
          notificationTitle: a.notification_title,
          source: 'attachment' as const,
        })),
        pages: [],
      };
    } catch (error) {
      logger.error(`Failed to get files: ${error}`);
      throw error;
    }
  });

  // Get module items for visible courses
  ipcMain.handle('data:getModuleItems', () => {
    try {
      const visibleIds = getVisibilityOracle()?.getVisibleCourseIds() ?? [];
      if (visibleIds.length === 0) return [];

      const placeholders = visibleIds.map(() => '?').join(', ');
      const rows = database.executeRead<{
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
      }>(
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
        visibleIds
      );

      return rows.map((row) => ({
        id: row.id,
        externalId: row.external_id,
        title: row.title,
        itemType: row.item_type,
        contentId: row.content_id,
        url: row.url,
        externalUrl: row.external_url,
        pageUrl: row.page_url,
        position: row.position,
        indent: row.indent,
        moduleName: row.module_name,
        modulePosition: row.module_position,
        courseId: row.course_id,
        courseCode: row.course_code,
        courseName: row.course_name,
        sizeBytes: null,
        hasLocalContent: row.has_local_content === 1,
        source: 'module' as const,
      }));
    } catch (error) {
      logger.error(`Failed to get module items: ${error}`);
      throw error;
    }
  });

  // ============ Attachment Handlers ============

  // Get attachments for a notification.
  //
  // Per ADR-0007/ADR-0008 (PR-F.3): routes through AnnouncementAttachmentReader
  // composed inside FileEntityProvider. No raw SQL in the handler.
  ipcMain.handle('data:getAttachments', (_event, notificationId: number) => {
    try {
      // The provider doesn't expose getByNotificationId directly — that's a
      // reader concern, not a "unified entity" concern. We pull the reader
      // out via the provider's collaborator-injection. Simpler: ctx exposes
      // the provider; we instantiate a fresh reader on the database here.
      // (PR-F.2's slice-1 added the reader to the L1 barrel.)
      const reader = new AnnouncementAttachmentReader(database);
      const rows = reader.getByNotificationId(notificationId);

      return rows.map((row) => ({
        id: row.id,
        notificationId: row.notification_id,
        externalId: row.external_id,
        displayName: row.display_name,
        filename: row.filename,
        url: row.url,
        sizeBytes: row.size_bytes,
        contentType: row.content_type,
        localPath: row.local_path,
        downloadStatus: row.download_status,
        downloadedAt: row.downloaded_at,
      }));
    } catch (error) {
      logger.error(`Failed to get attachments: ${error}`);
      throw error;
    }
  });

  // ============ FileEntity Handlers (ADR-0008 PR-F.3) ============
  //
  // Forward-facing channels returning the unified FileEntity wire shape from
  // ADR-0008. The legacy data:getFiles / data:getCourseFiles channels still
  // return the older FilesData shape until consumer migration completes.

  // Single FileEntity by Canvas File ID. Single-id lookup bypasses
  // visibility (per ADR-0007 sub-decision alpha) — caller knew the id.
  ipcMain.handle('data:getFileEntity', (_event, canvasId: string) => {
    try {
      const provider = getFileEntityProvider();
      if (!provider) return null;
      return provider.findByCanvasId(canvasId);
    } catch (error) {
      logger.error(`Failed to get file entity for ${canvasId}: ${error}`);
      throw error;
    }
  });

  // All FileEntities in one course. No visibility filter — caller supplied
  // a specific course id (single-scope, not list-scope). Matches the
  // legacy data:getCourseFiles handler's no-visibility-filter behaviour.
  ipcMain.handle('data:getFileEntitiesByCourse', (_event, courseId: number) => {
    try {
      const provider = getFileEntityProvider();
      if (!provider) return [];
      return provider.findByCourseIds([courseId]);
    } catch (error) {
      logger.error(`Failed to get file entities for course ${courseId}: ${error}`);
      throw error;
    }
  });

  // All FileEntities across all visible courses. List-scope endpoint —
  // composes with VisibilityOracle.getVisibleCourseIds() per ADR-0007.
  ipcMain.handle('data:getFileEntitiesForVisibleCourses', () => {
    try {
      const provider = getFileEntityProvider();
      const oracle = getVisibilityOracle();
      if (!provider || !oracle) return [];
      const visibleIds = oracle.getVisibleCourseIds();
      if (visibleIds.length === 0) return [];
      return provider.findByCourseIds(visibleIds);
    } catch (error) {
      logger.error(`Failed to get file entities for visible courses: ${error}`);
      throw error;
    }
  });

  // Get file references for a notification (with attachment details if linked)
  ipcMain.handle('data:getFileReferences', (_event, notificationId: number) => {
    try {
      const rows = database.executeRead<{
        id: number;
        notification_id: number;
        attachment_id: number | null;
        start_position: number;
        end_position: number;
        matched_text: string;
        original_url: string | null;
        att_id: number | null;
        att_external_id: string | null;
        att_display_name: string | null;
        att_filename: string | null;
        att_url: string | null;
        att_size_bytes: number | null;
        att_content_type: string | null;
        att_local_path: string | null;
        att_download_status: string | null;
        att_downloaded_at: string | null;
      }>(
        `SELECT
          fr.id, fr.notification_id, fr.attachment_id, fr.start_position, fr.end_position,
          fr.matched_text, fr.original_url,
          a.id as att_id, a.external_id as att_external_id, a.display_name as att_display_name,
          a.filename as att_filename, a.url as att_url, a.size_bytes as att_size_bytes,
          a.content_type as att_content_type, a.local_path as att_local_path,
          a.download_status as att_download_status, a.downloaded_at as att_downloaded_at
        FROM announcement_file_references fr
        LEFT JOIN notification_attachments a ON fr.attachment_id = a.id
        WHERE fr.notification_id = ?
        ORDER BY fr.start_position`,
        [notificationId]
      );

      return rows.map((row) => ({
        id: row.id,
        notificationId: row.notification_id,
        attachmentId: row.attachment_id,
        startPosition: row.start_position,
        endPosition: row.end_position,
        matchedText: row.matched_text,
        originalUrl: row.original_url,
        attachment: row.att_id
          ? {
              id: row.att_id,
              notificationId: row.notification_id,
              externalId: row.att_external_id!,
              displayName: row.att_display_name!,
              filename: row.att_filename!,
              url: row.att_url!,
              sizeBytes: row.att_size_bytes,
              contentType: row.att_content_type,
              localPath: row.att_local_path,
              downloadStatus: row.att_download_status,
              downloadedAt: row.att_downloaded_at,
            }
          : undefined,
      }));
    } catch (error) {
      logger.error(`Failed to get file references: ${error}`);
      throw error;
    }
  });

  // ============ Canvas URL Handlers ============

  // Get Canvas URL for a resource (file or attachment)
  ipcMain.handle(
    'data:getResourceCanvasUrl',
    (_event, resourceId: number, source: 'resource' | 'attachment') => {
      try {
        const canvasClient = getCanvasClient();
        if (!canvasClient) {
          return { success: false, error: 'Canvas client not connected' };
        }

        const baseUrl = canvasClient.getBaseUrl();

        if (source === 'resource') {
          const result = database.executeRead<{
            external_id: string;
            course_id: number;
          }>('SELECT external_id, course_id FROM resources WHERE id = ?', [resourceId]);

          if (!result[0]) {
            return { success: false, error: 'Resource not found' };
          }

          const resource = result[0];
          const course = database.executeReadOne<{ external_id: string }>(
            'SELECT external_id FROM courses WHERE id = ?',
            [resource.course_id]
          );

          if (!course) {
            return { success: false, error: 'Course not found' };
          }

          // Construct correct Canvas URL based on external_id format
          const canvasUrl = buildCanvasResourceUrl(
            baseUrl,
            course.external_id,
            resource.external_id,
            resource.course_id,
            database
          );
          return { success: true, data: { canvasUrl } };
        } else if (source === 'attachment') {
          const result = database.executeRead<{
            external_id: string;
            course_id: number;
          }>('SELECT external_id, course_id FROM notification_attachments WHERE id = ?', [
            resourceId,
          ]);

          if (!result[0]) {
            return { success: false, error: 'Attachment not found' };
          }

          const attachment = result[0];
          const course = database.executeReadOne<{ external_id: string }>(
            'SELECT external_id FROM courses WHERE id = ?',
            [attachment.course_id]
          );

          if (!course) {
            return { success: false, error: 'Course not found' };
          }

          const canvasUrl = `${baseUrl}/courses/${course.external_id}/files/${attachment.external_id}?wrap=1`;
          return { success: true, data: { canvasUrl } };
        }

        return { success: false, error: 'Invalid source type' };
      } catch (error) {
        logger.error('Failed to get resource Canvas URL:', error as Error);
        return { success: false, error: 'Failed to get Canvas URL' };
      }
    }
  );

  // Get Canvas URL for a task (assignment)
  ipcMain.handle('data:getTaskCanvasUrl', (_event, taskId: number) => {
    try {
      const canvasClient = getCanvasClient();
      if (!canvasClient) {
        return { success: false, error: 'Canvas client not connected' };
      }

      const baseUrl = canvasClient.getBaseUrl();

      const result = database.executeRead<{
        external_id: string;
        course_id: number;
      }>('SELECT external_id, course_id FROM tasks WHERE id = ?', [taskId]);

      if (!result[0]) {
        return { success: false, error: 'Task not found' };
      }

      const task = result[0];
      const course = database.executeReadOne<{ external_id: string }>(
        'SELECT external_id FROM courses WHERE id = ?',
        [task.course_id]
      );

      if (!course) {
        return { success: false, error: 'Course not found' };
      }

      const canvasUrl = `${baseUrl}/courses/${course.external_id}/assignments/${task.external_id}`;
      return { success: true, data: { canvasUrl } };
    } catch (error) {
      logger.error('Failed to get task Canvas URL:', error as Error);
      return { success: false, error: 'Failed to get Canvas URL' };
    }
  });
}
