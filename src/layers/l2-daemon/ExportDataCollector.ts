/**
 * Export Data Collector
 * Handles data collection and sanitization for exports
 */

import type { Database } from '../l1-persistence/Database';
import type { VisibleDataProvider } from '../l1-persistence/VisibleDataProvider';
import type {
  CourseRow,
  TaskRow,
  NotificationRow,
  PolicyRow,
  GraceTokenRow,
} from '../l1-persistence/DatabaseRowTypes';
import type { SelectiveExportOptions, SyncMetadataExport } from './ExportManagerTypes';

export interface ExportDataCollectorDeps {
  db: Database;
  visibleDataProvider: VisibleDataProvider;
  appVersion: string;
  emitProgress: (stage: string, progress: number, message: string) => void;
}

export interface CollectedExportData {
  courses: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  notifications: NotificationRow[];
  policies: PolicyRow[];
  graceTokens: GraceTokenRow[];
  pages: Record<string, unknown>[];
  calendarEvents: Record<string, unknown>[];
  modules: Record<string, unknown>[];
  moduleItems: Record<string, unknown>[];
  resources: Record<string, unknown>[];
  syncMetadata: SyncMetadataExport;
  courseIds: number[];
}

/**
 * Resolve course IDs - use provided or fall back to visible courses
 */
export function resolveCourseIds(
  visibleDataProvider: VisibleDataProvider,
  courseIds?: number[],
  includeArchived?: boolean,
  archivedCourseIds?: number[]
): number[] {
  let result: number[] = [];

  // Handle visible courses
  if (courseIds && courseIds.length > 0) {
    const visibleIds = new Set(visibleDataProvider.getVisibleCourseIds());
    result = courseIds.filter((id) => visibleIds.has(id));
  } else {
    result = visibleDataProvider.getVisibleCourseIds();
  }

  // Handle archived courses
  if (includeArchived) {
    const allArchivedIds = visibleDataProvider.getArchivedCourseIds();
    result = [...result, ...allArchivedIds];
  } else if (archivedCourseIds && archivedCourseIds.length > 0) {
    const validArchivedIds = new Set(visibleDataProvider.getArchivedCourseIds());
    const filteredArchivedIds = archivedCourseIds.filter((id) => validArchivedIds.has(id));
    result = [...result, ...filteredArchivedIds];
  }

  return [...new Set(result)];
}

/**
 * Sanitize course data for export (remove internal fields)
 */
export function sanitizeCourseForExport(course: CourseRow): Record<string, unknown> {
  return {
    id: course.id,
    externalId: course.external_id,
    code: course.code,
    name: course.name,
    nickname: course.nickname,
    color: course.color,
    enrollmentTermId: course.enrollment_term_id,
    targetGrade: course.target_grade,
    targetGradeSource: course.target_grade_source,
    isHidden: course.is_hidden,
    currentGrade: course.current_grade,
    assessedGrade: course.assessed_grade,
    totalWeight: course.total_weight,
    syllabusBody: course.syllabus_body,
    archivedAt: course.archived_at,
    archiveSource: course.archive_source,
  };
}

/**
 * Sanitize task data for export (remove internal fields)
 */
export function sanitizeTaskForExport(task: TaskRow): Record<string, unknown> {
  return {
    id: task.id,
    externalId: task.external_id,
    courseId: task.course_id,
    title: task.title,
    description: task.description,
    dueAt: task.due_at,
    dueTimeKnown: task.due_time_known,
    unlockAt: task.unlock_at,
    lockAt: task.lock_at,
    weight: task.weight,
    grade: task.grade,
    pointsPossible: task.points_possible,
    priorityScore: task.priority_score,
    isCompleted: task.is_completed,
    isOptional: task.is_optional,
    completedAt: task.completed_at,
    submissionStatus: task.submission_status,
    userSubmissionStatus: task.user_submission_status,
    taskType: task.task_type,
    taskGroupId: task.task_group_id,
    fieldSources: task.field_sources,
  };
}

/**
 * Collect sync metadata for export
 */
export function collectSyncMetadata(db: Database): SyncMetadataExport {
  let endpoints: Record<string, unknown>[] = [];
  let preferences: Record<string, unknown>[] = [];
  let pendingConflicts: Record<string, unknown>[] = [];
  let lastSyncedAt: string | null = null;

  try {
    endpoints = db.executeRead<Record<string, unknown>>('SELECT * FROM sync_metadata');
  } catch {
    // Table may not exist
  }

  try {
    preferences = db.executeRead<Record<string, unknown>>('SELECT * FROM sync_preferences');
  } catch {
    // Table may not exist
  }

  try {
    pendingConflicts = db.executeRead<Record<string, unknown>>(
      'SELECT * FROM pending_sync_conflicts'
    );
  } catch {
    // Table may not exist
  }

  try {
    const lastSync = db.executeReadOne<{ last_synced_at: string }>(
      'SELECT MAX(last_synced_at) as last_synced_at FROM sync_metadata'
    );
    lastSyncedAt = lastSync?.last_synced_at ?? null;
  } catch {
    // Table may not exist
  }

  return { endpoints, preferences, pendingConflicts, lastSyncedAt };
}

