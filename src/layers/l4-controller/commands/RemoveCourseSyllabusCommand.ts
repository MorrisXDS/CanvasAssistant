/**
 * RemoveCourseSyllabusCommand - Remove syllabus designation from a course
 *
 * Removes the syllabus file designation. Policies remain but lose
 * their staleness tracking capability.
 */

import { Command, CommandContext, CommandResult } from '../types';

export interface RemoveCourseSyllabusParams {
  courseId: number;
}

export interface RemoveCourseSyllabusResult {
  success: boolean;
}

export class RemoveCourseSyllabusCommand
  implements Command<RemoveCourseSyllabusParams, RemoveCourseSyllabusResult>
{
  readonly name = 'RemoveCourseSyllabus';

  validate(params: RemoveCourseSyllabusParams): { valid: boolean; error?: string } {
    if (!params.courseId || params.courseId <= 0) {
      return { valid: false, error: 'Invalid course ID' };
    }

    return { valid: true };
  }

  async execute(
    context: CommandContext,
    params: RemoveCourseSyllabusParams
  ): Promise<CommandResult<RemoveCourseSyllabusResult>> {
    const validation = this.validate(params);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      // Delete the syllabus record
      const result = context.db.executeWrite(
        'DELETE FROM course_syllabuses WHERE course_id = ?',
        [params.courseId],
        'course_syllabuses'
      );

      if (result.changes === 0) {
        return { success: false, error: 'No syllabus found for this course' };
      }

      return {
        success: true,
        data: { success: true },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to remove course syllabus: ${error}`,
      };
    }
  }
}
