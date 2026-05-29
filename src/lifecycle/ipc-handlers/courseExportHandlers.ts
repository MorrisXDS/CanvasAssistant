/**
 * Course Export IPC Handlers
 * Handlers for course data export/import operations
 */

import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import type { IpcContext } from './IpcContext';
import { ImportCourseDataCommand } from '../../layers/l4-controller';
import { createSimulationContext } from '../../layers/l4-controller/types';

/**
 * Register course data export/import IPC handlers
 *
 * ADR-0007 migration is in progress for this file: the import pipeline now
 * routes through `ImportCourseDataCommand` (L4). The export reads are slated
 * for a follow-up PR (they use generic-typed `executeRead`, so the ratchet
 * does not count them yet).
 */
export function registerCourseExportHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();
  const metricsCollector = ctx.getMetricsCollector();
  const getMainWindow = ctx.getMainWindow;
  const runContext = () => ({
    db: database,
    simulationContext: createSimulationContext(),
  });

  ipcMain.handle(
    'data:exportCourseData',
    async (_event, params?: { courseIds?: number[]; includeFiles?: boolean }) => {
      const mainWindow = getMainWindow();
      if (!mainWindow) {
        return { success: false, error: 'No window available' };
      }

      try {
        // Build course filter
        let courseFilter = '';
        const courseIds = params?.courseIds;
        if (courseIds && courseIds.length > 0) {
          courseFilter = ` WHERE id IN (${courseIds.join(',')})`;
        }

        // Fetch courses with all fields
        const courses = database.executeRead<{
          id: number;
          external_id: string;
          code: string;
          name: string;
          nickname: string | null;
          color: string | null;
          enrollment_term_id: number | null;
          target_grade: number | null;
          target_grade_source: string | null;
          is_hidden: number;
          current_grade: number | null;
          assessed_grade: number | null;
          total_weight: number | null;
          syllabus_body: string | null;
          field_sources: string | null;
          allow_guessed_override: number | null;
          auto_assign_due_date: number | null;
        }>(`SELECT * FROM courses${courseFilter}`);

        if (courses.length === 0) {
          return { success: false, error: 'No courses found to export' };
        }

        const courseIdList = courses.map((c) => c.id).join(',');

        // Fetch related data
        const tasks = database.executeRead<Record<string, unknown>>(
          `SELECT * FROM tasks WHERE course_id IN (${courseIdList})`
        );

        const notifications = database.executeRead<Record<string, unknown>>(
          `SELECT * FROM notifications WHERE course_id IN (${courseIdList})`
        );

        const pages = database.executeRead<Record<string, unknown>>(
          `SELECT * FROM course_pages WHERE course_id IN (${courseIdList})`
        );

        const policies = database.executeRead<Record<string, unknown>>(
          `SELECT * FROM course_policies WHERE course_id IN (${courseIdList})`
        );

        const resources = database.executeRead<Record<string, unknown>>(
          `SELECT id, external_id, course_id, folder_path, type, title, url, size_bytes, mime_type FROM resources WHERE course_id IN (${courseIdList})`
        );

        // Fetch course_syllabuses
        const syllabuses = database.executeRead<Record<string, unknown>>(
          `SELECT * FROM course_syllabuses WHERE course_id IN (${courseIdList})`
        );

        // Fetch grace_tokens and grace_token_usage
        const graceTokens = database.executeRead<Record<string, unknown>>(
          `SELECT * FROM grace_tokens WHERE course_id IN (${courseIdList})`
        );

        const graceTokenIds = graceTokens.map((g) => g.id).filter(Boolean);
        const graceTokenUsage =
          graceTokenIds.length > 0
            ? database.executeRead<Record<string, unknown>>(
                `SELECT * FROM grace_token_usage WHERE grace_token_id IN (${graceTokenIds.join(',')})`
              )
            : [];

        const exportData = {
          exportedAt: new Date().toISOString(),
          version: '1.1',
          courses: courses.map((c) => ({
            id: c.id,
            externalId: c.external_id,
            code: c.code,
            name: c.name,
            nickname: c.nickname,
            color: c.color,
            enrollmentTermId: c.enrollment_term_id,
            targetGrade: c.target_grade,
            targetGradeSource: c.target_grade_source,
            isHidden: c.is_hidden,
            currentGrade: c.current_grade,
            assessedGrade: c.assessed_grade,
            totalWeight: c.total_weight,
            syllabusBody: c.syllabus_body,
            fieldSources: c.field_sources,
            allowGuessedOverride: c.allow_guessed_override,
            autoAssignDueDate: c.auto_assign_due_date,
          })),
          tasks,
          notifications,
          pages,
          policies,
          resources: resources.map((r) => ({
            ...r,
            localPath: undefined, // Don't include local paths in export
          })),
          syllabuses,
          graceTokens,
          graceTokenUsage,
        };

        const dialogResult = await dialog.showSaveDialog(mainWindow, {
          defaultPath: `canvas-export-${new Date().toISOString().split('T')[0]}.json`,
          filters: [
            { name: 'JSON Files', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });

        if (dialogResult.canceled || !dialogResult.filePath) {
          return { success: false, error: 'Save cancelled' };
        }

        fs.writeFileSync(
          dialogResult.filePath,
          JSON.stringify(exportData, null, 2),
          'utf-8'
        );
        logger.info(`Course data exported to: ${dialogResult.filePath}`);
        metricsCollector.increment('data.export.courses');

        return {
          success: true,
          data: {
            filePath: dialogResult.filePath,
            courseCount: courses.length,
            taskCount: tasks.length,
            notificationCount: notifications.length,
          },
        };
      } catch (error) {
        logger.error('Failed to export course data:', error as Error);
        return { success: false, error: String(error) };
      }
    }
  );

  // Import course data from JSON (same format as export)
  ipcMain.handle('data:importCourseData', async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) {
      return { success: false, error: 'No window available' };
    }

    try {
      const dialogResult = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (dialogResult.canceled || !dialogResult.filePaths.length) {
        return { success: false, error: 'Import cancelled' };
      }

      const filePath = dialogResult.filePaths[0];
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const importData = JSON.parse(fileContent);

      const result = await new ImportCourseDataCommand().execute(runContext(), {
        importData,
      });
      if (!result.success || !result.data) {
        return { success: false, error: result.error };
      }
      const counts = result.data;

      logger.info(
        `Data imported from: ${filePath} (${counts.coursesImported} courses, ${counts.tasksImported} tasks, ${counts.notificationsImported} notifications, ${counts.pagesImported} pages, ${counts.policiesImported} policies, ${counts.resourcesImported} resources, ${counts.syllabusesImported} syllabuses, ${counts.graceTokensImported} grace tokens)`
      );
      metricsCollector.increment('data.import.courses');

      return {
        success: true,
        data: {
          filePath,
          ...counts,
        },
      };
    } catch (error) {
      logger.error('Failed to import course data:', error as Error);
      return { success: false, error: String(error) };
    }
  });
}
