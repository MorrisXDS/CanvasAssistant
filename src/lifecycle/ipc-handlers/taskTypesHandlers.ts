/**
 * Task Types IPC Handlers
 * Handlers for custom task type management:
 * - Get all task types
 * - Create task type
 * - Delete task type
 *
 * Per ADR-0007, this file holds no raw `database.execute*` calls. Reads
 * route through `TaskTypeReader` (L1); writes route through the
 * `CreateTaskTypeCommand` / `DeleteTaskTypeCommand` (L4).
 */

import { ipcMain } from 'electron';
import type { IpcContext } from './IpcContext';
import { TaskTypeReader } from '../../layers/l1-persistence';
import { CreateTaskTypeCommand, DeleteTaskTypeCommand } from '../../layers/l4-controller';
import { createSimulationContext } from '../../layers/l4-controller/types';

/**
 * Register all task types-related IPC handlers
 */
export function registerTaskTypesHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();

  const taskTypeReader = new TaskTypeReader(database);

  // Get all custom task types (optionally filtered by course + globals)
  ipcMain.handle('taskTypes:getAll', (_event, courseId?: number) => {
    try {
      const rows = taskTypeReader.getAll(courseId).map((row) => ({
        id: row.id,
        name: row.name,
        displayName: row.display_name,
        courseId: row.course_id,
        createdAt: row.created_at,
      }));

      return { success: true, data: rows };
    } catch (error) {
      logger.error('Failed to get custom task types:', error as Error);
      return {
        success: false,
        error: `Failed to get task types: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });

  // Create a new custom task type
  ipcMain.handle(
    'taskTypes:create',
    async (_event, params: { name: string; displayName: string; courseId?: number }) => {
      try {
        const command = new CreateTaskTypeCommand();
        const result = await command.execute(
          { db: database, simulationContext: createSimulationContext() },
          {
            name: params.name,
            displayName: params.displayName,
            courseId: params.courseId,
          }
        );

        if (!result.success) {
          return { success: false, error: result.error };
        }
        return { success: true, data: result.data };
      } catch (error) {
        logger.error('Failed to create custom task type:', error as Error);
        return {
          success: false,
          error: `Failed to create task type: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
  );

  // Delete a custom task type
  ipcMain.handle('taskTypes:delete', async (_event, id: number) => {
    try {
      const command = new DeleteTaskTypeCommand();
      const result = await command.execute(
        { db: database, simulationContext: createSimulationContext() },
        { id }
      );

      if (!result.success) {
        return { success: false, error: result.error };
      }
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete custom task type:', error as Error);
      return {
        success: false,
        error: `Failed to delete task type: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });
}
