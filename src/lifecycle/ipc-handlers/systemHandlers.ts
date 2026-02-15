/**
 * System IPC Handlers
 * Handlers for system monitoring and logging:
 * - Health check status
 * - Metrics summary
 * - System state
 * - Renderer logging
 */

import { ipcMain } from 'electron';
import type { IpcContext } from './IpcContext';

/**
 * Register all system-related IPC handlers
 */
export function registerSystemHandlers(ctx: IpcContext): void {
  const logger = ctx.getLogger();
  const metricsCollector = ctx.getMetricsCollector();
  const healthCheck = ctx.getHealthCheck();
  const systemMonitor = ctx.getSystemMonitor();

  // Health check status
  ipcMain.handle('health:status', () => {
    return healthCheck.getStatus();
  });

  // Metrics summary
  ipcMain.handle('metrics:summary', () => {
    return metricsCollector.getSummary();
  });

  // System state
  ipcMain.handle('system:state', () => {
    return systemMonitor.getState();
  });

  // Renderer logger - forwards logs from renderer to main process Logger
  ipcMain.handle(
    'log:renderer',
    (_event, level: string, message: string, component?: string) => {
      const prefix = component ? `[Renderer:${component}]` : '[Renderer]';
      const fullMessage = `${prefix} ${message}`;

      switch (level) {
        case 'debug':
          logger.debug(fullMessage);
          break;
        case 'info':
          logger.info(fullMessage);
          break;
        case 'warn':
          logger.warn(fullMessage);
          break;
        case 'error':
          logger.error(fullMessage);
          break;
        default:
          logger.info(fullMessage);
      }
    }
  );
}
