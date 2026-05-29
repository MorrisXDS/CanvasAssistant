/**
 * UpdateCourseSettingsCommand - Update per-course settings columns
 * (`auto_assign_due_date`, `allow_guessed_override`).
 *
 * Only the fields present in params are updated. Per ADR-0007 this is the
 * write path the `course:updateSettings` IPC handler routes through.
 */

import {
  Command,
  CommandContext,
  CommandResult,
  UpdateCourseSettingsParams,
} from '../../types';

export class UpdateCourseSettingsCommand implements Command<
  UpdateCourseSettingsParams,
  void
> {
  readonly name = 'UpdateCourseSettings';

  async execute(
    context: CommandContext,
    params: UpdateCourseSettingsParams
  ): Promise<CommandResult<void>> {
    try {
      const updates: string[] = [];
      const values: (number | null)[] = [];

      if ('autoAssignDueDate' in params) {
        updates.push('auto_assign_due_date = ?');
        values.push(params.autoAssignDueDate ?? null);
      }

      if ('allowGuessedOverride' in params) {
        updates.push('allow_guessed_override = ?');
        values.push(params.allowGuessedOverride ?? 1);
      }

      // Nothing to change — treat as a no-op success (preserves prior behavior).
      if (updates.length === 0) {
        return { success: true };
      }

      values.push(params.courseId);
      context.db.executeWrite(
        `UPDATE courses SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        values,
        'courses'
      );

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to update course settings: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
