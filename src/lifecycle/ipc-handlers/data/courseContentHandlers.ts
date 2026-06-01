/**
 * Course Content IPC Handlers
 * Handlers for syllabus, grade history, and course pages
 * (data:getCourseSyllabus, data:getGradeHistory, pages:getByCourse, pages:get, pages:getByTitle)
 */

import { ipcMain } from 'electron';
import type { IpcContext } from '../IpcContext';
import {
  CourseSyllabusReader,
  ResourceReader,
  CoursePageReader,
  GradeHistoryReader,
  CourseReader,
} from '../../../layers/l1-persistence';

/**
 * Register course content-related IPC handlers
 *
 * Per ADR-0007, this file holds no raw `database.execute*` calls. Reads route
 * through L1 readers; the handler keeps DTO shaping + the Canvas-URL construction.
 */
export function registerCourseContentHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();
  const getCanvasClient = ctx.getCanvasClient;

  const courseSyllabusReader = new CourseSyllabusReader(database);
  const resourceReader = new ResourceReader(database);
  const coursePageReader = new CoursePageReader(database);
  const gradeHistoryReader = new GradeHistoryReader(database);
  const courseReader = new CourseReader(database);

  // ============ Syllabus ============

  // Get syllabus designation for a course
  ipcMain.handle('data:getCourseSyllabus', (_event, courseId: number) => {
    try {
      // Check course_syllabuses table for user-designated syllabus file
      const syllabusDesignation = courseSyllabusReader.getDesignationByCourse(courseId);

      if (syllabusDesignation?.resource_id) {
        // Get resource details
        const resource = resourceReader.getSyllabusInfoById(
          syllabusDesignation.resource_id
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
            changeDetectedAt: syllabusDesignation.change_detected_at,
            designatedAt: syllabusDesignation.marked_at,
          };
        }
      }

      // Check for page with page_type = 'syllabus' as fallback
      const syllabusPage = coursePageReader.getSyllabusPageByCourse(courseId);

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
      return gradeHistoryReader.getByCourse(courseId).map((row) => ({
        recordedAt: row.recorded_at,
        grade: row.grade,
      }));
    } catch (error) {
      logger.error(`Failed to get grade history: ${error}`);
      throw error;
    }
  });

  // ============ Course Pages ============

  // Get all pages for a course (wiki pages + syllabus)
  ipcMain.handle('pages:getByCourse', (_event, courseId: number) => {
    const pages = coursePageReader.getAllByCourse(courseId);

    // Also check if course has syllabus_body
    const course = courseReader.getById(courseId);

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

    const page = coursePageReader.getById(pageId);

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
    const page = coursePageReader.getByTitleInCourse(title, courseId);

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
}
