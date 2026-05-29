/**
 * RecordExportHistoryCommand - Insert a row into `export_history`.
 *
 * Per ADR-0007 this is the write path the export IPC handlers route
 * through to log a completed (or failed) export. Returns the new row id.
 */

import {
  Command,
  CommandContext,
  CommandResult,
  RecordExportHistoryParams,
} from '../../types';

export class RecordExportHistoryCommand implements Command<
  RecordExportHistoryParams,
  { id: number }
> {
  readonly name = 'RecordExportHistory';

  async execute(
    context: CommandContext,
    params: RecordExportHistoryParams
  ): Promise<CommandResult<{ id: number }>> {
    try {
      const result = context.db.executeWrite(
        `INSERT INTO export_history (export_type, file_path, file_size, tasks_exported, status)
         VALUES (?, ?, ?, ?, ?)`,
        [
          params.exportType,
          params.filePath ?? null,
          params.fileSize ?? 0,
          params.tasksExported ?? 0,
          params.status ?? 'completed',
        ],
        'export_history'
      );
      return { success: true, data: { id: result.lastInsertRowid as number } };
    } catch (error) {
      return {
        success: false,
        error: `Failed to record export history: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
