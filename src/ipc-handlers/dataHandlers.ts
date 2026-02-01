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
    }>(
      'SELECT * FROM course_pages WHERE title = ? AND course_id = ?',
      [title, courseId]
    );

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
