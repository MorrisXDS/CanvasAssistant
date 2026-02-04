/**
 * Data IPC Handlers
 * Handlers for policies, syllabus, grade history, course pages, and app state management
 */

import { ipcMain } from 'electron';
import type { IpcContext } from './IpcContext';

/**
 * Register data-related IPC handlers for policies, syllabus, grade history, and course pages
 */
export function registerDataHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();
  const getVisibleDataProvider = ctx.getVisibleDataProvider;
  const getCanvasClient = ctx.getCanvasClient;
  const resetAppState = ctx.resetAppState;

  // ============ Policies ============

  // Get policies for a course
  ipcMain.handle('data:getPolicies', (_event, courseId: number) => {
    try {
      const rows = database.executeRead<{
        id: number;
        course_id: number;
        policy_type: string;
        policy_name: string;
        policy_config: string;
        raw_text: string | null;
        is_user_verified: number;
        is_active: number;
        created_at: string;
        updated_at: string;
      }>(
        'SELECT * FROM course_policies WHERE course_id = ? AND is_active = 1 ORDER BY policy_type',
        [courseId]
      );

      return rows.map((row) => ({
        id: row.id,
        courseId: row.course_id,
        policyType: row.policy_type,
        policyName: row.policy_name,
        policyConfig: JSON.parse(row.policy_config || '{}'),
        rawText: row.raw_text,
        isUserVerified: Boolean(row.is_user_verified),
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
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
        sql = `SELECT * FROM course_policies WHERE course_id IN (${placeholders}) AND is_active = 1 ORDER BY course_id, policy_type`;
        params = filteredCourseIds;
      } else {
        // Return policies for all visible courses
        if (visibleIds.length === 0) return [];

        const placeholders = visibleIds.map(() => '?').join(', ');
        sql = `SELECT * FROM course_policies WHERE course_id IN (${placeholders}) AND is_active = 1 ORDER BY course_id, policy_type`;
        params = visibleIds;
      }

      const rows = database.executeRead<{
        id: number;
        course_id: number;
        policy_type: string;
        policy_name: string;
        policy_config: string;
        raw_text: string | null;
        is_user_verified: number;
        is_active: number;
        created_at: string;
        updated_at: string;
      }>(sql, params);

      return rows.map((row) => ({
        id: row.id,
        courseId: row.course_id,
        policyType: row.policy_type,
        policyName: row.policy_name,
        policyConfig: JSON.parse(row.policy_config || '{}'),
        rawText: row.raw_text,
        isUserVerified: Boolean(row.is_user_verified),
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (error) {
      logger.error(`Failed to get all policies: ${error}`);
      throw error;
    }
  });

  // Get course authority settings
  ipcMain.handle('data:getCourseAuthority', (_event, courseId: number) => {
    try {
      const course = database.executeReadOne<{
        late_penalty_authority: string | null;
        drop_lowest_authority: string | null;
        grade_calc_mode: string | null;
      }>(
        'SELECT late_penalty_authority, drop_lowest_authority, grade_calc_mode FROM courses WHERE id = ?',
        [courseId]
      );

      if (!course) {
        return null;
      }

      return {
        latePenaltyAuthority: course.late_penalty_authority || 'canvas',
        dropLowestAuthority: course.drop_lowest_authority || 'canvas',
        gradeCalcMode: course.grade_calc_mode || 'canvas',
      };
    } catch (error) {
      logger.error(`Failed to get course authority settings: ${error}`);
      throw error;
    }
  });

  // Update course authority settings
  ipcMain.handle(
    'data:updateCourseAuthority',
    (
      _event,
      courseId: number,
      settings: {
        latePenaltyAuthority?: 'canvas' | 'local' | 'both';
        dropLowestAuthority?: 'canvas' | 'local' | 'off';
        gradeCalcMode?: 'canvas' | 'local' | 'both';
      }
    ) => {
      try {
        const updates: string[] = [];
        const params: (string | number)[] = [];

        if (settings.latePenaltyAuthority) {
          updates.push('late_penalty_authority = ?');
          params.push(settings.latePenaltyAuthority);
        }
        if (settings.dropLowestAuthority) {
          updates.push('drop_lowest_authority = ?');
          params.push(settings.dropLowestAuthority);
        }
        if (settings.gradeCalcMode) {
          updates.push('grade_calc_mode = ?');
          params.push(settings.gradeCalcMode);
        }

        if (updates.length > 0) {
          params.push(courseId);
          database.executeWrite(
            `UPDATE courses SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            params,
            'courses'
          );
        }

        return { success: true };
      } catch (error) {
        logger.error(`Failed to update course authority settings: ${error}`);
        return { success: false, error: String(error) };
      }
    }
  );

  // ============ Task Link Suggestions ============

  // Get pending link suggestions
  ipcMain.handle('data:getLinkSuggestions', (_event, status = 'pending') => {
    try {
      const rows = database.executeRead<{
        id: number;
        user_task_id: number;
        canvas_task_id: number;
        confidence: number;
        status: string;
        created_at: string;
        user_task_title: string;
        canvas_task_title: string;
        course_id: number;
        course_name: string;
      }>(
        `SELECT
          ls.id,
          ls.user_task_id,
          ls.canvas_task_id,
          ls.confidence,
          ls.status,
          ls.created_at,
          ut.title as user_task_title,
          ut.course_id,
          ct.title as canvas_task_title,
          c.name as course_name
        FROM link_suggestions ls
        JOIN tasks ut ON ls.user_task_id = ut.id
        JOIN tasks ct ON ls.canvas_task_id = ct.id
        JOIN courses c ON ut.course_id = c.id
        WHERE ls.status = ?
        ORDER BY ls.confidence DESC, ls.created_at DESC`,
        [status]
      );

      return rows.map((row) => ({
        id: row.id,
        userTaskId: row.user_task_id,
        canvasTaskId: row.canvas_task_id,
        confidence: row.confidence,
        status: row.status,
        createdAt: row.created_at,
        userTaskTitle: row.user_task_title,
        canvasTaskTitle: row.canvas_task_title,
        courseId: row.course_id,
        courseName: row.course_name,
      }));
    } catch (error) {
      logger.error(`Failed to get link suggestions: ${error}`);
      throw error;
    }
  });

  // Accept a link suggestion
  ipcMain.handle('data:acceptLinkSuggestion', (_event, suggestionId: number) => {
    try {
      const suggestion = database.executeReadOne<{
        id: number;
        user_task_id: number;
        canvas_task_id: number;
        confidence: number;
      }>('SELECT * FROM link_suggestions WHERE id = ?', [suggestionId]);

      if (!suggestion) {
        return { success: false, error: 'Suggestion not found' };
      }

      const userTask = database.executeReadOne<{
        id: number;
        external_id: string;
        weight: number | null;
        notes: string | null;
        user_expected_grade: number | null;
      }>(
        'SELECT id, external_id, weight, notes, user_expected_grade FROM tasks WHERE id = ?',
        [suggestion.user_task_id]
      );

      if (!userTask) {
        return { success: false, error: 'User task not found' };
      }

      const now = new Date().toISOString();

      // Perform the link
      database.executeWrite(
        `UPDATE tasks SET
          linked_from_user_task = ?,
          link_confidence = ?,
          link_method = 'suggested',
          weight = COALESCE(?, weight),
          notes = COALESCE(?, notes),
          user_expected_grade = COALESCE(?, user_expected_grade),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [
          userTask.external_id,
          suggestion.confidence,
          userTask.weight,
          userTask.notes,
          userTask.user_expected_grade,
          suggestion.canvas_task_id,
        ],
        'tasks'
      );

      // Soft-delete user task
      database.executeWrite(
        `UPDATE tasks SET deleted_at = ?, merged_into_task_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [now, suggestion.canvas_task_id, userTask.id],
        'tasks'
      );

      // Mark suggestion as accepted
      database.executeWrite(
        `UPDATE link_suggestions SET status = 'accepted', resolved_at = ?, resolved_by = 'user' WHERE id = ?`,
        [now, suggestionId],
        'link_suggestions'
      );

      return { success: true, canvasTaskId: suggestion.canvas_task_id };
    } catch (error) {
      logger.error(`Failed to accept link suggestion: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  // Reject a link suggestion
  ipcMain.handle('data:rejectLinkSuggestion', (_event, suggestionId: number) => {
    try {
      const now = new Date().toISOString();

      database.executeWrite(
        `UPDATE link_suggestions SET status = 'rejected', resolved_at = ?, resolved_by = 'user' WHERE id = ?`,
        [now, suggestionId],
        'link_suggestions'
      );

      return { success: true };
    } catch (error) {
      logger.error(`Failed to reject link suggestion: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  // Get count of pending suggestions (for badge)
  ipcMain.handle('data:getPendingSuggestionCount', () => {
    try {
      const result = database.executeReadOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM link_suggestions WHERE status = 'pending'`
      );
      return result?.count || 0;
    } catch (error) {
      logger.error(`Failed to get pending suggestion count: ${error}`);
      return 0;
    }
  });

  // Get Canvas tasks available for manual linking (same course, not already linked)
  ipcMain.handle('data:getCanvasTasksForLinking', (_event, courseId: number) => {
    try {
      const rows = database.executeRead<{
        id: number;
        title: string;
        due_at: string | null;
        grade: number | null;
        task_type: string | null;
      }>(
        `SELECT id, title, due_at, grade, task_type
         FROM tasks
         WHERE course_id = ?
           AND source_type = 'canvas'
           AND deleted_at IS NULL
           AND linked_from_user_task IS NULL
         ORDER BY due_at DESC`,
        [courseId]
      );

      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        dueAt: row.due_at,
        grade: row.grade,
        taskType: row.task_type,
      }));
    } catch (error) {
      logger.error(`Failed to get Canvas tasks for linking: ${error}`);
      throw error;
    }
  });

  // Manually link a user task to a Canvas task
  ipcMain.handle(
    'data:manuallyLinkTasks',
    (_event, userTaskId: number, canvasTaskId: number) => {
      try {
        const userTask = database.executeReadOne<{
          id: number;
          source_type: string;
          external_id: string;
          weight: number | null;
          notes: string | null;
          user_expected_grade: number | null;
        }>('SELECT * FROM tasks WHERE id = ?', [userTaskId]);

        const canvasTask = database.executeReadOne<{
          id: number;
          source_type: string;
          linked_from_user_task: string | null;
        }>('SELECT id, source_type, linked_from_user_task FROM tasks WHERE id = ?', [
          canvasTaskId,
        ]);

        if (!userTask || !canvasTask) {
          return { success: false, error: 'Task not found' };
        }

        if (userTask.source_type !== 'user') {
          return { success: false, error: 'Can only link user-created tasks' };
        }

        if (canvasTask.source_type !== 'canvas') {
          return { success: false, error: 'Target must be a Canvas task' };
        }

        if (canvasTask.linked_from_user_task) {
          return {
            success: false,
            error: 'Canvas task is already linked to another user task',
          };
        }

        const now = new Date().toISOString();

        // Perform the link
        database.executeWrite(
          `UPDATE tasks SET
            linked_from_user_task = ?,
            link_confidence = 1.0,
            link_method = 'manual',
            weight = COALESCE(?, weight),
            notes = COALESCE(?, notes),
            user_expected_grade = COALESCE(?, user_expected_grade),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
          [
            userTask.external_id,
            userTask.weight,
            userTask.notes,
            userTask.user_expected_grade,
            canvasTaskId,
          ],
          'tasks'
        );

        // Soft-delete user task
        database.executeWrite(
          `UPDATE tasks SET deleted_at = ?, merged_into_task_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [now, canvasTaskId, userTaskId],
          'tasks'
        );

        // Dismiss any pending suggestions for this user task
        database.executeWrite(
          `UPDATE link_suggestions SET status = 'dismissed', resolved_at = ?, resolved_by = 'manual'
           WHERE user_task_id = ? AND status = 'pending'`,
          [now, userTaskId],
          'link_suggestions'
        );

        return { success: true, canvasTaskId };
      } catch (error) {
        logger.error(`Failed to manually link tasks: ${error}`);
        return { success: false, error: String(error) };
      }
    }
  );

  // Unlink tasks (restore user task, remove link)
  ipcMain.handle('data:unlinkTasks', (_event, canvasTaskId: number) => {
    try {
      const canvasTask = database.executeReadOne<{
        id: number;
        linked_from_user_task: string | null;
      }>('SELECT id, linked_from_user_task FROM tasks WHERE id = ?', [canvasTaskId]);

      if (!canvasTask || !canvasTask.linked_from_user_task) {
        return { success: false, error: 'No link found' };
      }

      // Find the user task
      const userTask = database.executeReadOne<{ id: number }>(
        `SELECT id FROM tasks WHERE external_id = ? AND merged_into_task_id = ?`,
        [canvasTask.linked_from_user_task, canvasTaskId]
      );

      if (userTask) {
        // Restore user task
        database.executeWrite(
          `UPDATE tasks SET deleted_at = NULL, merged_into_task_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [userTask.id],
          'tasks'
        );
      }

      // Remove link from Canvas task
      database.executeWrite(
        `UPDATE tasks SET
          linked_from_user_task = NULL,
          link_confidence = NULL,
          link_method = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [canvasTaskId],
        'tasks'
      );

      return { success: true };
    } catch (error) {
      logger.error(`Failed to unlink tasks: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  // ============ Syllabus ============

  // Get syllabus designation for a course
  ipcMain.handle('data:getCourseSyllabus', (_event, courseId: number) => {
    try {
      // Check course_syllabuses table for user-designated syllabus file
      const syllabusDesignation = database.executeReadOne<{
        resource_id: number;
        source_type: string;
        last_reviewed_at: string;
        marked_at: string;
      }>(
        `SELECT resource_id, source_type, last_reviewed_at, marked_at
         FROM course_syllabuses
         WHERE course_id = ?`,
        [courseId]
      );

      if (syllabusDesignation?.resource_id) {
        // Get resource details
        const resource = database.executeReadOne<{
          id: number;
          title: string;
          url: string | null;
          local_path: string | null;
          synced_at: string | null;
        }>(
          `SELECT id, title, url, local_path, synced_at
           FROM resources WHERE id = ?`,
          [syllabusDesignation.resource_id]
        );

        if (resource) {
          const hasLocalFile = !!resource.local_path;
          return {
            type: 'resource' as const,
            resourceId: resource.id,
            title: resource.title,
            url: resource.url,
            localPath: resource.local_path,
            downloadStatus: hasLocalFile ? 'completed' : 'pending',
            downloadedAt: resource.synced_at,
            reviewedAt: syllabusDesignation.last_reviewed_at,
            designatedAt: syllabusDesignation.marked_at,
          };
        }
      }

      // Check for page with page_type = 'syllabus' as fallback
      const syllabusPage = database.executeReadOne<{
        id: number;
        title: string;
        external_id: string;
        url_slug: string | null;
      }>(
        `SELECT id, title, external_id, url_slug
         FROM course_pages
         WHERE course_id = ? AND page_type = 'syllabus'`,
        [courseId]
      );

      if (syllabusPage) {
        return {
          type: 'page' as const,
          pageId: syllabusPage.id,
          title: syllabusPage.title,
          externalId: syllabusPage.external_id,
          urlSlug: syllabusPage.url_slug,
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

  // ============ Course Pages Handlers ============

  // Get all pages for a course (wiki pages + syllabus)
  ipcMain.handle('pages:getByCourse', (_event, courseId: number) => {
    const pages = database.executeRead<{
      id: number;
      external_id: string | null;
      course_id: number;
      page_type: string;
      title: string;
      url_slug: string | null;
      body_html: string | null;
      body_text: string | null;
      is_front_page: number;
      published: number;
      last_synced_at: string | null;
    }>(
      'SELECT * FROM course_pages WHERE course_id = ? ORDER BY is_front_page DESC, title',
      [courseId]
    );

    // Also check if course has syllabus_body
    const course = database.executeRead<{
      id: number;
      code: string;
      name: string;
      syllabus_body: string | null;
    }>('SELECT id, code, name, syllabus_body FROM courses WHERE id = ?', [courseId])[0];

    const result = pages.map((p) => ({
      id: p.id,
      externalId: p.external_id,
      courseId: p.course_id,
      pageType: p.page_type,
      title: p.title,
      urlSlug: p.url_slug,
      bodyHtml: p.body_html,
      bodyText: p.body_text,
      isFrontPage: p.is_front_page === 1,
      published: p.published === 1,
      lastSyncedAt: p.last_synced_at,
    }));

    // Add syllabus as a virtual page if it exists
    if (course?.syllabus_body) {
      result.unshift({
        id: -1,
        externalId: `syllabus-${courseId}`,
        courseId: courseId,
        pageType: 'syllabus',
        title: 'Course Syllabus',
        urlSlug: 'syllabus',
        bodyHtml: course.syllabus_body,
        bodyText: course.syllabus_body
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
        isFrontPage: false,
        published: true,
        lastSyncedAt: null,
      });
    }

    return result;
  });

  // Get a single page by ID
  ipcMain.handle('pages:get', (_event, pageId: number) => {
    if (pageId === -1) {
      return { success: false, error: 'Use pages:getByCourse to get syllabus' };
    }

    const page = database.executeRead<{
      id: number;
      external_id: string | null;
      course_id: number;
      page_type: string;
      title: string;
      url_slug: string | null;
      body_html: string | null;
      body_text: string | null;
      is_front_page: number;
      published: number;
    }>('SELECT * FROM course_pages WHERE id = ?', [pageId])[0];

    if (!page) {
      return { success: false, error: 'Page not found' };
    }

    const canvasClient = getCanvasClient();
    let canvasUrl: string | null = null;
    if (canvasClient && page.url_slug) {
      const baseUrl = canvasClient.getBaseUrl();
      canvasUrl = `${baseUrl}/courses/${page.course_id}/pages/${page.url_slug}`;
    }

    return {
      success: true,
      data: {
        id: page.id,
        externalId: page.external_id,
        courseId: page.course_id,
        pageType: page.page_type,
        title: page.title,
        urlSlug: page.url_slug,
        bodyHtml: page.body_html,
        bodyText: page.body_text,
        isFrontPage: page.is_front_page === 1,
        published: page.published === 1,
        canvasUrl,
      },
    };
  });

  // Get page by title (for module items linking to pages)
  ipcMain.handle('pages:getByTitle', (_event, title: string, courseId: number) => {
    const page = database.executeReadOne<{
      id: number;
      external_id: string | null;
      course_id: number;
      page_type: string;
      title: string;
      url_slug: string | null;
      body_html: string | null;
      body_text: string | null;
      is_front_page: number;
      published: number;
    }>('SELECT * FROM course_pages WHERE title = ? AND course_id = ?', [title, courseId]);

    if (!page) {
      return { success: false, error: 'Page not found' };
    }

    const canvasClient = getCanvasClient();
    let canvasUrl: string | null = null;
    if (canvasClient && page.url_slug) {
      const baseUrl = canvasClient.getBaseUrl();
      canvasUrl = `${baseUrl}/courses/${page.course_id}/pages/${page.url_slug}`;
    }

    return {
      success: true,
      data: {
        id: page.id,
        externalId: page.external_id,
        courseId: page.course_id,
        pageType: page.page_type,
        title: page.title,
        urlSlug: page.url_slug,
        bodyHtml: page.body_html,
        bodyText: page.body_text,
        isFrontPage: page.is_front_page === 1,
        published: page.published === 1,
        canvasUrl,
      },
    };
  });

  // ============ App State Management ============

  // Clear all app data (optionally including Canvas API token)
  ipcMain.handle('data:clearAll', async (_event, options?: { deleteToken?: boolean }) => {
    const deleteToken = options?.deleteToken ?? false;
    logger.info(`Clearing all app data (deleteToken: ${deleteToken})`);
    try {
      await resetAppState({ deleteToken });
      return { success: true, tokenDeleted: deleteToken };
    } catch (error) {
      logger.error(`Failed to clear all data: ${error}`);
      return { success: false, error: String(error) };
    }
  });
}
