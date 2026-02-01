/**
 * Pages IPC Handlers
 * Handlers for page content operations:
 * - pages:downloadContent, pages:openFile
 */

import { ipcMain, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import {
  mapPage,
  type CanvasPage,
} from '../layers/l2-daemon';
import { extractCanvasFileReferences } from '../layers/l2-daemon/HtmlFileExtractor';
import type { IpcContext } from './IpcContext';

/**
 * Register all pages related IPC handlers
 */
export function registerPagesHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();
  const credentialManager = ctx.getCredentialManager();
  const fileDownloadManager = ctx.getFileDownloadManager();
  const getCanvasClient = ctx.getCanvasClient;
  const getLocalHtmlPathsSettings = ctx.getLocalHtmlPathsSettings;
  const getFilesDir = ctx.getFilesDir;

  // Download page content on demand (for module items of type Page)
  // Fetches the page HTML from Canvas and saves it as an HTML file to the course folder
  ipcMain.handle(
    'pages:downloadContent',
    async (_event, moduleItemId: number): Promise<{ success: boolean; localPath?: string; error?: string }> => {
      try {
        const canvasClient = getCanvasClient();
        if (!canvasClient) {
          return { success: false, error: 'Canvas client not connected' };
        }

        // Get module item to find page_url and course info
        const moduleItem = database.executeReadOne<{
          id: number;
          module_id: number;
          title: string;
          item_type: string;
          page_url: string | null;
          url: string | null;
        }>('SELECT id, module_id, title, item_type, page_url, url FROM module_items WHERE id = ?', [
          moduleItemId,
        ]);

        if (!moduleItem) {
          return { success: false, error: 'Module item not found' };
        }

        if (moduleItem.item_type !== 'Page') {
          return { success: false, error: 'Module item is not a Page type' };
        }

        // Get course info through module -> course chain
        const moduleInfo = database.executeReadOne<{
          course_id: number;
          name: string;
        }>('SELECT course_id, name FROM modules WHERE id = ?', [moduleItem.module_id]);

        if (!moduleInfo) {
          return { success: false, error: 'Module not found' };
        }

        const course = database.executeReadOne<{
          id: number;
          external_id: string;
          code: string;
        }>('SELECT id, external_id, code FROM courses WHERE id = ?', [moduleInfo.course_id]);

        if (!course) {
          return { success: false, error: 'Course not found' };
        }

        // Determine page slug - prefer page_url, fall back to extracting from url or title
        let pageSlug = moduleItem.page_url;

        if (!pageSlug && moduleItem.url) {
          // Try to extract slug from html_url like /courses/123/pages/my-page
          const urlMatch = moduleItem.url.match(/\/pages\/([^/?#]+)/);
          if (urlMatch) {
            pageSlug = urlMatch[1];
          }
        }

        if (!pageSlug) {
          // Fall back to converting title to slug format
          pageSlug = moduleItem.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        }

        logger.info(
          `[pages:downloadContent] Fetching page "${pageSlug}" for course ${course.external_id}`
        );

        // Fetch page content from Canvas API
        const canvasCourseId = parseInt(course.external_id, 10);
        const endpoint = `/courses/${canvasCourseId}/pages/${encodeURIComponent(pageSlug)}`;

        const response = await canvasClient.get<CanvasPage>(endpoint);

        if (!response.data) {
          return { success: false, error: 'Page not found on Canvas' };
        }

        // Store in course_pages for offline access
        const localPage = mapPage(response.data, course.id, 'module_item');
        database.upsert('course_pages', localPage);

        const FILES_DIR = getFilesDir();

        // Create HTML file and save to course folder
        const safeTitle = moduleItem.title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
        const filename = `${safeTitle}.html`;

        // Sanitize course code for filesystem (same as FileDownloadManager)
        const sanitizedCourseCode = course.code
          .replace(/[^a-zA-Z0-9_\-. ]/g, '_')
          .replace(/\s+/g, '_');

        // Sanitize module name for folder (use module name as subfolder)
        const sanitizedModuleName = moduleInfo.name
          .replace(/[^a-zA-Z0-9_\-. ]/g, '_')
          .replace(/\s+/g, '_');

        // Create course/module folder structure
        const courseFolder = path.join(FILES_DIR, sanitizedCourseCode);
        const moduleFolder = path.join(courseFolder, sanitizedModuleName);
        if (!fs.existsSync(moduleFolder)) {
          fs.mkdirSync(moduleFolder, { recursive: true });
        }

        const localPath = path.join(moduleFolder, filename);
        const filesFolder = path.join(moduleFolder, `${safeTitle}_files`);
        // folder_path is relative to course folder (for database storage)
        const folderPath = sanitizedModuleName;

        // Extract and download dependencies from the HTML body
        const bodyHtml = response.data.body || '';
        const fileRefs = extractCanvasFileReferences(bodyHtml);

        // Map of Canvas file URLs to local paths for rewriting
        const urlRewrites = new Map<string, string>();

        if (fileRefs.length > 0) {
          logger.info(`[pages:downloadContent] Found ${fileRefs.length} file dependencies`);

          // Create files folder for dependencies
          if (!fs.existsSync(filesFolder)) {
            fs.mkdirSync(filesFolder, { recursive: true });
          }

          // Get auth token for downloads
          const token = await credentialManager.retrieve();

          if (token) {
            for (const ref of fileRefs) {
              try {
                // Get file info from Canvas
                const fileEndpoint = `/files/${ref.canvasFileId}`;
                const fileResponse = await canvasClient.get<{
                  id: number;
                  display_name: string;
                  url: string;
                  'content-type': string;
                }>(fileEndpoint);

                if (fileResponse.data?.url && fileResponse.data?.display_name) {
                  const safeFileName = fileResponse.data.display_name
                    .replace(/[<>:"/\\|?*]/g, '_');
                  const _localFilePath = path.join(filesFolder, safeFileName);

                  // Download the file
                  await new Promise<void>((resolve, _reject) => {
                    const downloadId = `page-dep-${ref.canvasFileId}-${Date.now()}`;

                    const onComplete = (result: { id: string; success: boolean; localPath?: string; error?: string }) => {
                      if (result.id !== downloadId) return;
                      fileDownloadManager.off('download-complete', onComplete);
                      fileDownloadManager.off('download-error', onComplete);

                      if (result.success && result.localPath) {
                        // Map the original URL pattern to local path
                        urlRewrites.set(ref.matchedUrl, `${safeTitle}_files/${safeFileName}`);
                        logger.info(`[pages:downloadContent] Downloaded dependency: ${safeFileName}`);
                        resolve();
                      } else {
                        logger.warn(`[pages:downloadContent] Failed to download ${ref.canvasFileId}: ${result.error}`);
                        resolve(); // Continue even if one file fails
                      }
                    };

                    fileDownloadManager.on('download-complete', onComplete);
                    fileDownloadManager.on('download-error', onComplete);

                    fileDownloadManager.queueDownload({
                      id: downloadId,
                      url: fileResponse.data.url,
                      courseCode: sanitizedCourseCode,
                      filename: safeFileName,
                      authToken: token,
                      parentHtml: path.join(sanitizedCourseCode, filename),
                    });
                  });
                }
              } catch (_err) {
                logger.warn(`[pages:downloadContent] Failed to fetch file info for ${ref.canvasFileId}`);
              }
            }
          }
        }

        // Rewrite HTML body with local paths
        let rewrittenBody = bodyHtml;
        for (const [originalUrl, localUrl] of urlRewrites) {
          // Replace various URL patterns that might reference this file
          const patterns = [
            originalUrl,
            originalUrl.replace(/&amp;/g, '&'),
            // Handle URL-encoded versions
            encodeURI(originalUrl),
          ];
          for (const pattern of patterns) {
            rewrittenBody = rewrittenBody.split(pattern).join(localUrl);
          }
        }

        // Generate full HTML document with rewritten paths
        const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${moduleItem.title} - ${course.code}</title>
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
  <h1>${moduleItem.title}</h1>
  <p class="meta">Course: ${course.code} | Downloaded: ${new Date().toLocaleDateString()}</p>
  <hr>
  ${rewrittenBody || '<p>No content available.</p>'}
</body>
</html>`;

        fs.writeFileSync(localPath, fullHtml, 'utf-8');

        // Register/update in resources table for Files page visibility
        const externalId = `html-page-${pageSlug}`;
        const fileStats = fs.statSync(localPath);
        database.executeWrite(
          `INSERT INTO resources (external_id, course_id, type, title, local_path, folder_path, size_bytes, mime_type, context_type, context_id, synced_at)
           VALUES (?, ?, 'page', ?, ?, ?, ?, 'text/html', 'page', ?, CURRENT_TIMESTAMP)
           ON CONFLICT(external_id) DO UPDATE SET
             title = excluded.title,
             local_path = excluded.local_path,
             folder_path = excluded.folder_path,
             size_bytes = excluded.size_bytes,
             synced_at = CURRENT_TIMESTAMP`,
          [
            externalId,
            course.id,
            moduleItem.title,
            localPath,
            folderPath,
            fileStats.size,
            pageSlug,
          ],
          'resources'
        );

        logger.info(
          `[pages:downloadContent] Saved page "${moduleItem.title}" to ${localPath} (folder: ${folderPath}, ${urlRewrites.size} dependencies downloaded)`
        );

        return { success: true, localPath };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`[pages:downloadContent] Failed: ${message}`);
        return { success: false, error: message };
      }
    }
  );

  // Open a downloaded Page HTML file
  ipcMain.handle(
    'pages:openFile',
    async (_event, moduleItemId: number): Promise<{ success: boolean; error?: string }> => {
      try {
        // Get module item info including page_url for Canvas URL construction
        const moduleItem = database.executeReadOne<{
          id: number;
          module_id: number;
          title: string;
          item_type: string;
          page_url: string | null;
          url: string | null;
        }>('SELECT id, module_id, title, item_type, page_url, url FROM module_items WHERE id = ?', [
          moduleItemId,
        ]);

        if (!moduleItem) {
          return { success: false, error: 'Module item not found' };
        }

        // Get course info through module -> course chain
        const moduleInfo = database.executeReadOne<{
          course_id: number;
        }>('SELECT course_id FROM modules WHERE id = ?', [moduleItem.module_id]);

        if (!moduleInfo) {
          return { success: false, error: 'Module not found' };
        }

        const course = database.executeReadOne<{
          code: string;
          external_id: string;
        }>('SELECT code, external_id FROM courses WHERE id = ?', [moduleInfo.course_id]);

        if (!course) {
          return { success: false, error: 'Course not found' };
        }

        // Check if offline HTML feature is enabled
        const htmlSettings = getLocalHtmlPathsSettings();
        const canvasClient = getCanvasClient();

        if (!htmlSettings.enabled) {
          // Offline HTML disabled - open in Canvas instead
          logger.info(`[pages:openFile] Offline HTML disabled, opening in Canvas`);

          if (canvasClient) {
            const baseUrl = canvasClient.getBaseUrl();
            // Use page_url (slug) if available, otherwise try to extract from url field
            let pageSlug = moduleItem.page_url;
            if (!pageSlug && moduleItem.url) {
              // Try to extract slug from URL like /courses/123/pages/my-page
              const match = moduleItem.url.match(/\/pages\/([^/?]+)/);
              if (match) {
                pageSlug = match[1];
              }
            }

            if (pageSlug) {
              // Use course.external_id (Canvas course ID), not internal DB ID
              const canvasUrl = `${baseUrl}/courses/${course.external_id}/pages/${pageSlug}`;
              logger.info(`[pages:openFile] Opening Canvas URL: ${canvasUrl}`);
              shell.openExternal(canvasUrl);
              return { success: true };
            }
          }

          // Fallback: try to open the html_url stored in url field directly
          if (moduleItem.url) {
            logger.info(`[pages:openFile] Opening stored URL: ${moduleItem.url}`);
            shell.openExternal(moduleItem.url);
            return { success: true };
          }

          return { success: false, error: 'Could not construct Canvas URL' };
        }

        const FILES_DIR = getFilesDir();

        // Offline HTML enabled - open local file
        // Build the expected file path
        const safeTitle = moduleItem.title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
        const filename = `${safeTitle}.html`;
        const sanitizedCourseCode = course.code
          .replace(/[^a-zA-Z0-9_\-. ]/g, '_')
          .replace(/\s+/g, '_');
        const localPath = path.join(FILES_DIR, sanitizedCourseCode, filename);

        // Check if file exists
        if (!fs.existsSync(localPath)) {
          return { success: false, error: 'Page file not found. Please download it first.' };
        }

        // Open the file
        const error = await shell.openPath(localPath);
        if (error) {
          logger.error(`[pages:openFile] Failed to open: ${error}`);
          return { success: false, error };
        }

        logger.info(`[pages:openFile] Opened ${localPath}`);
        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`[pages:openFile] Failed: ${message}`);
        return { success: false, error: message };
      }
    }
  );
}
