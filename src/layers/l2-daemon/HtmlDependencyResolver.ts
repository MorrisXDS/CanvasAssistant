/**
 * HtmlDependencyResolver - Recursive dependency resolution with cycle detection
 *
 * Resolves all dependencies (files and embedded HTMLs) for an HTML document,
 * handling recursive HTML-to-HTML dependencies and detecting cycles.
 *
 * Features:
 * - Recursive resolution of nested HTML dependencies
 * - Cycle detection using path tracking
 * - Shared file handling (Option B: first HTML wins)
 * - Canvas URL fallback for missing/cycle references
 *
 * Example folder structure produced:
 * ```
 * Assignment1.html
 * Assignment1_files/
 *   image.png
 *   lecture.pdf
 *   instructions.html
 *   instructions_files/
 *     diagram.svg
 *     deeper.html
 *     deeper_files/
 *       icon.png
 * ```
 */

import { Database } from '../l1-persistence/Database';
import {
  HtmlFileExtractor,
  ExtractedFileReference,
  ExtractedHtmlReference,
} from './HtmlFileExtractor';
import path from 'path';

/**
 * Types of HTML sources that can have dependencies
 */
export type HtmlSourceType =
  | 'page'
  | 'assignment'
  | 'syllabus'
  | 'module'
  | 'announcement';

/**
 * Represents a resolved dependency node in the dependency tree
 */
export interface DependencyNode {
  /** Source type of the dependency */
  sourceType: 'file' | HtmlSourceType;
  /** Unique identifier (file ID or page slug) */
  sourceId: string;
  /** Course ID (for Canvas resources) */
  courseId?: string;
  /** Original Canvas URL */
  canvasUrl: string;
  /** Local path where the file will be saved (relative) */
  localPath: string | null;
  /** Whether this is a cycle reference (use Canvas URL fallback) */
  isCycleRef: boolean;
  /** Whether to use Canvas URL instead of local path */
  useCanvasUrl: boolean;
  /** Whether this is an external URL (not a dependency) */
  isExternal: boolean;
  /** Child dependencies (for HTML nodes) */
  dependencies: DependencyNode[];
  /** File size in bytes (for files) */
  sizeBytes?: number;
  /** MIME type (for files) */
  mimeType?: string;
  /** Whether the file is already downloaded */
  isDownloaded: boolean;
  /** Reference to existing resource ID (if already in database) */
  resourceId?: number;
}

/**
 * Result of dependency resolution
 */
export interface ResolutionResult {
  /** Root node (the HTML being resolved) */
  root: DependencyNode;
  /** All dependencies flattened */
  allDependencies: DependencyNode[];
  /** Detected cycles (array of paths) */
  cycles: string[][];
  /** Total size of all dependencies in bytes */
  totalSizeBytes: number;
  /** Number of missing files (not downloaded) */
  missingCount: number;
  /** Folder structure mapping (relative path -> local path) */
  folderStructure: Map<string, string>;
}

/**
 * Configuration for the dependency resolver
 */
export interface HtmlDependencyResolverConfig {
  /** Maximum recursion depth (default: 10) */
  maxDepth?: number;
  /** Whether to resolve nested HTML dependencies (default: true) */
  resolveNestedHtml?: boolean;
  /** Base directory for downloaded files */
  filesBaseDir: string;
}

const DEFAULT_CONFIG: Required<Omit<HtmlDependencyResolverConfig, 'filesBaseDir'>> = {
  maxDepth: 10,
  resolveNestedHtml: true,
};

/**
 * Resolves dependencies for HTML content with cycle detection
 */
export class HtmlDependencyResolver {
  private db: Database;
  private config: Required<HtmlDependencyResolverConfig>;
  private extractor: HtmlFileExtractor;

  constructor(db: Database, config: HtmlDependencyResolverConfig) {
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.extractor = new HtmlFileExtractor({ extractHtmlRefs: true });
  }

  /**
   * Resolve all dependencies for an HTML source
   *
   * @param sourceType The type of HTML source
   * @param sourceId The unique identifier (external_id, page slug, etc.)
   * @param courseId The course ID
   * @param basePath The base path for this HTML file (determines _files folder location)
   * @returns Resolution result with dependency tree and metadata
   */
  resolve(
    sourceType: HtmlSourceType,
    sourceId: string,
    courseId: string,
    basePath: string
  ): ResolutionResult {
    const visited = new Set<string>();
    const cycles: string[][] = [];
    const allDependencies: DependencyNode[] = [];
    const folderStructure = new Map<string, string>();

    // Get the HTML content for the source
    const html = this.getHtmlContent(sourceType, sourceId, courseId);

    // Create root node
    const rootNode: DependencyNode = {
      sourceType,
      sourceId,
      courseId,
      canvasUrl: this.buildCanvasUrl(sourceType, sourceId, courseId),
      localPath: basePath,
      isCycleRef: false,
      useCanvasUrl: false,
      isExternal: false,
      dependencies: [],
      isDownloaded: false,
    };

    if (html) {
      // Resolve dependencies recursively
      this.resolveNode(
        rootNode,
        html,
        courseId,
        basePath,
        visited,
        [],
        cycles,
        allDependencies,
        folderStructure,
        0
      );
    }

    // Calculate totals
    let totalSizeBytes = 0;
    let missingCount = 0;
    for (const dep of allDependencies) {
      if (dep.sourceType === 'file') {
        totalSizeBytes += dep.sizeBytes || 0;
        if (!dep.isDownloaded) {
          missingCount++;
        }
      }
    }

    return {
      root: rootNode,
      allDependencies,
      cycles,
      totalSizeBytes,
      missingCount,
      folderStructure,
    };
  }

