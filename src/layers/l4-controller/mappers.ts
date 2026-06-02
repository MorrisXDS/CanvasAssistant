/**
 * Entity Mappers - Transform DB rows to entities and vice versa
 *
 * These mappers ensure consistent transformation between database
 * rows and entity objects used by the store.
 */

import type {
  Course,
  CourseDetail,
  Task,
  Notification,
  ImportedCalendar,
  DisplayCalendarEvent,
} from '../../shared/ipc-contract';

// Re-export types from centralized location for convenience
export type { CourseRow, TaskRow, NotificationRow } from '../l1-persistence';

/**
 * Map a course database row to a Course entity.
 */
export function mapCourseRowToEntity(row: {
  id: number;
  external_id: string;
  code: string;
  name: string;
  target_grade: number;
  target_grade_source?: 'default' | 'manual';
  assessed_grade: number | null;
  current_grade: number | null;
  color: string | null;
  nickname: string | null;
  is_hidden: number | boolean;
  last_synced_at: string | null;
  enrollment_term_id: number | null;
  credits?: number | null;
  archived_at?: string | null;
  archive_source?: 'manual' | 'auto' | null;
}): Course {
  return {
    id: row.id,
    externalId: row.external_id,
    code: row.code,
    name: row.name,
    targetGrade: row.target_grade,
    targetGradeSource: row.target_grade_source ?? 'default',
    assessedGrade: row.assessed_grade,
    currentGrade: row.current_grade,
    color: row.color,
    nickname: row.nickname,
    isHidden: Boolean(row.is_hidden),
    lastSyncedAt: row.last_synced_at,
    enrollmentTermId: row.enrollment_term_id,
    credits: row.credits ?? 1.0,
    archivedAt: row.archived_at ?? null,
    archiveSource: row.archive_source ?? null,
  };
}

/**
 * Map a course row to CourseDetail (includes syllabus and total weight).
 */
export function mapCourseRowToDetail(row: {
  id: number;
  external_id: string;
  code: string;
  name: string;
  target_grade: number;
  target_grade_source?: 'default' | 'manual';
  assessed_grade: number | null;
  current_grade: number | null;
  total_weight: number;
  color: string | null;
  nickname: string | null;
  is_hidden: number | boolean;
  syllabus_body: string | null;
  last_synced_at: string | null;
  enrollment_term_id: number | null;
  credits?: number | null;
}): CourseDetail {
  return {
    ...mapCourseRowToEntity(row),
    totalWeight: row.total_weight,
    syllabusBody: row.syllabus_body,
    gradeCurveAdjustment:
      (row as { grade_curve_adjustment?: number }).grade_curve_adjustment ?? 0,
  };
}

/**
 * Map a task database row to a Task entity.
 */
export function mapTaskRowToEntity(row: {
  id: number;
  external_id: string;
  source_type?: string;
  course_id: number;
  title: string;
  description: string | null;
  notes?: string | null;
  unlock_at?: string | null;
  due_at: string | null;
  due_time_known?: number | boolean;
  weight: number;
  grade: number | null;
  points_possible: number | null;
  priority_score: number;
  is_completed: number | boolean;
  is_optional?: number | boolean;
  completed_at: string | null;
  submission_status: string | null;
  task_type?: string | null;
  task_group_id?: number | null;
  calendar_event_id?: number | null;
  location?: string | null;
  field_sources?: string | null;
}): Task {
  const fieldSources = row.field_sources ? JSON.parse(row.field_sources) : undefined;

  // Determine source type: explicitly from row, or infer from external_id pattern
  const sourceType =
    row.source_type === 'canvas' || row.source_type === 'user'
      ? row.source_type
      : row.external_id.startsWith('user_')
        ? 'user'
        : 'canvas';

  return {
    id: row.id,
    externalId: row.external_id,
    sourceType,
    courseId: row.course_id,
    title: row.title,
    description: row.description,
    notes: row.notes ?? null,
    unlockAt: row.unlock_at ?? null,
    dueAt: row.due_at,
    dueTimeKnown: Boolean(row.due_time_known ?? 1), // Default true for backward compat
    weight: row.weight,
    grade: row.grade,
    pointsPossible: row.points_possible,
    priorityScore: row.priority_score,
    isCompleted: Boolean(row.is_completed),
    isOptional: Boolean(row.is_optional),
    completedAt: row.completed_at,
    submissionStatus: row.submission_status,
    taskType: row.task_type ?? null,
    taskGroupId: row.task_group_id ?? null,
    calendarEventId: row.calendar_event_id ?? null,
    location: row.location ?? null,
    fieldSources,
  };
}

