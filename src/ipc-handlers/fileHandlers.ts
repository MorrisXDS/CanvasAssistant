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
import type { IpcContext } from './IpcContext';

/**
 * Register all file-related IPC handlers
 */
export function registerFileHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();
  const metricsCollector = ctx.getMetricsCollector();
  const credentialManager = ctx.getCredentialManager();
  const fileDownloadManager = ctx.getFileDownloadManager();
  const getMainWindow = ctx.getMainWindow;

  // ============ Attachment Handlers ============

  // Download an attachment
  ipcMain.handle('attachment:download', async (_event, attachmentId: number) => {
    const attachment = database.executeReadOne<{
      id: number;
      notification_id: number;
      course_id: number;
      external_id: string;
      display_name: string;
      filename: string;
      url: string;
      download_status: string;
    }>('SELECT * FROM notification_attachments WHERE id = ?', [attachmentId]);

    if (!attachment) {
      return { success: false, error: 'Attachment not found' };
    }

    // Get course code for folder organization
    const course = database.executeReadOne<{ code: string }>(
      'SELECT code FROM courses WHERE id = ?',
      [attachment.course_id]
    );

    const courseCode = course?.code || 'unknown';

    // Get auth token for Canvas download
    const token = await credentialManager.retrieve();
    if (!token) {
      return { success: false, error: 'No credentials available' };
    }

    // Update status to downloading
    database.executeWrite(
      'UPDATE notification_attachments SET download_status = ? WHERE id = ?',
      ['downloading', attachmentId],
      'notification_attachments'
    );

    // Queue the download
    return new Promise((resolve) => {
      const downloadId = `attachment-${attachmentId}`;

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
            'UPDATE notification_attachments SET download_status = ?, local_path = ?, downloaded_at = ? WHERE id = ?',
            ['completed', result.localPath, new Date().toISOString(), attachmentId],
            'notification_attachments'
          );
          metricsCollector.increment('attachment.download.success');
          resolve({ success: true, localPath: result.localPath });
        } else {
          database.executeWrite(
            'UPDATE notification_attachments SET download_status = ? WHERE id = ?',
            ['failed', attachmentId],
            'notification_attachments'
          );
          metricsCollector.increment('attachment.download.failure');
          resolve({ success: false, error: result.error || 'Download failed' });
        }
      };

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
    const attachment = database.executeReadOne<{
      local_path: string | null;
      url: string;
    }>('SELECT local_path, url FROM notification_attachments WHERE id = ?', [
      attachmentId,
    ]);

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
    const attachment = database.executeReadOne<{ local_path: string | null }>(
      'SELECT local_path FROM notification_attachments WHERE id = ?',
      [attachmentId]
    );

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
      database.transaction(() => {
        // Clear resources (Canvas files/folders)
        database.executeWrite('DELETE FROM resources', [], 'resources');
        // Clear notification attachments
        database.executeWrite(
          'DELETE FROM notification_attachments',
          [],
          'notification_attachments'
        );
        // Clear sync metadata for files/folders endpoints
        database.executeWrite(
          "DELETE FROM sync_metadata WHERE endpoint LIKE '%/files' OR endpoint LIKE '%/folders'",
          [],
          'sync_metadata'
        );
      });
      logger.info('Synced files data cleared successfully');
      return { success: true };
    } catch (error) {
      logger.error(`Failed to clear sync data: ${error}`);
      return { success: false, error: String(error) };
    }
  });
}