  /**
   * Recursively resolve dependencies for a node
   */
  private resolveNode(
    node: DependencyNode,
    html: string,
    courseId: string,
    basePath: string,
    visited: Set<string>,
    path: string[],
    cycles: string[][],
    allDependencies: DependencyNode[],
    folderStructure: Map<string, string>,
    depth: number
  ): void {
    if (depth > this.config.maxDepth) {
      return;
    }

    const nodeKey = `${node.sourceType}:${node.sourceId}`;

    // Check for cycles
    if (path.includes(nodeKey)) {
      // Cycle detected! Record it and mark node
      cycles.push([...path, nodeKey]);
      node.isCycleRef = true;
      node.useCanvasUrl = true;
      return;
    }

    // Check if already processed (shared file)
    if (visited.has(nodeKey)) {
      // Already resolved, find existing node
      const existing = allDependencies.find(
        (d) => `${d.sourceType}:${d.sourceId}` === nodeKey
      );
      if (existing) {
        // Copy relevant properties
        node.localPath = existing.localPath;
        node.isDownloaded = existing.isDownloaded;
        node.resourceId = existing.resourceId;
      }
      return;
    }

    // Mark as visited and add to path
    visited.add(nodeKey);
    const currentPath = [...path, nodeKey];

    // Extract dependencies from HTML
    const { files, htmlRefs } = this.extractor.extractAllDependencies(html);

    // Calculate the _files folder path for this HTML
    const filesFolder = this.getFilesFolderPath(basePath);

    // Process file dependencies
    for (const fileRef of files) {
      const fileDep = this.resolveFileDependency(
        fileRef,
        courseId,
        filesFolder,
        folderStructure
      );
      node.dependencies.push(fileDep);
      allDependencies.push(fileDep);
    }

    // Process HTML dependencies (if enabled)
    if (this.config.resolveNestedHtml) {
      for (const htmlRef of htmlRefs) {
        const htmlDep = this.resolveHtmlDependency(
          htmlRef,
          courseId,
          filesFolder,
          visited,
          currentPath,
          cycles,
          allDependencies,
          folderStructure,
          depth + 1
        );
        node.dependencies.push(htmlDep);
        if (!htmlDep.isCycleRef) {
          allDependencies.push(htmlDep);
        }
      }
    }
  }

  /**
   * Resolve a file dependency
   */
  private resolveFileDependency(
    fileRef: ExtractedFileReference,
    courseId: string,
    filesFolder: string,
    folderStructure: Map<string, string>
  ): DependencyNode {
    // Look up the resource in the database
    const resource = this.db.executeReadOne<{
      id: number;
      local_path: string | null;
      title: string;
      size_bytes: number | null;
      mime_type: string | null;
      first_referenced_by: string | null;
    }>(
      `SELECT id, local_path, title, size_bytes, mime_type, first_referenced_by
       FROM resources
       WHERE external_id = ? AND course_id = (SELECT id FROM courses WHERE external_id = ? LIMIT 1)`,
      [fileRef.canvasFileId, fileRef.courseId || courseId]
    );

    const isDownloaded = !!resource?.local_path;
    let localPath: string | null = null;

    if (resource) {
      if (resource.first_referenced_by && resource.local_path) {
        // File already downloaded by another HTML - use existing path (Option B)
        localPath = resource.local_path;
      } else {
        // This HTML will be the first to reference this file
        const filename = this.sanitizeFilename(resource.title);
        localPath = path.join(filesFolder, filename);
        folderStructure.set(localPath, localPath);
      }
    }

    return {
      sourceType: 'file',
      sourceId: fileRef.canvasFileId,
      courseId: fileRef.courseId || courseId,
      canvasUrl: fileRef.matchedUrl,
      localPath,
      isCycleRef: false,
      useCanvasUrl: !isDownloaded && !localPath,
      isExternal: false,
      dependencies: [],
      sizeBytes: resource?.size_bytes || undefined,
      mimeType: resource?.mime_type || undefined,
      isDownloaded,
      resourceId: resource?.id,
    };
  }