/**
 * Map a notification database row to a Notification entity.
 */
export function mapNotificationRowToEntity(row: {
  id: number;
  source_type: string;
  source_id: string;
  course_id: number | null;
  title: string;
  message: string;
  message_html: string | null;
  published_at: string;
  dismissed_at: string | null;
  url: string | null;
}): Notification {
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    courseId: row.course_id,
    title: row.title,
    message: row.message,
    messageHtml: row.message_html,
    publishedAt: row.published_at,
    dismissedAt: row.dismissed_at,
    url: row.url,
  };
}

/**
 * Map an imported calendar row to an ImportedCalendar entity.
 */
export function mapCalendarRowToEntity(row: {
  id: number;
  name: string;
  filename: string;
  file_hash: string | null;
  color: string;
  event_count: number;
  is_visible: number | boolean;
  imported_at: string;
  updated_at: string;
}): ImportedCalendar {
  return {
    id: row.id,
    name: row.name,
    filename: row.filename,
    fileHash: row.file_hash,
    color: row.color,
    eventCount: row.event_count,
    isVisible: Boolean(row.is_visible),
    importedAt: row.imported_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Map a calendar event row to a DisplayCalendarEvent entity.
 */
export function mapCalendarEventRowToEntity(row: {
  id: number;
  external_id: string | null;
  source_type: string;
  course_id: number | null;
  imported_calendar_id: number | null;
  task_id?: number | null;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  all_day: number | boolean;
  location: string | null;
  uid: string | null;
  recurrence_rule: string | null;
  recurrence_exception_dates: string | null;
  parent_event_id: number | null;
  event_color?: string | null;
  notes?: string | null;
  reminder_minutes?: number | null;
  calendar_name?: string | null;
  calendar_color?: string | null;
}): DisplayCalendarEvent {
  return {
    id: row.id,
    externalId: row.external_id,
    sourceType: row.source_type as 'canvas' | 'user' | 'imported',
    courseId: row.course_id,
    importedCalendarId: row.imported_calendar_id,
    taskId: row.task_id ?? null,
    title: row.title,
    description: row.description,
    startAt: row.start_at,
    endAt: row.end_at,
    allDay: Boolean(row.all_day),
    location: row.location,
    uid: row.uid,
    recurrenceRule: row.recurrence_rule,
    recurrenceExceptionDates: row.recurrence_exception_dates,
    parentEventId: row.parent_event_id,
    eventColor: row.event_color ?? null,
    notes: row.notes ?? null,
    reminderMinutes: row.reminder_minutes ?? null,
    isRecurrenceInstance: false,
    color: row.event_color || row.calendar_color || '#6366F1',
    calendarName: row.calendar_name ?? undefined,
  };
}

/**
 * Helper to merge entity updates.
 * Returns a new entity with the updates applied.
 */
export function mergeEntityUpdate<T extends { id: number }>(
  entities: T[],
  updatedEntity: T
): T[] {
  return entities.map((entity) =>
    entity.id === updatedEntity.id ? updatedEntity : entity
  );
}

/**
 * Helper to remove an entity from a list by ID.
 */
export function removeEntityById<T extends { id: number }>(
  entities: T[],
  id: number
): T[] {
  return entities.filter((entity) => entity.id !== id);
}

/**
 * Helper to add or update an entity in a list.
 */
export function upsertEntity<T extends { id: number }>(entities: T[], entity: T): T[] {
  const existingIndex = entities.findIndex((e) => e.id === entity.id);
  if (existingIndex >= 0) {
    return [
      ...entities.slice(0, existingIndex),
      entity,
      ...entities.slice(existingIndex + 1),
    ];
  }
  return [...entities, entity];
}

/**
 * Map local course IDs to Canvas external IDs.
 * Used when sync options come from UI with local IDs but SyncEngine
 * needs Canvas external IDs for filtering API responses.
 *
 * @param localIds - Array of local database course IDs
 * @param db - Database instance to query
 * @returns Array of Canvas external IDs (as numbers)
 */
export function mapLocalCourseIdsToExternal(
  localIds: number[],
  db: { executeRead: <T>(sql: string, params: unknown[]) => T[] }
): number[] {
  if (!localIds || localIds.length === 0) return [];

  const rows = db.executeRead<{ external_id: string }>(
    `SELECT external_id FROM courses WHERE id IN (${localIds.map(() => '?').join(',')})`,
    localIds
  );

  return rows.map((r) => parseInt(r.external_id, 10)).filter((id) => !isNaN(id));
}
