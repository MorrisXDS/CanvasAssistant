/**
 * File IPC Handlers
 * Handlers for file and attachment operations:
 * - Attachment download, open, show in folder
 * - Files directory management
 * - File save dialogs
 */

import { ipcMain, dialog, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import {
  AnnouncementAttachmentReader,
  ResourceReader,
  CourseReader,
} from '../../layers/l1-persistence';
import {
  UpdateAttachmentDownloadCommand,
  ClearSyncedFilesCommand,
} from '../../layers/l4-controller/commands/file';
import { UpdateResourceLocalPathCommand } from '../../layers/l4-controller/commands/resource';
import type { IpcContext } from './IpcContext';

/**
 * Register all file-related IPC handlers
 *
 * Per ADR-0007, this file holds no raw `database.execute*` / `upsert` calls.
 * Reads route through L1 readers; writes through L4 commands. The handler keeps
 * the Canvas download queue wiring, file IO, dialogs, and directory management.
 */
export function registerFileHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();
  const metricsCollector = ctx.getMetricsCollector();
  const credentialManager = ctx.getCredentialManager();
  const fileDownloadManager = ctx.getFileDownloadManager();
  const getMainWindow = ctx.getMainWindow;

  const announcementAttachmentReader = new AnnouncementAttachmentReader(database);
  const resourceReader = new ResourceReader(database);
  const courseReader = new CourseReader(database);
  const updateAttachmentDownloadCommand = new UpdateAttachmentDownloadCommand(database);
  const clearSyncedFilesCommand = new ClearSyncedFilesCommand(database);
  const updateResourceLocalPathCommand = new UpdateResourceLocalPathCommand(database);

  // ============ Attachment Handlers ============

  // Download an attachment
  ipcMain.handle('attachment:download', async (_event, attachmentId: number) => {
    const attachment = announcementAttachmentReader.getById(attachmentId);

    if (!attachment) {
      return { success: false, error: 'Attachment not found' };
    }

    // Get course code for folder organization
    const course = courseReader.getById(attachment.course_id);

    const courseCode = course?.code || 'unknown';

    // Get auth token for Canvas download
    const token = await credentialManager.retrieve();
    if (!token) {
      return { success: false, error: 'No credentials available' };
    }

    // Dedup guard: reuse an already-downloaded course resource with the same
    // Canvas external_id rather than fetching a duplicate copy to disk.
    // Mirrors the symmetric guard in downloadCoordinator.ts:58-79.
    const existingResource = resourceReader.getDownloadedFileByExternalId(
      attachment.external_id
    );
    if (
      existingResource?.local_path &&
      !existingResource.local_path.startsWith('http://') &&
      !existingResource.local_path.startsWith('https://') &&
      fs.existsSync(existingResource.local_path)
    ) {
      updateAttachmentDownloadCommand.markDownloaded(
        attachmentId,
        existingResource.local_path,
        new Date().toISOString()
      );
      metricsCollector.increment('attachment.download.dedup_reuse');
      return { success: true, localPath: existingResource.local_path };
    }

    // Update status to downloading
    updateAttachmentDownloadCommand.setStatus(attachmentId, 'downloading');

    // Queue the download
    return new Promise((resolve) => {
      const downloadId = `attachment-${attachment.external_id}`;

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
          // Update database with local path
          updateAttachmentDownloadCommand.markDownloaded(
            attachmentId,
            result.localPath,
            new Date().toISOString()
          );
          metricsCollector.increment('attachment.download.success');
          resolve({ success: true, localPath: result.localPath });
        } else {
          updateAttachmentDownloadCommand.setStatus(attachmentId, 'failed');
          metricsCollector.increment('attachment.download.failure');
          resolve({ success: false, error: result.error || 'Download failed' });
        }
      };

      // Safety timeout to prevent listener leaks if download never completes
      const safetyTimeout = setTimeout(
        () => {
          fileDownloadManager.off('download-complete', onComplete);
          fileDownloadManager.off('download-error', onComplete);
          logger.warn(`[attachment:download] Safety timeout for download ${downloadId}`);
          resolve({ success: false, error: 'Download timed out' });
        },
        5 * 60 * 1000
      );

      fileDownloadManager.on('download-complete', onComplete);
      fileDownloadManager.on('download-error', onComplete);

      fileDownloadManager.queueDownload({
        id: downloadId,
        url: attachment.url,
        courseCode,
        filename: attachment.filename,
        authToken: token,
      });
    });
  });

  // Open a downloaded attachment file
  ipcMain.handle('attachment:open', (_event, attachmentId: number) => {
    const attachment = announcementAttachmentReader.getOpenInfoById(attachmentId);

    logger.debug(
      `[attachment:open] Attachment: ${JSON.stringify({ attachmentId, localPath: attachment?.local_path, url: attachment?.url })}`
    );

    if (!attachment?.local_path) {
      logger.debug('[attachment:open] No local_path, file not downloaded');
      return { success: false, error: 'File not downloaded' };
    }

    // Verify the local path is actually a file path, not a URL
    if (
      attachment.local_path.startsWith('http://') ||
      attachment.local_path.startsWith('https://')
    ) {
      logger.error(
        `[attachment:open] local_path is a URL, not a file path: ${attachment.local_path}`
      );
      return {
        success: false,
        error: 'Invalid local path (URL stored instead of file path)',
      };
    }

    // Check if file exists
    if (!fs.existsSync(attachment.local_path)) {
      logger.error(`[attachment:open] File does not exist: ${attachment.local_path}`);
      return { success: false, error: 'File not found on disk' };
    }

    // Use Electron's shell.openPath for cross-platform file opening
    shell.openPath(attachment.local_path).then((error: string) => {
      if (error) {
        logger.error(`[attachment:open] Failed to open: ${error}`);
      }
    });

    logger.debug('[attachment:open] Opening file with default application');
    return { success: true };
  });

  // Show attachment file in folder
  ipcMain.handle('attachment:showInFolder', (_event, attachmentId: number) => {
    const attachment = announcementAttachmentReader.getLocalPathById(attachmentId);

    if (!attachment?.local_path) {
      return { success: false, error: 'File not downloaded' };
    }

    shell.showItemInFolder(attachment.local_path);
    return { success: true };
  });

  // ============ Files Directory Handlers ============

  // Get current download directory
  ipcMain.handle('files:getDirectory', () => {
    return { path: fileDownloadManager.getBaseDir() };
  });

  // Open download directory in file explorer
  ipcMain.handle('files:openDirectory', () => {
    const currentDir = fileDownloadManager.getBaseDir();

    // Ensure directory exists
    if (!fs.existsSync(currentDir)) {
      fs.mkdirSync(currentDir, { recursive: true });
    }

    shell.openPath(currentDir);
    return { success: true };
  });

  // Select a new download directory via system dialog
  ipcMain.handle('files:selectDirectory', async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) {
      return { success: false, error: 'No window available' };
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Download Location',
      defaultPath: fileDownloadManager.getBaseDir(),
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || !result.filePaths[0]) {
      return { success: false, error: 'Selection cancelled' };
    }

    const selectedPath = result.filePaths[0];
    return { success: true, data: { path: selectedPath } };
  });

  // Set the download directory
  ipcMain.handle('files:setDirectory', (_event, newPath: string) => {
    try {
      // Validate input
      if (!newPath || typeof newPath !== 'string') {
        return { success: false, error: 'Invalid path' };
      }

      // Normalize and resolve the path to prevent traversal attacks
      const resolvedPath = path.resolve(newPath);

      // Check for null bytes (path injection)
      if (newPath.includes('\0') || resolvedPath.includes('\0')) {
        logger.warn(`Rejected path with null byte: ${newPath}`);
        return { success: false, error: 'Invalid path characters' };
      }

      // Prevent setting to system-critical directories
      /* eslint-disable cross-platform/no-hardcoded-app-paths -- Fallbacks for system directories when env vars are not set */
      const criticalPaths = [
        process.env.SystemRoot || 'C:\\Windows',
        process.env.ProgramFiles || 'C:\\Program Files',
        process.env.ProgramData || 'C:\\ProgramData',
        '/etc',
        '/usr',
        '/bin',
        '/sbin',
        '/var',
        '/System',
      ].map((p) => path.resolve(p).toLowerCase());
      /* eslint-enable cross-platform/no-hardcoded-app-paths */

      const resolvedLower = resolvedPath.toLowerCase();
      for (const critical of criticalPaths) {
        if (resolvedLower === critical || resolvedLower.startsWith(critical + path.sep)) {
          logger.warn(
            `Rejected attempt to set files directory to system path: ${newPath}`
          );
          return { success: false, error: 'Cannot use system directory' };
        }
      }

      // Validate the path exists or can be created
      if (!fs.existsSync(resolvedPath)) {
        fs.mkdirSync(resolvedPath, { recursive: true });
      }

      fileDownloadManager.updateBaseDir(resolvedPath);
      logger.info(`Download directory changed to: ${resolvedPath}`);
      return { success: true };
    } catch (error) {
      logger.error(`Failed to set download directory: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  // ============ File Save Dialog ============

  // Save file with dialog
  ipcMain.handle(
    'file:save',
    async (
      _event,
      options: {
        defaultName: string;
        content: string;
        filters?: Array<{ name: string; extensions: string[] }>;
      }
    ) => {
      const mainWindow = getMainWindow();
      if (!mainWindow) {
        return { success: false, error: 'No window available' };
      }

      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: options.defaultName,
        filters: options.filters || [{ name: 'All Files', extensions: ['*'] }],
      });

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Save cancelled' };
      }

      try {
        fs.writeFileSync(result.filePath, options.content, 'utf-8');
        logger.info(`File saved: ${result.filePath}`);
        return { success: true, data: { filePath: result.filePath } };
      } catch (error) {
        logger.error(`Failed to save file: ${error}`);
        return { success: false, error: String(error) };
      }
    }
  );

  // Clear synced files data (resources and notification attachments)
  ipcMain.handle('files:clearSync', () => {
    logger.info('Clearing synced files data');
    try {
      clearSyncedFilesCommand.execute();
      logger.info('Synced files data cleared successfully');
      return { success: true };
    } catch (error) {
      logger.error(`Failed to clear sync data: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  // ============ Resource Handlers ============

  ipcMain.handle('resource:showInFolder', (_event, resourceId: number) => {
    const resource = resourceReader.getLocalPathById(resourceId);

    if (!resource?.local_path) {
      return { success: false, error: 'File not downloaded' };
    }

    // Check if file actually exists on disk
    if (!fs.existsSync(resource.local_path)) {
      logger.warn(
        `[resource:showInFolder] File not found on disk, clearing local_path: ${resource.local_path}`
      );
      updateResourceLocalPathCommand.clear(resourceId);
      return { success: false, error: 'File was deleted from disk. Please re-download.' };
    }

    shell.showItemInFolder(resource.local_path);
    return { success: true };
  });

  // Show resource in folder by external_id (for module items)
  ipcMain.handle('resource:showInFolderByExternalId', (_event, externalId: string) => {
    const resource = resourceReader.getOpenInfoByExternalId(externalId);

    if (!resource?.local_path) {
      return { success: false, error: 'File not downloaded' };
    }

    // Check if file actually exists on disk
    if (!fs.existsSync(resource.local_path)) {
      logger.warn(
        `[resource:showInFolderByExternalId] File not found on disk, clearing local_path: ${resource.local_path}`
      );
      updateResourceLocalPathCommand.clear(resource.id);
      return { success: false, error: 'File was deleted from disk. Please re-download.' };
    }

    shell.showItemInFolder(resource.local_path);
    return { success: true };
  });

  ipcMain.handle('resource:deleteLocal', (_event, resourceId: number) => {
    logger.debug(`[resource:deleteLocal] START resourceId=${resourceId}`);
    const mainWindow = getMainWindow();

    const resource = resourceReader.getLocalPathExternalById(resourceId);

    if (!resource?.local_path) {
      return { success: false, error: 'File not downloaded' };
    }

    try {
      if (fs.existsSync(resource.local_path)) {
        fs.unlinkSync(resource.local_path);
        logger.info(`[resource:deleteLocal] Deleted file: ${resource.local_path}`);
      }

      updateResourceLocalPathCommand.clear(resourceId);

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('file-status-changed', {
          type: 'deleted',
          resourceId,
          externalId: resource.external_id,
          path: resource.local_path,
        });
      }

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[resource:deleteLocal] Failed: ${message}`);
      return { success: false, error: message };
    }
  });

  // ============ Canvas File Protocol Handler ============

  /**
   * Open a Canvas file by its external ID
   * - If already downloaded, opens the local file
   * - If not downloaded, downloads first then opens
   * Used for in-app link clicks when HTML local paths feature is enabled
   */
  ipcMain.handle('canvas-file:open', async (_event, canvasFileId: string) => {
    logger.debug(`[canvas-file:open] START canvasFileId=${canvasFileId}`);

    // Look up the resource by external_id
    const resource =
      resourceReader.getDownloadInfoWithLocalPathByExternalId(canvasFileId);

    if (!resource) {
      logger.warn(`[canvas-file:open] Resource not found: ${canvasFileId}`);
      return { success: false, error: 'File not found in database' };
    }

    // Check if file is already downloaded and exists on disk
    if (resource.local_path && fs.existsSync(resource.local_path)) {
      logger.debug(`[canvas-file:open] Opening existing file: ${resource.local_path}`);

      // Open with OS default application (HTML files now use relative paths)
      const error = await shell.openPath(resource.local_path);
      if (error) {
        logger.error(`[canvas-file:open] Failed to open: ${error}`);
        return { success: false, error };
      }
      return { success: true, localPath: resource.local_path };
    }

    // File not downloaded - need to download first
    if (!resource.url) {
      return { success: false, error: 'Resource has no download URL' };
    }

    // Get auth token
    const token = await credentialManager.retrieve();
    if (!token) {
      return { success: false, error: 'No credentials available' };
    }

    // Get course code for folder organization
    const course = courseReader.getById(resource.course_id);
    const courseCode = course?.code || 'unknown';

    // Download the file
    const downloadId = `file-${canvasFileId}`;
    const downloadPromise = new Promise<{
      success: boolean;
      localPath?: string;
      error?: string;
    }>((resolve) => {
      const cleanup = () => {
        fileDownloadManager.off('download-complete', onComplete);
        fileDownloadManager.off('download-error', onError);
        clearTimeout(safetyTimeout);
      };

      const onComplete = (result: { id: string; localPath: string }) => {
        if (result.id === downloadId) {
          cleanup();

          // Update database with local path
          updateResourceLocalPathCommand.setLocalPath(resource.id, result.localPath);

          resolve({ success: true, localPath: result.localPath });
        }
      };

      const onError = (result: { id: string; error: string }) => {
        if (result.id === downloadId) {
          cleanup();
          resolve({ success: false, error: result.error });
        }
      };

      // Safety timeout to prevent listener leaks if download never completes
      const safetyTimeout = setTimeout(
        () => {
          fileDownloadManager.off('download-complete', onComplete);
          fileDownloadManager.off('download-error', onError);
          logger.warn(`[canvas-file:open] Safety timeout for download ${downloadId}`);
          resolve({ success: false, error: 'Download timed out' });
        },
        5 * 60 * 1000
      );

      fileDownloadManager.on('download-complete', onComplete);
      fileDownloadManager.on('download-error', onError);

      fileDownloadManager.queueDownload({
        id: downloadId,
        url: resource.url!,
        courseCode,
        filename: resource.title,
        authToken: token,
        folderPath: resource.folder_path ?? undefined,
      });
    });

    const downloadResult = await downloadPromise;
    if (!downloadResult.success) {
      return downloadResult;
    }

    // Open the downloaded file with OS default application
    const error = await shell.openPath(downloadResult.localPath!);
    if (error) {
      logger.error(`[canvas-file:open] Failed to open downloaded file: ${error}`);
      return { success: false, error };
    }

    return { success: true, localPath: downloadResult.localPath };
  });
}