  /**
   * Resolve an HTML dependency (recursive)
   */
  private resolveHtmlDependency(
    htmlRef: ExtractedHtmlReference,
    courseId: string,
    filesFolder: string,
    visited: Set<string>,
    currentPath: string[],
    cycles: string[][],
    allDependencies: DependencyNode[],
    folderStructure: Map<string, string>,
    depth: number
  ): DependencyNode {
    // Determine the source type and ID
    let sourceType: HtmlSourceType = 'page';
    let sourceId = '';

    if (htmlRef.refType === 'canvas-page' && htmlRef.pageSlug) {
      sourceType = 'page';
      sourceId = htmlRef.pageSlug;
    } else {
      // For other HTML refs (iframe, object, embed), try to parse the URL
      sourceId = this.extractSourceIdFromUrl(htmlRef.matchedUrl);
    }

    const refCourseId = htmlRef.courseId || courseId;
    const nodeKey = `${sourceType}:${sourceId}`;

    // Check for cycle before creating node
    if (currentPath.includes(nodeKey)) {
      // Record the cycle path
      cycles.push([...currentPath, nodeKey]);
      return {
        sourceType,
        sourceId,
        courseId: refCourseId,
        canvasUrl: htmlRef.matchedUrl,
        localPath: null,
        isCycleRef: true,
        useCanvasUrl: true,
        isExternal: htmlRef.isExternal,
        dependencies: [],
        isDownloaded: false,
      };
    }

    // Calculate local path for this nested HTML
    const htmlFilename = this.sanitizeFilename(sourceId) + '.html';
    const localPath = path.join(filesFolder, htmlFilename);
    folderStructure.set(localPath, localPath);

    const htmlNode: DependencyNode = {
      sourceType,
      sourceId,
      courseId: refCourseId,
      canvasUrl: htmlRef.matchedUrl,
      localPath,
      isCycleRef: false,
      useCanvasUrl: false,
      isExternal: htmlRef.isExternal,
      dependencies: [],
      isDownloaded: false,
    };

    // If external, don't resolve further
    if (htmlRef.isExternal) {
      htmlNode.useCanvasUrl = true;
      return htmlNode;
    }

    // Get HTML content and resolve recursively
    const html = this.getHtmlContent(sourceType, sourceId, refCourseId);
    if (html) {
      this.resolveNode(
        htmlNode,
        html,
        refCourseId,
        localPath,
        visited,
        currentPath,
        cycles,
        allDependencies,
        folderStructure,
        depth
      );
    }

    return htmlNode;
  }

  /**
   * Get HTML content for a source from the database
   */
  private getHtmlContent(
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
      case 'module': {
        // Modules don't typically have HTML content
        return null;
      }
      default:
        return null;
    }
  }

  /**
   * Build Canvas URL for a source
   */
  private buildCanvasUrl(
    sourceType: HtmlSourceType,
    sourceId: string,
    courseId: string
  ): string {
    switch (sourceType) {
      case 'page':
        return `/courses/${courseId}/pages/${sourceId}`;
      case 'assignment':
        return `/courses/${courseId}/assignments/${sourceId}`;
      case 'syllabus':
        return `/courses/${courseId}/assignments/syllabus`;
      case 'announcement':
        return `/courses/${courseId}/discussion_topics/${sourceId}`;
      case 'module':
        return `/courses/${courseId}/modules/${sourceId}`;
      default:
        return `/courses/${courseId}/${sourceType}/${sourceId}`;
    }
  }

  /**
   * Get the _files folder path for an HTML file
   * E.g., "Assignment1.html" -> "Assignment1_files/"
   */
  private getFilesFolderPath(htmlPath: string): string {
    const parsed = path.parse(htmlPath);
    return path.join(parsed.dir, `${parsed.name}_files`);
  }

  /**
   * Extract source ID from a URL
   */
  private extractSourceIdFromUrl(url: string): string {
    // Try to extract page slug from URL
    const pageMatch = url.match(/\/pages\/([^/?#]+)/);
    if (pageMatch) {
      return pageMatch[1];
    }

    // Try to extract file ID
    const fileMatch = url.match(/\/files\/(\d+)/);
    if (fileMatch) {
      return fileMatch[1];
    }

    // Fall back to filename from URL
    // eslint-disable-next-line cross-platform/no-hardcoded-path-separator -- URLs always use forward slashes
    const parts = url.split('/');
    const lastPart = parts[parts.length - 1];
    return lastPart.split('?')[0].split('#')[0] || 'unknown';
  }

  /**
   * Sanitize a filename for filesystem safety
   */
  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9_\-. ]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/__+/g, '_');
  }

  /**
   * Check if all dependencies are downloaded
   */
  areAllDependenciesDownloaded(result: ResolutionResult): boolean {
    return result.missingCount === 0;
  }

  /**
   * Get list of missing dependencies
   */
  getMissingDependencies(result: ResolutionResult): DependencyNode[] {
    return result.allDependencies.filter(
      (dep) => dep.sourceType === 'file' && !dep.isDownloaded
    );
  }
}

export default HtmlDependencyResolver;
