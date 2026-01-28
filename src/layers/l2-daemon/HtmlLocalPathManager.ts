/**
 * HtmlLocalPathManager - Orchestrates HTML download with local path dependencies
 *
 * Manages the complete workflow for downloading HTML content with dependencies:
 * 1. Analyze dependencies (recursive, with cycle detection)
 * 2. Check local state for existing files
 * 3. Download missing files to {HTML}_files/ folders
 * 4. Generate HTML with local paths
 * 5. Auto-regenerate when files change
 *
 * Features:
 * - Recursive HTML dependency resolution
 * - Cycle detection with Canvas URL fallback
 * - Shared files (Option B - first HTML wins)
 * - FileWatcher integration for auto-regeneration
 * - Original HTML preservation for regeneration
 */

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { Database } from '../l1-persistence/Database';
import { Logger } from '../l0-utilities/Logger';
import {
  HtmlDependencyResolver,
  HtmlSourceType,
  DependencyNode,
} from './HtmlDependencyResolver';
import { HtmlUrlRewriter, ResolvedDependency } from './HtmlUrlRewriter';

/**
 * Configuration for HtmlLocalPathManager
 */
export interface HtmlLocalPathManagerConfig {
  /** Base directory for downloaded files */
  filesBaseDir: string;
  /** Logger instance */
  logger?: Logger;
  /** Whether to auto-regenerate HTMLs when files change */
  autoRegenerate?: boolean;
  /** Canvas base URL for fallback links */
  canvasBaseUrl?: string;
}

/**
 * Request to download HTML with dependencies
 */
export interface HtmlDownloadRequest {
  /** Source type */
  sourceType: HtmlSourceType;
  /** Source ID (external_id, page slug, etc.) */
  sourceId: string;
  /** Course ID (external) */
  courseId: string;
  /** Course code (for folder naming) */
  courseCode: string;
  /** Title for the HTML file */
  title: string;
}

/**
 * Result of HTML download operation
 */
export interface HtmlDownloadResult {
  success: boolean;
  /** Path to the downloaded HTML file */
  htmlPath?: string;
  /** Error message if failed */
  error?: string;
  /** Number of dependencies downloaded */
  dependenciesDownloaded: number;
  /** Number of dependencies already present */
  dependenciesExisting: number;
  /** Total size of downloaded files */
  totalSizeBytes: number;
  /** Detected cycles */
  cycles: string[][];
}

/**
 * Information about a file that needs regeneration
 */
export interface RegenerationInfo {
  /** Path to the HTML file */
  htmlPath: string;
  /** Source type */
  sourceType: HtmlSourceType;
  /** Source ID */
  sourceId: string;
  /** Course ID */
  courseId: string;
  /** Reason for regeneration */
  reason: 'file_deleted' | 'file_added' | 'file_modified';
  /** Path of the affected dependency */
  affectedFile: string;
}

/**
 * Orchestrates HTML download with local path dependencies
 */
export class HtmlLocalPathManager extends EventEmitter {
  private db: Database;
  private config: Omit<Required<HtmlLocalPathManagerConfig>, 'logger'> & {
    logger?: Logger;
  };
  private resolver: HtmlDependencyResolver;
  private rewriter: HtmlUrlRewriter;
  private logger?: Logger;

  constructor(db: Database, config: HtmlLocalPathManagerConfig) {
    super();
    this.db = db;
    this.config = {
      autoRegenerate: true,
      canvasBaseUrl: '',
      ...config,
    };
    this.logger = config.logger;

    this.resolver = new HtmlDependencyResolver(db, {
      filesBaseDir: config.filesBaseDir,
    });
    this.rewriter = new HtmlUrlRewriter();
  }

