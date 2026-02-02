/**
 * UpdateCoursePreferencesCommand - Update course display preferences
 *
 * Allows users to customize how a course appears:
 * - color: Custom color for course identification
 * - nickname: Custom display name
 * - isHidden: Hide course from default views
 */

import {
  Command,
  CommandContext,
  CommandResult,
  UpdateCoursePreferencesParams,
  CoursePreferences,
} from '../types';

export class UpdateCoursePreferencesCommand implements Command<
  UpdateCoursePreferencesParams,
  { previous: CoursePreferences }
> {
  readonly name = 'UpdateCoursePreferences';

  validate(params: UpdateCoursePreferencesParams): { valid: boolean; error?: string } {
    if (!params.courseId || params.courseId <= 0) {
      return { valid: false, error: 'Course not found or invalid' };
    }

    if (!params.preferences || Object.keys(params.preferences).length === 0) {
      return { valid: false, error: 'No preferences provided' };
    }

    const { targetGrade, color, nickname, credits } = params.preferences;

    if (targetGrade !== undefined) {
      if (typeof targetGrade !== 'number' || isNaN(targetGrade)) {
        return { valid: false, error: 'Target grade must be a number' };
      }
      if (targetGrade < 0 || targetGrade > 100) {
        return { valid: false, error: 'Target grade must be between 0 and 100' };
      }
    }

    if (color !== undefined && typeof color !== 'string') {
      return { valid: false, error: 'Color must be a string' };
    }

    if (nickname !== undefined && typeof nickname !== 'string') {
      return { valid: false, error: 'Nickname must be a string' };
    }

    if (nickname !== undefined && nickname.length > 100) {
      return { valid: false, error: 'Nickname must be 100 characters or less' };
    }

    if (credits !== undefined) {
      if (typeof credits !== 'number' || isNaN(credits)) {
        return { valid: false, error: 'Credits must be a number' };
      }
      if (credits < 0 || credits > 10) {
        return { valid: false, error: 'Credits must be between 0 and 10' };
      }
    }

    return { valid: true };
  }

  async execute(
    context: CommandContext,
    params: UpdateCoursePreferencesParams
  ): Promise<CommandResult<{ previous: CoursePreferences }>> {
    const validation = this.validate(params);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      // Get current preferences
      const course = context.db.executeReadOne<{
        target_grade: number;
        color: string | null;
        nickname: string | null;
        is_hidden: boolean;
        credits: number;
      }>('SELECT target_grade, color, nickname, is_hidden, credits FROM courses WHERE id = ?', [
        params.courseId,
      ]);

      if (!course) {
        return { success: false, error: 'Course not found' };
      }

      const previous: CoursePreferences = {
        targetGrade: course.target_grade,
        color: course.color ?? undefined,
        nickname: course.nickname ?? undefined,
        isHidden: Boolean(course.is_hidden),
        credits: course.credits,
      };

      // Build update query dynamically
      const updates: string[] = [];
      const values: unknown[] = [];

      if (params.preferences.targetGrade !== undefined) {
        updates.push('target_grade = ?');
        values.push(params.preferences.targetGrade);
      }

      if (params.preferences.color !== undefined) {
        updates.push('color = ?');
        values.push(params.preferences.color);
      }

      if (params.preferences.nickname !== undefined) {
        updates.push('nickname = ?');
        values.push(params.preferences.nickname);
      }

      if (params.preferences.isHidden !== undefined) {
        updates.push('is_hidden = ?');
        values.push(params.preferences.isHidden ? 1 : 0);
      }

      if (params.preferences.credits !== undefined) {
        updates.push('credits = ?');
        values.push(params.preferences.credits);
      }

      if (updates.length > 0) {
        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(params.courseId);

        context.db.executeWrite(
          `UPDATE courses SET ${updates.join(', ')} WHERE id = ?`,
          values,
          'courses'
        );
      }

      // Notify VisibleDataProvider if visibility changed
      if (params.preferences.isHidden !== undefined && context.visibleDataProvider) {
        context.visibleDataProvider.notifyVisibilityChanged(params.courseId);
      }

      return {
        success: true,
        data: { previous },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to update course preferences: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
