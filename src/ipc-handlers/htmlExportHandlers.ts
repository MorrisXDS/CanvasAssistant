/**
 * HTML Export IPC Handlers
 * Handlers for HTML export operations:
 * - pages:exportHtml, html:exportBatch
 */

import { ipcMain, dialog } from 'electron';
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
  const getMainWindow = ctx.getMainWindow;
  const getFilesDir = ctx.getFilesDir;

  // Export page as HTML file (with proper HTML wrapper)
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
      const mainWindow = getMainWindow();
      if (!mainWindow) {
        return { success: false, error: 'No window available' };
      }

      // Get course info for filename
      const course = database.executeRead<{ code: string }>(
        'SELECT code FROM courses WHERE id = ?',
        [options.courseId]
      )[0];

      const courseCode = course?.code || 'Unknown';
      const safeTitle = options.title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
      const defaultName = `${courseCode}_${safeTitle}.html`;

      // Wrap body in full HTML document
      const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${options.title} - ${courseCode}</title>
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
  <p class="meta">Course: ${courseCode} | Exported: ${new Date().toLocaleDateString()}</p>
  <hr>
  ${options.bodyHtml}
</body>
</html>`;

      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultName,
        filters: [
          { name: 'HTML Files', extensions: ['html', 'htm'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Save cancelled' };
      }

      try {
        fs.writeFileSync(result.filePath, fullHtml, 'utf-8');
        logger.info(`Page exported: ${result.filePath}`);
        return { success: true, data: { filePath: result.filePath } };
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
}
