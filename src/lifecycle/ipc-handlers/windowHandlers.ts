/**
 * Window IPC Handlers
 * Handlers for window control and shell operations:
 * - Minimize, maximize, close window
 * - Open external URLs
 */

import { ipcMain, shell } from 'electron';
import type { IpcContext } from './IpcContext';

/**
 * Register all window-related IPC handlers
 */
export function registerWindowHandlers(ctx: IpcContext): void {
  const getMainWindow = ctx.getMainWindow;
  const logger = ctx.getLogger();

  // Window controls
  ipcMain.on('window:minimize', () => {
    getMainWindow()?.minimize();
  });

  ipcMain.on('window:maximize', () => {
    const mainWindow = getMainWindow();
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.on('window:close', () => {
    getMainWindow()?.close();
  });

  // Reset window size to adaptive defaults
  ipcMain.handle('window:resetSize', () => {
    ctx.resetWindowSize();
  });

  // Shell operations
  ipcMain.on('shell:openExternal', async (_event, url: string) => {
    try {
      await shell.openExternal(url);
    } catch (error) {
      logger.error('Failed to open external URL:', error as Error);
    }
  });
}
