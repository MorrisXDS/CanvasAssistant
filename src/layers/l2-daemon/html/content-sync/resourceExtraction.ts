/**
 * Resource extraction from HTML content
 *
 * Extracts embedded resources (images, files, embeds, stylesheets) from HTML,
 * resolves filenames from Canvas database, and sanitizes file system names.
 */

import path from 'path';
import type { Database } from '../../../l1-persistence';
import type { ComponentLogger } from '../../../l0-utilities/Logger';

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
 * Extract all resources from HTML content
 */
export function extractResources(
  html: string,
  baseUrl: string,
  log?: ComponentLogger | null
): ExtractedResource[] {
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
      const filename = extractFilename(url, pattern.name, baseUrl, log);

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
 * Use resolveResourceFilenames() to get the actual filename after extraction.
 */
export function extractFilename(
  url: string,
  type: ExtractedResource['type'],
  baseUrl: string,
  log?: ComponentLogger | null
): string {
  try {
    // Try to get filename from URL path
    const urlObj = new URL(url, baseUrl);
    const pathname = urlObj.pathname;
    // URL paths always use forward slashes regardless of platform
    // eslint-disable-next-line cross-platform/no-hardcoded-path-separator
    const segments = pathname.split('/').filter(Boolean);

    if (segments.length > 0) {
      let filename = segments[segments.length - 1];

      // Remove query parameters from filename
      filename = filename.split('?')[0];

      log?.debug(`extractFilename: url="${url}" lastSegment="${filename}"`);

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
          log?.debug(
            `extractFilename: Created placeholder canvas_file_${fileIdMatch[1]}`
          );
          return `canvas_file_${fileIdMatch[1]}`;
        }
      }

      // If no extension, add one based on type
      if (!path.extname(filename)) {
        const ext = getDefaultExtension(type);
        filename = `${filename}${ext}`;
      }

      return sanitizeFilename(filename);
    }
  } catch {
    // URL parsing failed
  }

  // Fallback: generate filename based on type
  const timestamp = Date.now();
  const ext = getDefaultExtension(type);
  return `resource_${timestamp}${ext}`;
}

/**
 * Look up the actual filename for a Canvas file ID from the resources table
 */
function lookupFilenameByCanvasId(
  canvasFileId: string,
  db: Database,
  log?: ComponentLogger | null
): string | null {
  log?.debug(`lookupFilenameByCanvasId: Looking up file ID "${canvasFileId}"`);

  const resource = db.executeReadOne<{ title: string; local_path: string | null }>(
    `SELECT title, local_path FROM resources WHERE external_id = ?`,
    [canvasFileId]
  );

  if (resource) {
    log?.debug(
      `lookupFilenameByCanvasId: Found resource title="${resource.title}" local_path="${resource.local_path}"`
    );
    // Prefer local_path filename if available (it has the original extension)
    if (resource.local_path) {
      return path.basename(resource.local_path);
    }
    // Fall back to title
    return sanitizeFilename(resource.title);
  }

  log?.debug(`lookupFilenameByCanvasId: No resource found for file ID "${canvasFileId}"`);
  return null;
}

/**
 * Resolve placeholder filenames to actual names from the database
 */
export function resolveResourceFilenames(
  resources: ExtractedResource[],
  db: Database,
  log?: ComponentLogger | null
): ExtractedResource[] {
  log?.debug(`resolveResourceFilenames: Processing ${resources.length} resources`);

  return resources.map((resource) => {
    log?.debug(
      `resolveResourceFilenames: filename="${resource.filename}" canvasFileId="${resource.canvasFileId}" originalUrl="${resource.originalUrl}"`
    );

    // Check if filename is a placeholder (canvas_file_12345)
    const placeholderMatch = resource.filename.match(/^canvas_file_(\d+)$/);
    if (placeholderMatch && resource.canvasFileId) {
      const actualFilename = lookupFilenameByCanvasId(resource.canvasFileId, db, log);
      if (actualFilename) {
        log?.debug(`resolveResourceFilenames: Resolved to "${actualFilename}"`);
        return { ...resource, filename: actualFilename };
      }
      // If not found in DB, keep the placeholder but add proper extension
      const ext = getDefaultExtension(resource.type);
      const fallbackFilename = `file_${resource.canvasFileId}${ext}`;
      log?.debug(`resolveResourceFilenames: Using fallback "${fallbackFilename}"`);
      return { ...resource, filename: fallbackFilename };
    }
    return resource;
  });
}

/**
 * Get default extension for resource type
 */
export function getDefaultExtension(type: ExtractedResource['type']): string {
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
export function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 255);
}

/**
 * Sanitize a path component
 */
export function sanitizePathComponent(component: string): string {
  return component.replace(/[^a-zA-Z0-9_\-. ]/g, '_').replace(/\s+/g, '_');
}

/**
 * Get MIME type from file extension
 */
export function getMimeTypeFromExtension(ext: string): string {
  const mimeTypes: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
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
