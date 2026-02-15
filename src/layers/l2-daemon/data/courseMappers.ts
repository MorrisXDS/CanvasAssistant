/**
 * Course Mappers - Transform Canvas course/attachment API responses to local schema
 */

import { z } from 'zod';
import type {
  CanvasAttachment,
  CanvasCourse,
  LocalCourse,
  LocalNotificationAttachment,
} from './DataMapperTypes';

// Validation schemas for defensive parsing
const SafeNumber = z.number().catch(0);
const SafeString = z.string().catch('');
const SafeNullableString = z.string().nullable().catch(null);
const SafeNullableNumber = z.number().nullable().catch(null);

/**
 * Safely parse a value with a Zod schema, returning the default on failure
 */
export function safeParse<T>(
  schema: z.ZodType<T>,
  value: unknown,
  fieldName?: string
): T {
  const result = schema.safeParse(value);
  if (!result.success && fieldName) {
    // Validation failures are silently handled - schema will use defaults
  }
  return result.success ? result.data : schema.parse(undefined);
}

/**
 * Map Canvas attachment to local attachment record
 * Uses Zod schemas for defensive validation of incoming data
 */
export function mapAttachment(
  canvas: CanvasAttachment,
  courseId: number
): LocalNotificationAttachment {
  const attachmentId = safeParse(SafeNumber, canvas.id, 'attachment.id');
  const displayName =
    safeParse(SafeString, canvas.display_name, 'attachment.display_name') ||
    `Attachment_${attachmentId}`;
  const filename =
    safeParse(SafeString, canvas.filename, 'attachment.filename') || displayName;
  const url = safeParse(SafeString, canvas.url, 'attachment.url');
  const size = safeParse(SafeNullableNumber, canvas.size, 'attachment.size');
  const contentType = safeParse(
    SafeNullableString,
    canvas.content_type,
    'attachment.content_type'
  );

  return {
    course_id: courseId,
    external_id: String(attachmentId),
    display_name: displayName,
    filename: filename,
    url: url,
    size_bytes: size,
    content_type: contentType,
    local_path: null,
    download_status: 'pending',
  };
}

/**
 * Determine default credits from course code (UofT convention)
 * - H courses (half-year) = 0.5 credit
 * - S courses (summer) = 0.5 credit
 * - Y courses (full-year) = 1.0 credit
 * Pattern: looks for H, S, or Y followed by a digit (e.g., CSC108H1, MAT137Y1)
 */
export function getDefaultCreditsFromCode(courseCode: string): number {
  const match = courseCode.match(/([HSY])(\d)/i);
  if (match) {
    const termIndicator = match[1].toUpperCase();
    if (termIndicator === 'H' || termIndicator === 'S') {
      return 0.5;
    }
    if (termIndicator === 'Y') {
      return 1.0;
    }
  }
  return 1.0;
}

/**
 * Map Canvas course to local course record
 * Uses Zod schemas for defensive validation of incoming data
 */
export function mapCourse(
  canvas: CanvasCourse,
  baseUrl: string,
  defaultTargetGrade: number = 80
): LocalCourse {
  const courseId = safeParse(SafeNumber, canvas.id, 'course.id');
  const courseCode =
    safeParse(SafeString, canvas.course_code, 'course.course_code') ||
    `Course_${courseId}`;
  const courseName = safeParse(SafeString, canvas.name, 'course.name') || courseCode;
  const syllabusBody = safeParse(
    SafeNullableString,
    canvas.syllabus_body,
    'course.syllabus_body'
  );
  const enrollmentTermId = safeParse(
    SafeNullableNumber,
    canvas.enrollment_term_id,
    'course.enrollment_term_id'
  );

  const enrollment = canvas.enrollments?.[0];
  const currentGrade = enrollment
    ? safeParse(
        SafeNullableNumber,
        enrollment.computed_current_score,
        'course.enrollment.computed_current_score'
      )
    : null;

  return {
    external_id: String(courseId),
    code: courseCode,
    name: courseName,
    current_grade: currentGrade,
    assessed_grade: null,
    target_grade: defaultTargetGrade,
    target_grade_source: 'default',
    landing_page_url: `${baseUrl}/courses/${courseId}`,
    syllabus_body: syllabusBody,
    last_synced_at: new Date().toISOString(),
    enrollment_term_id: enrollmentTermId,
    credits: getDefaultCreditsFromCode(courseCode),
  };
}
