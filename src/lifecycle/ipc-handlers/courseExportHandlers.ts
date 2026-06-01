/**
 * Course Export IPC Handlers
 * Handlers for course data export/import operations
 */

import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import type { IpcContext } from './IpcContext';
import { ImportCourseDataCommand } from '../../layers/l4-controller';
import { createSimulationContext } from '../../layers/l4-controller/types';
import { CourseExportReader } from '../../layers/l1-persistence';

/**
 * Register course data export/import IPC handlers
 *
 * Per ADR-0007, this file holds no raw `database.execute*` / `upsert` calls.
 * The export reads route through `CourseExportReader` (L1); the import pipeline
 * through `ImportCourseDataCommand` (L4).
 */
export function registerCourseExportHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();
  const metricsCollector = ctx.getMetricsCollector();
  const getMainWindow = ctx.getMainWindow;
  const courseExportReader = new CourseExportReader(database);
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
        // Gather the full export bundle (course-scoped or all courses)
        const {
          courses,
          tasks,
          notifications,
          pages,
          policies,
          resources,
          syllabuses,
          graceTokens,
          graceTokenUsage,
        } = courseExportReader.gather(params?.courseIds);

        if (courses.length === 0) {
          return { success: false, error: 'No courses found to export' };
        }

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
