/**
 * Canvas File Protocol Handler
 * Handles canvas-file:// protocol for serving local/network files
 * URL format: canvas-file://{canvasFileId}/{filename}
 */

import { net, protocol } from 'electron';
import fs from 'fs';
import path from 'path';
import type { Database } from '../layers/l1-persistence';
import type { Logger } from '../layers/l0-utilities/Logger';
import type { CredentialManager } from '../layers/l0-utilities/CredentialManager';

export interface CanvasFileProtocolConfig {
  database: Database;
  logger: Logger;
  credentialManager: CredentialManager;
  filesDir: string;
}

/**
 * MIME type mappings for common file extensions
 */
const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.txt': 'text/plain',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

/**
 * Register the canvas-file:// protocol handler
 */
export function registerCanvasFileProtocol(config: CanvasFileProtocolConfig): void {
  const { database, logger, credentialManager, filesDir } = config;

  protocol.handle('canvas-file', async (request) => {
    const url = new URL(request.url);
    let canvasFileId = url.hostname; // The file ID is in the hostname part
    const requestedPath = url.pathname;

    logger.info(`[canvas-file] Protocol request received: ${request.url}`);
    logger.info(
      `[canvas-file] Raw hostname: ${canvasFileId}, pathname: ${requestedPath}`
    );

    // JavaScript's URL parser converts numeric hostnames to IP addresses
    // e.g., canvas-file://41584900/file.pdf becomes hostname "2.122.137.4"
    // Convert IP-style hostname back to the original number
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(canvasFileId)) {
      const parts = canvasFileId.split('.').map(Number);
      const numericId = (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
      // Use unsigned conversion for large numbers
      const unsignedId = numericId >>> 0;
      canvasFileId = String(unsignedId);
      logger.info(
        `[canvas-file] Converted IP-style hostname to file ID: ${canvasFileId}`
      );
    }

    logger.info(`[canvas-file] Resolved fileId: ${canvasFileId}`);

    // Look up the resource in the database
    const resource = database.executeReadOne<{
      local_path: string | null;
      url: string | null;
    }>('SELECT local_path, url FROM resources WHERE external_id = ?', [canvasFileId]);

    logger.info(`[canvas-file] DB lookup result: ${JSON.stringify(resource)}`);

    if (resource?.local_path && fs.existsSync(resource.local_path)) {
      // Local file exists - serve it
      logger.info(`[canvas-file] Serving LOCAL file: ${resource.local_path}`);
      return net.fetch(`file://${resource.local_path}`);
    } else if (resource?.local_path) {
      logger.warn(
        `[canvas-file] local_path set but file doesn't exist: ${resource.local_path}`
      );
    }

    if (resource?.url) {
      // Fall back to Canvas URL - download locally first, then serve
      logger.info(`[canvas-file] Falling back to NETWORK URL: ${resource.url}`);

      try {
        // Get auth token for Canvas request
        const token = await credentialManager.retrieve();
        const headers: Record<string, string> = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        logger.info(`[canvas-file] Downloading file from Canvas...`);
        const response = await net.fetch(resource.url, { headers });

        if (!response.ok) {
          logger.error(
            `[canvas-file] Canvas fetch failed: ${response.status} ${response.statusText}`
          );
          return new Response(`Failed to fetch from Canvas: ${response.status}`, {
            status: response.status,
          });
        }

        // Get the file content
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Determine filename from URL path (URLs always use forward slashes)
        const filename = decodeURIComponent(
          requestedPath.split(/[/\\]/).pop() || `file_${canvasFileId}`
        );

        // Get course info to determine save location
        const resourceInfo = database.executeReadOne<{
          course_id: number;
          folder_path: string | null;
        }>('SELECT course_id, folder_path FROM resources WHERE external_id = ?', [
          canvasFileId,
        ]);

        if (resourceInfo) {
          const courseInfo = database.executeReadOne<{ code: string }>(
            'SELECT code FROM courses WHERE id = ?',
            [resourceInfo.course_id]
          );

          if (courseInfo) {
            // Sanitize course code for file system (replace spaces with underscores)
            const sanitizedCode = courseInfo.code
              .replace(/[^a-zA-Z0-9_\-. ]/g, '_')
              .replace(/\s+/g, '_');
            // Save to course folder
            const courseFolder = path.join(filesDir, sanitizedCode);
            const targetFolder = resourceInfo.folder_path
              ? path.join(courseFolder, resourceInfo.folder_path)
              : courseFolder;

            // Ensure folder exists
            if (!fs.existsSync(targetFolder)) {
              fs.mkdirSync(targetFolder, { recursive: true });
            }

            const localPath = path.join(targetFolder, filename);
            fs.writeFileSync(localPath, buffer);
            logger.info(`[canvas-file] Saved file to: ${localPath}`);

            // Update database with local_path
            database.executeWrite(
              'UPDATE resources SET local_path = ? WHERE external_id = ?',
              [localPath, canvasFileId],
              'resources'
            );
            logger.info(`[canvas-file] Updated database with local_path`);
          }
        }

        // Determine content type from filename
        const ext = path.extname(filename).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        // Return response with proper content-type for inline display
        logger.info(`[canvas-file] Serving downloaded content as ${contentType}`);
        return new Response(buffer, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Content-Length': String(buffer.length),
          },
        });
      } catch (err) {
        logger.error(`[canvas-file] Error downloading from Canvas: ${err}`);
        return new Response(`Error fetching file: ${err}`, { status: 500 });
      }
    } else {
      // Resource not found
      logger.warn(
        `[canvas-file] Resource not found in DB for external_id: ${canvasFileId}`
      );
      return new Response('File not found', { status: 404 });
    }
  });

  logger.info('Registered canvas-file:// protocol handler');
}
