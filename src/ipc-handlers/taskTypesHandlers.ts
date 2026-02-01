/**
 * Task Types IPC Handlers
 * Handlers for custom task type management:
 * - Get all task types
 * - Create task type
 * - Delete task type
 */

import { ipcMain } from 'electron';
import type { IpcContext } from './IpcContext';

/**
 * Register all task types-related IPC handlers
 */
export function registerTaskTypesHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();

  // Get all custom task types (optionally filtered by course)
  ipcMain.handle('taskTypes:getAll', (_event, courseId?: number) => {
    try {
      let sql = `
        SELECT id, name, display_name as displayName, course_id as courseId, created_at as createdAt
        FROM custom_task_types
      `;
      const params: unknown[] = [];

      if (courseId !== undefined) {
        sql += ' WHERE course_id = ? OR course_id IS NULL';
        params.push(courseId);
      }

      sql += ' ORDER BY display_name ASC';

      const rows = database.executeRead<{
        id: number;
        name: string;
        displayName: string;
        courseId: number | null;
        createdAt: string;
      }>(sql, params);

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
    (_event, params: { name: string; displayName: string; courseId?: number }) => {
      try {
        // Validate
        if (!params.name || !params.displayName) {
          return { success: false, error: 'Name and display name are required' };
        }

        // Normalize name to lowercase with underscores
        const normalizedName = params.name.toLowerCase().replace(/\s+/g, '_');

        // Check for duplicate
        const existing = database.executeReadOne<{ id: number }>(
          'SELECT id FROM custom_task_types WHERE name = ?',
          [normalizedName]
        );

        if (existing) {
          return { success: false, error: 'A task type with this name already exists' };
        }

        const result = database.executeWrite(
          `INSERT INTO custom_task_types (name, display_name, course_id)
           VALUES (?, ?, ?)`,
          [normalizedName, params.displayName.trim(), params.courseId ?? null],
          'custom_task_types'
        );

        return {
          success: true,
          data: {
            id: result.lastInsertRowid as number,
            name: normalizedName,
            displayName: params.displayName.trim(),
            courseId: params.courseId ?? null,
          },
        };
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
  ipcMain.handle('taskTypes:delete', (_event, id: number) => {
    try {
      if (!id || id <= 0) {
        return { success: false, error: 'Invalid task type ID' };
      }

      const existing = database.executeReadOne<{ id: number }>(
        'SELECT id FROM custom_task_types WHERE id = ?',
        [id]
      );

      if (!existing) {
        return { success: false, error: 'Task type not found' };
      }

      database.executeWrite(
        'DELETE FROM custom_task_types WHERE id = ?',
        [id],
        'custom_task_types'
      );

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
