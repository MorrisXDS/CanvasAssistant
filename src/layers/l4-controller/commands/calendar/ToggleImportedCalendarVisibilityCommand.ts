/**
 * ToggleImportedCalendarVisibilityCommand — sets an imported calendar's
 * `is_visible` flag to an explicit value.
 *
 * Extracted from calendarCrudHandlers (ADR-0007).
 */

import type { Database } from '../../../l1-persistence/Database';
import type { Logger } from '../../../l0-utilities/Logger';

export interface ToggleImportedCalendarVisibilityResult {
  success: boolean;
  error?: string;
}

export class ToggleImportedCalendarVisibilityCommand {
  constructor(
    private readonly db: Database,
    private readonly logger: Logger
  ) {}

  execute(
    calendarId: number,
    isVisible: boolean
  ): ToggleImportedCalendarVisibilityResult {
    try {
      this.db.executeWrite(
        'UPDATE imported_calendars SET is_visible = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [isVisible ? 1 : 0, calendarId],
        'imported_calendars'
      );
      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to toggle calendar visibility: ${error}`);
      return { success: false, error: String(error) };
    }
  }
}
