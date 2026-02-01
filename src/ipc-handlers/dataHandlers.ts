/**
 * Data IPC Handlers
 * Handlers for data fetching operations:
 * - Courses, tasks, notifications
 * - Enrollment terms
 * - Policies and syllabi
 * - Files and module items
 */

import { ipcMain } from 'electron';
import type { IpcContext } from './IpcContext';

/**
 * Register all data-related IPC handlers
 */
export function registerDataHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();
  const visibleDataProvider = ctx.getVisibleDataProvider();

  // ============ Enrollment Terms ============

  ipcMain.handle('data:getEnrollmentTerms', () => {
    try {
      const rows = database.executeRead<{
        id: number;
        external_id: string;
        name: string;
        start_at: string | null;
        end_at: string | null;
      }>('SELECT * FROM enrollment_terms ORDER BY start_at DESC');

      return rows.map((row) => ({
        id: row.id,
        externalId: row.external_id,
        name: row.name,
        startAt: row.start_at,
        endAt: row.end_at,
      }));
    } catch (error) {
      logger.error(`Failed to get enrollment terms: ${error}`);
      throw error;
    }
  });

  // ============ Courses ============

  ipcMain.handle('data:getCourses', () => {
    try {
      // Filter out archived and deleted courses
      const rows = database.executeRead<{
        id: number;
        external_id: string;
        code: string;
        name: string;
        target_grade: number;
        target_grade_source: 'default' | 'manual' | null;
        assessed_grade: number | null;
        current_grade: number | null;
        color: string | null;
        nickname: string | null;
        is_hidden: number;
        last_synced_at: string | null;
        enrollment_term_id: number | null;
      }>(
        'SELECT * FROM courses WHERE archived_at IS NULL AND deleted_at IS NULL ORDER BY name'
      );

      return rows.map((row) => ({
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
        archivedAt: null, // Always null since we filter out archived courses
        archiveSource: null, // Always null since we filter out archived courses
      }));
    } catch (error) {
      logger.error(`Failed to get courses: ${error}`);
      throw error;
    }
  });

  // Get a single course by ID
  ipcMain.handle('data:getCourse', (_event, courseId: number) => {
    try {
      const row = database.executeReadOne<{
        id: number;
        external_id: string;
        code: string;
        name: string;
        target_grade: number;
        target_grade_source: 'default' | 'manual' | null;
        assessed_grade: number | null;
        current_grade: number | null;
        color: string | null;
        nickname: string | null;
        is_hidden: number;
        last_synced_at: string | null;
        enrollment_term_id: number | null;
        archived_at: string | null;
        archive_source: string | null;
      }>('SELECT * FROM courses WHERE id = ?', [courseId]);

      if (!row) {
        return null;
      }

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
        archivedAt: row.archived_at,
        archiveSource: row.archive_source,
      };
    } catch (error) {
      logger.error(`Failed to get course: ${error}`);
      throw error;
    }
  });

  // Get archived courses - sorted by term end date (primary), then alphabetically (secondary)
  ipcMain.handle('data:getArchivedCourses', () => {
    try {
      const rows = database.executeRead<{
        id: number;
        external_id: string;
        code: string;
        name: string;
        target_grade: number;
        target_grade_source: 'default' | 'manual' | null;
        assessed_grade: number | null;
        current_grade: number | null;
        color: string | null;
        nickname: string | null;
        is_hidden: number;
        last_synced_at: string | null;
        enrollment_term_id: number | null;
        archived_at: string;
        archive_source: string | null;
        term_end_at: string | null;
      }>(
        `SELECT c.*, et.end_at as term_end_at
         FROM courses c
         LEFT JOIN enrollment_terms et ON c.enrollment_term_id = et.id
         WHERE c.archived_at IS NOT NULL AND c.deleted_at IS NULL
         ORDER BY et.end_at DESC NULLS LAST, c.name ASC`
      );

      return rows.map((row) => ({
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
        archivedAt: row.archived_at,
        archiveSource: row.archive_source,
      }));
    } catch (error) {
      logger.error(`Failed to get archived courses: ${error}`);
      throw error;
    }
  });

  // ============ Tasks ============

  ipcMain.handle(
    'data:getTasks',
    (_event, options?: { courseIds?: number[] } | number) => {
      try {
        // Use VisibleDataProvider as single source of truth for visibility
        // This ensures consistent filtering across all services
        let sql: string;
        let params: number[] = [];

        if (typeof options === 'number') {
          // Legacy: single courseId - verify it's visible first
          if (visibleDataProvider && !visibleDataProvider.isCourseVisible(options)) {
            return []; // Course not visible, return empty
          }
          sql = `SELECT t.* FROM tasks t
                 WHERE t.course_id = ?
                 ORDER BY t.priority_score DESC`;
          params = [options];
        } else if (
          options?.courseIds &&
          Array.isArray(options.courseIds) &&
          options.courseIds.length > 0
        ) {
          // Filter provided courseIds to only visible ones
          const visibleIds = visibleDataProvider?.getVisibleCourseIds() ?? [];
          const visibleSet = new Set(visibleIds);
          const filteredCourseIds = options.courseIds.filter((id) => visibleSet.has(id));

          if (filteredCourseIds.length === 0) return [];

          const placeholders = filteredCourseIds.map(() => '?').join(', ');
          sql = `SELECT t.* FROM tasks t
                 WHERE t.course_id IN (${placeholders})
                 ORDER BY t.priority_score DESC`;
          params = filteredCourseIds;
        } else {
          // No filter - return tasks from all visible courses
          const visibleIds = visibleDataProvider?.getVisibleCourseIds() ?? [];
          if (visibleIds.length === 0) return [];

          const placeholders = visibleIds.map(() => '?').join(', ');
          sql = `SELECT t.* FROM tasks t
                 WHERE t.course_id IN (${placeholders})
                 ORDER BY t.priority_score DESC`;
          params = visibleIds;
        }

        const rows = database.executeRead<{
          id: number;
          external_id: string;
          course_id: number;
          title: string;
          description: string | null;
          due_at: string | null;
          due_time_known: number;
          weight: number;
          grade: number | null;
          points_possible: number | null;
          priority_score: number;
          is_completed: number;
          completed_at: string | null;
          submission_status: string | null;
          task_type: string | null;
          is_optional: number;
        }>(sql, params);

        return rows.map((row) => ({
          id: row.id,
          externalId: row.external_id,
          courseId: row.course_id,
          title: row.title,
          description: row.description,
          dueAt: row.due_at,
          dueTimeKnown: Boolean(row.due_time_known ?? 1), // Default to true for backward compat
          weight: row.weight,
          grade: row.grade,
          pointsPossible: row.points_possible,
          priorityScore: row.priority_score,
          isCompleted: Boolean(row.is_completed),
          completedAt: row.completed_at,
          submissionStatus: row.submission_status,
          taskType: row.task_type,
          isOptional: Boolean(row.is_optional),
        }));
      } catch (error) {
        logger.error(`Failed to get tasks: ${error}`);
        throw error;
      }
    }
  );

  // Get tasks for an archived course (bypasses visibility filtering)
  // Archived courses are local-only sandboxes - users can view/edit without affecting active workflows
  ipcMain.handle('data:getTasksForArchivedCourse', (_event, courseId: number) => {
    try {
      // Verify the course is actually archived
      const course = database.executeReadOne<{ archived_at: string | null }>(
        'SELECT archived_at FROM courses WHERE id = ?',
        [courseId]
      );

      if (!course?.archived_at) {
        logger.error(
          `Attempted to get tasks for non-archived course ${courseId} via archived endpoint`
        );
        return [];
      }

      const rows = database.executeRead<{
        id: number;
        external_id: string;
        course_id: number;
        title: string;
        description: string | null;
        due_at: string | null;
        due_time_known: number;
        weight: number;
        grade: number | null;
        points_possible: number | null;
        priority_score: number;
        is_completed: number;
        completed_at: string | null;
        submission_status: string | null;
        task_type: string | null;
        is_optional: number;
      }>(
        `SELECT * FROM tasks WHERE course_id = ? ORDER BY priority_score DESC`,
        [courseId]
      );

      return rows.map((row) => ({
        id: row.id,
        externalId: row.external_id,
        courseId: row.course_id,
        title: row.title,
        description: row.description,
        dueAt: row.due_at,
        dueTimeKnown: Boolean(row.due_time_known ?? 1),
        weight: row.weight,
        grade: row.grade,
        pointsPossible: row.points_possible,
        priorityScore: row.priority_score,
        isCompleted: Boolean(row.is_completed),
        completedAt: row.completed_at,
        submissionStatus: row.submission_status,
        taskType: row.task_type,
        isOptional: Boolean(row.is_optional),
      }));
    } catch (error) {
      logger.error(`Failed to get tasks for archived course: ${error}`);
      throw error;
    }
  });

  // ============ Notifications ============

  ipcMain.handle(
    'data:getNotifications',
    (_event, options?: { courseIds?: number[] }) => {
      try {
        // Use VisibleDataProvider as single source of truth for visibility
        // Always include system notifications (course_id IS NULL)
        const visibleIds = visibleDataProvider?.getVisibleCourseIds() ?? [];
        let sql: string;
        let params: number[] = [];

        if (
          options?.courseIds &&
          Array.isArray(options.courseIds) &&
          options.courseIds.length > 0
        ) {
          // Filter provided courseIds to only visible ones
          const visibleSet = new Set(visibleIds);
          const filteredCourseIds = options.courseIds.filter((id) => visibleSet.has(id));

          if (filteredCourseIds.length === 0) {
            // Only system notifications when no visible courses match
            sql = `SELECT * FROM notifications WHERE course_id IS NULL ORDER BY published_at DESC`;
          } else {
            const placeholders = filteredCourseIds.map(() => '?').join(', ');
            sql = `SELECT * FROM notifications
                   WHERE course_id IS NULL OR course_id IN (${placeholders})
                   ORDER BY published_at DESC`;
            params = filteredCourseIds;
          }
        } else {
          // No filter - return notifications from all visible courses + system
          if (visibleIds.length === 0) {
            sql = `SELECT * FROM notifications WHERE course_id IS NULL ORDER BY published_at DESC`;
          } else {
            const placeholders = visibleIds.map(() => '?').join(', ');
            sql = `SELECT * FROM notifications
                   WHERE course_id IS NULL OR course_id IN (${placeholders})
                   ORDER BY published_at DESC`;
            params = visibleIds;
          }
        }

        const rows = database.executeRead<{
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
        }>(sql, params);

        return rows.map((row) => ({
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
        }));
      } catch (error) {
        logger.error(`Failed to get notifications: ${error}`);
        throw error;
      }
    }
  );

  // Get a single notification by ID
  ipcMain.handle('data:getNotification', (_event, notificationId: number) => {
    try {
      const row = database.executeReadOne<{
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
      }>('SELECT * FROM notifications WHERE id = ?', [notificationId]);

      if (!row) {
        return null;
      }

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
    } catch (error) {
      logger.error(`Failed to get notification: ${error}`);
      throw error;
    }
  });

  // Get announcements for a specific course
  ipcMain.handle('data:getCourseNotifications', (_event, courseId: number) => {
    try {
      const rows = database.executeRead<{
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
      }>(
        'SELECT * FROM notifications WHERE course_id = ? ORDER BY published_at DESC',
        [courseId]
      );

      return rows.map((row) => ({
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
      }));
    } catch (error) {
      logger.error(`Failed to get course notifications: ${error}`);
      throw error;
    }
  });

  // ============ Policies ============

  // Get policies for a course
  ipcMain.handle('data:getPolicies', (_event, courseId: number) => {
    try {
      const rows = database.executeRead<{
        id: number;
        course_id: number;
        policy_type: string;
        title: string;
        description: string | null;
        penalty_percent: number | null;
        grace_period_hours: number | null;
        source_type: string;
        is_active: number;
      }>('SELECT * FROM course_policies WHERE course_id = ? ORDER BY policy_type', [courseId]);

      return rows.map((row) => ({
        id: row.id,
        courseId: row.course_id,
        policyType: row.policy_type,
        title: row.title,
        description: row.description,
        penaltyPercent: row.penalty_percent,
        gracePeriodHours: row.grace_period_hours,
        sourceType: row.source_type,
        isActive: Boolean(row.is_active),
      }));
    } catch (error) {
      logger.error(`Failed to get policies: ${error}`);
      throw error;
    }
  });

  // Get all policies for multiple courses (for policy badges on tasks)
  ipcMain.handle('data:getAllPolicies', (_event, options?: { courseIds?: number[] }) => {
    try {
      const visibleIds = visibleDataProvider?.getVisibleCourseIds() ?? [];

      let sql: string;
      let params: number[] = [];

      if (
        options?.courseIds &&
        Array.isArray(options.courseIds) &&
        options.courseIds.length > 0
      ) {
        // Filter provided courseIds to only visible ones
        const visibleSet = new Set(visibleIds);
        const filteredCourseIds = options.courseIds.filter((id) => visibleSet.has(id));

        if (filteredCourseIds.length === 0) return [];

        const placeholders = filteredCourseIds.map(() => '?').join(', ');
        sql = `SELECT * FROM course_policies WHERE course_id IN (${placeholders}) ORDER BY course_id, policy_type`;
        params = filteredCourseIds;
      } else {
        // Return policies for all visible courses
        if (visibleIds.length === 0) return [];

        const placeholders = visibleIds.map(() => '?').join(', ');
        sql = `SELECT * FROM course_policies WHERE course_id IN (${placeholders}) ORDER BY course_id, policy_type`;
        params = visibleIds;
      }

      const rows = database.executeRead<{
        id: number;
        course_id: number;
        policy_type: string;
        title: string;
        description: string | null;
        penalty_percent: number | null;
        grace_period_hours: number | null;
        source_type: string;
        is_active: number;
      }>(sql, params);

      return rows.map((row) => ({
        id: row.id,
        courseId: row.course_id,
        policyType: row.policy_type,
        title: row.title,
        description: row.description,
        penaltyPercent: row.penalty_percent,
        gracePeriodHours: row.grace_period_hours,
        sourceType: row.source_type,
        isActive: Boolean(row.is_active),
      }));
    } catch (error) {
      logger.error(`Failed to get all policies: ${error}`);
      throw error;
    }
  });

  // ============ Syllabus ============

  // Get syllabus designation for a course
  ipcMain.handle('data:getCourseSyllabus', (_event, courseId: number) => {
    try {
      // Check resources table first (for synced file syllabus)
      const resourceSyllabus = database.executeReadOne<{
        id: number;
        title: string;
        url: string | null;
        local_path: string | null;
        download_status: string;
        downloaded_at: string | null;
      }>(
        `SELECT id, title, url, local_path, download_status, downloaded_at
         FROM resources
         WHERE course_id = ? AND is_syllabus = 1`,
        [courseId]
      );

      if (resourceSyllabus) {
        return {
          type: 'resource' as const,
          resourceId: resourceSyllabus.id,
          title: resourceSyllabus.title,
          url: resourceSyllabus.url,
          localPath: resourceSyllabus.local_path,
          downloadStatus: resourceSyllabus.download_status,
          downloadedAt: resourceSyllabus.downloaded_at,
        };
      }

      // Check for page syllabus (from course_pages table)
      const pageSyllabus = database.executeReadOne<{
        id: number;
        title: string;
        external_id: string;
        url: string | null;
      }>(
        `SELECT id, title, external_id, url
         FROM course_pages
         WHERE course_id = ? AND is_syllabus = 1`,
        [courseId]
      );

      if (pageSyllabus) {
        return {
          type: 'page' as const,
          pageId: pageSyllabus.id,
          title: pageSyllabus.title,
          externalId: pageSyllabus.external_id,
          url: pageSyllabus.url,
        };
      }

      return null;
    } catch (error) {
      logger.error(`Failed to get course syllabus: ${error}`);
      throw error;
    }
  });

  // ============ Grade History ============

  // Get grade history for a course
  ipcMain.handle('data:getGradeHistory', (_event, courseId: number) => {
    try {
      const rows = database.executeRead<{
        recorded_at: string;
        grade: number;
      }>(
        `SELECT recorded_at, grade FROM grade_history
         WHERE course_id = ?
         ORDER BY recorded_at ASC`,
        [courseId]
      );

      return rows.map((row) => ({
        recordedAt: row.recorded_at,
        grade: row.grade,
      }));
    } catch (error) {
      logger.error(`Failed to get grade history: ${error}`);
      throw error;
    }
  });
}