  /**
   * Download HTML with all dependencies
   *
   * @param request Download request details
   * @param downloadFiles Function to download files (injected for testability)
   * @returns Download result
   */
  async downloadHtmlWithDependencies(
    request: HtmlDownloadRequest,
    downloadFiles: (dependencies: DependencyNode[]) => Promise<Map<string, string>>
  ): Promise<HtmlDownloadResult> {
    try {
      // Calculate base path for HTML file
      const htmlFilename = this.sanitizeFilename(request.title) + '.html';
      const courseDir = path.join(this.config.filesBaseDir, request.courseCode);
      const htmlPath = path.join(courseDir, htmlFilename);

      this.logger?.info(
        `Resolving dependencies for ${request.sourceType}:${request.sourceId}`
      );

      // Phase 1: Resolve dependencies
      const resolution = this.resolver.resolve(
        request.sourceType,
        request.sourceId,
        request.courseId,
        htmlPath
      );

      this.logger?.debug(
        `Found ${resolution.allDependencies.length} dependencies, ${resolution.missingCount} missing`
      );

      // Phase 2: Get original HTML content
      const originalHtml = this.getOriginalHtml(
        request.sourceType,
        request.sourceId,
        request.courseId
      );
      if (!originalHtml) {
        return {
          success: false,
          error: 'Source HTML content not found',
          dependenciesDownloaded: 0,
          dependenciesExisting: 0,
          totalSizeBytes: 0,
          cycles: resolution.cycles,
        };
      }

      // Store original HTML for future regeneration
      this.storeOriginalHtml(
        request.sourceType,
        request.sourceId,
        request.courseId,
        originalHtml
      );

      // Phase 3: Download missing files
      const missingDeps = this.resolver.getMissingDependencies(resolution);
      let downloadedPaths = new Map<string, string>();
      let downloadedSize = 0;

      if (missingDeps.length > 0) {
        this.logger?.info(`Downloading ${missingDeps.length} missing files...`);
        downloadedPaths = await downloadFiles(missingDeps);

        // Update database with download paths and first_referenced_by
        for (const dep of missingDeps) {
          const downloadedPath = downloadedPaths.get(dep.sourceId);
          if (downloadedPath && dep.resourceId) {
            this.updateResourceWithLocalPath(
              dep.resourceId,
              downloadedPath,
              `${request.sourceType}:${request.sourceId}`
            );
            downloadedSize += dep.sizeBytes || 0;
          }
        }
      }

      // Phase 4: Build resolved dependencies for rewriting
      const resolvedDeps = this.buildResolvedDependencies(
        resolution.allDependencies,
        downloadedPaths
      );

      // Phase 5: Rewrite HTML with local paths
      const rewrittenHtml = this.rewriter.rewrite(originalHtml, htmlPath, resolvedDeps, {
        keepExternalUrls: true,
        fallbackToCanvasUrl: true,
        canvasBaseUrl: this.config.canvasBaseUrl,
      });

      // Phase 6: Write HTML file
      this.ensureDirectory(courseDir);
      fs.writeFileSync(htmlPath, rewrittenHtml, 'utf-8');

      // Phase 7: Record HTML dependencies in database
      this.recordHtmlDependencies(
        request.sourceType,
        request.sourceId,
        resolution.allDependencies,
        resolution.cycles
      );

      this.logger?.info(`Successfully created ${htmlPath}`);

      return {
        success: true,
        htmlPath,
        dependenciesDownloaded: downloadedPaths.size,
        dependenciesExisting: resolution.allDependencies.length - missingDeps.length,
        totalSizeBytes: downloadedSize,
        cycles: resolution.cycles,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger?.error(`Failed to download HTML with dependencies: ${errorMessage}`);
      return {
        success: false,
        error: errorMessage,
        dependenciesDownloaded: 0,
        dependenciesExisting: 0,
        totalSizeBytes: 0,
        cycles: [],
      };
    }
  }

  /**
   * Regenerate HTML when a dependency changes
   *
   * @param info Regeneration info
   * @returns Success status
   */
  async regenerateHtml(info: RegenerationInfo): Promise<boolean> {
    try {
      this.logger?.info(
        `Regenerating HTML for ${info.sourceType}:${info.sourceId} (${info.reason})`
      );

      // Get original HTML
      const originalHtml = this.getStoredOriginalHtml(
        info.sourceType,
        info.sourceId,
        info.courseId
      );
      if (!originalHtml) {
        this.logger?.warn('No original HTML stored, cannot regenerate');
        return false;
      }

      // Get current dependencies from database
      const deps = this.getStoredDependencies(info.sourceType, info.sourceId);

      // Update dependency status based on change type
      const resolvedDeps: ResolvedDependency[] = [];
      for (const dep of deps) {
        // Check if file exists on disk
        const fileExists = dep.local_path ? fs.existsSync(dep.local_path) : false;

        resolvedDeps.push({
          canvasUrl: dep.canvas_url,
          localPath: fileExists ? dep.local_path : null,
          isCycleRef: dep.is_cycle === 1,
        });
      }

      // Rewrite HTML
      const rewrittenHtml = this.rewriter.rewrite(
        originalHtml,
        info.htmlPath,
        resolvedDeps,
        {
          keepExternalUrls: true,
          fallbackToCanvasUrl: true,
          canvasBaseUrl: this.config.canvasBaseUrl,
        }
      );

      // Write updated HTML
      fs.writeFileSync(info.htmlPath, rewrittenHtml, 'utf-8');

      this.emit('html-regenerated', {
        htmlPath: info.htmlPath,
        sourceType: info.sourceType,
        sourceId: info.sourceId,
        reason: info.reason,
      });

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger?.error(`Failed to regenerate HTML: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Handle file deleted event from FileWatcher
   *
   * @param deletedPath Path of the deleted file
   */
  async handleFileDeleted(deletedPath: string): Promise<void> {
    if (!this.config.autoRegenerate) return;

    // Find HTMLs that reference this file
    const affectedHtmls = this.findAffectedHtmls(deletedPath);

    for (const info of affectedHtmls) {
      info.reason = 'file_deleted';
      info.affectedFile = deletedPath;
      await this.regenerateHtml(info);
    }

    this.emit('dependency-deleted', { path: deletedPath, affectedHtmls });
  }

  /**
   * Handle file added event from FileWatcher
   *
   * @param addedPath Path of the added file
   * @param resourceId Resource ID (if known)
   */
  async handleFileAdded(addedPath: string, resourceId?: number): Promise<void> {
    if (!this.config.autoRegenerate) return;

    // Update resource local_path if resourceId provided
    if (resourceId) {
      this.db.executeWrite(
        'UPDATE resources SET local_path = ? WHERE id = ?',
        [addedPath, resourceId],
        'resources'
      );
    }

    // Find HTMLs that reference this file
    const affectedHtmls = this.findAffectedHtmls(addedPath);

    // Check if any HTML now has all dependencies complete
    for (const info of affectedHtmls) {
      const allComplete = this.areAllDependenciesPresent(info.sourceType, info.sourceId);
      if (allComplete) {
        info.reason = 'file_added';
        info.affectedFile = addedPath;
        await this.regenerateHtml(info);
      }
    }

    this.emit('dependency-added', { path: addedPath, affectedHtmls });
  }

  /**
   * Get original HTML content from source
   */
  private getOriginalHtml(
    sourceType: HtmlSourceType,
    sourceId: string,
    courseId: string
  ): string | null {
    switch (sourceType) {
      case 'page': {
        const page = this.db.executeReadOne<{ body_html: string | null }>(
          `SELECT body_html FROM course_pages
           WHERE (url_slug = ? OR external_id = ?)
           AND course_id = (SELECT id FROM courses WHERE external_id = ? LIMIT 1)`,
          [sourceId, sourceId, courseId]
        );
        return page?.body_html || null;
      }
      case 'assignment': {
        const task = this.db.executeReadOne<{ description: string | null }>(
          `SELECT description FROM tasks
           WHERE external_id = ?
           AND course_id = (SELECT id FROM courses WHERE external_id = ? LIMIT 1)`,
          [sourceId, courseId]
        );
        return task?.description || null;
      }
      case 'syllabus': {
        const course = this.db.executeReadOne<{ syllabus_body: string | null }>(
          'SELECT syllabus_body FROM courses WHERE external_id = ?',
          [courseId]
        );
        return course?.syllabus_body || null;
      }
      case 'announcement': {
        const notification = this.db.executeReadOne<{ message_html: string | null }>(
          `SELECT message_html FROM notifications
           WHERE source_id = ?
           AND course_id = (SELECT id FROM courses WHERE external_id = ? LIMIT 1)`,
          [sourceId, courseId]
        );
        return notification?.message_html || null;
      }
      default:
        return null;
    }
  }

  /**
   * Store original HTML for future regeneration
   */
  private storeOriginalHtml(
    sourceType: HtmlSourceType,
    sourceId: string,
    courseId: string,
    html: string
  ): void {
    switch (sourceType) {
      case 'page':
        this.db.executeWrite(
          `UPDATE course_pages SET body_html_original = ?
           WHERE (url_slug = ? OR external_id = ?)
           AND course_id = (SELECT id FROM courses WHERE external_id = ? LIMIT 1)`,
          [html, sourceId, sourceId, courseId],
          'course_pages'
        );
        break;
      case 'assignment':
        this.db.executeWrite(
          `UPDATE tasks SET description_original = ?
           WHERE external_id = ?
           AND course_id = (SELECT id FROM courses WHERE external_id = ? LIMIT 1)`,
          [html, sourceId, courseId],
          'tasks'
        );
        break;
      case 'syllabus':
        this.db.executeWrite(
          'UPDATE courses SET syllabus_body_original = ? WHERE external_id = ?',
          [html, courseId],
          'courses'
        );
        break;
      case 'announcement':
        this.db.executeWrite(
          `UPDATE notifications SET message_html_original = ?
           WHERE source_id = ?
           AND course_id = (SELECT id FROM courses WHERE external_id = ? LIMIT 1)`,
          [html, sourceId, courseId],
          'notifications'
        );
        break;
    }
  }

  /**
   * Get stored original HTML for regeneration
   */
  private getStoredOriginalHtml(
    sourceType: HtmlSourceType,
    sourceId: string,
    courseId: string
  ): string | null {
    switch (sourceType) {
      case 'page': {
        const page = this.db.executeReadOne<{ body_html_original: string | null }>(
          `SELECT body_html_original FROM course_pages
           WHERE (url_slug = ? OR external_id = ?)
           AND course_id = (SELECT id FROM courses WHERE external_id = ? LIMIT 1)`,
          [sourceId, sourceId, courseId]
        );
        return page?.body_html_original || null;
      }
      case 'assignment': {
        const task = this.db.executeReadOne<{ description_original: string | null }>(
          `SELECT description_original FROM tasks
           WHERE external_id = ?
           AND course_id = (SELECT id FROM courses WHERE external_id = ? LIMIT 1)`,
          [sourceId, courseId]
        );
        return task?.description_original || null;
      }
      case 'syllabus': {
        const course = this.db.executeReadOne<{ syllabus_body_original: string | null }>(
          'SELECT syllabus_body_original FROM courses WHERE external_id = ?',
          [courseId]
        );
        return course?.syllabus_body_original || null;
      }
      case 'announcement': {
        const notification = this.db.executeReadOne<{
          message_html_original: string | null;
        }>(
          `SELECT message_html_original FROM notifications
           WHERE source_id = ?
           AND course_id = (SELECT id FROM courses WHERE external_id = ? LIMIT 1)`,
          [sourceId, courseId]
        );
        return notification?.message_html_original || null;
      }
      default:
        return null;
    }
  }

  /**
   * Update resource with local path and first_referenced_by
   */
  private updateResourceWithLocalPath(
    resourceId: number,
    localPath: string,
    referencedBy: string
  ): void {
    // Only update first_referenced_by if not already set
    this.db.executeWrite(
      `UPDATE resources
       SET local_path = ?,
           first_referenced_by = COALESCE(first_referenced_by, ?)
       WHERE id = ?`,
      [localPath, referencedBy, resourceId],
      'resources'
    );
  }

  /**
   * Build resolved dependencies for rewriting
   */
  private buildResolvedDependencies(
    dependencies: DependencyNode[],
    downloadedPaths: Map<string, string>
  ): ResolvedDependency[] {
    return dependencies.map((dep) => {
      // Check if we just downloaded this file
      const downloadedPath = downloadedPaths.get(dep.sourceId);

      return {
        canvasUrl: dep.canvasUrl,
        localPath: downloadedPath || dep.localPath,
        isCycleRef: dep.isCycleRef,
        isExternal: dep.isExternal,
      };
    });
  }

  /**
   * Record HTML dependencies in database
   */
  private recordHtmlDependencies(
    parentSourceType: HtmlSourceType,
    parentSourceId: string,
    dependencies: DependencyNode[],
    cycles: string[][]
  ): void {
    // Clear existing dependencies
    this.db.executeWrite(
      'DELETE FROM html_dependencies WHERE parent_source_type = ? AND parent_source_id = ?',
      [parentSourceType, parentSourceId],
      'html_dependencies'
    );

    // Insert new dependencies
    for (const dep of dependencies) {
      const isCycle = cycles.some((cycle) =>
        cycle.includes(`${dep.sourceType}:${dep.sourceId}`)
      );

      this.db.executeWrite(
        `INSERT OR REPLACE INTO html_dependencies
         (parent_source_type, parent_source_id, child_source_type, child_source_id, child_canvas_url, is_cycle)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          parentSourceType,
          parentSourceId,
          dep.sourceType,
          dep.sourceId,
          dep.canvasUrl,
          isCycle ? 1 : 0,
        ],
        'html_dependencies'
      );
    }
  }

