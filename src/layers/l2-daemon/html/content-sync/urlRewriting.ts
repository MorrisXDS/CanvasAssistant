/**
 * URL rewriting for offline HTML access
 *
 * Rewrites Canvas URLs in HTML content to use relative file paths,
 * enabling offline viewing in any browser.
 */

import fs from 'fs';
import path from 'path';
import type { Database } from '../../../l1-persistence';
import type { ComponentLogger } from '../../../l0-utilities/Logger';
import type { ExtractedResource } from './resourceExtraction';
import { sanitizePathComponent } from './resourceExtraction';
import type { HtmlContentItem } from '../HtmlContentSync';

/**
 * Rewrite URLs in HTML to use relative file paths for offline access.
 * This allows HTML files to be opened in any browser (not just Electron).
 *
 * @param html - The HTML content to rewrite
 * @param resources - Extracted resources with Canvas file IDs
 * @param htmlFolder - Folder where the HTML file is saved (e.g., "Pages", "Assignments")
 * @param db - Database instance for looking up resource paths
 * @param log - Optional logger
 */
export function rewriteHtmlUrls(
  html: string,
  resources: ExtractedResource[],
  htmlFolder: string,
  db: Database,
  log?: ComponentLogger | null
): string {
  let rewrittenHtml = html;

  for (const resource of resources) {
    if (!resource.canvasFileId) {
      // No Canvas file ID - keep original URL
      log?.debug(
        `rewriteUrls: No Canvas file ID for ${resource.originalUrl}, keeping original`
      );
      continue;
    }

    // Look up the resource's local path and folder from the database
    const existingResource = db.executeReadOne<{
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
      newUrl = calculateRelativePath(htmlFolder, resourceFolder, filename);
      log?.debug(`rewriteUrls: ${resource.originalUrl} -> ${newUrl} (local file exists)`);
    } else if (existingResource?.folder_path) {
      // Resource not downloaded yet - use expected relative path based on folder_path
      // This works if the user downloads the resource later to the expected location
      newUrl = calculateRelativePath(
        htmlFolder,
        existingResource.folder_path,
        resource.filename
      );
      log?.debug(`rewriteUrls: ${resource.originalUrl} -> ${newUrl} (expected path)`);
    } else {
      // No folder info - put in course root and use relative path
      newUrl = calculateRelativePath(htmlFolder, '', resource.filename);
      log?.debug(`rewriteUrls: ${resource.originalUrl} -> ${newUrl} (fallback to root)`);
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
export function calculateRelativePath(
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
 * Get the folder path for an HTML content item
 */
export function getContentFolder(item: HtmlContentItem): string {
  if (item.moduleName) {
    return sanitizePathComponent(item.moduleName);
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
 * Escape HTML entities
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
