/**
 * CanvasFieldMappings - Defines which fields are provided by Canvas vs locally managed
 *
 * This module is the single source of truth for field ownership.
 * Used by SyncConflictResolver to determine conflict handling.
 *
 * IMPORTANT: When adding fields to DataMappers, update this file accordingly.
 *
 * ## Field Authority Rules
 *
 * Fields are categorized into three types:
 *
 * ### 1. Canvas Fields (CANVAS_PROVIDED_FIELDS)
 * Fields that Canvas API provides. During sync:
 * - New records: Canvas values are used
 * - Existing records: Conflict detection if local differs from Canvas
 *
 * ### 2. Authoritative Fields (CANVAS_AUTHORITATIVE_FIELDS)
 * Subset of Canvas fields that ALWAYS use Canvas values without user prompts.
 * These represent Canvas's ground truth:
 * - `grade` - Canvas submission score is authoritative (user cannot override)
 * - `due_at` - Canvas due date is authoritative (user cannot override)
 * - `submission_status` - Canvas workflow_state is authoritative
 * - `completed_at` - Canvas submitted_at is authoritative
 *
 * Note: `is_completed` is NOT authoritative - users can mark tasks complete
 * locally and it will persist even if Canvas shows incomplete.
 *
 * ### 3. Local Fields (LOCAL_ONLY_FIELDS)
 * Fields managed entirely by the application, never synced from Canvas:
 * - `weight` - Calculated by L3 intelligence
 * - `priority_score` - Calculated by L3 intelligence
 * - `task_group_id` - Local grouping
 * - `is_optional` - User-marked optional status
 *
 * ## Adding New Fields
 *
 * When adding a new field to the database schema:
 * 1. Determine if it comes from Canvas API or is local-only
 * 2. Add to the appropriate constant array below
 * 3. Update DatabaseRowTypes.ts with the field
 * 4. If it's a sync field, update the relevant DataMapper
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
  'submission_status', // Derived from Canvas submission.workflow_state
  'completed_at', // From Canvas submission.submitted_at
  'grade', // From Canvas submission.score / points_possible * 100
  'task_type', // Derived from Canvas submission_types - user can override with conflict UI
] as const;

/**
 * Authoritative Canvas fields that ALWAYS use Canvas values without triggering conflicts.
 * These fields represent Canvas's ground truth and should never be overridden by local state.
 *
 * ## Field Explanations
 *
 * @field submission_status - Canvas workflow_state (pending, submitted, graded).
 *        User can set `user_submission_status` independently for OR logic.
 *
 * @field completed_at - Timestamp from Canvas submission.submitted_at.
 *        Represents when the student actually submitted.
 *
 * @field grade - Numeric grade from Canvas submission.score / points_possible * 100.
 *        Instructor grades are always authoritative.
 *
 * @field due_at - Due date from Canvas assignment.due_at.
 *        Canvas assignment dates are authoritative for academic compliance.
 *
 * @field unlock_at - Date when assignment becomes available.
 *        Canvas controls assignment availability.
 *
 * @field lock_at - Date when assignment becomes locked.
 *        Canvas controls assignment lock dates.
 *
 * ## Conflict-enabled Fields (user can override via conflict UI)
 *
 * @field task_type - Derived from Canvas submission_types. User can override
 *        and will see conflict UI if Canvas value differs from local value.
 *        NOT authoritative - user decides which value to keep.
 *
 * @field is_completed - User can mark tasks complete locally. If Canvas
 *        differs, user decides via conflict UI which value to keep.
 */
export const TASK_AUTHORITATIVE_FIELDS = [
  'submission_status', // Canvas workflow_state is authoritative
  'completed_at', // Canvas submitted_at is authoritative
  'grade', // Canvas score is authoritative
  'due_at', // Canvas due date is authoritative
  'unlock_at', // Canvas unlock date is authoritative
  'lock_at', // Canvas lock date is authoritative
] as const;

/**
 * Fields that are locally managed for tasks (not from Canvas).
 * These should never be overwritten by sync.
 */
export const TASK_LOCAL_FIELDS = [
  'weight', // Calculated by L3 intelligence
  'priority_score', // Calculated by L3 intelligence
  'task_group_id', // Local grouping
  'local_modified_fields',
  'is_optional', // User-marked optional (moves to "Not for Grade")
  'calendar_event_id', // Link to calendar event (bidirectional sync)
  'user_submission_status', // User-set submission status (OR logic with Canvas)
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
 * Combined mapping of authoritative Canvas fields.
 * These fields always use Canvas values without conflict prompts.
 */
export const CANVAS_AUTHORITATIVE_FIELDS: Record<string, readonly string[]> = {
  tasks: TASK_AUTHORITATIVE_FIELDS,
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
 * Type guard to check if a field is authoritative (always use Canvas, no conflicts).
 */
export function isAuthoritativeField(tableName: string, field: string): boolean {
  const fields = CANVAS_AUTHORITATIVE_FIELDS[tableName];
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
