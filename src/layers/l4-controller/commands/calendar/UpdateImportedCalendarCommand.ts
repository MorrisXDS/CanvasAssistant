/**
 * UpdateImportedCalendarCommand — partial update of an imported calendar's
 * name / color / visibility.
 *
 * Extracted from calendarCrudHandlers (ADR-0007). Dynamic SET-clause build
 * preserved verbatim; `updated_at` is bumped only when at least one field
 * changes (matching the original).
 */

import type { Database } from '../../../l1-persistence/Database';
import type { Logger } from '../../../l0-utilities/Logger';

export interface UpdateImportedCalendarInput {
  name?: string;
  color?: string;
  isVisible?: boolean;
}

export interface UpdateImportedCalendarResult {
  success: boolean;
  error?: string;
}

export class UpdateImportedCalendarCommand {
  constructor(
    private readonly db: Database,
    private readonly logger: Logger
  ) {}

  execute(
    calendarId: number,
    updates: UpdateImportedCalendarInput
  ): UpdateImportedCalendarResult {
    try {
      const setClauses: string[] = [];
      const params: (string | number)[] = [];

      if (updates.name !== undefined) {
        setClauses.push('name = ?');
        params.push(updates.name);
      }
      if (updates.color !== undefined) {
        setClauses.push('color = ?');
        params.push(updates.color);
      }
      if (updates.isVisible !== undefined) {
        setClauses.push('is_visible = ?');
        params.push(updates.isVisible ? 1 : 0);
      }

      if (setClauses.length > 0) {
        setClauses.push('updated_at = CURRENT_TIMESTAMP');
        params.push(calendarId);
        this.db.executeWrite(
          `UPDATE imported_calendars SET ${setClauses.join(', ')} WHERE id = ?`,
          params,
          'imported_calendars'
        );
      }

      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to update calendar: ${error}`);
      return { success: false, error: String(error) };
    }
  }
}
