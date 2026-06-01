/**
 * Pages IPC Handlers
 * Handlers for page content operations:
 * - pages:downloadContent, pages:openFile
 *
 * Per ADR-0007, this file holds no raw `database.execute*` / `upsert`
 * calls. Reads route through `ModuleReader` / `CourseReader` (L1); writes
 * route through the page commands (L4). The handler keeps the Canvas API
 * calls, file IO, HTML rewriting, and dependency-walking orchestration.
 */

import { ipcMain, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { mapPage, type CanvasPage } from '../../layers/l2-daemon';
import {
  extractCanvasFileReferences,
  extractHtmlReferences,
} from '../../layers/l2-daemon/html/HtmlFileExtractor';
// Deep import from PathBuilder (not the l0-utilities barrel): the barrel
// re-exports FileWatcher, which pulls in chokidar (ESM-only) and breaks the
// jest transform when this handler is loaded in a test. PathBuilder itself
// only depends on `path`.
import {
  createPathBuilder,
  sanitizeCourseCode,
  sanitizeTitle,
} from '../../layers/l0-utilities/PathBuilder';
import { ModuleReader, CourseReader } from '../../layers/l1-persistence';
import {
  UpsertCoursePageCommand,
  UpsertResourceCommand,
  RecordHtmlDependencyCommand,
} from '../../layers/l4-controller/commands/page';
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

  const moduleReader = new ModuleReader(database);
  const courseReader = new CourseReader(database);
  const upsertCoursePageCommand = new UpsertCoursePageCommand(database);
  const upsertResourceCommand = new UpsertResourceCommand(database);
  const recordHtmlDependencyCommand = new RecordHtmlDependencyCommand(database);

  // Download page content on demand (for module items of type Page)
  // Fetches the page HTML from Canvas and saves it as an HTML file to the course folder
  ipcMain.handle(
    'pages:downloadContent',
    async (
      _event,
      moduleItemId: number
    ): Promise<{ success: boolean; localPath?: string; error?: string }> => {
      try {
        const canvasClient = getCanvasClient();
        if (!canvasClient) {
          return { success: false, error: 'Canvas client not connected' };
        }

        // Get module item to find page_url and course info
        const moduleItem = moduleReader.getModuleItemById(moduleItemId);

        if (!moduleItem) {
          return { success: false, error: 'Module item not found' };
        }

        if (moduleItem.item_type !== 'Page') {
          return { success: false, error: 'Module item is not a Page type' };
        }

        // Get course info through module -> course chain
        const moduleInfo = moduleReader.getModuleById(moduleItem.module_id);

        if (!moduleInfo) {
          return { success: false, error: 'Module not found' };
        }

        const course = courseReader.getById(moduleInfo.course_id);

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
        upsertCoursePageCommand.execute(localPage);

        // Use centralized path builder for consistent path construction
        const pathBuilder = createPathBuilder(getFilesDir());
        const safeTitle = sanitizeTitle(moduleItem.title);
        const sanitizedCode = sanitizeCourseCode(course.code);

        // Get paths using PathBuilder
        const localPath = pathBuilder.getPageHtmlPath(
          course.code,
          moduleInfo.name,
          moduleItem.title
        );
        const filesFolder = pathBuilder.getPageDependenciesPath(
          course.code,
          moduleInfo.name,
          moduleItem.title
        );
        // Use original module name (not sanitized) for folder_path so it matches module item display
        const folderPath = moduleInfo.name;

        // Create module folder if needed
        const moduleFolder = pathBuilder.getModulePath(course.code, moduleInfo.name);
        if (!fs.existsSync(moduleFolder)) {
          fs.mkdirSync(moduleFolder, { recursive: true });
        }

        // Extract and download dependencies from the HTML body
        const bodyHtml = response.data.body || '';
        const fileRefs = extractCanvasFileReferences(bodyHtml);

        // Map of Canvas file URLs to local paths for rewriting
        const urlRewrites = new Map<string, string>();
        // Track downloaded file IDs for html_dependencies table
        const downloadedFileIds: string[] = [];

        if (fileRefs.length > 0) {
          logger.info(
            `[pages:downloadContent] Found ${fileRefs.length} file dependencies`
          );

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
                  const safeFileName = fileResponse.data.display_name.replace(
                    /[<>:"/\\|?*]/g,
                    '_'
                  );
                  const localFilePath = path.join(filesFolder, safeFileName);
                  const fileId = ref.canvasFileId;
                  const mimeType = fileResponse.data['content-type'] || null;

                  // Download the file
                  await new Promise<void>((resolve) => {
                    const downloadId = `page-dep-${fileId}-${Date.now()}`;

                    const cleanup = () => {
                      fileDownloadManager.off('download-complete', onComplete);
                      fileDownloadManager.off('download-error', onComplete);
                      clearTimeout(safetyTimeout);
                    };

                    const onComplete = (result: {
                      id: string;
                      success: boolean;
                      localPath?: string;
                      error?: string;
                    }) => {
                      if (result.id !== downloadId) return;
                      cleanup();

                      if (result.success && result.localPath) {
                        // Map the original URL pattern to local path
                        urlRewrites.set(
                          ref.matchedUrl,
                          `${safeTitle}_files/${safeFileName}`
                        );
                        // Track for html_dependencies table
                        downloadedFileIds.push(fileId);

                        // Create/update resource entry for this file so dependency check can find it
                        try {
                          const fileStats = fs.statSync(localFilePath);
                          upsertResourceCommand.upsertPageDependency({
                            externalId: fileId,
                            courseId: course.id,
                            title: safeFileName,
                            localPath: localFilePath,
                            folderPath: `${moduleInfo.name}/${safeTitle}_files`,
                            sizeBytes: fileStats.size,
                            mimeType,
                            contextId: pageSlug,
                          });
                        } catch (dbErr) {
                          logger.warn(
                            `[pages:downloadContent] Failed to create resource entry for ${fileId}: ${dbErr}`
                          );
                        }

                        logger.info(
                          `[pages:downloadContent] Downloaded dependency: ${safeFileName}`
                        );
                        resolve();
                      } else {
                        logger.warn(
                          `[pages:downloadContent] Failed to download ${fileId}: ${result.error}`
                        );
                        resolve(); // Continue even if one file fails
                      }
                    };

                    // Safety timeout to prevent listener leaks if download never completes
                    const safetyTimeout = setTimeout(
                      () => {
                        fileDownloadManager.off('download-complete', onComplete);
                        fileDownloadManager.off('download-error', onComplete);
                        logger.warn(
                          `[pages:downloadContent] Safety timeout for download ${downloadId}`
                        );
                        resolve();
                      },
                      5 * 60 * 1000
                    );

                    fileDownloadManager.on('download-complete', onComplete);
                    fileDownloadManager.on('download-error', onComplete);

                    fileDownloadManager.queueDownload({
                      id: downloadId,
                      url: fileResponse.data.url,
                      courseCode: sanitizedCode,
                      filename: safeFileName,
                      authToken: token,
                      parentHtml: path.join(sanitizedCode, `${safeTitle}.html`),
                    });
                  });
                }
              } catch (_err) {
                logger.warn(
                  `[pages:downloadContent] Failed to fetch file info for ${ref.canvasFileId}`
                );
              }
            }
          }

          // Record dependencies in html_dependencies table for future dependency checking
          if (downloadedFileIds.length > 0) {
            logger.info(
              `[pages:downloadContent] Recording ${downloadedFileIds.length} file dependencies in html_dependencies`
            );
            for (const fileId of downloadedFileIds) {
              recordHtmlDependencyCommand.execute('page', pageSlug, 'file', fileId);
            }
          }
        }

        // Extract and record page link dependencies (links to other Canvas pages)
        const htmlRefs = extractHtmlReferences(bodyHtml);
        const pageLinks = htmlRefs.filter(
          (ref) => ref.refType === 'canvas-page' && ref.pageSlug
        );
        if (pageLinks.length > 0) {
          logger.info(
            `[pages:downloadContent] Recording ${pageLinks.length} page link dependencies`
          );
          for (const link of pageLinks) {
            if (link.pageSlug) {
              recordHtmlDependencyCommand.execute(
                'page',
                pageSlug,
                'page',
                link.pageSlug
              );
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
        upsertResourceCommand.upsertPage({
          externalId,
          courseId: course.id,
          title: moduleItem.title,
          localPath,
          folderPath,
          sizeBytes: fileStats.size,
          contextId: pageSlug,
        });

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
    async (
      _event,
      moduleItemId: number,
      skipDependencyCheck: boolean = false
    ): Promise<{
      success: boolean;
      needsDownload?: boolean;
      hasMissingDependencies?: boolean;
      missingDependencies?: Array<{
        sourceId: string;
        filename: string;
        sizeBytes: number;
        canvasUrl: string;
      }>;
      totalMissingSize?: number;
      error?: string;
    }> => {
      try {
        // Get module item info including page_url for Canvas URL construction
        const moduleItem = moduleReader.getModuleItemById(moduleItemId);

        if (!moduleItem) {
          return { success: false, error: 'Module item not found' };
        }

        // Get course info through module -> course chain
        const moduleInfo = moduleReader.getModuleById(moduleItem.module_id);

        if (!moduleInfo) {
          return { success: false, error: 'Module not found' };
        }

        const course = courseReader.getById(moduleInfo.course_id);

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

        // Offline HTML enabled - open local file
        // Use centralized PathBuilder to ensure path matches pages:downloadContent
        const pathBuilder = createPathBuilder(getFilesDir());
        const localPath = pathBuilder.getPageHtmlPath(
          course.code,
          moduleInfo.name,
          moduleItem.title
        );

        // Check if file exists
        if (!fs.existsSync(localPath)) {
          // Return needsDownload flag so UI can auto-download or prompt user
          return {
            success: false,
            needsDownload: true,
            error: 'Page file not found. Please download it first.',
          };
        }

        // Check for missing dependencies if promptForMissing is enabled and not skipping
        if (htmlSettings.promptForMissing && !skipDependencyCheck) {
          const missingDependencies: Array<{
            sourceId: string;
            filename: string;
            sizeBytes: number;
            canvasUrl: string;
          }> = [];

          try {
            // Read the HTML file to find local file references
            const htmlContent = fs.readFileSync(localPath, 'utf-8');
            const safeTitle = sanitizeTitle(moduleItem.title);
            const filesFolder = pathBuilder.getPageDependenciesPath(
              course.code,
              moduleInfo.name,
              moduleItem.title
            );

            // Find all references to the _files folder (e.g., PageTitle_files/image.png)
            const localRefPattern = new RegExp(
              `${safeTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_files/([^"'\\s>]+)`,
              'g'
            );
            const matches = htmlContent.matchAll(localRefPattern);

            for (const match of matches) {
              const filename = match[1];
              const localFilePath = path.join(filesFolder, filename);

              if (!fs.existsSync(localFilePath)) {
                logger.info(`[pages:openFile] Missing dependency: ${filename}`);
                missingDependencies.push({
                  sourceId: `page-dep-${filename}`,
                  filename,
                  sizeBytes: 0, // Unknown size for local refs
                  canvasUrl: '', // No Canvas URL available
                });
              }
            }

            if (missingDependencies.length > 0) {
              logger.info(
                `[pages:openFile] Found ${missingDependencies.length} missing dependencies`
              );
              return {
                success: false,
                hasMissingDependencies: true,
                missingDependencies,
                totalMissingSize: 0,
              };
            }
          } catch (parseError) {
            logger.warn(`[pages:openFile] Failed to check dependencies: ${parseError}`);
            // Continue to open file even if dependency check fails
          }
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
