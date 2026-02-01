/**
 * Command IPC Handlers
 * Handlers for L4 command dispatching
 */

import { ipcMain } from 'electron';
import type { IpcContext } from './IpcContext';

/**
 * Register command dispatch IPC handlers
 */
export function registerCommandHandlers(ctx: IpcContext): void {
  const logger = ctx.getLogger();
  const metricsCollector = ctx.getMetricsCollector();
  const getCommandDispatcher = ctx.getCommandDispatcher;

  // L4 Command dispatch handler
  ipcMain.handle(
    'command:dispatch',
    async (_event, commandName: string, params: unknown) => {
      const commandDispatcher = getCommandDispatcher();
      if (!commandDispatcher) {
        return { success: false, error: 'Command dispatcher not initialized' };
      }

      // Validate command name against registered commands (security: prevent arbitrary command injection)
      const registeredCommands = commandDispatcher.getRegisteredCommands();
      if (!registeredCommands.includes(commandName)) {
        logger.warn(`Rejected unknown command: ${commandName}`);
        metricsCollector.increment('command.rejected.unknown');
        return { success: false, error: `Unknown command: ${commandName}` };
      }

      const result = await commandDispatcher.dispatch(
        commandName as Parameters<typeof commandDispatcher.dispatch>[0],
        params
      );
      if (result.success) {
        metricsCollector.increment(`command.${commandName}.success`);
      } else {
        metricsCollector.increment(`command.${commandName}.failure`);
      }
      return result;
    }
  );
}
