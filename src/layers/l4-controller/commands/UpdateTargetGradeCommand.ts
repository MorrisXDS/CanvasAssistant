/**
 * UpdateTargetGradeCommand - Update a course's target grade
 *
 * Uses repository for data access.
 * Changes the user's target grade for a course, which affects
 * priority calculations for all assignments in that course.
 */

import {
  Command,
  CommandContext,
  CommandResult,
  UpdateTargetGradeParams,
} from '../types';
import { CourseRepository } from '../../l1-persistence/repositories';

export class UpdateTargetGradeCommand
  implements Command<UpdateTargetGradeParams, { previousGrade: number }>
{
  readonly name = 'UpdateTargetGrade';

  validate(params: UpdateTargetGradeParams): { valid: boolean; error?: string } {
    if (!params.courseId || params.courseId <= 0) {
      return { valid: false, error: 'Invalid course ID' };
    }

    if (typeof params.targetGrade !== 'number' || isNaN(params.targetGrade)) {
      return { valid: false, error: 'Target grade must be a number' };
    }

    if (params.targetGrade < 0 || params.targetGrade > 100) {
      return { valid: false, error: 'Target grade must be between 0 and 100' };
    }

    return { valid: true };
  }

  async execute(
    context: CommandContext,
    params: UpdateTargetGradeParams
  ): Promise<CommandResult<{ previousGrade: number }>> {
    const validation = this.validate(params);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      const courseRepo = new CourseRepository(context.db);

      // Get current target grade
      const previousGrade = courseRepo.getTargetGrade(params.courseId);
      if (previousGrade === null) {
        return { success: false, error: 'Course not found' };
      }

      // Update target grade using repository
      courseRepo.update(params.courseId, { targetGrade: params.targetGrade });

      // Mark the field as locally modified for sync conflict detection
      courseRepo.markFieldModified(params.courseId, 'target_grade');

      // Note: Priority recalculation will be triggered by the commit event
      // The L5 Presentation layer listens to DB commits and triggers recalcs

      return {
        success: true,
        data: { previousGrade },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to update target grade: ${error}`,
      };
    }
  }
}
