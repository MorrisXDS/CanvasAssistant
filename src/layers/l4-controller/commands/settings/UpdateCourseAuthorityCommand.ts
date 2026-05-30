/**
 * UpdateCourseAuthorityCommand - Update per-course grade-authority columns
 * (`late_penalty_authority`, `drop_lowest_authority`, `grade_calc_mode`).
 *
 * Only the fields present in params are written. Per ADR-0007 this is the
 * write path the `data:updateCourseAuthority` IPC handler routes through.
 */

import {
  Command,
  CommandContext,
  CommandResult,
  UpdateCourseAuthorityParams,
} from '../../types';

export class UpdateCourseAuthorityCommand implements Command<
  UpdateCourseAuthorityParams,
  void
> {
  readonly name = 'UpdateCourseAuthority';

  async execute(
    context: CommandContext,
    params: UpdateCourseAuthorityParams
  ): Promise<CommandResult<void>> {
    try {
      const updates: string[] = [];
      const values: (string | number)[] = [];

      if (params.latePenaltyAuthority) {
        updates.push('late_penalty_authority = ?');
        values.push(params.latePenaltyAuthority);
      }
      if (params.dropLowestAuthority) {
        updates.push('drop_lowest_authority = ?');
        values.push(params.dropLowestAuthority);
      }
      if (params.gradeCalcMode) {
        updates.push('grade_calc_mode = ?');
        values.push(params.gradeCalcMode);
      }

      if (updates.length > 0) {
        values.push(params.courseId);
        context.db.executeWrite(
          `UPDATE courses SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          values,
          'courses'
        );
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to update course authority settings: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
