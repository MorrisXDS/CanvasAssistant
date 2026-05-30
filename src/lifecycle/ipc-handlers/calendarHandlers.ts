/**
 * Calendar IPC Handlers
 * Facade that delegates to sub-handler modules:
 * - calendarCrudHandlers: Calendar CRUD (get, import, delete, update, toggle visibility, reimport)
 * - calendarEventHandlers: Event CRUD (get events for range, create, update, delete, export batch)
 * - calendarMigrationUtils: Hash recomputation utility
 */

import type { IpcContext } from './IpcContext';
import { registerCalendarCrudHandlers, registerCalendarEventHandlers } from './calendar';
import { recomputeCalendarHashes } from '../../layers/l2-daemon';

/**
 * Register all calendar-related IPC handlers
 */
export function registerCalendarHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();

  // Recompute hashes for existing calendars (one-time migration)
  recomputeCalendarHashes(database, logger);

  // Register sub-handler groups
  registerCalendarCrudHandlers(ctx);
  registerCalendarEventHandlers(ctx);
}
