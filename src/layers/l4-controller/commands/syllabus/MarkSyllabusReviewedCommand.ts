/**
 * MarkSyllabusReviewedCommand - Mark a syllabus as reviewed
 *
 * Updates the last_reviewed_at timestamp and clears any change detection.
 * Called when user acknowledges they've reviewed the syllabus.
 */

import { Command, CommandContext, CommandResult } from '../../types';

export interface MarkSyllabusReviewedParams {
  courseId: number;
}

export interface MarkSyllabusReviewedResult {
  lastReviewedAt: string;
}

export class MarkSyllabusReviewedCommand implements Command<
  MarkSyllabusReviewedParams,
  MarkSyllabusReviewedResult
> {
  readonly name = 'MarkSyllabusReviewed';

  validate(params: MarkSyllabusReviewedParams): { valid: boolean; error?: string } {
    if (!params.courseId || params.courseId <= 0) {
      return { valid: false, error: 'Invalid course ID' };
    }

    return { valid: true };
  }

  async execute(
    context: CommandContext,
    params: MarkSyllabusReviewedParams
  ): Promise<CommandResult<MarkSyllabusReviewedResult>> {
    const validation = this.validate(params);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      // Check syllabus exists for this course
      const existing = context.db.executeReadOne<{ id: number }>(
        'SELECT id FROM course_syllabuses WHERE course_id = ?',
        [params.courseId]
      );

      if (!existing) {
        return { success: false, error: 'No syllabus designated for this course' };
      }

      // Update the review timestamp and clear change detection
      const now = new Date().toISOString();
      context.db.executeWrite(
        `UPDATE course_syllabuses
         SET last_reviewed_at = ?,
             change_detected_at = NULL
         WHERE course_id = ?`,
        [now, params.courseId],
        'course_syllabuses'
      );

      // Also update any policies to mark them as based on this review
      context.db.executeWrite(
        `UPDATE course_policies
         SET based_on_syllabus_reviewed_at = ?
         WHERE course_id = ?
           AND based_on_syllabus_reviewed_at IS NULL`,
        [now, params.courseId],
        'course_policies'
      );

      return {
        success: true,
        data: {
          lastReviewedAt: now,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to mark syllabus as reviewed: ${error}`,
      };
    }
  }
}
