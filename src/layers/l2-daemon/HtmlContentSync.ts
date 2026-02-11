/**
 * HtmlContentSync - Sync HTML content and embedded resources
 *
 * Extracts and saves HTML content from Canvas (pages, assignments, announcements)
 * along with embedded resources (images, files). Optionally rewrites URLs for
 * offline access.
 */

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { Database } from '../l1-persistence/Database';
import {
  FileDownloadManager,
  DownloadRequest,
} from '../l0-utilities/FileDownloadManager';
import { HtmlContentSyncConfig } from './DaemonConfig';
import type { ComponentLogger } from '../l0-utilities/Logger';

/**
 * Represents an extracted resource from HTML content
 */
export interface ExtractedResource {
  /** Original URL in the HTML */
  originalUrl: string;
  /** Canvas file ID if applicable */
  canvasFileId?: string;
  /** Resource type */
  type: 'image' | 'file' | 'embed' | 'stylesheet' | 'script';
  /** Suggested filename */
  filename: string;
  /** The HTML attribute that contained this URL (src, href, etc.) */
  attribute: string;
}

/**
 * Represents HTML content to be saved
 */
export interface HtmlContentItem {
  /** Source type (page, assignment, announcement) */
  sourceType: 'page' | 'assignment' | 'announcement' | 'syllabus';
  /** Source identifier (external_id or url slug) */
  sourceId: string;
  /** Content title */
  title: string;
  /** HTML content body */
  htmlContent: string;
  /** Course ID (local) */
  courseId: number;
  /** Course code for folder organization */
  courseCode: string;
  /** Module name if linked to a module */
  moduleName?: string;
}

/**
 * Result of syncing HTML content
 */
export interface HtmlContentSyncResult {
  /** Number of HTML content items registered */
  itemsRegistered: number;
  /** Number of embedded resources found */
  resourcesFound: number;
  /** Errors encountered */
  errors: string[];
}

/**
 * Configuration for HtmlContentSync
 */
export interface HtmlContentSyncOptions {
  db: Database;
  downloadManager: FileDownloadManager;
  config: HtmlContentSyncConfig;
  authToken?: string;
  baseUrl: string;
  /** Optional logger for debug output */
  logger?: ComponentLogger;
}

/**
 * Pattern definitions for extracting resources from HTML
 */