/**
 * Collect all export data based on options
 */
export function collectExportData(
  deps: ExportDataCollectorDeps,
  options: SelectiveExportOptions
): CollectedExportData | { error: string } {
  const courseIds = resolveCourseIds(
    deps.visibleDataProvider,
    options.courses,
    options.includeArchived,
    options.archivedCourses
  );

  if (courseIds.length === 0) {
    return { error: 'No courses to export' };
  }

  const placeholders = courseIds.map(() => '?').join(', ');

  // Collect courses
  const courses = deps.db
    .executeRead<CourseRow>(`SELECT * FROM courses WHERE id IN (${placeholders})`, courseIds)
    .map(sanitizeCourseForExport);

  deps.emitProgress('collecting', 15, `Found ${courses.length} courses`);

  // Collect tasks if requested
  let tasks: Record<string, unknown>[] = [];
  if (options.includeTasks !== false) {
    let taskSql = `SELECT * FROM tasks WHERE course_id IN (${placeholders})`;
    const taskParams: (string | number)[] = [...courseIds];

    if (options.taskStatus === 'pending') {
      taskSql += ' AND is_completed = 0';
    } else if (options.taskStatus === 'completed') {
      taskSql += ' AND is_completed = 1';
    }

    if (options.dateRange) {
      taskSql += ' AND due_at >= ? AND due_at <= ?';
      taskParams.push(options.dateRange.start.toISOString());
      taskParams.push(options.dateRange.end.toISOString());
    }

    tasks = deps.db.executeRead<TaskRow>(taskSql, taskParams).map(sanitizeTaskForExport);
    deps.emitProgress('collecting', 25, `Found ${tasks.length} tasks`);
  }

  // Collect notifications if requested
  let notifications: NotificationRow[] = [];
  if (options.includeNotifications) {
    notifications = deps.db.executeRead<NotificationRow>(
      `SELECT * FROM notifications WHERE course_id IN (${placeholders})`,
      courseIds
    );
    deps.emitProgress('collecting', 35, `Found ${notifications.length} notifications`);
  }

  // Collect policies
  const policies = deps.db.executeRead<PolicyRow>(
    `SELECT * FROM course_policies WHERE course_id IN (${placeholders})`,
    courseIds
  );

  // Collect grace tokens
  const graceTokens = deps.db.executeRead<GraceTokenRow>(
    `SELECT * FROM grace_tokens WHERE course_id IN (${placeholders})`,
    courseIds
  );

  // Collect pages
  const pages = deps.db.executeRead<Record<string, unknown>>(
    `SELECT * FROM course_pages WHERE course_id IN (${placeholders})`,
    courseIds
  );

  // Collect calendar events if requested
  let calendarEvents: Record<string, unknown>[] = [];
  if (options.includeCalendar) {
    calendarEvents = deps.db.executeRead<Record<string, unknown>>(
      `SELECT * FROM calendar_events WHERE course_id IN (${placeholders})`,
      courseIds
    );
  }

  // Collect modules
  const modules = deps.db.executeRead<Record<string, unknown>>(
    `SELECT * FROM modules WHERE course_id IN (${placeholders})`,
    courseIds
  );

  // Collect module items
  const moduleIds = modules.map((m) => m.id as number);
  let moduleItems: Record<string, unknown>[] = [];
  if (moduleIds.length > 0) {
    const modulePlaceholders = moduleIds.map(() => '?').join(', ');
    moduleItems = deps.db.executeRead<Record<string, unknown>>(
      `SELECT * FROM module_items WHERE module_id IN (${modulePlaceholders})`,
      moduleIds
    );
  }

  // Collect resources
  const resources = deps.db.executeRead<Record<string, unknown>>(
    `SELECT * FROM resources WHERE course_id IN (${placeholders})`,
    courseIds
  );

  // Collect sync metadata
  const syncMetadata = collectSyncMetadata(deps.db);

  deps.emitProgress('collecting', 45, 'Building export data...');

  return {
    courses,
    tasks,
    notifications,
    policies,
    graceTokens,
    pages,
    calendarEvents,
    modules,
    moduleItems,
    resources,
    syncMetadata,
    courseIds,
  };
}
