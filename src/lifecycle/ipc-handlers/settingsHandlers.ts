/**
 * Settings IPC Handlers
 * Handlers for application settings:
 * - Academic settings (target grade)
 * - Visibility settings (term selection)
 * - Window behavior settings
 * - Course settings
 * - Settings export/import
 */

import { ipcMain, app, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import type { IpcContext } from './IpcContext';
import {
  CourseReader,
  CourseRepository,
  UserPreferencesReader,
} from '../../layers/l1-persistence';
import {
  SetUserPreferenceCommand,
  UpdateCourseSettingsCommand,
} from '../../layers/l4-controller';
import { createSimulationContext } from '../../layers/l4-controller/types';

/**
 * Register all settings-related IPC handlers
 *
 * Per ADR-0007, this file holds no raw `database.execute*` calls. Reads
 * route through `UserPreferencesReader` / `CourseReader` (L1); writes route
 * through `SetUserPreferenceCommand` / `UpdateCourseSettingsCommand` (L4).
 */
export function registerSettingsHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();
  const prefsReader = new UserPreferencesReader(database);
  const courseReader = new CourseReader(database);
  const runContext = () => ({
    db: database,
    simulationContext: createSimulationContext(),
  });
  const getVisibilityOracle = ctx.getVisibilityOracle;
  const getMainWindow = ctx.getMainWindow;
  const getWindowBehavior = ctx.getWindowBehavior;
  const setWindowBehavior = ctx.setWindowBehavior;
  const createTray = ctx.createTray;
  const destroyTray = ctx.destroyTray;
  const getLocalHtmlPathsSettings = ctx.getLocalHtmlPathsSettings;
  const _getIsQuitting = ctx.getIsQuitting;
  const setIsQuitting = ctx.setIsQuitting;

  // ============ Local HTML Paths Settings ============

  ipcMain.handle('settings:getLocalHtmlPathsSettings', () => {
    return getLocalHtmlPathsSettings();
  });

  ipcMain.handle(
    'settings:setLocalHtmlPathsSettings',
    async (
      _event,
      settings: {
        enabled: boolean;
        autoRegenerate: boolean;
        promptForMissing: boolean;
      }
    ) => {
      try {
        const result = await new SetUserPreferenceCommand().execute(runContext(), {
          key: 'localHtmlPathsSettings',
          value: JSON.stringify(settings),
        });
        if (!result.success) {
          return { success: false, error: result.error };
        }

        logger.info(
          `Local HTML paths settings updated: enabled=${settings.enabled}, autoRegenerate=${settings.autoRegenerate}`
        );
        return { success: true };
      } catch (error) {
        logger.error('Failed to save local HTML paths settings:', error as Error);
        return { success: false, error: String(error) };
      }
    }
  );

  // ============ Academic Settings Handlers ============

  ipcMain.handle('settings:getDefaultTargetGrade', () => {
    try {
      const value = prefsReader.get('academicSettings');
      if (value) {
        const settings = JSON.parse(value);
        return { defaultTargetGrade: settings.defaultTargetGrade ?? 85 };
      }
      return { defaultTargetGrade: 85 };
    } catch (_e) {
      return { defaultTargetGrade: 85 };
    }
  });

  ipcMain.handle(
    'settings:setDefaultTargetGrade',
    async (_event, targetGrade: number) => {
      try {
        const existing = prefsReader.get('academicSettings');
        const settings = existing ? JSON.parse(existing) : {};
        settings.defaultTargetGrade = targetGrade;

        const result = await new SetUserPreferenceCommand().execute(runContext(), {
          key: 'academicSettings',
          value: JSON.stringify(settings),
        });
        if (!result.success) {
          return { success: false, error: result.error };
        }

        const courseRepo = new CourseRepository(database);
        const updatedCount = courseRepo.updateDefaultTargetGrades(targetGrade);

        logger.info(
          `Default target grade updated to ${targetGrade}%, propagated to ${updatedCount} courses`
        );
        return { success: true, data: { updatedCourses: updatedCount } };
      } catch (error) {
        logger.error('Failed to save default target grade:', error as Error);
        return { success: false, error: String(error) };
      }
    }
  );

  // ============ Visibility Settings Handlers ============

  ipcMain.handle('settings:getTermSelection', () => {
    try {
      const visibilityOracle = getVisibilityOracle();
      if (!visibilityOracle) {
        return { termSelection: 'auto' };
      }
      const termSelection = visibilityOracle.getTermSelection();
      return { termSelection };
    } catch (error) {
      logger.error('Failed to get term selection:', error as Error);
      return { termSelection: 'auto' };
    }
  });

  ipcMain.handle(
    'settings:setTermSelection',
    (_event, value: 'all' | 'auto' | number) => {
      try {
        const visibilityOracle = getVisibilityOracle();
        if (!visibilityOracle) {
          return { success: false, error: 'VisibilityOracle not initialized' };
        }
        visibilityOracle.setTermSelection(value);
        logger.info(`Term selection updated to: ${value}`);
        return { success: true };
      } catch (error) {
        logger.error('Failed to set term selection:', error as Error);
        return { success: false, error: String(error) };
      }
    }
  );

  ipcMain.handle('visibility:getVisibleCourseIds', () => {
    try {
      const visibilityOracle = getVisibilityOracle();
      if (!visibilityOracle) {
        return { courseIds: [] };
      }
      const courseIds = visibilityOracle.getVisibleCourseIds();
      return { courseIds };
    } catch (error) {
      logger.error('Failed to get visible course IDs:', error as Error);
      return { courseIds: [] };
    }
  });

  // ============ Window Behavior Settings Handlers ============

  ipcMain.handle('settings:getWindowBehavior', () => {
    try {
      return getWindowBehavior();
    } catch (error) {
      logger.error('Failed to get window behavior settings:', error as Error);
      return { closeAction: null, showTrayIcon: true };
    }
  });

  ipcMain.handle(
    'settings:setWindowBehavior',
    (
      _event,
      settings: { closeAction: 'quit' | 'minimize-to-tray' | null; showTrayIcon: boolean }
    ) => {
      try {
        const previous = getWindowBehavior();
        setWindowBehavior(settings);
        logger.info(
          `Window behavior updated: closeAction=${settings.closeAction}, showTrayIcon=${settings.showTrayIcon}`
        );

        // Toggle tray when showTrayIcon changes (Windows only — macOS uses Dock, Linux tray unreliable)
        if (
          process.platform === 'win32' &&
          settings.showTrayIcon !== previous.showTrayIcon
        ) {
          if (settings.showTrayIcon) {
            createTray();
          } else {
            destroyTray();
          }
        }

        return { success: true };
      } catch (error) {
        logger.error('Failed to set window behavior settings:', error as Error);
        return { success: false, error: String(error) };
      }
    }
  );

  // One-way handler to hide window (for tray functionality)
  ipcMain.on('window:hide', () => {
    getMainWindow()?.hide();
  });

  // Handler for close behavior dialog response from renderer
  ipcMain.handle(
    'window:setCloseBehaviorAndApply',
    (_event, choice: 'minimize-to-tray' | 'quit') => {
      const settings = getWindowBehavior();
      setWindowBehavior({ ...settings, closeAction: choice });
      logger.info(`Close behavior set to: ${choice}`);

      if (choice === 'minimize-to-tray') {
        getMainWindow()?.hide();
      } else {
        setIsQuitting(true);
        app.quit();
      }
      return { success: true };
    }
  );

  // ============ Course Settings Handlers ============

  ipcMain.handle('course:getSettings', (_event, courseId: number) => {
    try {
      const course = courseReader.getSettingsById(courseId);

      if (!course) {
        return { success: false, error: 'Course not found' };
      }

      return {
        success: true,
        data: {
          autoAssignDueDate: course.auto_assign_due_date,
          allowGuessedOverride: course.allow_guessed_override ?? 1,
        },
      };
    } catch (_e) {
      return { success: false, error: String(_e) };
    }
  });

  ipcMain.handle(
    'course:updateSettings',
    async (
      _event,
      courseId: number,
      settings: {
        autoAssignDueDate?: number | null;
        allowGuessedOverride?: number;
      }
    ) => {
      try {
        const result = await new UpdateCourseSettingsCommand().execute(runContext(), {
          courseId,
          ...settings,
        });
        if (!result.success) {
          return { success: false, error: result.error };
        }
        return { success: true };
      } catch (error) {
        logger.error('Failed to update course settings:', error as Error);
        return { success: false, error: String(error) };
      }
    }
  );

  // ============ Settings Export/Import Handlers ============

  ipcMain.handle(
    'settings:exportToFile',
    async (_event, settings: Record<string, unknown>) => {
      const mainWindow = getMainWindow();
      if (!mainWindow) {
        return { success: false, error: 'No window available' };
      }

      const downloadsPath = app.getPath('downloads');
      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: path.join(
          downloadsPath,
          `canvas-assistant-settings-${new Date().toISOString().split('T')[0]}.json`
        ),
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Export cancelled' };
      }

      try {
        fs.writeFileSync(result.filePath, JSON.stringify(settings, null, 2), 'utf-8');
        logger.info(`Settings exported to: ${result.filePath}`);
        return { success: true, data: { filePath: result.filePath } };
      } catch (error) {
        logger.error('Failed to export settings:', error as Error);
        return { success: false, error: String(error) };
      }
    }
  );

  ipcMain.handle('settings:importFromFile', async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) {
      return { success: false, error: 'No window available' };
    }

    const downloadsPath = app.getPath('downloads');
    const result = await dialog.showOpenDialog(mainWindow, {
      defaultPath: downloadsPath,
      properties: ['openFile'],
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled || !result.filePaths.length) {
      return { success: false, error: 'Import cancelled' };
    }

    try {
      const content = fs.readFileSync(result.filePaths[0], 'utf-8');
      const settings = JSON.parse(content);

      if (typeof settings !== 'object' || settings === null) {
        return { success: false, error: 'Invalid settings file format' };
      }

      logger.info(`Settings imported from: ${result.filePaths[0]}`);
      return { success: true, data: { settings, filePath: result.filePaths[0] } };
    } catch (error) {
      logger.error('Failed to import settings:', error as Error);
      return { success: false, error: String(error) };
    }
  });

  // ============ Timezone Settings ============

  /**
   * Sync Canvas timezone from user profile
   * Called during sync to update the Canvas timezone in settings
   */
  ipcMain.handle(
    'settings:syncCanvasTimezone',
    async (_event, params: { timezone: string }) => {
      const { timezone } = params;

      if (!timezone) {
        return { success: false, error: 'No timezone provided' };
      }

      try {
        // Store in user_preferences for persistence
        const result = await new SetUserPreferenceCommand().execute(runContext(), {
          key: 'canvasTimezone',
          value: JSON.stringify({ timezone, syncedAt: new Date().toISOString() }),
        });
        if (!result.success) {
          return { success: false, error: result.error };
        }

        logger.info(`Canvas timezone synced: ${timezone}`);
        return { success: true, data: { timezone } };
      } catch (error) {
        logger.error('Failed to sync Canvas timezone:', error as Error);
        return { success: false, error: String(error) };
      }
    }
  );

  /**
   * Get the Canvas timezone stored in the database
   */
  ipcMain.handle('settings:getCanvasTimezone', () => {
    try {
      const value = prefsReader.get('canvasTimezone');
      if (value) {
        const data = JSON.parse(value);
        return { success: true, data };
      }
      return { success: true, data: null };
    } catch (error) {
      logger.error('Failed to get Canvas timezone:', error as Error);
      return { success: false, error: String(error) };
    }
  });
}