const RESOURCE_PATTERNS: Array<{
  name: ExtractedResource['type'];
  regex: RegExp;
  attribute: string;
  urlGroup: number;
}> = [
  // Images with src attribute
  {
    name: 'image',
    regex: /<img[^>]+src=["']([^"']+)["']/gi,
    attribute: 'src',
    urlGroup: 1,
  },
  // Images with data-src (lazy loading)
  {
    name: 'image',
    regex: /<img[^>]+data-src=["']([^"']+)["']/gi,
    attribute: 'data-src',
    urlGroup: 1,
  },
  // Canvas file links via href
  {
    name: 'file',
    regex: /<a[^>]+href=["']([^"']*\/files\/\d+[^"']*)["']/gi,
    attribute: 'href',
    urlGroup: 1,
  },
  // Embedded iframes
  {
    name: 'embed',
    regex: /<iframe[^>]+src=["']([^"']+)["']/gi,
    attribute: 'src',
    urlGroup: 1,
  },
  // Stylesheets
  {
    name: 'stylesheet',
    regex: /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi,
    attribute: 'href',
    urlGroup: 1,
  },
  // Background images in style attributes
  {
    name: 'image',
    regex: /style=["'][^"']*url\(["']?([^"')]+)["']?\)[^"']*["']/gi,
    attribute: 'style',
    urlGroup: 1,
  },
];

/**
 * Pattern for extracting Canvas file IDs from URLs
 */
const FILE_ID_PATTERN = /\/files\/(\d+)/;

/**
 * HtmlContentSync service
 */
export class HtmlContentSync extends EventEmitter {
  private db: Database;
  private downloadManager: FileDownloadManager;
  private config: HtmlContentSyncConfig;
  private authToken?: string;
  private baseUrl: string;
  private log: ComponentLogger | null;

  constructor(options: HtmlContentSyncOptions) {
    super();
    this.db = options.db;
    this.downloadManager = options.downloadManager;
    this.config = options.config;
    this.authToken = options.authToken;
    this.baseUrl = options.baseUrl;
    this.log = options.logger ?? null;
  }

  /**
   * Extract all resources from HTML content
   */
  extractResources(html: string): ExtractedResource[] {
    if (!html || typeof html !== 'string') {
      return [];
    }

    const resources: ExtractedResource[] = [];
    const seenUrls = new Set<string>();

    for (const pattern of RESOURCE_PATTERNS) {
      pattern.regex.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = pattern.regex.exec(html)) !== null) {
        const url = match[pattern.urlGroup];

        // Skip empty, data URIs, or already seen URLs
        if (!url || url.startsWith('data:') || seenUrls.has(url)) {
          continue;
        }

        seenUrls.add(url);

        // Extract Canvas file ID if present
        const fileIdMatch = url.match(FILE_ID_PATTERN);
        const canvasFileId = fileIdMatch ? fileIdMatch[1] : undefined;

        // Generate filename from URL
        const filename = this.extractFilename(url, pattern.name);

        resources.push({
          originalUrl: url,
          canvasFileId,
          type: pattern.name,
          filename,
          attribute: pattern.attribute,
        });
      }
    }

    return resources;
  }

  /**
   * Extract a filename from a URL
   * Note: For Canvas file URLs like /files/123/download, the filename is not in the URL.
   * Use lookupFilenameByCanvasId() to get the actual filename after extraction.
   */
  private extractFilename(url: string, type: ExtractedResource['type']): string {
    try {
      // Try to get filename from URL path
      const urlObj = new URL(url, this.baseUrl);
      const pathname = urlObj.pathname;
      // URL paths always use forward slashes regardless of platform
      // eslint-disable-next-line cross-platform/no-hardcoded-path-separator
      const segments = pathname.split('/').filter(Boolean);

      if (segments.length > 0) {
        let filename = segments[segments.length - 1];

        // Remove query parameters from filename
        filename = filename.split('?')[0];

        this.log?.debug(`extractFilename: url="${url}" lastSegment="${filename}"`);

        // Canvas URLs may end in:
        // - 'download' or 'preview' (not real filenames)
        // - A numeric ID like '41584900' (Canvas file ID, not actual filename)
        // Use the file ID as a placeholder so we can look up the actual name later
        const isCanvasPlaceholder =
          filename === 'download' || filename === 'preview' || /^\d+$/.test(filename); // Pure numeric = likely Canvas file ID

        if (isCanvasPlaceholder) {
          // Find the file ID in the URL (e.g., /files/12345/download or /files/12345)
          const fileIdMatch = pathname.match(/\/files\/(\d+)/);
          if (fileIdMatch) {
            // Return a placeholder with the file ID - we'll resolve the actual name later
            this.log?.debug(
              `extractFilename: Created placeholder canvas_file_${fileIdMatch[1]}`
            );
            return `canvas_file_${fileIdMatch[1]}`;
          }
        }

        // If no extension, add one based on type
        if (!path.extname(filename)) {
          const ext = this.getDefaultExtension(type);
          filename = `${filename}${ext}`;
        }

        return this.sanitizeFilename(filename);
      }
    } catch {
      // URL parsing failed
    }

    // Fallback: generate filename based on type
    const timestamp = Date.now();
    const ext = this.getDefaultExtension(type);
    return `resource_${timestamp}${ext}`;
  }

  /**
   * Look up the actual filename for a Canvas file ID from the resources table
   */
  private lookupFilenameByCanvasId(canvasFileId: string): string | null {
    this.log?.debug(`lookupFilenameByCanvasId: Looking up file ID "${canvasFileId}"`);

    const resource = this.db.executeReadOne<{ title: string; local_path: string | null }>(
      `SELECT title, local_path FROM resources WHERE external_id = ?`,
      [canvasFileId]
    );

    if (resource) {
      this.log?.debug(
        `lookupFilenameByCanvasId: Found resource title="${resource.title}" local_path="${resource.local_path}"`
      );
      // Prefer local_path filename if available (it has the original extension)
      if (resource.local_path) {
        return path.basename(resource.local_path);
      }
      // Fall back to title
      return this.sanitizeFilename(resource.title);
    }

    this.log?.debug(
      `lookupFilenameByCanvasId: No resource found for file ID "${canvasFileId}"`
    );
    return null;
  }

  /**
   * Resolve placeholder filenames to actual names from the database
   */
  private resolveResourceFilenames(resources: ExtractedResource[]): ExtractedResource[] {
    this.log?.debug(`resolveResourceFilenames: Processing ${resources.length} resources`);

    return resources.map((resource) => {
      this.log?.debug(
        `resolveResourceFilenames: filename="${resource.filename}" canvasFileId="${resource.canvasFileId}" originalUrl="${resource.originalUrl}"`
      );

      // Check if filename is a placeholder (canvas_file_12345)
      const placeholderMatch = resource.filename.match(/^canvas_file_(\d+)$/);
      if (placeholderMatch && resource.canvasFileId) {
        const actualFilename = this.lookupFilenameByCanvasId(resource.canvasFileId);
        if (actualFilename) {
          this.log?.debug(`resolveResourceFilenames: Resolved to "${actualFilename}"`);
          return { ...resource, filename: actualFilename };
        }
        // If not found in DB, keep the placeholder but add proper extension
        const ext = this.getDefaultExtension(resource.type);
        const fallbackFilename = `file_${resource.canvasFileId}${ext}`;
        this.log?.debug(`resolveResourceFilenames: Using fallback "${fallbackFilename}"`);
        return { ...resource, filename: fallbackFilename };
      }
      return resource;
    });
  }

  /**
   * Get default extension for resource type
   */
  private getDefaultExtension(type: ExtractedResource['type']): string {
    switch (type) {
      case 'image':
        return '.png';
      case 'file':
        return '.pdf';
      case 'embed':
        return '.html';
      case 'stylesheet':
        return '.css';
      case 'script':
        return '.js';
      default:
        return '.bin';
    }
  }

  /**
   * Sanitize a filename for filesystem
   */
  private sanitizeFilename(filename: string): string {
    return filename.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 255);
  }

  /**
   * Sanitize a path component
   */
  private sanitizePathComponent(component: string): string {
    return component.replace(/[^a-zA-Z0-9_\-. ]/g, '_').replace(/\s+/g, '_');
  }

  /**
   * Get the folder path for an HTML content item
   */
  private getContentFolder(item: HtmlContentItem): string {
    if (item.moduleName) {
      return this.sanitizePathComponent(item.moduleName);
    }

    switch (item.sourceType) {
      case 'page':
        return 'Pages';
      case 'assignment':
        return 'Assignments';
      case 'announcement':
        return 'Announcements';
      case 'syllabus':
        return 'Syllabus';
      default:
        return 'Other';
    }
  }

  /**
   * Rewrite URLs in HTML to use relative file paths for offline access.
   * This allows HTML files to be opened in any browser (not just Electron).
   *
   * @param html - The HTML content to rewrite
   * @param resources - Extracted resources with Canvas file IDs
   * @param htmlFolder - Folder where the HTML file is saved (e.g., "Pages", "Assignments")
   */
  rewriteUrls(html: string, resources: ExtractedResource[], htmlFolder: string): string {
    let rewrittenHtml = html;

    for (const resource of resources) {
      if (!resource.canvasFileId) {
        // No Canvas file ID - keep original URL
        this.log?.debug(
          `rewriteUrls: No Canvas file ID for ${resource.originalUrl}, keeping original`
        );
        continue;
      }

      // Look up the resource's local path and folder from the database
      const existingResource = this.db.executeReadOne<{
        local_path: string | null;
        folder_path: string | null;
      }>('SELECT local_path, folder_path FROM resources WHERE external_id = ?', [
        resource.canvasFileId,
      ]);

      let newUrl: string;

      if (existingResource?.local_path && fs.existsSync(existingResource.local_path)) {
        // Resource is downloaded - use relative path
        const resourceFolder = existingResource.folder_path || '';
        const filename = path.basename(existingResource.local_path);
        newUrl = this.calculateRelativePath(htmlFolder, resourceFolder, filename);
        this.log?.debug(
          `rewriteUrls: ${resource.originalUrl} -> ${newUrl} (local file exists)`
        );
      } else if (existingResource?.folder_path) {
        // Resource not downloaded yet - use expected relative path based on folder_path
        // This works if the user downloads the resource later to the expected location
        newUrl = this.calculateRelativePath(
          htmlFolder,
          existingResource.folder_path,
          resource.filename
        );
        this.log?.debug(
          `rewriteUrls: ${resource.originalUrl} -> ${newUrl} (expected path)`
        );
      } else {
        // No folder info - put in course root and use relative path
        newUrl = this.calculateRelativePath(htmlFolder, '', resource.filename);
        this.log?.debug(
          `rewriteUrls: ${resource.originalUrl} -> ${newUrl} (fallback to root)`
        );
      }

      // Replace all occurrences of the original URL
      rewrittenHtml = rewrittenHtml.split(resource.originalUrl).join(newUrl);
    }

    return rewrittenHtml;
  }

  /**
   * Calculate relative path from source folder to target folder + filename
   * @param sourceFolder - Folder where the HTML is (e.g., "Pages")
   * @param targetFolder - Folder where the file is (e.g., "Lecture Notes" or "" for root)
   * @param filename - The filename
   */
  private calculateRelativePath(
    sourceFolder: string,
    targetFolder: string,
    filename: string
  ): string {
    // Normalize folders (handle empty/null as root)
    const source = sourceFolder || '';
    const target = targetFolder || '';

    if (source === target) {
      // Same folder
      return `./${filename}`;
    }

    // Split into path segments
    const sourceParts = source ? source.split(/[/\\]/).filter(Boolean) : [];
    const targetParts = target ? target.split(/[/\\]/).filter(Boolean) : [];

    // Find common prefix
    let commonLength = 0;
    while (
      commonLength < sourceParts.length &&
      commonLength < targetParts.length &&
      sourceParts[commonLength] === targetParts[commonLength]
    ) {
      commonLength++;
    }

    // Build relative path
    // Go up for each remaining source segment
    const upCount = sourceParts.length - commonLength;
    const ups = Array(upCount).fill('..').join('/');

    // Go down into remaining target segments
    const downs = targetParts.slice(commonLength).join('/');

    // Combine
    let relativePath = '';
    if (ups) {
      relativePath = ups;
      if (downs) {
        relativePath += '/' + downs;
      }
    } else if (downs) {
      relativePath = './' + downs;
    } else {
      relativePath = '.';
    }

    return relativePath + '/' + filename;
  }

  /**
   * Save HTML content to disk and register in resources table
   */
  saveHtmlFile(
    item: HtmlContentItem,
    html: string,
    baseDir: string
  ): { success: boolean; localPath?: string; error?: string } {
    try {
      const folder = this.getContentFolder(item);
      const courseDir = path.join(baseDir, this.sanitizePathComponent(item.courseCode));
      const contentDir = path.join(courseDir, folder);

      // Ensure directory exists
      if (!fs.existsSync(contentDir)) {
        fs.mkdirSync(contentDir, { recursive: true });
      }

      // Generate filename from title
      const filename = `${this.sanitizeFilename(item.title)}.html`;
      let localPath = path.join(contentDir, filename);
      let finalFilename = filename;

      // Handle duplicates
      if (fs.existsSync(localPath)) {
        const ext = path.extname(filename);
        const base = path.basename(filename, ext);
        let counter = 1;
        while (fs.existsSync(localPath)) {
          finalFilename = `${base}_${counter}${ext}`;
          localPath = path.join(contentDir, finalFilename);
          counter++;
        }
      }

      // Wrap content in a basic HTML document if not already
      let fullHtml = html;
      if (
        !html.trim().toLowerCase().startsWith('<!doctype') &&
        !html.trim().toLowerCase().startsWith('<html')
      ) {
        fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(item.title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; padding: 20px; max-width: 800px; margin: 0 auto; }
    img { max-width: 100%; height: auto; }
    a { color: #0066cc; }
    pre, code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
    pre { padding: 12px; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>${this.escapeHtml(item.title)}</h1>
  ${html}
</body>
</html>`;
      }

      fs.writeFileSync(localPath, fullHtml, 'utf-8');

      // Get file size
      const stats = fs.statSync(localPath);

      // Register in resources table for Files page visibility
      const externalId = `html-${item.sourceType}-${item.sourceId}`;
      // folder_path is relative to course folder (no course prefix needed)
      const folderPath = folder;

      this.db.executeWrite(
        `INSERT INTO resources (external_id, course_id, type, title, local_path, folder_path, size_bytes, mime_type, context_type, context_id, synced_at)
         VALUES (?, ?, 'page', ?, ?, ?, ?, 'text/html', ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(external_id) DO UPDATE SET
           local_path = excluded.local_path,
           size_bytes = excluded.size_bytes,
           synced_at = CURRENT_TIMESTAMP`,
        [
          externalId,
          item.courseId,
          item.title,
          localPath,
          folderPath,
          stats.size,
          item.sourceType,
          item.sourceId,
        ],
        'resources'
      );

      return { success: true, localPath };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  /**
   * Escape HTML entities
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Create download requests for resources
   * Skips files that are already downloaded via normal sync
   */
  createDownloadRequests(
    resources: ExtractedResource[],
    item: HtmlContentItem
  ): DownloadRequest[] {
    const folder = this.getContentFolder(item);
    const requests: DownloadRequest[] = [];

    this.log?.info(
      `createDownloadRequests: Processing ${resources.length} resources for ${item.sourceType}-${item.sourceId}`
    );

    for (const resource of resources) {
      this.log?.info(
        `createDownloadRequests: Checking resource: filename="${resource.filename}" canvasFileId="${resource.canvasFileId}" type="${resource.type}" url="${resource.originalUrl}"`
      );

      // Skip non-downloadable resources (external embeds, etc.)
      if (resource.type === 'embed' && !resource.originalUrl.includes(this.baseUrl)) {
        this.log?.info(`createDownloadRequests: Skipping - external embed`);
        continue;
      }

      // Skip if not configured to download this type
      if (resource.type === 'image' && !this.config.downloadImages) {
        this.log?.info(`createDownloadRequests: Skipping - images disabled`);
        continue;
      }
      if (resource.type === 'file' && !this.config.downloadLinkedFiles) {
        this.log?.info(`createDownloadRequests: Skipping - linked files disabled`);
        continue;
      }

      // Check if file is already downloaded via normal sync
      if (resource.canvasFileId) {
        this.log?.info(
          `createDownloadRequests: Looking up canvasFileId="${resource.canvasFileId}" in DB`
        );
        const existingFile = this.db.executeReadOne<{ local_path: string | null }>(
          'SELECT local_path FROM resources WHERE external_id = ?',
          [resource.canvasFileId]
        );

        this.log?.info(
          `createDownloadRequests: DB lookup result: ${JSON.stringify(existingFile)}`
        );

        if (existingFile?.local_path) {
          const fileExists = fs.existsSync(existingFile.local_path);
          this.log?.info(
            `createDownloadRequests: local_path="${existingFile.local_path}" exists on disk: ${fileExists}`
          );
          if (fileExists) {
            this.log?.info(
              `createDownloadRequests: SKIPPING ${resource.filename} - already downloaded`
            );
            continue; // File already exists, skip download
          }
        }
      } else {
        this.log?.info(`createDownloadRequests: No canvasFileId for this resource`);
      }

      // Build full URL if relative
      let url = resource.originalUrl;
      if (!url.startsWith('http')) {
        url = new URL(url, this.baseUrl).toString();
      }

      const requestId = `${item.sourceType}-${item.sourceId}-${resource.filename}`;
      this.log?.info(
        `createDownloadRequests: ADDING to download queue: id="${requestId}" filename="${resource.filename}" url="${url}"`
      );

      requests.push({
        id: requestId,
        url,
        courseCode: item.courseCode,
        filename: resource.filename,
        authToken: this.authToken,
        contextFolder: folder,
      });
    }

    this.log?.info(`createDownloadRequests: Total requests queued: ${requests.length}`);
    return requests;
  }

  /**
   * Sync HTML content for a course
   */
  async syncCourseHtmlContent(
    localCourseId: number,
    baseDir: string
  ): Promise<HtmlContentSyncResult> {
    this.log?.debug(`Starting sync for course ${localCourseId}, baseDir: ${baseDir}`);
    this.log?.debug(
      `Config: enabled=${this.config.enabled}, urlRewriting=${this.config.urlRewriting}`
    );

    const result: HtmlContentSyncResult = {
      itemsRegistered: 0,
      resourcesFound: 0,
      errors: [],
    };

    if (!this.config.enabled) {
      this.log?.debug('Skipping - disabled in config');
      return result;
    }

    // Get course info
    const course = this.db.executeReadOne<{
      code: string;
      external_id: string;
      syllabus_body: string | null;
    }>('SELECT code, external_id, syllabus_body FROM courses WHERE id = ?', [
      localCourseId,
    ]);

    if (!course) {
      result.errors.push('Course not found');
      return result;
    }

    const items: HtmlContentItem[] = [];

    // Collect pages
    const pages = this.db.executeRead<{
      external_id: string;
      title: string;
      body_html: string | null;
      module_id: number | null;
    }>(
      `SELECT p.external_id, p.title, p.body_html, mi.module_id
       FROM course_pages p
       LEFT JOIN module_items mi ON mi.content_id = CAST(p.external_id AS INTEGER) AND mi.item_type = 'Page'
       WHERE p.course_id = ? AND p.body_html IS NOT NULL`,
      [localCourseId]
    );

    for (const page of pages) {
      if (!page.body_html) continue;

      let moduleName: string | undefined;
      if (page.module_id) {
        const module = this.db.executeReadOne<{ name: string }>(
          'SELECT name FROM modules WHERE id = ?',
          [page.module_id]
        );
        moduleName = module?.name;
      }

      items.push({
        sourceType: 'page',
        sourceId: page.external_id,
        title: page.title,
        htmlContent: page.body_html,
        courseId: localCourseId,
        courseCode: course.code,
        moduleName,
      });
    }

    // Collect announcements
    const announcements = this.db.executeRead<{
      source_id: string;
      title: string;
      message_html: string | null;
    }>(
      `SELECT source_id, title, message_html FROM notifications
       WHERE course_id = ? AND source_type = 'canvas' AND message_html IS NOT NULL`,
      [localCourseId]
    );

    for (const ann of announcements) {
      if (!ann.message_html) continue;

      items.push({
        sourceType: 'announcement',
        sourceId: ann.source_id,
        title: ann.title,
        htmlContent: ann.message_html,
        courseId: localCourseId,
        courseCode: course.code,
      });
    }

    // Collect assignments
    const assignments = this.db.executeRead<{
      external_id: string;
      title: string;
      description: string | null;
      module_id: number | null;
    }>(
      `SELECT t.external_id, t.title, t.description, mi.module_id
       FROM tasks t
       LEFT JOIN module_items mi ON mi.content_id = CAST(t.external_id AS INTEGER) AND mi.item_type = 'Assignment'
       WHERE t.course_id = ? AND t.description IS NOT NULL`,
      [localCourseId]
    );

    for (const assignment of assignments) {
      if (!assignment.description) continue;

      let moduleName: string | undefined;
      if (assignment.module_id) {
        const module = this.db.executeReadOne<{ name: string }>(
          'SELECT name FROM modules WHERE id = ?',
          [assignment.module_id]
        );
        moduleName = module?.name;
      }

      items.push({
        sourceType: 'assignment',
        sourceId: assignment.external_id,
        title: assignment.title,
        htmlContent: assignment.description,
        courseId: localCourseId,
        courseCode: course.code,
        moduleName,
      });
    }

    // Add syllabus if present
    if (course.syllabus_body) {
      items.push({
        sourceType: 'syllabus',
        sourceId: course.external_id, // Use course external_id for unique identifier
        title: 'Syllabus',
        htmlContent: course.syllabus_body,
        courseId: localCourseId,
        courseCode: course.code,
      });
    }

    // Log what we found
    const pageCount = items.filter((i) => i.sourceType === 'page').length;
    const annCount = items.filter((i) => i.sourceType === 'announcement').length;
    const assignCount = items.filter((i) => i.sourceType === 'assignment').length;
    const syllabusCount = items.filter((i) => i.sourceType === 'syllabus').length;
    this.log?.debug(
      `Found items: ${pageCount} pages, ${annCount} announcements, ${assignCount} assignments, ${syllabusCount} syllabus`
    );
    this.log?.debug(`Total items to process: ${items.length}`);

    // Register each item in resources table (no file download yet)
    for (const item of items) {
      try {
        // Count embedded resources
        const resources = this.extractResources(item.htmlContent);
        result.resourcesFound += resources.length;

        // Register in resources table as downloadable item
        const externalId = `html-${item.sourceType}-${item.sourceId}`;
        // folder_path is relative to course folder (no course prefix needed)
        const folderPath = this.getContentFolder(item);

        this.db.executeWrite(
          `INSERT INTO resources (external_id, course_id, type, title, folder_path, mime_type, context_type, context_id, synced_at)
           VALUES (?, ?, 'page', ?, ?, 'text/html', ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(external_id) DO UPDATE SET
             title = excluded.title,
             folder_path = excluded.folder_path,
             synced_at = CURRENT_TIMESTAMP`,
          [
            externalId,
            item.courseId,
            item.title,
            folderPath,
            item.sourceType,
            item.sourceId,
          ],
          'resources'
        );

        result.itemsRegistered++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(`${item.sourceType} "${item.title}": ${message}`);
      }
    }

    this.log?.debug(
      `Registered ${result.itemsRegistered} items, found ${result.resourcesFound} embedded resources`
    );

    this.emit('html-sync-complete', {
      courseId: localCourseId,
      courseCode: course.code,
      ...result,
    });

    return result;
  }

  /**
   * Download an HTML content item and its embedded resources
   * Called when user explicitly requests download from Files panel
   */
  async downloadHtmlItem(
    externalId: string,
    baseDir: string
  ): Promise<{ success: boolean; localPath?: string; error?: string }> {
    // Parse external ID to get source type and ID
    const match = externalId.match(/^html-(page|assignment|announcement|syllabus)-(.+)$/);
    if (!match) {
      return { success: false, error: 'Invalid HTML resource ID' };
    }

    const [, sourceType, sourceId] = match;

    // Get the resource record
    const resource = this.db.executeReadOne<{
      course_id: number;
      title: string;
      folder_path: string;
    }>('SELECT course_id, title, folder_path FROM resources WHERE external_id = ?', [
      externalId,
    ]);

    if (!resource) {
      return { success: false, error: 'Resource not found' };
    }

    // Get course code
    const course = this.db.executeReadOne<{ code: string }>(
      'SELECT code FROM courses WHERE id = ?',
      [resource.course_id]
    );

    if (!course) {
      return { success: false, error: 'Course not found' };
    }

    // Get the HTML content based on source type
    let htmlContent: string | null = null;
    let title = resource.title;

    if (sourceType === 'page') {
      const page = this.db.executeReadOne<{ body_html: string | null; title: string }>(
        'SELECT body_html, title FROM course_pages WHERE external_id = ?',
        [sourceId]
      );
      htmlContent = page?.body_html || null;
      title = page?.title || title;
    } else if (sourceType === 'announcement') {
      const ann = this.db.executeReadOne<{ message_html: string | null; title: string }>(
        'SELECT message_html, title FROM notifications WHERE source_id = ?',
        [sourceId]
      );
      htmlContent = ann?.message_html || null;
      title = ann?.title || title;
    } else if (sourceType === 'assignment') {
      const task = this.db.executeReadOne<{ description: string | null; title: string }>(
        'SELECT description, title FROM tasks WHERE external_id = ?',
        [sourceId]
      );
      htmlContent = task?.description || null;
      title = task?.title || title;
    } else if (sourceType === 'syllabus') {
      const courseData = this.db.executeReadOne<{ syllabus_body: string | null }>(
        'SELECT syllabus_body FROM courses WHERE id = ?',
        [resource.course_id]
      );
      htmlContent = courseData?.syllabus_body || null;
    }

    if (!htmlContent) {
      return { success: false, error: 'HTML content not found' };
    }

    // Build the item for saving
    const item: HtmlContentItem = {
      sourceType: sourceType as HtmlContentItem['sourceType'],
      sourceId,
      title,
      htmlContent,
      courseId: resource.course_id,
      courseCode: course.code,
    };

    // Extract and optionally rewrite URLs
    let resources = this.extractResources(htmlContent);

    // Resolve placeholder filenames (canvas_file_12345) to actual filenames from database
    resources = this.resolveResourceFilenames(resources);

    let htmlToSave = htmlContent;

    if (this.config.urlRewriting === 'local' && resources.length > 0) {
      const folder = this.getContentFolder(item);
      htmlToSave = this.rewriteUrls(htmlContent, resources, folder);
    }

    // Save the HTML file
    const saveResult = this.saveHtmlFile(item, htmlToSave, baseDir);

    if (saveResult.success && saveResult.localPath) {
      // Update resource record with local path
      this.db.executeWrite(
        'UPDATE resources SET local_path = ? WHERE external_id = ?',
        [saveResult.localPath, externalId],
        'resources'
      );

      // Note: Embedded resources (linked files in HTML) are NOT registered separately.
      // The canvas-file:// protocol handles on-demand downloads using the original
      // Canvas file ID. When a user clicks a link, the protocol handler:
      // 1. Looks up the resource by Canvas file ID
      // 2. Downloads from Canvas if not local
      // 3. Saves to the course folder and updates local_path
      // 4. Serves the file inline
      // This avoids duplicate entries in the Files page.
    }

    return saveResult;
  }

  /**
   * Get MIME type from file extension
   */
  private getMimeTypeFromExtension(ext: string): string {
    const mimeTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx':
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.zip': 'application/zip',
      '.txt': 'text/plain',
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.xml': 'application/xml',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
}

export default HtmlContentSync;
