/**
 * Download coordination for HTML embedded resources
 *
 * Creates download requests for resources embedded in HTML content,
 * checking existing downloads to avoid duplicates.
 */

import fs from 'fs';
import type { Database } from '../../../l1-persistence';
import type { DownloadRequest } from '../../../l0-utilities/FileDownloadManager';
import type { HtmlContentSyncConfig } from '../../DaemonConfig';
import type { ComponentLogger } from '../../../l0-utilities/Logger';
import type { ExtractedResource } from './resourceExtraction';
import type { HtmlContentItem } from '../HtmlContentSync';
import { getContentFolder } from './urlRewriting';

/**
 * Create download requests for resources embedded in HTML content.
 * Skips files that are already downloaded via normal sync.
 */
export function createDownloadRequests(
  resources: ExtractedResource[],
  item: HtmlContentItem,
  config: HtmlContentSyncConfig,
  baseUrl: string,
  authToken: string | undefined,
  db: Database,
  log?: ComponentLogger | null
): DownloadRequest[] {
  const folder = getContentFolder(item);
  const requests: DownloadRequest[] = [];

  log?.info(
    `createDownloadRequests: Processing ${resources.length} resources for ${item.sourceType}-${item.sourceId}`
  );

  for (const resource of resources) {
    log?.info(
      `createDownloadRequests: Checking resource: filename="${resource.filename}" canvasFileId="${resource.canvasFileId}" type="${resource.type}" url="${resource.originalUrl}"`
    );

    // Skip non-downloadable resources (external embeds, etc.)
    if (resource.type === 'embed' && !resource.originalUrl.includes(baseUrl)) {
      log?.info(`createDownloadRequests: Skipping - external embed`);
      continue;
    }

    // Skip if not configured to download this type
    if (resource.type === 'image' && !config.downloadImages) {
      log?.info(`createDownloadRequests: Skipping - images disabled`);
      continue;
    }
    if (resource.type === 'file' && !config.downloadLinkedFiles) {
      log?.info(`createDownloadRequests: Skipping - linked files disabled`);
      continue;
    }

    // Check if file is already downloaded via normal sync
    if (resource.canvasFileId) {
      log?.info(
        `createDownloadRequests: Looking up canvasFileId="${resource.canvasFileId}" in DB`
      );
      const existingFile = db.executeReadOne<{ local_path: string | null }>(
        'SELECT local_path FROM resources WHERE external_id = ?',
        [resource.canvasFileId]
      );

      log?.info(
        `createDownloadRequests: DB lookup result: ${JSON.stringify(existingFile)}`
      );

      if (existingFile?.local_path) {
        const fileExists = fs.existsSync(existingFile.local_path);
        log?.info(
          `createDownloadRequests: local_path="${existingFile.local_path}" exists on disk: ${fileExists}`
        );
        if (fileExists) {
          log?.info(
            `createDownloadRequests: SKIPPING ${resource.filename} - already downloaded`
          );
          continue; // File already exists, skip download
        }
      }
    } else {
      log?.info(`createDownloadRequests: No canvasFileId for this resource`);
    }

    // Build full URL if relative
    let url = resource.originalUrl;
    if (!url.startsWith('http')) {
      url = new URL(url, baseUrl).toString();
    }

    const requestId = `${item.sourceType}-${item.sourceId}-${resource.filename}`;
    log?.info(
      `createDownloadRequests: ADDING to download queue: id="${requestId}" filename="${resource.filename}" url="${url}"`
    );

    requests.push({
      id: requestId,
      url,
      courseCode: item.courseCode,
      filename: resource.filename,
      authToken,
      contextFolder: folder,
    });
  }

  log?.info(`createDownloadRequests: Total requests queued: ${requests.length}`);
  return requests;
}
