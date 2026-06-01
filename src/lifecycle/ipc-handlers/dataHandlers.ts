/**
 * Data IPC Handlers (Facade)
 * Delegates to submodules in data/ for policies, course authority,
 * task linking, course content, and app state management
 */

import { ipcMain } from 'electron';
import type { IpcContext } from './IpcContext';
import { registerCourseAuthorityHandlers } from './data/courseAuthorityHandlers';
import { registerTaskLinkHandlers } from './data/taskLinkHandlers';
import { registerCourseContentHandlers } from './data/courseContentHandlers';

/**
 * Register all data-related IPC handlers
 */
export function registerDataHandlers(ctx: IpcContext): void {
  const logger = ctx.getLogger();
  const resetAppState = ctx.resetAppState;

  // Delegate to submodules
  registerCourseAuthorityHandlers(ctx);
  registerTaskLinkHandlers(ctx);
  registerCourseContentHandlers(ctx);

  // ============ App State Management ============

  // Clear all app data (optionally including Canvas API token)
  ipcMain.handle('data:clearAll', async (_event, options?: { deleteToken?: boolean }) => {
    const deleteToken = options?.deleteToken ?? false;
    logger.info(`Clearing all app data (deleteToken: ${deleteToken})`);
    try {
      await resetAppState({ deleteToken });
      return { success: true, tokenDeleted: deleteToken };
    } catch (error) {
      logger.error(`Failed to clear all data: ${error}`);
      return { success: false, error: String(error) };
    }
  });
}
