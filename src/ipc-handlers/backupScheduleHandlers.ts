/**
 * Backup Schedule IPC Handlers
 *
 * Handles backup schedule configuration and history retrieval.
 */

import { ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import type { IpcContext } from './IpcContext';
import type { ExportSchedule } from '../layers/l5-presentation/settings/settingsSchema';
import { DEFAULT_EXPORT_SCHEDULE } from '../layers/l5-presentation/settings/settingsSchema';

interface BackupHistoryRow {
  id: number;
  file_path: string | null;
  file_size: number | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

/**
 * Calculate the next scheduled backup time
 */
function calculateNextRun(schedule: ExportSchedule): string | undefined {
  if (!schedule.enabled || schedule.frequency === 'never') {
    return undefined;
  }

  const now = new Date();
  const targetHour = schedule.time ? parseInt(schedule.time.split(':')[0], 10) : 3;
  const targetMinute = schedule.time ? parseInt(schedule.time.split(':')[1], 10) : 0;

  let nextRun = new Date(now);
  nextRun.setHours(targetHour, targetMinute, 0, 0);

  if (schedule.frequency === 'daily') {
    // If we've passed today's target time, move to tomorrow
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }
  } else if (schedule.frequency === 'weekly') {
    const targetDay = schedule.dayOfWeek ?? 0; // 0 = Sunday
    const currentDay = now.getDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil < 0 || (daysUntil === 0 && nextRun <= now)) {
      daysUntil += 7;
    }
    nextRun.setDate(nextRun.getDate() + daysUntil);
  } else if (schedule.frequency === 'monthly') {
    const targetDate = schedule.dayOfMonth ?? 1;
    nextRun.setDate(targetDate);
    // If we've passed this month's target, move to next month
    if (nextRun <= now) {
      nextRun.setMonth(nextRun.getMonth() + 1);
    }
    // Handle months with fewer days
    if (nextRun.getDate() !== targetDate) {
      // Target date doesn't exist in this month (e.g., Feb 30)
      // Go to the last day of the month
      nextRun.setDate(0);
    }
  }

  return nextRun.toISOString();
}

export function registerBackupScheduleHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();

  // Get backup schedule
  ipcMain.handle('backup:getSchedule', () => {
    try {
      const row = database.executeReadOne<{ value: string }>(
        "SELECT value FROM app_settings WHERE key = 'exportSchedule'"
      );

      if (row?.value) {
        const schedule: ExportSchedule = JSON.parse(row.value);
        // Calculate next run if enabled
        if (schedule.enabled && schedule.frequency !== 'never') {
          schedule.nextRun = calculateNextRun(schedule);
        }
        return { success: true, data: schedule };
      }

      // Return defaults with calculated next run
      const defaults = { ...DEFAULT_EXPORT_SCHEDULE };
      return { success: true, data: defaults };
    } catch (error) {
      logger.error('Failed to get backup schedule', error as Error);
      return { success: false, error: String(error) };
    }
  });

  // Set backup schedule
  ipcMain.handle(
    'backup:setSchedule',
    (_event, schedule: ExportSchedule & { encryptionPassword?: string }) => {
      try {
        // Calculate next run if enabled
        if (schedule.enabled && schedule.frequency !== 'never') {
          schedule.nextRun = calculateNextRun(schedule);
        } else {
          schedule.nextRun = undefined;
        }

        // Store the schedule (without password in main settings)
        const scheduleToStore = { ...schedule };
        delete scheduleToStore.encryptionPassword;

        database.executeWrite(
          `INSERT INTO app_settings (key, value) VALUES ('exportSchedule', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          [JSON.stringify(scheduleToStore)],
          'app_settings'
        );

        // Store encryption password separately if provided
        if (schedule.encrypt && schedule.encryptionPassword) {
          database.executeWrite(
            `INSERT INTO app_settings (key, value) VALUES ('backupEncryptionPassword', ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            [schedule.encryptionPassword],
            'app_settings'
          );
        } else if (!schedule.encrypt) {
          // Remove password if encryption disabled
          database.executeWrite(
            "DELETE FROM app_settings WHERE key = 'backupEncryptionPassword'",
            [],
            'app_settings'
          );
        }

        logger.info(
          `Backup schedule updated: ${schedule.frequency}, enabled: ${schedule.enabled}`
        );
        return { success: true, data: scheduleToStore };
      } catch (error) {
        logger.error('Failed to set backup schedule', error as Error);
        return { success: false, error: String(error) };
      }
    }
  );

  // Get backup history
  ipcMain.handle('backup:getHistory', (_event, limit = 10) => {
    try {
      const history = database.executeRead<BackupHistoryRow>(
        `SELECT id, file_path, file_size, status, error_message, created_at
         FROM export_history WHERE export_type = 'scheduled'
         ORDER BY created_at DESC LIMIT ?`,
        [limit]
      );

      // Check which files still exist
      const historyWithExists = history.map((h) => ({
        ...h,
        exists: h.file_path ? fs.existsSync(h.file_path) : false,
        encrypted: h.file_path ? h.file_path.endsWith('.enc') : false,
      }));

      return { success: true, data: historyWithExists };
    } catch (error) {
      logger.error('Failed to get backup history', error as Error);
      return { success: false, error: String(error) };
    }
  });

  // Get backup directory info
  ipcMain.handle('backup:getDirectoryInfo', () => {
    try {
      const backupDir = ctx.getBackupDir();

      let totalSize = 0;
      let fileCount = 0;

      if (fs.existsSync(backupDir)) {
        const files = fs.readdirSync(backupDir);
        for (const file of files) {
          if (file.startsWith('scheduled-backup-')) {
            const filePath = path.join(backupDir, file);
            const stats = fs.statSync(filePath);
            if (stats.isFile()) {
              totalSize += stats.size;
              fileCount++;
            }
          }
        }
      }

      return {
        success: true,
        data: {
          path: backupDir,
          totalSize,
          fileCount,
        },
      };
    } catch (error) {
      logger.error('Failed to get backup directory info', error as Error);
      return { success: false, error: String(error) };
    }
  });

  // Trigger immediate backup (for testing or manual trigger)
  ipcMain.handle('backup:runNow', async () => {
    try {
      // This will be handled by BackupManager - emit an event or call directly
      const mainWindow = ctx.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('backup:triggerNow');
      }

      // For now, we'll return success and let the BackupManager handle it
      // In a real implementation, you'd want to wait for completion
      return { success: true, message: 'Backup triggered' };
    } catch (error) {
      logger.error('Failed to trigger backup', error as Error);
      return { success: false, error: String(error) };
    }
  });
}
