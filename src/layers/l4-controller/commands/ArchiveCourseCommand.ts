/**
 * ArchiveCourseCommand - Archive a course
 *
 * Archives a course, hiding it from dashboard, priorities, and task pages
 * while keeping it recoverable (distinct from hide and delete).
 *
 * Archived courses:
 * - Are excluded from getVisibleCourseIds()
 * - Are visible in dedicated "Archived" section on CoursesPage
 * - Can be unarchived at any time
 * - Retain all their data (tasks, grades, etc.)
 */

import { Command, CommandContext, CommandResult } from '../types';

export interface ArchiveCourseParams {
  courseId: number;
}

export interface ArchiveCourseResult {
  archivedAt: string;
}

export class ArchiveCourseCommand implements Command<
  ArchiveCourseParams,
  ArchiveCourseResult
> {
  readonly name = 'ArchiveCourse';

  validate(params: ArchiveCourseParams): { valid: boolean; error?: string } {
    if (!params.courseId || params.courseId <= 0) {
      return { valid: false, error: 'Invalid course ID' };
    }
    return { valid: true };
  }

  async execute(
    context: CommandContext,
    params: ArchiveCourseParams
  ): Promise<CommandResult<ArchiveCourseResult>> {
    const validation = this.validate(params);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      // Check if course exists
      const course = context.db.executeReadOne<{
        id: number;
        archived_at: string | null;
      }>('SELECT id, archived_at FROM courses WHERE id = ?', [params.courseId]);

      if (!course) {
        return { success: false, error: 'Course not found' };
      }

      if (course.archived_at !== null) {
        return { success: false, error: 'Course is already archived' };
      }

      // Archive the course (manual archive - can be restored)
      const now = new Date().toISOString();
      context.db.executeWrite(
        `UPDATE courses SET archived_at = ?, archive_source = 'manual', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [now, params.courseId],
        'courses'
      );

      // Notify VisibleDataProvider of visibility change
      if (context.visibleDataProvider) {
        context.visibleDataProvider.notifyVisibilityChanged(params.courseId);
      }

      return {
        success: true,
        data: { archivedAt: now },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to archive course: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