  /**
   * Get stored dependencies from database
   */
  private getStoredDependencies(
    sourceType: HtmlSourceType,
    sourceId: string
  ): Array<{
    child_source_type: string;
    child_source_id: string;
    canvas_url: string;
    local_path: string | null;
    is_cycle: number;
  }> {
    return this.db.executeRead(
      `SELECT hd.child_source_type, hd.child_source_id, hd.child_canvas_url as canvas_url,
              hd.is_cycle, r.local_path
       FROM html_dependencies hd
       LEFT JOIN resources r ON hd.child_source_type = 'file'
         AND r.external_id = hd.child_source_id
       WHERE hd.parent_source_type = ? AND hd.parent_source_id = ?`,
      [sourceType, sourceId]
    );
  }

  /**
   * Find HTMLs that reference a given file path
   */
  private findAffectedHtmls(filePath: string): RegenerationInfo[] {
    // Get resource ID from file path
    const resource = this.db.executeReadOne<{ id: number; external_id: string }>(
      'SELECT id, external_id FROM resources WHERE local_path = ?',
      [filePath]
    );

    if (!resource) {
      return [];
    }

    // Find HTMLs that depend on this resource
    const deps = this.db.executeRead<{
      parent_source_type: string;
      parent_source_id: string;
    }>(
      `SELECT DISTINCT parent_source_type, parent_source_id
       FROM html_dependencies
       WHERE child_source_type = 'file' AND child_source_id = ?`,
      [resource.external_id]
    );

    // Build regeneration info for each affected HTML
    return deps.map((dep) => {
      // Get HTML file path from html_exports or construct it
      const htmlExport = this.db.executeReadOne<{
        local_path: string | null;
        course_id: number;
      }>(
        `SELECT local_path, course_id FROM html_exports
         WHERE source_type = ? AND source_id = ?`,
        [dep.parent_source_type, dep.parent_source_id]
      );

      // Get course external_id
      const course = htmlExport
        ? this.db.executeReadOne<{ external_id: string }>(
            'SELECT external_id FROM courses WHERE id = ?',
            [htmlExport.course_id]
          )
        : null;

      return {
        htmlPath: htmlExport?.local_path || '',
        sourceType: dep.parent_source_type as HtmlSourceType,
        sourceId: dep.parent_source_id,
        courseId: course?.external_id || '',
        reason: 'file_deleted' as const,
        affectedFile: filePath,
      };
    });
  }

  /**
   * Check if all dependencies for an HTML are present
   */
  private areAllDependenciesPresent(
    sourceType: HtmlSourceType,
    sourceId: string
  ): boolean {
    const result = this.db.executeReadOne<{ missing_count: number }>(
      `SELECT COUNT(*) as missing_count
       FROM html_dependencies hd
       LEFT JOIN resources r ON hd.child_source_type = 'file'
         AND r.external_id = hd.child_source_id
       WHERE hd.parent_source_type = ? AND hd.parent_source_id = ?
         AND hd.child_source_type = 'file'
         AND (r.local_path IS NULL OR r.local_path = '')`,
      [sourceType, sourceId]
    );

    return (result?.missing_count || 0) === 0;
  }

  /**
   * Ensure directory exists
   */
  private ensureDirectory(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Sanitize filename for filesystem safety
   */
  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9_\-. ]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/__+/g, '_');
  }
}

export default HtmlLocalPathManager;
