/**
 * HTML Export IPC Handlers
 * Handlers for HTML export operations:
 * - pages:exportHtml, html:exportBatch
 */

import { ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { IpcContext } from './IpcContext';

/**
 * Register all HTML export related IPC handlers
 */
export function registerHtmlExportHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();
  const getFilesDir = ctx.getFilesDir;

  // Export page as HTML file (auto-saves to Files directory, registers in html_exports)
  ipcMain.handle(
    'pages:exportHtml',
    async (
      _event,
      options: {
        courseId: number;
        pageId: number; // -1 for syllabus
        title: string;
        bodyHtml: string;
      }
    ) => {
      const FILES_DIR = getFilesDir();

      // Get course info
      const course = database.executeRead<{ code: string }>(
        'SELECT code FROM courses WHERE id = ?',
        [options.courseId]
      )[0];

      if (!course) {
        return { success: false, error: 'Course not found' };
      }

      const courseCode = course.code.replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeTitle = options.title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);

      // Determine source type and source ID
      const sourceType = options.pageId === -1 ? 'syllabus' : 'page';
      const sourceId = options.pageId === -1 ? 'syllabus' : String(options.pageId);

      // Check if there's an existing export in html_exports
      const existingExport = database.executeRead<{ local_path: string }>(
        'SELECT local_path FROM html_exports WHERE course_id = ? AND source_type = ? AND source_id = ?',
        [options.courseId, sourceType, sourceId]
      )[0];

      let localPath: string;

      if (existingExport?.local_path) {
        // Use existing path
        localPath = existingExport.local_path;
        // Ensure parent directory exists (in case it was deleted)
        const parentDir = path.dirname(localPath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }
      } else {
        // Create new path: FILES_DIR/{courseCode}/{SourceType}/{Title}.html
        const sourceTypeCapitalized = sourceType.charAt(0).toUpperCase() + sourceType.slice(1);
        const contextDir = path.join(FILES_DIR, courseCode, sourceTypeCapitalized);
        if (!fs.existsSync(contextDir)) {
          fs.mkdirSync(contextDir, { recursive: true });
        }
        localPath = path.join(contextDir, `${safeTitle}.html`);
      }

      // Generate styled HTML document
      const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${options.title} - ${course.code}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem;
      line-height: 1.6;
      color: #333;
    }
    h1 { border-bottom: 2px solid #2563eb; padding-bottom: 0.5rem; }
    h1, h2, h3 { color: #1e40af; }
    a { color: #2563eb; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #ddd; padding: 0.5rem; text-align: left; }
    th { background: #f3f4f6; }
    pre, code { background: #f3f4f6; padding: 0.25rem 0.5rem; border-radius: 4px; }
    pre { padding: 1rem; overflow-x: auto; }
    img { max-width: 100%; height: auto; }
    .meta { color: #666; font-size: 0.9rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <h1>${options.title}</h1>
  <p class="meta">Course: ${course.code} | Type: ${sourceType} | Exported: ${new Date().toLocaleDateString()}</p>
  <hr>
  ${options.bodyHtml}
</body>
</html>`;

      try {
        // Write the file
        fs.writeFileSync(localPath, fullHtml, 'utf-8');

        // Compute content hash for change detection
        const contentHash = crypto
          .createHash('md5')
          .update(options.bodyHtml)
          .digest('hex');

        // Register/update in html_exports table
        database.executeWrite(
          `INSERT INTO html_exports (course_id, source_type, source_id, title, content_hash, local_path, exported_at)
           VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(course_id, source_type, source_id) DO UPDATE SET
             title = excluded.title,
             content_hash = excluded.content_hash,
             local_path = excluded.local_path,
             exported_at = CURRENT_TIMESTAMP`,
          [options.courseId, sourceType, sourceId, options.title, contentHash, localPath],
          'html_exports'
        );

        logger.info(`Page exported to Files: ${localPath}`);
        return { success: true, data: { filePath: localPath } };
      } catch (error) {
        logger.error(`Failed to export page: ${error}`);
        return { success: false, error: String(error) };
      }
    }
  );

  // Batch export HTML content (saves to app files directory)
  ipcMain.handle(
    'html:exportBatch',
    async (
      _event,
      params: {
        courseId: number;
        items: Array<{
          sourceType: 'page' | 'assignment' | 'syllabus' | 'module' | 'announcement';
          sourceId: string;
          title: string;
          bodyHtml: string;
        }>;
      }
    ) => {
      const FILES_DIR = getFilesDir();

      // Get course info
      const course = database.executeRead<{ code: string; external_id: string }>(
        'SELECT code, external_id FROM courses WHERE id = ?',
        [params.courseId]
      )[0];

      if (!course) {
        return { success: false, error: 'Course not found' };
      }

      const courseCode = course.code.replace(/[^a-zA-Z0-9_-]/g, '_');
      const results: Array<{
        sourceType: string;
        sourceId: string;
        success: boolean;
        localPath?: string;
        error?: string;
      }> = [];

      for (const item of params.items) {
        try {
          // Create directory structure: files/{courseCode}/{sourceType}/
          const contextDir = path.join(
            FILES_DIR,
            courseCode,
            item.sourceType.charAt(0).toUpperCase() + item.sourceType.slice(1)
          );
          if (!fs.existsSync(contextDir)) {
            fs.mkdirSync(contextDir, { recursive: true });
          }

          // Generate safe filename
          const safeTitle = item.title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
          const filename = `${safeTitle}.html`;
          const localPath = path.join(contextDir, filename);

          // Generate styled HTML
          const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${item.title} - ${course.code}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem;
      line-height: 1.6;
      color: #333;
    }
    h1 { border-bottom: 2px solid #2563eb; padding-bottom: 0.5rem; }
    h1, h2, h3 { color: #1e40af; }
    a { color: #2563eb; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #ddd; padding: 0.5rem; text-align: left; }
    th { background: #f3f4f6; }
    pre, code { background: #f3f4f6; padding: 0.25rem 0.5rem; border-radius: 4px; }
    pre { padding: 1rem; overflow-x: auto; }
    img { max-width: 100%; height: auto; }
    .meta { color: #666; font-size: 0.9rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <h1>${item.title}</h1>
  <p class="meta">Course: ${course.code} | Type: ${item.sourceType} | Exported: ${new Date().toLocaleDateString()}</p>
  <hr>
  ${item.bodyHtml}
</body>
</html>`;

          fs.writeFileSync(localPath, fullHtml, 'utf-8');

          // Compute content hash for change detection
          const contentHash = crypto
            .createHash('md5')
            .update(item.bodyHtml)
            .digest('hex');

          // Update html_exports table
          database.executeWrite(
            `INSERT INTO html_exports (course_id, source_type, source_id, title, content_hash, local_path, exported_at)
             VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(course_id, source_type, source_id) DO UPDATE SET
               title = excluded.title,
               content_hash = excluded.content_hash,
               local_path = excluded.local_path,
               exported_at = CURRENT_TIMESTAMP`,
            [
              params.courseId,
              item.sourceType,
              item.sourceId,
              item.title,
              contentHash,
              localPath,
            ],
            'html_exports'
          );

          results.push({
            sourceType: item.sourceType,
            sourceId: item.sourceId,
            success: true,
            localPath,
          });

          logger.debug(`HTML exported: ${localPath}`);
        } catch (error) {
          results.push({
            sourceType: item.sourceType,
            sourceId: item.sourceId,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
          logger.error(
            `Failed to export HTML ${item.sourceType}/${item.sourceId}: ${error}`
          );
        }
      }

      const successCount = results.filter((r) => r.success).length;
      logger.info(
        `Batch HTML export: ${successCount}/${params.items.length} items exported for course ${course.code}`
      );

      return {
        success: results.every((r) => r.success),
        data: {
          exported: successCount,
          total: params.items.length,
          results,
        },
      };
    }
  );

  // Get exported pages for a course (to show download status in UI)
  ipcMain.handle(
    'html:getExports',
    async (
      _event,
      courseId: number
    ): Promise<Array<{ sourceType: string; sourceId: string; localPath: string }>> => {
      const exports = database.executeRead<{
        source_type: string;
        source_id: string;
        local_path: string;
      }>(
        'SELECT source_type, source_id, local_path FROM html_exports WHERE course_id = ? AND local_path IS NOT NULL',
        [courseId]
      );

      return exports.map((e) => ({
        sourceType: e.source_type,
        sourceId: e.source_id,
        localPath: e.local_path,
      }));
    }
  );
}
