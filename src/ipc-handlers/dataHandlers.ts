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
  const getVisibleDataProvider = ctx.getVisibleDataProvider;

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
          if (getVisibleDataProvider() && !getVisibleDataProvider()!.isCourseVisible(options)) {
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
          const visibleIds = getVisibleDataProvider()?.getVisibleCourseIds() ?? [];
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
          const visibleIds = getVisibleDataProvider()?.getVisibleCourseIds() ?? [];
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
        const visibleIds = getVisibleDataProvider()?.getVisibleCourseIds() ?? [];
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
      const visibleIds = getVisibleDataProvider()?.getVisibleCourseIds() ?? [];

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

  // ============ File Data Handlers ============

  // Get files for a specific course (for syllabus selection)
  ipcMain.handle('data:getCourseFiles', (_event, courseId: number) => {
    try {
      const resources = database.executeRead<{
        id: number;
        external_id: string;
        course_id: number;
        parent_folder_id: number | null;
        folder_path: string | null;
        type: string;
        title: string;
        url: string | null;
        local_path: string | null;
        size_bytes: number | null;
        mime_type: string | null;
        synced_at: string | null;
        remote_updated_at: string | null;
      }>(
        `SELECT * FROM resources
         WHERE course_id = ? AND type IN ('file', 'page')
         ORDER BY folder_path, title`,
        [courseId]
      );

      logger.info(
        `getCourseFiles for course ${courseId}: found ${resources.length} resources`
      );

      const attachments = database.executeRead<{
        id: number;
        notification_id: number;
        course_id: number;
        external_id: string;
        display_name: string;
        filename: string;
        url: string;
        size_bytes: number | null;
        content_type: string | null;
        local_path: string | null;
        download_status: string;
        downloaded_at: string | null;
      }>(
        `SELECT na.* FROM notification_attachments na WHERE na.course_id = ? ORDER BY na.display_name`,
        [courseId]
      );

      const resourceFiles = resources.map((row) => ({
        id: row.id,
        externalId: row.external_id,
        courseId: row.course_id,
        parentFolderId: row.parent_folder_id,
        folderPath: row.folder_path,
        type: row.type,
        title: row.title,
        url: row.url,
        localPath: row.local_path,
        sizeBytes: row.size_bytes,
        mimeType: row.mime_type,
        syncedAt: row.synced_at,
        source: 'resource' as const,
      }));

      const attachmentFiles = attachments.map((row) => ({
        id: -row.id,
        externalId: row.external_id,
        courseId: row.course_id,
        parentFolderId: null,
        folderPath: 'Announcement Attachments',
        type: 'file',
        title: row.display_name,
        url: row.url,
        localPath: row.local_path,
        sizeBytes: row.size_bytes,
        mimeType: row.content_type,
        syncedAt: row.downloaded_at,
        source: 'attachment' as const,
      }));

      return [...resourceFiles, ...attachmentFiles];
    } catch (error) {
      logger.error(`Failed to get course files: ${error}`);
      throw error;
    }
  });

  // Get all files (resources + notification attachments)
  ipcMain.handle('data:getFiles', () => {
    try {
      const resources = database.executeRead<{
        id: number;
        external_id: string;
        course_id: number;
        parent_folder_id: number | null;
        folder_path: string | null;
        type: string;
        title: string;
        url: string | null;
        local_path: string | null;
        size_bytes: number | null;
        mime_type: string | null;
        synced_at: string | null;
      }>(`
        SELECT r.*, c.code as course_code, c.name as course_name
        FROM resources r
        JOIN courses c ON r.course_id = c.id
        WHERE r.type IN ('file', 'page')
          AND c.archived_at IS NULL AND c.deleted_at IS NULL
        ORDER BY r.course_id, r.folder_path, r.title
      `);

      const attachments = database.executeRead<{
        id: number;
        notification_id: number;
        course_id: number;
        external_id: string;
        display_name: string;
        filename: string;
        url: string;
        size_bytes: number | null;
        content_type: string | null;
        local_path: string | null;
        download_status: string;
        downloaded_at: string | null;
        course_code: string;
        course_name: string;
        notification_title: string;
      }>(`
        SELECT na.*, c.code as course_code, c.name as course_name, n.title as notification_title
        FROM notification_attachments na
        JOIN courses c ON na.course_id = c.id
        JOIN notifications n ON na.notification_id = n.id
        WHERE c.archived_at IS NULL AND c.deleted_at IS NULL
        ORDER BY na.course_id, na.display_name
      `);

      const downloadedResources = resources.filter((r) => r.local_path !== null).length;
      const downloadedAttachments = attachments.filter((a) => a.download_status === 'completed').length;
      logger.info(`Found ${resources.length} files (${downloadedResources} downloaded), ${attachments.length} attachments (${downloadedAttachments} downloaded)`);

      return {
        resources: resources.map((r) => ({
          id: r.id,
          externalId: r.external_id,
          courseId: r.course_id,
          parentFolderId: r.parent_folder_id,
          folderPath: r.folder_path,
          type: r.type,
          title: r.title,
          url: r.url,
          localPath: r.local_path,
          sizeBytes: r.size_bytes,
          mimeType: r.mime_type,
          syncedAt: r.synced_at,
          source: 'resource' as const,
        })),
        attachments: attachments.map((a) => ({
          id: a.id,
          notificationId: a.notification_id,
          courseId: a.course_id,
          externalId: a.external_id,
          displayName: a.display_name,
          filename: a.filename,
          url: a.url,
          sizeBytes: a.size_bytes,
          contentType: a.content_type,
          localPath: a.local_path,
          downloadStatus: a.download_status,
          downloadedAt: a.downloaded_at,
          courseCode: a.course_code,
          courseName: a.course_name,
          notificationTitle: a.notification_title,
          source: 'attachment' as const,
        })),
        pages: [],
      };
    } catch (error) {
      logger.error(`Failed to get files: ${error}`);
      throw error;
    }
  });

  // Get module items for visible courses
  ipcMain.handle('data:getModuleItems', () => {
    try {
      const visibleIds = getVisibleDataProvider()?.getVisibleCourseIds() ?? [];
      if (visibleIds.length === 0) return [];

      const placeholders = visibleIds.map(() => '?').join(', ');
      const rows = database.executeRead<{
        id: number;
        external_id: string;
        title: string;
        item_type: string;
        content_id: string | null;
        url: string | null;
        external_url: string | null;
        page_url: string | null;
        position: number;
        indent: number;
        module_name: string;
        module_position: number;
        course_id: number;
        course_code: string;
        course_name: string;
        has_local_content: number;
      }>(
        `SELECT
          mi.id, mi.external_id, mi.title, mi.item_type,
          mi.content_id, mi.url, mi.external_url, mi.page_url,
          mi.position, mi.indent,
          m.name as module_name, m.position as module_position,
          c.id as course_id, c.code as course_code, c.name as course_name,
          CASE
            WHEN mi.item_type = 'Page' THEN (
              SELECT CASE WHEN cp.body_html IS NOT NULL THEN 1 ELSE 0 END
              FROM course_pages cp
              WHERE (cp.url_slug = mi.page_url OR cp.title = mi.title) AND cp.course_id = c.id
              LIMIT 1
            )
            WHEN mi.item_type = 'File' THEN (
              SELECT CASE WHEN r.local_path IS NOT NULL THEN 1 ELSE 0 END
              FROM resources r
              WHERE r.external_id = mi.content_id
              LIMIT 1
            )
            ELSE 0
          END as has_local_content
        FROM module_items mi
        JOIN modules m ON mi.module_id = m.id
        JOIN courses c ON m.course_id = c.id
        WHERE c.id IN (${placeholders})
          AND mi.item_type != 'SubHeader'
        ORDER BY c.id, m.position, mi.position`,
        visibleIds
      );

      return rows.map((row) => ({
        id: row.id,
        externalId: row.external_id,
        title: row.title,
        itemType: row.item_type,
        contentId: row.content_id,
        url: row.url,
        externalUrl: row.external_url,
        pageUrl: row.page_url,
        position: row.position,
        indent: row.indent,
        moduleName: row.module_name,
        modulePosition: row.module_position,
        courseId: row.course_id,
        courseCode: row.course_code,
        courseName: row.course_name,
        sizeBytes: null,
        hasLocalContent: row.has_local_content === 1,
        source: 'module' as const,
      }));
    } catch (error) {
      logger.error(`Failed to get module items: ${error}`);
      throw error;
    }
  });

  // Get attachments for a notification
  ipcMain.handle('data:getAttachments', (_event, notificationId: number) => {
    try {
      const rows = database.executeRead<{
        id: number;
        notification_id: number;
        external_id: string;
        display_name: string;
        filename: string;
        url: string;
        size_bytes: number | null;
        content_type: string | null;
        local_path: string | null;
        download_status: string;
        downloaded_at: string | null;
      }>(
        'SELECT * FROM notification_attachments WHERE notification_id = ?',
        [notificationId]
      );

      return rows.map((row) => ({
        id: row.id,
        notificationId: row.notification_id,
        externalId: row.external_id,
        displayName: row.display_name,
        filename: row.filename,
        url: row.url,
        sizeBytes: row.size_bytes,
        contentType: row.content_type,
        localPath: row.local_path,
        downloadStatus: row.download_status,
        downloadedAt: row.downloaded_at,
      }));
    } catch (error) {
      logger.error(`Failed to get attachments: ${error}`);
      throw error;
    }
  });

  // Get file references for a notification (with attachment details if linked)
  ipcMain.handle('data:getFileReferences', (_event, notificationId: number) => {
    try {
      const rows = database.executeRead<{
        id: number;
        notification_id: number;
        attachment_id: number | null;
        start_position: number;
        end_position: number;
        matched_text: string;
        original_url: string | null;
        att_id: number | null;
        att_external_id: string | null;
        att_display_name: string | null;
        att_filename: string | null;
        att_url: string | null;
        att_size_bytes: number | null;
        att_content_type: string | null;
        att_local_path: string | null;
        att_download_status: string | null;
        att_downloaded_at: string | null;
      }>(
        `SELECT
          fr.id, fr.notification_id, fr.attachment_id, fr.start_position, fr.end_position,
          fr.matched_text, fr.original_url,
          a.id as att_id, a.external_id as att_external_id, a.display_name as att_display_name,
          a.filename as att_filename, a.url as att_url, a.size_bytes as att_size_bytes,
          a.content_type as att_content_type, a.local_path as att_local_path,
          a.download_status as att_download_status, a.downloaded_at as att_downloaded_at
        FROM announcement_file_references fr
        LEFT JOIN notification_attachments a ON fr.attachment_id = a.id
        WHERE fr.notification_id = ?
        ORDER BY fr.start_position`,
        [notificationId]
      );

      return rows.map((row) => ({
        id: row.id,
        notificationId: row.notification_id,
        attachmentId: row.attachment_id,
        startPosition: row.start_position,
        endPosition: row.end_position,
        matchedText: row.matched_text,
        originalUrl: row.original_url,
        attachment: row.att_id
          ? {
              id: row.att_id,
              notificationId: row.notification_id,
              externalId: row.att_external_id!,
              displayName: row.att_display_name!,
              filename: row.att_filename!,
              url: row.att_url!,
              sizeBytes: row.att_size_bytes,
              contentType: row.att_content_type,
              localPath: row.att_local_path,
              downloadStatus: row.att_download_status,
              downloadedAt: row.att_downloaded_at,
            }
          : undefined,
      }));
    } catch (error) {
      logger.error(`Failed to get file references: ${error}`);
      throw error;
    }
  });
}
