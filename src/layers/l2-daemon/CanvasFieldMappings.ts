/**
 * CanvasFieldMappings - Defines which fields are provided by Canvas vs locally managed
 *
 * This module is the single source of truth for field ownership.
 * Used by SyncConflictResolver to determine conflict handling.
 *
 * IMPORTANT: When adding fields to DataMappers, update this file accordingly.
 */

/**
 * Fields that Canvas provides for courses.
 * These are mapped in mapCourse() from CanvasCourse.
 */
export const COURSE_CANVAS_FIELDS = [
  'external_id',
  'code',
  'name',
  'current_grade',
  'landing_page_url',
  'syllabus_body',
  'last_synced_at',
  'enrollment_term_id',
] as const;

/**
 * Fields that are locally managed for courses (not from Canvas).
 * These should never be overwritten by sync.
 */
export const COURSE_LOCAL_FIELDS = [
  'assessed_grade',
  'target_grade',
  'color',
  'nickname',
  'is_hidden',
  'local_modified_fields',
] as const;

/**
 * Fields that Canvas provides for tasks.
 * These are mapped in mapAssignment() from CanvasAssignment.
 */
export const TASK_CANVAS_FIELDS = [
  'external_id',
  'source_type',
  'course_id',
  'title',
  'description',
  'due_at',
  'unlock_at',
  'lock_at',
  'points_possible',
  'submission_types',
  'is_completed',
] as const;

/**
 * Fields that are locally managed for tasks (not from Canvas).
 * These should never be overwritten by sync.
 */
export const TASK_LOCAL_FIELDS = [
  'weight',           // Calculated by L3 intelligence
  'priority_score',   // Calculated by L3 intelligence
  'task_type',        // Detected/classified locally
  'task_group_id',    // Local grouping
  'grade',            // User-entered or synced separately
  'local_modified_fields',
] as const;

/**
 * Fields that Canvas provides for notifications.
 * These are mapped in mapAnnouncement() from CanvasAnnouncement.
 */
export const NOTIFICATION_CANVAS_FIELDS = [
  'source_type',
  'source_id',
  'course_id',
  'title',
  'message',
  'message_html',
  'url',
  'priority_level',
  'published_at',
  'is_policy_related',
  'policy_keywords',
] as const;

/**
 * Fields that are locally managed for notifications.
 */
export const NOTIFICATION_LOCAL_FIELDS = [
  'dismissed_at',
  'is_read',
  'local_modified_fields',
] as const;

/**
 * Combined mapping for use by SyncConflictResolver.
 * Maps table name to list of Canvas-provided fields.
 */
export const CANVAS_PROVIDED_FIELDS: Record<string, readonly string[]> = {
  courses: COURSE_CANVAS_FIELDS,
  tasks: TASK_CANVAS_FIELDS,
  notifications: NOTIFICATION_CANVAS_FIELDS,
};

/**
 * Combined mapping of locally-managed fields.
 * Maps table name to list of local-only fields.
 */
export const LOCAL_ONLY_FIELDS: Record<string, readonly string[]> = {
  courses: COURSE_LOCAL_FIELDS,
  tasks: TASK_LOCAL_FIELDS,
  notifications: NOTIFICATION_LOCAL_FIELDS,
};

/**
 * Type guard to check if a field is Canvas-provided for a given entity.
 */
export function isCanvasField(tableName: string, field: string): boolean {
  const fields = CANVAS_PROVIDED_FIELDS[tableName];
  return fields ? fields.includes(field) : false;
}

/**
 * Type guard to check if a field is locally-managed for a given entity.
 */
export function isLocalField(tableName: string, field: string): boolean {
  const fields = LOCAL_ONLY_FIELDS[tableName];
  return fields ? fields.includes(field) : false;
}

/**
 * Get all Canvas-provided fields for an entity type.
 */
export function getCanvasFields(tableName: string): readonly string[] {
  return CANVAS_PROVIDED_FIELDS[tableName] ?? [];
}

/**
 * Get all locally-managed fields for an entity type.
 */
export function getLocalFields(tableName: string): readonly string[] {
  return LOCAL_ONLY_FIELDS[tableName] ?? [];
}
