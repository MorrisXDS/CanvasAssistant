/**
 * UnarchiveCourseCommand - Unarchive a course
 *
 * Restores an archived course back to active status.
 * The course will appear in dashboard, priorities, and task pages
 * (subject to term selection and hide settings).
 */

import { Command, CommandContext, CommandResult } from '../../types';

export interface UnarchiveCourseParams {
  courseId: number;
}

export interface UnarchiveCourseResult {
  unarchivedAt: string;
}

export class UnarchiveCourseCommand implements Command<
  UnarchiveCourseParams,
  UnarchiveCourseResult
> {
  readonly name = 'UnarchiveCourse';

  validate(params: UnarchiveCourseParams): { valid: boolean; error?: string } {
    if (!params.courseId || params.courseId <= 0) {
      return { valid: false, error: 'Invalid course ID' };
    }
    return { valid: true };
  }

  async execute(
    context: CommandContext,
    params: UnarchiveCourseParams
  ): Promise<CommandResult<UnarchiveCourseResult>> {
    const validation = this.validate(params);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      // Check if course exists and is archived
      const course = context.db.executeReadOne<{
        id: number;
        archived_at: string | null;
      }>('SELECT id, archived_at FROM courses WHERE id = ?', [params.courseId]);

      if (!course) {
        return { success: false, error: 'Course not found' };
      }

      if (course.archived_at === null) {
        return { success: false, error: 'Course is not archived' };
      }

      // Unarchive the course
      const now = new Date().toISOString();
      context.db.executeWrite(
        `UPDATE courses SET archived_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [params.courseId],
        'courses'
      );

      // Notify VisibilityOracle of visibility change
      if (context.visibilityOracle) {
        context.visibilityOracle.notifyVisibilityChanged(params.courseId);
      }

      return {
        success: true,
        data: { unarchivedAt: now },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to unarchive course: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
