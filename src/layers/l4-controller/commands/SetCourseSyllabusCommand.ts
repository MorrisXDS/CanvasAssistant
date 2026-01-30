/**
 * SetCourseSyllabusCommand - Designate a file as the course syllabus
 *
 * Allows users to mark which file is the syllabus for a course.
 * Supports both resources (synced files) and notification attachments.
 * This enables change detection and policy staleness tracking.
 */

import { Command, CommandContext, CommandResult } from '../types';

export interface SetCourseSyllabusParams {
  courseId: number;
  resourceId: number; // Positive for resources, negative for attachments
}

export interface SetCourseSyllabusResult {
  syllabusId: number;
  lastReviewedAt: string;
}

export class SetCourseSyllabusCommand implements Command<
  SetCourseSyllabusParams,
  SetCourseSyllabusResult
> {
  readonly name = 'SetCourseSyllabus';

  validate(params: SetCourseSyllabusParams): { valid: boolean; error?: string } {
    if (!params.courseId || params.courseId <= 0) {
      return { valid: false, error: 'Course not found or invalid' };
    }

    if (!params.resourceId || params.resourceId === 0) {
      return { valid: false, error: 'File not found or invalid' };
    }

    return { valid: true };
  }

  async execute(
    context: CommandContext,
    params: SetCourseSyllabusParams
  ): Promise<CommandResult<SetCourseSyllabusResult>> {
    const validation = this.validate(params);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      // Verify course exists
      const course = context.db.executeReadOne<{ id: number }>(
        'SELECT id FROM courses WHERE id = ?',
        [params.courseId]
      );

      if (!course) {
        return { success: false, error: 'Course not found' };
      }

      // Determine if this is a resource (positive ID) or attachment (negative ID)
      const isAttachment = params.resourceId < 0;
      const actualId = isAttachment ? Math.abs(params.resourceId) : params.resourceId;
      const sourceType = isAttachment ? 'attachment' : 'resource';

      let remoteUpdatedAt: string | null = null;

      if (isAttachment) {
        // Look up notification attachment
        const attachment = context.db.executeReadOne<{
          id: number;
          course_id: number;
          downloaded_at: string | null;
        }>(
          'SELECT id, course_id, downloaded_at FROM notification_attachments WHERE id = ?',
          [actualId]
        );

        if (!attachment) {
          return { success: false, error: 'File attachment not found' };
        }

        if (attachment.course_id !== params.courseId) {
          return {
            success: false,
            error: 'This file attachment belongs to a different course',
          };
        }

        remoteUpdatedAt = attachment.downloaded_at;
      } else {
        // Look up resource
        const resource = context.db.executeReadOne<{
          id: number;
          course_id: number;
          remote_updated_at: string | null;
        }>('SELECT id, course_id, remote_updated_at FROM resources WHERE id = ?', [
          actualId,
        ]);

        if (!resource) {
          return { success: false, error: 'File not found' };
        }

        if (resource.course_id !== params.courseId) {
          return { success: false, error: 'This file belongs to a different course' };
        }

        remoteUpdatedAt = resource.remote_updated_at;
      }

      // Insert or update the syllabus record
      // Store the original ID (with sign) so we can look it up correctly later
      const now = new Date().toISOString();
      const result = context.db.executeWrite(
        `INSERT INTO course_syllabuses
         (course_id, resource_id, source_type, resource_updated_at, last_reviewed_at, marked_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(course_id) DO UPDATE SET
           resource_id = excluded.resource_id,
           source_type = excluded.source_type,
           resource_updated_at = excluded.resource_updated_at,
           last_reviewed_at = excluded.last_reviewed_at,
           change_detected_at = NULL,
           marked_at = excluded.marked_at`,
        [
          params.courseId,
          actualId, // Store the actual ID (positive)
          sourceType,
          remoteUpdatedAt,
          now,
          now,
        ],
        'course_syllabuses'
      );

      return {
        success: true,
        data: {
          syllabusId: result.lastInsertRowid as number,
          lastReviewedAt: now,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to set course syllabus: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
