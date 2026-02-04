/**
 * Intelligence IPC Handlers
 *
 * Note: Priority, recommendation, insight, workload, behavior, and adaptive
 * learning systems have been removed. Only simulation handlers remain.
 */

import { ipcMain } from 'electron';
import type { IpcContext } from './IpcContext';

/**
 * Register intelligence-related IPC handlers
 * Currently only simulation handlers are active
 */
export function registerIntelligenceHandlers(ctx: IpcContext): void {
  // ============ Simulation Handlers ============

  ipcMain.handle('simulation:getState', () => {
    const commandDispatcher = ctx.getCommandDispatcher();
    if (!commandDispatcher) {
      return { isActive: false, grades: [] };
    }

    const context = commandDispatcher.getSimulationContext();
    return {
      isActive: context.isActive,
      startedAt: context.startedAt,
      grades: Array.from(context.grades.values()),
    };
  });

  ipcMain.handle('simulation:clear', async () => {
    const commandDispatcher = ctx.getCommandDispatcher();
    if (!commandDispatcher) {
      return { success: false, error: 'Command dispatcher not initialized' };
    }

    commandDispatcher.clearSimulation();
    return { success: true };
  });
}
