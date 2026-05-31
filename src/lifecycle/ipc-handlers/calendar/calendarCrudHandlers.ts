/**
 * Calendar CRUD IPC Handlers
 * Handlers for imported calendar operations:
 * - Get all calendars
 * - Parse ICS preview
 * - Import ICS
 * - Delete calendar
 * - Update calendar settings
 * - Toggle visibility
 * - Re-import calendar
 *
 * Per ADR-0007, this file holds no raw `database.execute*` calls. Reads
 * route through `ImportedCalendarReader` (L1); writes route through the
 * imported-calendar commands (L4). ICS parsing for the (read-only) preview
 * stays here; import/reimport parsing lives in the commands.
 */

import { ipcMain } from 'electron';
import type { IpcContext } from '../IpcContext';
import { ICSParser } from '../../../layers/l2-daemon';
import { ImportedCalendarReader } from '../../../layers/l1-persistence';
import {
  ImportICSCalendarCommand,
  ReimportICSCalendarCommand,
  DeleteImportedCalendarCommand,
  UpdateImportedCalendarCommand,
  ToggleImportedCalendarVisibilityCommand,
} from '../../../layers/l4-controller/commands/calendar';

/**
 * Register calendar CRUD IPC handlers
 */
export function registerCalendarCrudHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();

  const importedCalendarReader = new ImportedCalendarReader(database);
  const importCommand = new ImportICSCalendarCommand(database, logger);
  const reimportCommand = new ReimportICSCalendarCommand(database, logger);
  const deleteCommand = new DeleteImportedCalendarCommand(database, logger);
  const updateCommand = new UpdateImportedCalendarCommand(database, logger);
  const toggleVisibilityCommand = new ToggleImportedCalendarVisibilityCommand(
    database,
    logger
  );

  // Get all imported calendars
  ipcMain.handle('calendar:getImportedCalendars', () => {
    return importedCalendarReader.getAll().map((row) => ({
      id: row.id,
      name: row.name,
      filename: row.filename,
      fileHash: row.file_hash,
      color: row.color,
      eventCount: row.event_count,
      isVisible: Boolean(row.is_visible),
      importedAt: row.imported_at,
      updatedAt: row.updated_at,
    }));
  });

  // Parse ICS for preview (without importing)
  ipcMain.handle(
    'calendar:parseICSPreview',
    (_event, content: string, filename: string) => {
      const parser = new ICSParser();
      return parser.createPreview(content, filename);
    }
  );

  // Import ICS calendar
  ipcMain.handle(
    'calendar:importICS',
    (
      _event,
      params: {
        content: string;
        filename: string;
        name?: string;
        color?: string;
      }
    ) => {
      return importCommand.execute(params);
    }
  );

  // Delete imported calendar
  ipcMain.handle('calendar:deleteCalendar', (_event, calendarId: number) => {
    return deleteCommand.execute(calendarId);
  });

  // Update calendar settings (name, color, visibility)
  ipcMain.handle(
    'calendar:updateCalendar',
    (
      _event,
      calendarId: number,
      updates: { name?: string; color?: string; isVisible?: boolean }
    ) => {
      return updateCommand.execute(calendarId, updates);
    }
  );

  // Toggle calendar visibility
  ipcMain.handle(
    'calendar:toggleVisibility',
    (_event, calendarId: number, isVisible: boolean) => {
      return toggleVisibilityCommand.execute(calendarId, isVisible);
    }
  );

  // Re-import calendar (update from file)
  ipcMain.handle('calendar:reimport', (_event, calendarId: number, content: string) => {
    return reimportCommand.execute(calendarId, content);
  });
}
