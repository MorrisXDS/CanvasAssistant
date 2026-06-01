/**
 * HTML Dependency IPC Handlers
 * Handlers for HTML dependency checking and downloading:
 * - html:checkDependencies, html:downloadDependencies
 */

import { ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { HtmlDependencyResolver } from '../../layers/l2-daemon/html/HtmlDependencyResolver';
import {
  extractCanvasFileReferences,
  extractHtmlReferences,
} from '../../layers/l2-daemon/html/HtmlFileExtractor';
import { mapPage } from '../../layers/l2-daemon';
import type { CanvasPage } from '../../layers/l2-daemon';
import {
  ResourceReader,
  CoursePageReader,
  HtmlDependencyReader,
  CourseReader,
  TaskReader,
} from '../../layers/l1-persistence';
import {
  UpsertCoursePageCommand,
  UpsertResourceCommand,
} from '../../layers/l4-controller/commands/page';
import { UpdateResourceLocalPathCommand } from '../../layers/l4-controller/commands/resource';
import { HtmlDependencyWriteCommand } from '../../layers/l4-controller/commands/htmlDependency';
import type { IpcContext } from './IpcContext';

/**
 * Register all HTML dependency related IPC handlers
 *
 * Per ADR-0007, this file holds no raw `database.execute*` / `upsert` calls.
 * Reads route through L1 readers; writes through L4 commands. The handler keeps
 * the Canvas API calls, file IO, HTML rewriting, recursive dependency-walking,
 * and OperationCoordinator session orchestration. (`HtmlDependencyResolver` is
 * an L2 service that owns its own SQL — passing the `database` to its
 * constructor is allowed; only direct `database.execute*` calls are not.)
 */
export function registerHtmlDependencyHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();
  const credentialManager = ctx.getCredentialManager();
  const fileDownloadManager = ctx.getFileDownloadManager();
  const getOperationCoordinator = ctx.getOperationCoordinator;
  const getSyncPreferences = ctx.getSyncPreferences;
  const getFilesDir = ctx.getFilesDir;

  const resourceReader = new ResourceReader(database);
  const coursePageReader = new CoursePageReader(database);
  const htmlDependencyReader = new HtmlDependencyReader(database);
  const courseReader = new CourseReader(database);
  const taskReader = new TaskReader(database);
  const upsertCoursePageCommand = new UpsertCoursePageCommand(database);
  const upsertResourceCommand = new UpsertResourceCommand(database);
  const updateResourceLocalPathCommand = new UpdateResourceLocalPathCommand(database);
  const htmlDependencyWriteCommand = new HtmlDependencyWriteCommand(database);

  // Check HTML dependencies without opening
  ipcMain.handle('html:checkDependencies', (_event, resourceId: number) => {
    logger.debug(`[html:checkDependencies] START resourceId=${resourceId}`);

    // Check if HTML offline viewing is enabled
    const syncPrefs = getSyncPreferences();
    if (!syncPrefs.saveHtmlContent) {
      logger.debug('[html:checkDependencies] HTML offline viewing disabled');
      return {
        success: true,
        totalDependencies: 0,
        missingCount: 0,
        missingDependencies: [],
        totalMissingSize: 0,
        cycles: [],
        featureDisabled: true,
      };
    }

    const resource = resourceReader.getOpenInfoById(resourceId);

    if (!resource) {
      return { success: false, error: 'Resource not found' };
    }

    const course = courseReader.getById(resource.course_id);

    if (!course) {
      return { success: false, error: 'Course not found' };
    }

    // Determine source type from external_id pattern
    const externalId = resource.external_id;
    let sourceType: 'page' | 'assignment' | 'announcement' | 'syllabus' = 'page';
    let sourceId = externalId;

    if (externalId.startsWith('html-')) {
      const match = externalId.match(
        /^html-(page|assignment|announcement|syllabus)-(.+)$/
      );
      if (match) {
        sourceType = match[1] as typeof sourceType;
        sourceId = match[2];
      }
    }

    // Use HtmlDependencyResolver to check dependencies
    const basePath =
      resource.local_path ||
      path.join(getFilesDir(), course.code, `${resource.title}.html`);
    const resolver = new HtmlDependencyResolver(database, {
      filesBaseDir: getFilesDir(),
    });
    const resolution = resolver.resolve(
      sourceType,
      sourceId,
      course.external_id,
      basePath
    );

    const missingDeps = resolver.getMissingDependencies(resolution);

    // Count embedded pages whose content is missing from local DB (will be fetched on download)
    const contentMissingCount = resolution.allDependencies.filter(
      (dep) => dep.contentMissing
    ).length;

    return {
      success: true,
      totalDependencies: resolution.allDependencies.length,
      missingCount: resolution.missingCount,
      contentMissingCount,
      missingDependencies: missingDeps.map((dep) => ({
        sourceId: dep.sourceId,
        resourceId: dep.resourceId,
        filename: dep.localPath ? path.basename(dep.localPath) : dep.sourceId,
        sizeBytes: dep.sizeBytes || 0,
        canvasUrl: dep.canvasUrl,
        mimeType: dep.mimeType,
      })),
      totalMissingSize: missingDeps.reduce((sum, dep) => sum + (dep.sizeBytes || 0), 0),
      cycles: resolution.cycles,
    };
  });

  // Download missing HTML dependencies and rewrite HTML with local paths
  // Supports recursive resolution of files AND Canvas pages
  // Uses OperationCoordinator to prevent sync conflicts during download
  ipcMain.handle('html:downloadDependencies', async (_event, resourceId: number) => {
    logger.info(`[html:downloadDependencies] START resourceId=${resourceId}`);

    // Check if HTML offline viewing is enabled
    const syncPrefs = getSyncPreferences();
    if (!syncPrefs.saveHtmlContent) {
      logger.info('[html:downloadDependencies] HTML offline viewing disabled');
      return {
        success: false,
        error:
          'HTML offline viewing is disabled. Enable "Save HTML content for offline viewing" in Settings > Sync.',
      };
    }

    const resource = resourceReader.getOpenInfoById(resourceId);

    if (!resource || !resource.local_path) {
      return { success: false, error: 'Resource not found or not downloaded' };
    }

    const course = courseReader.getById(resource.course_id);

    if (!course) {
      return { success: false, error: 'Course not found' };
    }

    // Parse external_id to extract sourceType and sourceId for dependency tracking
    // Format: html-{sourceType}-{sourceId}, e.g., "html-page-12345" or "html-syllabus-419166"
    const externalIdMatch = resource.external_id.match(
      /^html-(page|assignment|announcement|syllabus)-(.+)$/
    );
    const sourceType = externalIdMatch?.[1] || null;
    const sourceId = externalIdMatch?.[2] || null;

    // Helper: Get content hash for an HTML source to detect changes during download
    const getContentHash = (type: string, id: string): string | null => {
      if (type === 'page') {
        const page = coursePageReader.getHashSourceByExternalId(id);
        // Use stored hash if available, otherwise compute from content
        if (page?.content_hash) return page.content_hash;
        if (page?.body_html)
          return crypto.createHash('md5').update(page.body_html).digest('hex');
      } else if (type === 'assignment') {
        const task = taskReader.getDescriptionHashSourceByExternalId(id);
        if (task?.description_hash) return task.description_hash;
        if (task?.description)
          return crypto.createHash('md5').update(task.description).digest('hex');
      } else if (type === 'syllabus') {
        const syllabus = courseReader.getSyllabusHashSourceByExternalId(id);
        if (syllabus?.syllabus_hash) return syllabus.syllabus_hash;
        if (syllabus?.syllabus_body)
          return crypto.createHash('md5').update(syllabus.syllabus_body).digest('hex');
      }
      return null;
    };

    // Get original content hash before starting download (to detect changes later)
    const originalContentHash =
      sourceType && sourceId ? getContentHash(sourceType, sourceId) : null;

    // Register this download operation with OperationCoordinator
    // This prevents sync from modifying html_dependencies during download
    const operationCoordinator = getOperationCoordinator();
    let sessionId: string | undefined;
    if (operationCoordinator && sourceType && sourceId) {
      sessionId = operationCoordinator.startOperation(
        'download_html',
        sourceType,
        sourceId,
        course.id
      );
      logger.info(
        `[html:downloadDependencies] Started operation with session=${sessionId.substring(0, 20)}...`
      );
    }

    // Get auth token
    const token = await credentialManager.retrieve();
    if (!token) {
      // Clean up operation on early exit
      if (sessionId && operationCoordinator) {
        operationCoordinator.completeOperation(sessionId);
      }
      return { success: false, error: 'No credentials available' };
    }

    // Track processed items to avoid cycles
    const processedFiles = new Set<string>();
    const processedPages = new Set<string>();
    let totalFilesDownloaded = 0;
    let totalPagesProcessed = 0;

    // Helper: Record dependencies for an HTML file in the html_dependencies table
    // sessionId protects these dependencies from being deleted by sync during active download
    // contentHash is stored to detect if content changes since dependencies were recorded
    const recordHtmlDependencies = (
      htmlSourceType: string,
      htmlSourceId: string,
      fileIds: string[],
      pageIds: string[],
      opSessionId?: string,
      contentHash?: string
    ) => {
      // Only delete dependencies that don't have a session ID or have the same session ID
      // This protects dependencies being used by another concurrent download
      htmlDependencyWriteCommand.deleteForParentInSession(
        htmlSourceType,
        htmlSourceId,
        opSessionId
      );

      // Record file dependencies with session ID and content hash
      for (const fileId of fileIds) {
        htmlDependencyWriteCommand.replaceChild(
          htmlSourceType,
          htmlSourceId,
          'file',
          fileId,
          opSessionId,
          contentHash
        );
      }

      // Record page dependencies with session ID and content hash
      for (const pageId of pageIds) {
        htmlDependencyWriteCommand.replaceChild(
          htmlSourceType,
          htmlSourceId,
          'page',
          pageId,
          opSessionId,
          contentHash
        );
      }

      if (fileIds.length > 0 || pageIds.length > 0) {
        logger.info(
          `[html:downloadDependencies] Recorded ${fileIds.length} files and ${pageIds.length} pages for ${htmlSourceType}:${htmlSourceId}${opSessionId ? ` (session=${opSessionId.substring(0, 20)}...)` : ''}`
        );
      }
    };

    // Helper: Generate HTML file for a Canvas page
    const generatePageHtml = (
      pageSlug: string,
      pageTitle: string,
      bodyHtml: string,
      targetDir: string
    ): string => {
      const safeTitle = pageTitle.replace(/[<>:"/\\|?*]/g, '_');
      const htmlPath = path.join(targetDir, `${safeTitle}.html`);

      const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pageTitle}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; padding: 20px; max-width: 800px; margin: 0 auto; }
    img { max-width: 100%; height: auto; }
    a { color: #0066cc; }
    pre, code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
    pre { padding: 12px; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>${pageTitle}</h1>
  ${bodyHtml}
</body>
</html>`;

      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(htmlPath, fullHtml, 'utf-8');
      logger.info(`[html:downloadDependencies] Generated page HTML: ${htmlPath}`);
      return htmlPath;
    };

    // Helper: Download a file and return local path
    const downloadFile = async (fileId: string): Promise<string | null> => {
      if (processedFiles.has(fileId)) return null;
      processedFiles.add(fileId);

      const depResource = resourceReader.getHtmlDownloadInfoByExternalId(fileId);

      // Return existing local path if already downloaded
      if (depResource?.local_path && fs.existsSync(depResource.local_path)) {
        return depResource.local_path;
      }

      if (!depResource?.url) {
        logger.warn(`[html:downloadDependencies] No URL for file ${fileId}`);
        return null;
      }

      // Download using FileDownloadManager
      const downloadId = `html-dep-${fileId}-${Date.now()}`;
      const downloadPromise = new Promise<string | null>((resolve) => {
        const cleanup = () => {
          fileDownloadManager.off('download-complete', onComplete);
          fileDownloadManager.off('download-error', onError);
          clearTimeout(safetyTimeout);
        };

        const onComplete = (result: { id: string; localPath: string }) => {
          if (result.id === downloadId) {
            cleanup();
            resolve(result.localPath);
          }
        };

        const onError = (result: { id: string; error: string }) => {
          if (result.id === downloadId) {
            cleanup();
            logger.error(`[html:downloadDependencies] Download failed: ${result.error}`);
            resolve(null);
          }
        };

        // Safety timeout to prevent listener leaks if download never completes
        const safetyTimeout = setTimeout(
          () => {
            fileDownloadManager.off('download-complete', onComplete);
            fileDownloadManager.off('download-error', onError);
            logger.warn(
              `[html:downloadDependencies] Safety timeout for download ${downloadId}`
            );
            resolve(null);
          },
          5 * 60 * 1000
        );

        fileDownloadManager.on('download-complete', onComplete);
        fileDownloadManager.on('download-error', onError);
        fileDownloadManager.queueDownload({
          id: downloadId,
          url: depResource.url!,
          courseCode: course.code,
          filename: depResource.title,
          authToken: token,
          contextFolder: depResource.folder_path || undefined,
        });
      });

      const localPath = await downloadPromise;
      if (localPath) {
        updateResourceLocalPathCommand.setLocalPath(depResource.id, localPath);
        totalFilesDownloaded++;
        logger.info(`[html:downloadDependencies] Downloaded file: ${depResource.title}`);
      }
      return localPath;
    };

    // Helper: Process a page and return local HTML path
    const processPage = async (
      courseExternalId: string,
      pageSlug: string,
      targetDir: string
    ): Promise<string | null> => {
      const pageKey = `${courseExternalId}:${pageSlug}`;
      if (processedPages.has(pageKey)) return null;
      processedPages.add(pageKey);

      // Look up page by slug in course_pages to get Canvas external_id
      const page = coursePageReader.getContentWithSlug(course.id, pageSlug);

      // Extract local vars from existing row (may be null if page not synced yet)
      let pageBodyHtml = page?.body_html ?? null;
      let pageTitle = page?.title ?? pageSlug;
      let pageExternalId = page?.external_id ?? pageSlug;
      let pageId = page?.id ?? null;

      // Fix: If body_html is missing, fetch on-demand from Canvas API
      if (!pageBodyHtml) {
        const canvasClient = ctx.getCanvasClient();
        if (!canvasClient) {
          logger.warn(
            `[html:downloadDependencies] Page "${pageSlug}" has no content and no Canvas client available (offline)`
          );
          return null;
        }

        try {
          const canvasCourseId = parseInt(course.external_id, 10);
          const endpoint = `/courses/${canvasCourseId}/pages/${encodeURIComponent(pageSlug)}`;
          logger.info(
            `[html:downloadDependencies] Fetching unsynced page from Canvas: ${endpoint}`
          );
          const response = await canvasClient.get<CanvasPage>(endpoint);
          const localPage = mapPage(response.data, course.id, 'module_item');
          upsertCoursePageCommand.execute(localPage);

          // Re-read the upserted row to get the id and all fields
          const freshPage = coursePageReader.getContent(course.id, pageSlug);

          if (freshPage?.body_html) {
            pageBodyHtml = freshPage.body_html;
            pageTitle = freshPage.title;
            pageExternalId = freshPage.external_id;
            pageId = freshPage.id;
            logger.info(
              `[html:downloadDependencies] Successfully fetched page "${pageTitle}" from Canvas`
            );
          } else {
            logger.warn(
              `[html:downloadDependencies] Fetched page "${pageSlug}" but body_html still empty`
            );
            return null;
          }
        } catch (fetchError) {
          const errMsg =
            fetchError instanceof Error ? fetchError.message : String(fetchError);
          logger.warn(
            `[html:downloadDependencies] Failed to fetch page "${pageSlug}" from Canvas: ${errMsg}`
          );
          return null;
        }
      }

      // Check if HTML file already exists in resources (registered via HtmlContentSync)
      const pageResourceId = `html-page-${pageExternalId}`;
      const existingResource = resourceReader.getLocalPathByExternalId(pageResourceId);

      if (existingResource?.local_path && fs.existsSync(existingResource.local_path)) {
        logger.info(
          `[html:downloadDependencies] Page already exists: ${existingResource.local_path}`
        );
        // Still process its dependencies recursively and record them
        await processHtmlDependencies(
          existingResource.local_path,
          targetDir,
          'page',
          pageExternalId
        );
        return existingResource.local_path;
      }

      // Generate HTML file
      const htmlPath = generatePageHtml(pageSlug, pageTitle, pageBodyHtml, targetDir);
      totalPagesProcessed++;

      // Register in resources table for tracking
      const stats = fs.statSync(htmlPath);
      upsertResourceCommand.upsertPageContent({
        externalId: pageResourceId,
        courseId: course.id,
        title: pageTitle,
        localPath: htmlPath,
        folderPath: path.basename(targetDir),
        sizeBytes: stats.size,
        contextId: pageId,
      });

      // Recursively process this page's dependencies and record them
      await processHtmlDependencies(htmlPath, targetDir, 'page', pageExternalId);

      return htmlPath;
    };

    // Helper: Process all dependencies in an HTML file
    // htmlSourceType/htmlSourceId are optional - if provided, dependencies are recorded in html_dependencies table
    const processHtmlDependencies = async (
      htmlPath: string,
      targetDir: string,
      htmlSourceType?: string,
      htmlSourceId?: string
    ): Promise<void> => {
      const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
      const htmlDir = path.dirname(htmlPath);

      const fileIdToLocalPath = new Map<string, string>();
      const pageSlugToLocalPath = new Map<string, string>();
      const directFileIds: string[] = [];
      const directPageSlugs: string[] = [];

      // First, check if we have recorded dependencies for this HTML (preferred method)
      // This handles the case where HTML was already rewritten with local paths
      let usedRecordedDeps = false;
      if (htmlSourceType && htmlSourceId) {
        const recordedDeps = htmlDependencyReader.getChildrenWithHash(
          htmlSourceType,
          htmlSourceId
        );

        if (recordedDeps.length > 0) {
          // Fix: Check if recorded deps are stale (recorded with null hash or hash mismatch)
          const recordedHash = recordedDeps[0].recorded_content_hash;
          const currentHash = getContentHash(htmlSourceType, htmlSourceId);
          const isStale = !recordedHash || (currentHash && recordedHash !== currentHash);

          if (isStale) {
            logger.info(
              `[html:downloadDependencies] Stale cached dependencies for ${htmlSourceType}:${htmlSourceId} ` +
                `(recordedHash=${recordedHash ?? 'null'}, currentHash=${currentHash ?? 'null'}). Re-parsing HTML.`
            );
            // Delete stale records so we fall through to the parse path
            htmlDependencyWriteCommand.deleteAllForParent(htmlSourceType, htmlSourceId);
            // usedRecordedDeps remains false → falls through to parse path
          } else {
            logger.info(
              `[html:downloadDependencies] Using ${recordedDeps.length} recorded dependencies for ${htmlSourceType}:${htmlSourceId}`
            );
            usedRecordedDeps = true;

            for (const dep of recordedDeps) {
              if (dep.child_source_type === 'file') {
                directFileIds.push(dep.child_source_id);
                const localPath = await downloadFile(dep.child_source_id);
                if (localPath) {
                  fileIdToLocalPath.set(dep.child_source_id, localPath);
                }
              } else if (dep.child_source_type === 'page') {
                directPageSlugs.push(dep.child_source_id);
                const localPath = await processPage(
                  course.external_id,
                  dep.child_source_id,
                  targetDir
                );
                if (localPath) {
                  pageSlugToLocalPath.set(dep.child_source_id, localPath);
                }
              }
            }
          }
        }
      }

      // Fallback: parse HTML content if no recorded dependencies (first-time download)
      if (!usedRecordedDeps) {
        logger.info(`[html:downloadDependencies] Parsing HTML content for dependencies`);

        // Extract file references - track direct file IDs for this HTML
        const fileRefs = extractCanvasFileReferences(htmlContent);

        for (const ref of fileRefs) {
          directFileIds.push(ref.canvasFileId);
          const localPath = await downloadFile(ref.canvasFileId);
          if (localPath) {
            fileIdToLocalPath.set(ref.canvasFileId, localPath);
          }
        }

        // Extract page references - track direct page slugs for this HTML
        const htmlRefs = extractHtmlReferences(htmlContent);

        for (const ref of htmlRefs) {
          if (
            ref.refType === 'canvas-page' &&
            ref.pageSlug &&
            ref.courseId === course.external_id
          ) {
            directPageSlugs.push(ref.pageSlug);
            const localPath = await processPage(ref.courseId, ref.pageSlug, targetDir);
            if (localPath) {
              pageSlugToLocalPath.set(ref.pageSlug, localPath);
            }
          }
        }

        // Record dependencies for this HTML if source info provided (only on first download)
        // Include sessionId to protect from concurrent sync deletion and contentHash for staleness detection
        if (
          htmlSourceType &&
          htmlSourceId &&
          directFileIds.length + directPageSlugs.length > 0
        ) {
          const currentContentHash = getContentHash(htmlSourceType, htmlSourceId);
          recordHtmlDependencies(
            htmlSourceType,
            htmlSourceId,
            directFileIds,
            directPageSlugs,
            sessionId,
            currentContentHash ?? undefined
          );
        }
      }

      // Rewrite HTML with local paths
      let updatedHtml = htmlContent;
      let replacementsMade = 0;

      // Replace file URLs
      for (const [fileId, localPath] of fileIdToLocalPath) {
        // Convert Windows backslashes to forward slashes for HTML/URL paths
        // eslint-disable-next-line cross-platform/no-hardcoded-path-separator
        const relativePath = path.relative(htmlDir, localPath).replace(/\\/g, '/');
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
      for (const [pageSlug, localPath] of pageSlugToLocalPath) {
        // Convert Windows backslashes to forward slashes for HTML/URL paths
        // eslint-disable-next-line cross-platform/no-hardcoded-path-separator
        const relativePath = path.relative(htmlDir, localPath).replace(/\\/g, '/');
        // URL patterns in HTML always use forward slashes regardless of platform

        const patterns = [
          new RegExp(
            `(href=["'])([^"']*\\/courses\\/${course.external_id}\\/pages\\/${pageSlug}[^"']*)(["'])`,
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

      if (replacementsMade > 0) {
        fs.writeFileSync(htmlPath, updatedHtml, 'utf-8');
        logger.info(
          `[html:downloadDependencies] Updated ${htmlPath} with ${replacementsMade} replacements`
        );
      }
    };

    try {
      // Process the main HTML file and record its dependencies
      const htmlDir = path.dirname(resource.local_path);
      await processHtmlDependencies(
        resource.local_path,
        htmlDir,
        sourceType || undefined,
        sourceId || undefined
      );

      // Check if content changed during download (sync may have updated HTML while we were downloading)
      const currentContentHash =
        sourceType && sourceId ? getContentHash(sourceType, sourceId) : null;
      const contentChanged =
        originalContentHash !== null &&
        currentContentHash !== null &&
        originalContentHash !== currentContentHash;

      if (contentChanged) {
        logger.warn(
          `[html:downloadDependencies] Content changed during download for ${sourceType}:${sourceId}`
        );
      }

      return {
        success: true,
        filesDownloaded: totalFilesDownloaded,
        pagesProcessed: totalPagesProcessed,
        htmlPath: resource.local_path,
        contentChanged,
        message: contentChanged
          ? 'Content was updated during download. Consider re-downloading to get the latest files.'
          : undefined,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[html:downloadDependencies] Failed: ${errorMessage}`);
      return { success: false, error: errorMessage };
    } finally {
      // Always complete the operation to release the lock
      if (sessionId && operationCoordinator) {
        operationCoordinator.completeOperation(sessionId);
        logger.debug(
          `[html:downloadDependencies] Completed operation session=${sessionId.substring(0, 20)}...`
        );
      }
    }
  });
}
