/**
 * Resource IPC Handlers
 * Handlers for resource download and open operations:
 * - resource:download, resource:open
 */

import { ipcMain, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import {
  extractCanvasFileReferences,
  extractHtmlReferences,
} from '../layers/l2-daemon/HtmlFileExtractor';
import type { IpcContext } from './IpcContext';

/**
 * Register all resource related IPC handlers
 */
export function registerResourceHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();
  const metricsCollector = ctx.getMetricsCollector();
  const credentialManager = ctx.getCredentialManager();
  const fileDownloadManager = ctx.getFileDownloadManager();
  const getCanvasClient = ctx.getCanvasClient;
  const getSyncEngine = ctx.getSyncEngine;
  const getSyncPreferences = ctx.getSyncPreferences;
  const getLocalHtmlPathsSettings = ctx.getLocalHtmlPathsSettings;
  const getFilesDir = ctx.getFilesDir;

  // Download a resource (Canvas file or HTML content)
  ipcMain.handle('resource:download', async (_event, resourceId: number) => {
    const resource = database.executeReadOne<{
      id: number;
      course_id: number;
      external_id: string;
      title: string;
      url: string | null;
    }>('SELECT * FROM resources WHERE id = ?', [resourceId]);

    if (!resource) {
      return { success: false, error: 'Resource not found' };
    }

    // Handle HTML content items (pages, assignments, announcements)
    const syncEngine = getSyncEngine();
    if (resource.external_id.startsWith('html-') && syncEngine?.['htmlContentSync']) {
      // Check if HTML offline viewing is enabled
      const syncPrefs = getSyncPreferences();
      if (!syncPrefs.saveHtmlContent) {
        logger.info(
          '[resource:download] HTML offline viewing disabled, skipping HTML download'
        );
        return {
          success: false,
          error:
            'HTML offline viewing is disabled. Enable "Save HTML content for offline viewing" in Settings > Sync to download HTML files.',
        };
      }

      const htmlSync = syncEngine[
        'htmlContentSync'
      ] as import('../layers/l2-daemon/HtmlContentSync').HtmlContentSync;
      const result = await htmlSync.downloadHtmlItem(resource.external_id, getFilesDir());
      if (result.success) {
        metricsCollector.increment('resource.download.html.success');
      } else {
        metricsCollector.increment('resource.download.html.failure');
      }
      return result;
    }

    if (!resource.url) {
      return { success: false, error: 'Resource has no download URL' };
    }

    // Get course code for folder organization
    const course = database.executeReadOne<{ code: string }>(
      'SELECT code FROM courses WHERE id = ?',
      [resource.course_id]
    );

    const courseCode = course?.code || 'unknown';

    // Get auth token for Canvas download
    const token = await credentialManager.retrieve();
    if (!token) {
      return { success: false, error: 'No credentials available' };
    }

    // Queue the download
    return new Promise((resolve) => {
      const downloadId = `resource-${resourceId}`;

      const onComplete = (result: {
        id: string;
        success: boolean;
        localPath?: string;
        error?: string;
      }) => {
        if (result.id !== downloadId) return;

        fileDownloadManager.off('download-complete', onComplete);
        fileDownloadManager.off('download-error', onComplete);

        if (result.success && result.localPath) {
          // Update database with local path
          database.executeWrite(
            'UPDATE resources SET local_path = ?, synced_at = ? WHERE id = ?',
            [result.localPath, new Date().toISOString(), resourceId],
            'resources'
          );
          metricsCollector.increment('resource.download.success');
          resolve({ success: true, localPath: result.localPath });
        } else {
          metricsCollector.increment('resource.download.failure');
          resolve({ success: false, error: result.error || 'Download failed' });
        }
      };

      fileDownloadManager.on('download-complete', onComplete);
      fileDownloadManager.on('download-error', onComplete);

      fileDownloadManager.queueDownload({
        id: downloadId,
        url: resource.url!, // Already checked for null above
        courseCode,
        filename: resource.title,
        authToken: token,
      });
    });
  });

  // Download a resource by external_id (for module items that reference resources)
  ipcMain.handle('resource:downloadByExternalId', async (_event, externalId: string) => {
    // Look up resource by external_id
    const resource = database.executeReadOne<{
      id: number;
      course_id: number;
      external_id: string;
      title: string;
      url: string | null;
    }>('SELECT id, course_id, external_id, title, url FROM resources WHERE external_id = ?', [externalId]);

    if (!resource) {
      logger.warn(`[resource:downloadByExternalId] Resource not found for external_id: ${externalId}`);
      return { success: false, error: 'Resource not found' };
    }

    // Handle HTML content items (pages, assignments, announcements)
    const syncEngine = getSyncEngine();
    if (resource.external_id.startsWith('html-') && syncEngine?.['htmlContentSync']) {
      const syncPrefs = getSyncPreferences();
      if (!syncPrefs.saveHtmlContent) {
        logger.info(
          '[resource:downloadByExternalId] HTML offline viewing disabled, skipping HTML download'
        );
        return {
          success: false,
          error:
            'HTML offline viewing is disabled. Enable "Save HTML content for offline viewing" in Settings > Sync to download HTML files.',
        };
      }

      const htmlSync = syncEngine[
        'htmlContentSync'
      ] as import('../layers/l2-daemon/HtmlContentSync').HtmlContentSync;
      const result = await htmlSync.downloadHtmlItem(resource.external_id, getFilesDir());
      if (result.success) {
        metricsCollector.increment('resource.download.html.success');
      } else {
        metricsCollector.increment('resource.download.html.failure');
      }
      return result;
    }

    if (!resource.url) {
      return { success: false, error: 'Resource has no download URL' };
    }

    // Get course code for folder organization
    const course = database.executeReadOne<{ code: string }>(
      'SELECT code FROM courses WHERE id = ?',
      [resource.course_id]
    );

    const courseCode = course?.code || 'unknown';

    // Get auth token for Canvas download
    const token = await credentialManager.retrieve();
    if (!token) {
      return { success: false, error: 'No credentials available' };
    }

    // Queue the download
    return new Promise((resolve) => {
      const downloadId = `resource-ext-${externalId}`;

      const onComplete = (result: {
        id: string;
        success: boolean;
        localPath?: string;
        error?: string;
      }) => {
        if (result.id !== downloadId) return;

        fileDownloadManager.off('download-complete', onComplete);
        fileDownloadManager.off('download-error', onComplete);

        if (result.success && result.localPath) {
          // Update database with local path
          database.executeWrite(
            'UPDATE resources SET local_path = ?, synced_at = ? WHERE id = ?',
            [result.localPath, new Date().toISOString(), resource.id],
            'resources'
          );
          metricsCollector.increment('resource.download.success');
          resolve({ success: true, localPath: result.localPath });
        } else {
          metricsCollector.increment('resource.download.failure');
          resolve({ success: false, error: result.error || 'Download failed' });
        }
      };

      fileDownloadManager.on('download-complete', onComplete);
      fileDownloadManager.on('download-error', onComplete);

      fileDownloadManager.queueDownload({
        id: downloadId,
        url: resource.url!,
        courseCode,
        filename: resource.title,
        authToken: token,
      });
    });
  });

  // Open a resource by external_id (for module File items)
  ipcMain.handle('resource:openByExternalId', (_event, externalId: string) => {
    logger.debug(`[resource:openByExternalId] START externalId=${externalId}`);

    const resource = database.executeReadOne<{
      id: number;
      local_path: string | null;
      title: string;
    }>('SELECT id, local_path, title FROM resources WHERE external_id = ?', [externalId]);

    if (!resource) {
      logger.warn(`[resource:openByExternalId] Resource not found for external_id: ${externalId}`);
      return { success: false, error: 'Resource not found' };
    }

    if (!resource.local_path) {
      logger.debug('[resource:openByExternalId] No local_path - file not downloaded');
      return { success: false, error: 'File not downloaded', needsDownload: true };
    }

    // Check if file actually exists on disk
    if (!fs.existsSync(resource.local_path)) {
      logger.warn(
        `[resource:openByExternalId] File not found on disk, clearing local_path: ${resource.local_path}`
      );
      database.executeWrite(
        'UPDATE resources SET local_path = NULL WHERE id = ?',
        [resource.id],
        'resources'
      );
      return { success: false, error: 'File was deleted from disk. Please re-download.', needsDownload: true };
    }

    logger.info(`[resource:openByExternalId] Opening local file: ${resource.local_path}`);
    shell.openPath(resource.local_path).then((error: string) => {
      if (error) {
        logger.error(`[resource:openByExternalId] shell.openPath failed: ${error}`);
      }
    });

    return { success: true };
  });

  // Open a resource file (with HTML dependency checking)
  ipcMain.handle(
    'resource:open',
    (_event, resourceId: number, skipDependencyCheck?: boolean) => {
      logger.debug(
        `[resource:open] START resourceId=${resourceId}, skipDependencyCheck=${skipDependencyCheck}`
      );
      const resource = database.executeReadOne<{
        local_path: string | null;
        external_id: string;
        course_id: number;
        title: string;
        mime_type: string | null;
      }>(
        'SELECT local_path, external_id, course_id, title, mime_type FROM resources WHERE id = ?',
        [resourceId]
      );

      if (!resource?.local_path) {
        logger.debug('[resource:open] No local_path');
        return { success: false, error: 'File not downloaded' };
      }

      // Check if file actually exists on disk
      if (!fs.existsSync(resource.local_path)) {
        logger.warn(
          `[resource:open] File not found on disk, clearing local_path: ${resource.local_path}`
        );
        // Clear the local_path since file was deleted
        database.executeWrite(
          'UPDATE resources SET local_path = NULL WHERE id = ?',
          [resourceId],
          'resources'
        );
        return {
          success: false,
          error: 'File was deleted from disk. Please re-download.',
        };
      }

      // Check if it's an HTML file and we should check dependencies
      const ext = path.extname(resource.local_path).toLowerCase();
      const isHtml = ext === '.html' || ext === '.htm';
      logger.info(
        `[resource:open] ext=${ext}, isHtml=${isHtml}, skipDependencyCheck=${skipDependencyCheck}`
      );

      if (isHtml && !skipDependencyCheck) {
        // Check if offline HTML feature is enabled
        const syncPrefs = getSyncPreferences();
        const htmlSettings = getLocalHtmlPathsSettings();
        const canvasClient = getCanvasClient();

        // If offline HTML viewing is disabled, use stored body_html from database
        const useStoredHtml = !syncPrefs.saveHtmlContent || !htmlSettings.enabled;
        logger.info(
          `[resource:open] Settings check: saveHtmlContent=${syncPrefs.saveHtmlContent}, htmlEnabled=${htmlSettings.enabled}, useStoredHtml=${useStoredHtml}`
        );

        if (useStoredHtml) {
          logger.info(`[resource:open] Offline HTML disabled, opening in Canvas`);

          // Parse external_id to get source type and ID
          const externalIdMatch = resource.external_id.match(
            /^html-(page|assignment|announcement|syllabus)-(.+)$/
          );
          if (externalIdMatch && canvasClient) {
            const [, sourceType, sourceId] = externalIdMatch;
            const baseUrl = canvasClient.getBaseUrl();

            // Get Canvas course ID (external_id), not internal DB ID
            const courseForUrl = database.executeReadOne<{ external_id: string }>(
              'SELECT external_id FROM courses WHERE id = ?',
              [resource.course_id]
            );

            if (courseForUrl) {
              const canvasCourseId = courseForUrl.external_id;
              let canvasUrl: string | null = null;

              if (sourceType === 'page') {
                // Get page slug to construct URL
                const page = database.executeReadOne<{ url_slug: string | null }>(
                  `SELECT url_slug FROM course_pages WHERE course_id = ? AND (external_id = ? OR url_slug = ?)`,
                  [resource.course_id, sourceId, sourceId]
                );
                if (page?.url_slug) {
                  canvasUrl = `${baseUrl}/courses/${canvasCourseId}/pages/${page.url_slug}`;
                }
              } else if (sourceType === 'assignment') {
                // For assignments, sourceId is the task external_id (which is the Canvas assignment ID)
                canvasUrl = `${baseUrl}/courses/${canvasCourseId}/assignments/${sourceId}`;
              } else if (sourceType === 'announcement') {
                // For announcements, construct the discussion topic URL
                canvasUrl = `${baseUrl}/courses/${canvasCourseId}/discussion_topics/${sourceId}`;
              } else if (sourceType === 'syllabus') {
                canvasUrl = `${baseUrl}/courses/${canvasCourseId}/assignments/syllabus`;
              }

              if (canvasUrl) {
                logger.info(`[resource:open] Opening Canvas URL: ${canvasUrl}`);
                shell.openExternal(canvasUrl);
                return { success: true, openedInCanvas: true };
              }
            }
          }

          // Fallback: no Canvas URL could be constructed, open local file anyway
          logger.warn(
            `[resource:open] Could not construct Canvas URL for ${resource.external_id}, falling back to local file`
          );
        }

        // Skip dependency checking if user doesn't want prompts (but still view locally)
        if (!htmlSettings.promptForMissing) {
          logger.info(
            `[resource:open] Skipping dependency check (promptForMissing=${htmlSettings.promptForMissing})`
          );
          // Skip dependency check and open directly
        } else {
          logger.info(
            `[resource:open] Checking HTML dependencies recursively for resource ${resourceId}`
          );

          // Parse external_id to get sourceType and sourceId
          const externalIdMatch = resource.external_id.match(
            /^html-(page|assignment|announcement|syllabus)-(.+)$/
          );
          const htmlSourceType = externalIdMatch?.[1] || null;
          const htmlSourceId = externalIdMatch?.[2] || null;

          logger.info(
            `[resource:open] HTML source: type=${htmlSourceType}, id=${htmlSourceId}`
          );

          // Get course info for page lookups
          const courseInfo = database.executeReadOne<{ id: number; external_id: string }>(
            'SELECT id, external_id FROM courses WHERE id = ?',
            [resource.course_id]
          );

          // Track all missing dependencies across all levels
          const allMissingDeps: Array<{
            sourceId: string;
            filename: string;
            sizeBytes: number;
            canvasUrl: string;
            resourceId?: number;
            type: 'file' | 'page';
          }> = [];

          // Track visited pages to prevent infinite loops
          const visitedPages = new Set<string>();
          const visitedFiles = new Set<string>();

          // Track downloaded files/pages for HTML rewriting
          const downloadedFiles: Map<string, string> = new Map();
          const downloadedPages: Map<string, string> = new Map();

          // Check dependencies using html_dependencies table (preferred) or by parsing HTML content
          const collectMissingDepsFromDb = (
            parentSourceType: string,
            parentSourceId: string,
            depth: number = 0
          ): void => {
            if (depth > 10) {
              logger.warn(
                `[resource:open] Max recursion depth reached for ${parentSourceType}:${parentSourceId}`
              );
              return;
            }

            // Query recorded dependencies from html_dependencies table
            const deps = database.executeRead<{
              child_source_type: string;
              child_source_id: string;
            }>(
              `SELECT child_source_type, child_source_id FROM html_dependencies
             WHERE parent_source_type = ? AND parent_source_id = ?`,
              [parentSourceType, parentSourceId]
            );

            logger.info(
              `[resource:open] Depth ${depth}: ${parentSourceType}:${parentSourceId} has ${deps.length} recorded dependencies`
            );

            for (const dep of deps) {
              if (dep.child_source_type === 'file') {
                // Check if file exists locally
                if (visitedFiles.has(dep.child_source_id)) continue;
                visitedFiles.add(dep.child_source_id);

                const fileResource = database.executeReadOne<{
                  id: number;
                  local_path: string | null;
                  title: string;
                  size_bytes: number | null;
                  url: string | null;
                }>(
                  'SELECT id, local_path, title, size_bytes, url FROM resources WHERE external_id = ?',
                  [dep.child_source_id]
                );

                const isDownloaded =
                  fileResource?.local_path && fs.existsSync(fileResource.local_path);

                if (!isDownloaded) {
                  allMissingDeps.push({
                    sourceId: dep.child_source_id,
                    filename: fileResource?.title || `file_${dep.child_source_id}`,
                    sizeBytes: fileResource?.size_bytes || 0,
                    canvasUrl: fileResource?.url || '',
                    resourceId: fileResource?.id,
                    type: 'file',
                  });
                  logger.info(`[resource:open] Missing file: ${dep.child_source_id}`);
                } else {
                  downloadedFiles.set(dep.child_source_id, fileResource!.local_path!);
                }
              } else if (dep.child_source_type === 'page') {
                // Check if page HTML exists locally
                if (visitedPages.has(dep.child_source_id)) continue;
                visitedPages.add(dep.child_source_id);

                // Look up page info
                const page = database.executeReadOne<{
                  id: number;
                  external_id: string;
                  title: string;
                  body_html: string | null;
                }>(
                  `SELECT id, external_id, title, body_html FROM course_pages
                 WHERE course_id = ? AND (url_slug = ? OR external_id = ?)`,
                  [courseInfo?.id, dep.child_source_id, dep.child_source_id]
                );

                if (!page) {
                  logger.warn(
                    `[resource:open] Page not found in database: ${dep.child_source_id}`
                  );
                  continue;
                }

                // Check if page HTML file exists
                const pageResourceId = `html-page-${page.external_id}`;
                const pageResource = database.executeReadOne<{
                  local_path: string | null;
                }>('SELECT local_path FROM resources WHERE external_id = ?', [
                  pageResourceId,
                ]);

                const pageExists =
                  pageResource?.local_path && fs.existsSync(pageResource.local_path);

                if (!pageExists) {
                  allMissingDeps.push({
                    sourceId: dep.child_source_id,
                    filename: `${page.title}.html`,
                    sizeBytes: page.body_html?.length || 0,
                    canvasUrl: `/courses/${courseInfo?.external_id}/pages/${dep.child_source_id}`,
                    type: 'page',
                  });
                  logger.info(`[resource:open] Missing page: ${dep.child_source_id}`);
                } else {
                  downloadedPages.set(dep.child_source_id, pageResource!.local_path!);
                  // Recursively check this page's dependencies
                  collectMissingDepsFromDb('page', page.external_id, depth + 1);
                }
              }
            }
          };

          // Recursive function to collect missing dependencies by parsing HTML (fallback)
          const collectMissingDeps = (htmlPath: string, depth: number = 0): void => {
            if (depth > 10) {
              logger.warn(`[resource:open] Max recursion depth reached at ${htmlPath}`);
              return;
            }

            if (!fs.existsSync(htmlPath)) return;

            const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
            const fileRefs = extractCanvasFileReferences(htmlContent);
            const htmlRefs = extractHtmlReferences(htmlContent);

            logger.info(
              `[resource:open] Depth ${depth}: ${path.basename(htmlPath)} has ${fileRefs.length} files, ${htmlRefs.length} pages`
            );

            // Check file references
            for (const ref of fileRefs) {
              if (visitedFiles.has(ref.canvasFileId)) continue;
              visitedFiles.add(ref.canvasFileId);

              const existingResource = database.executeReadOne<{
                id: number;
                local_path: string | null;
                title: string;
                size_bytes: number | null;
              }>(
                'SELECT id, local_path, title, size_bytes FROM resources WHERE external_id = ?',
                [ref.canvasFileId]
              );

              const isDownloaded =
                existingResource?.local_path &&
                fs.existsSync(existingResource.local_path);

              if (!isDownloaded) {
                allMissingDeps.push({
                  sourceId: ref.canvasFileId,
                  filename: existingResource?.title || `file_${ref.canvasFileId}`,
                  sizeBytes: existingResource?.size_bytes || 0,
                  canvasUrl: ref.matchedUrl,
                  resourceId: existingResource?.id,
                  type: 'file',
                });
              } else {
                downloadedFiles.set(ref.matchedUrl, existingResource!.local_path!);
              }
            }

            // Check page references (only for same course)
            if (!courseInfo) return;

            logger.info(
              `[resource:open] Checking ${htmlRefs.length} HTML refs, courseInfo.external_id=${courseInfo.external_id}`
            );

            for (const ref of htmlRefs) {
              logger.info(
                `[resource:open] HTML ref: refType=${ref.refType}, pageSlug=${ref.pageSlug}, courseId=${ref.courseId}`
              );
              if (ref.refType !== 'canvas-page' || !ref.pageSlug) {
                logger.info(`[resource:open] Skipping: not canvas-page or no pageSlug`);
                continue;
              }
              if (String(ref.courseId) !== String(courseInfo.external_id)) {
                logger.info(
                  `[resource:open] Skipping: courseId mismatch (${ref.courseId} vs ${courseInfo.external_id})`
                );
                continue;
              }
              if (visitedPages.has(ref.pageSlug)) {
                logger.info(`[resource:open] Skipping: already visited ${ref.pageSlug}`);
                continue;
              }
              visitedPages.add(ref.pageSlug);

              // Look up page by slug
              const page = database.executeReadOne<{
                id: number;
                external_id: string;
                title: string;
                body_html: string | null;
              }>(
                `SELECT id, external_id, title, body_html FROM course_pages
               WHERE course_id = ? AND (url_slug = ? OR external_id = ?)`,
                [courseInfo.id, ref.pageSlug, ref.pageSlug]
              );

              if (!page || !page.body_html) {
                logger.warn(`[resource:open] Page not synced: ${ref.pageSlug}`);
                continue;
              }

              // Check if HTML file exists
              const pageResourceExternalId = `html-page-${page.external_id}`;
              const pageResource = database.executeReadOne<{ local_path: string | null }>(
                `SELECT local_path FROM resources WHERE external_id = ?`,
                [pageResourceExternalId]
              );

              logger.info(
                `[resource:open] Page ${ref.pageSlug}: external_id=${pageResourceExternalId}, local_path=${pageResource?.local_path}, exists=${pageResource?.local_path ? fs.existsSync(pageResource.local_path) : false}`
              );

              if (pageResource?.local_path && fs.existsSync(pageResource.local_path)) {
                downloadedPages.set(ref.pageSlug, pageResource.local_path);
                // Recursively check this page's dependencies
                logger.info(
                  `[resource:open] Recursing into page: ${pageResource.local_path}`
                );
                collectMissingDeps(pageResource.local_path, depth + 1);
              } else {
                allMissingDeps.push({
                  sourceId: ref.pageSlug,
                  filename: `${page.title}.html`,
                  sizeBytes: page.body_html.length,
                  canvasUrl: ref.matchedUrl,
                  type: 'page',
                });
                logger.info(`[resource:open] Page ${ref.pageSlug} marked as missing`);
                // Note: Can't recurse into page content here since it's not generated yet
                // The download handler will handle recursive generation
              }
            }
          };

          // Check dependencies using recorded data (preferred) or by parsing HTML content (fallback)
          try {
            // First, check if we have recorded dependencies for this HTML
            let hasRecordedDeps = false;
            if (htmlSourceType && htmlSourceId) {
              const depCount = database.executeReadOne<{ count: number }>(
                'SELECT COUNT(*) as count FROM html_dependencies WHERE parent_source_type = ? AND parent_source_id = ?',
                [htmlSourceType, htmlSourceId]
              );
              hasRecordedDeps = (depCount?.count ?? 0) > 0;
            }

            if (hasRecordedDeps) {
              logger.info(
                `[resource:open] Using recorded dependencies from html_dependencies table`
              );
              collectMissingDepsFromDb(htmlSourceType!, htmlSourceId!);
            } else {
              logger.info(
                `[resource:open] No recorded dependencies, parsing HTML content`
              );
              collectMissingDeps(resource.local_path);
            }

            const missingFiles = allMissingDeps.filter((d) => d.type === 'file');
            const missingPages = allMissingDeps.filter((d) => d.type === 'page');
            logger.info(
              `[resource:open] Total missing: ${missingFiles.length} files, ${missingPages.length} pages`
            );

            // Use allMissingDeps for the rest of the logic
            const missingDeps = allMissingDeps;

            if (missingDeps.length > 0) {
              const missingFilesCount = missingDeps.filter((d) => d.type === 'file');
              const missingPagesCount = missingDeps.filter((d) => d.type === 'page');
              logger.info(
                `[resource:open] HTML has ${missingFilesCount.length} missing files, ${missingPagesCount.length} missing pages`
              );

              return {
                success: false,
                hasMissingDependencies: true,
                missingDependencies: missingDeps,
                totalMissingSize: missingDeps.reduce((sum, f) => sum + f.sizeBytes, 0),
                totalMissingCount: missingDeps.length,
              };
            }

            // All dependencies available - rewrite HTML with local paths
            if (downloadedFiles.size > 0 || downloadedPages.size > 0) {
              logger.info(
                `[resource:open] Rewriting HTML with ${downloadedFiles.size} files, ${downloadedPages.size} pages`
              );
              const htmlContent = fs.readFileSync(resource.local_path, 'utf-8');
              let updatedHtml = htmlContent;
              const htmlDir = path.dirname(resource.local_path);
              let replacementsMade = 0;

              // Replace file URLs - extract file IDs from visitedFiles set
              logger.info(
                `[resource:open] Files to rewrite: ${Array.from(visitedFiles).join(', ')}`
              );
              logger.info(
                `[resource:open] Downloaded files map: ${Array.from(downloadedFiles.keys()).join(', ')}`
              );
              for (const fileId of visitedFiles) {
                // Find the local path for this file - key is the file ID directly
                const localPath = downloadedFiles.get(fileId);
                if (!localPath) {
                  logger.info(
                    `[resource:open] File ${fileId} has no local path, skipping rewrite`
                  );
                  continue;
                }

                logger.info(`[resource:open] Rewriting file ${fileId} -> ${localPath}`);
                // Convert Windows backslashes to forward slashes for HTML/URL paths
                const relativePath = path
                  .relative(htmlDir, localPath)
                  // eslint-disable-next-line cross-platform/no-hardcoded-path-separator -- Intentional: converting to web-friendly forward slashes
                  .replace(/\\/g, '/');
                // URL patterns in HTML always use forward slashes regardless of platform

                const patterns = [
                  new RegExp(`(href=["'])([^"']*\\/files\\/${fileId}[^"']*)(["'])`, 'gi'),
                  new RegExp(`(src=["'])([^"']*\\/files\\/${fileId}[^"']*)(["'])`, 'gi'),
                  new RegExp(
                    `(data-api-endpoint=["'])([^"']*\\/files\\/${fileId}[^"']*)(["'])`,
                    'gi'
                  ),
                ];

                for (const pattern of patterns) {
                  const matches = updatedHtml.match(pattern);
                  if (matches) {
                    for (const match of matches) {
                      const replaced = match.replace(pattern, `$1${relativePath}$3`);
                      updatedHtml = updatedHtml.replace(match, replaced);
                      replacementsMade++;
                    }
                  }
                }
              }

              // Replace page URLs
              if (courseInfo) {
                for (const [pageSlug, localPath] of downloadedPages) {
                  // Convert Windows backslashes to forward slashes for HTML/URL paths
                  const relativePath = path
                    .relative(htmlDir, localPath)
                    // eslint-disable-next-line cross-platform/no-hardcoded-path-separator -- Intentional: converting to web-friendly forward slashes
                    .replace(/\\/g, '/');
                  // URL patterns in HTML always use forward slashes regardless of platform

                  const patterns = [
                    new RegExp(
                      `(href=["'])([^"']*\\/courses\\/${courseInfo.external_id}\\/pages\\/${pageSlug}[^"']*)(["'])`,
                      'gi'
                    ),
                    new RegExp(
                      `(data-api-endpoint=["'])([^"']*\\/pages\\/${pageSlug}[^"']*)(["'])`,
                      'gi'
                    ),
                  ];

                  for (const pattern of patterns) {
                    const matches = updatedHtml.match(pattern);
                    if (matches) {
                      for (const match of matches) {
                        const replaced = match.replace(pattern, `$1${relativePath}$3`);
                        updatedHtml = updatedHtml.replace(match, replaced);
                        replacementsMade++;
                      }
                    }
                  }
                }
              }

              if (replacementsMade > 0) {
                fs.writeFileSync(resource.local_path, updatedHtml, 'utf-8');
                logger.info(
                  `[resource:open] HTML updated with ${replacementsMade} replacements`
                );
              }
            }
          } catch (err) {
            logger.error(`[resource:open] Error parsing HTML: ${err}`);
            // Continue to open the file even if parsing fails
          }
        } // end else (promptForMissing)
      }

      logger.info(`[resource:open] Opening local file: ${resource.local_path}`);

      // Use OS default application for all file types (including HTML)
      // HTML files now use relative paths instead of canvas-file:// protocol,
      // so they work correctly in any browser
      shell.openPath(resource.local_path).then((error: string) => {
        if (error) {
          logger.error(`[resource:open] shell.openPath failed: ${error}`);
        } else {
          logger.info(`[resource:open] shell.openPath succeeded`);
        }
      });

      return { success: true };
    }
  );
}
