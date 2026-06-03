/**
 * Backup Manager
 * Handles scheduled database backups with rotation and optional encryption
 */

import { BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import type { Database } from '../layers/l1-persistence';
import { UserPreferencesReader } from '../layers/l1-persistence';
import type { Logger } from '../layers/l0-utilities/Logger';
import type { MetricsCollector } from '../layers/l0-utilities/MetricsCollector';
import { encryptBackup } from '../layers/l0-utilities/BackupEncryption';
import { SetUserPreferenceCommand } from '../layers/l4-controller';
import { createSimulationContext } from '../layers/l4-controller/types';

export interface BackupManagerConfig {
  database: Database;
  dbPath: string;
  backupDir: string;
  logger: Logger;
  metricsCollector: MetricsCollector;
  getMainWindow: () => BrowserWindow | null;
}

interface BackupSchedule {
  enabled: boolean;
  frequency: string;
  time?: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  maxBackups: number;
  encrypt: boolean;
  lastRun?: string;
}

export class BackupManager {
  private database: Database;
  private dbPath: string;
  private backupDir: string;
  private logger: Logger;
  private metricsCollector: MetricsCollector;
  private getMainWindow: () => BrowserWindow | null;
  private schedulerInterval: ReturnType<typeof setInterval> | null = null;
  private lastBackupCheck: Date | null = null;

  constructor(config: BackupManagerConfig) {
    this.database = config.database;
    this.dbPath = config.dbPath;
    this.backupDir = config.backupDir;
    this.logger = config.logger;
    this.metricsCollector = config.metricsCollector;
    this.getMainWindow = config.getMainWindow;
  }

  /**
   * Start the backup scheduler
   */
  start(): void {
    this.stop();

    // Check every hour
    const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

    this.logger.info('Starting backup scheduler (checks hourly)');

    // Initial check after 5 minutes (allow app to settle)
    setTimeout(() => this.checkAndRunBackup(), 5 * 60 * 1000);

    // Regular checks
    this.schedulerInterval = setInterval(() => {
      this.checkAndRunBackup();
    }, CHECK_INTERVAL_MS);
  }

  /**
   * Stop the backup scheduler
   */
  stop(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
  }

  /**
   * Check if backup is due and run it if needed
   */
  async checkAndRunBackup(): Promise<void> {
    try {
      // Read schedule from user_preferences (SQL is authoritative for backup config)
      const prefsReader = new UserPreferencesReader(this.database);
      const scheduleValue = prefsReader.get('exportSchedule');

      if (!scheduleValue) {
        return; // No schedule configured
      }

      let schedule: BackupSchedule;

      try {
        schedule = JSON.parse(scheduleValue);
      } catch {
        return; // Invalid schedule
      }

      if (!schedule.enabled || schedule.frequency === 'never') {
        return;
      }

      const now = new Date();
      const lastRun = schedule.lastRun ? new Date(schedule.lastRun) : null;

      // Determine if backup is due
      let isDue = false;
      const targetHour = schedule.time ? parseInt(schedule.time.split(':')[0], 10) : 3; // Default 3 AM

      if (schedule.frequency === 'daily') {
        // Daily: run once per day at target hour
        if (!lastRun || now.getTime() - lastRun.getTime() >= 20 * 60 * 60 * 1000) {
          // At least 20 hours since last run
          if (now.getHours() === targetHour) {
            isDue = true;
          }
        }
      } else if (schedule.frequency === 'weekly') {
        // Weekly: run on specific day of week
        const targetDay = schedule.dayOfWeek ?? 0; // Default Sunday
        if (!lastRun || now.getTime() - lastRun.getTime() >= 6 * 24 * 60 * 60 * 1000) {
          // At least 6 days since last run
          if (now.getDay() === targetDay && now.getHours() === targetHour) {
            isDue = true;
          }
        }
      } else if (schedule.frequency === 'monthly') {
        // Monthly: run on specific day of month
        const targetDate = schedule.dayOfMonth ?? 1;
        if (!lastRun || now.getTime() - lastRun.getTime() >= 27 * 24 * 60 * 60 * 1000) {
          // At least 27 days since last run
          if (now.getDate() === targetDate && now.getHours() === targetHour) {
            isDue = true;
          }
        }
      }

      if (!isDue) {
        return;
      }

      this.logger.info('Scheduled backup is due, running...');
      this.lastBackupCheck = now;

      // Run the backup
      if (!fs.existsSync(this.backupDir)) {
        fs.mkdirSync(this.backupDir, { recursive: true });
      }

      let backupPath = path.join(
        this.backupDir,
        `scheduled-backup-${now.toISOString().replace(/[:.]/g, '-')}.db`
      );

      // Checkpoint WAL before copying
      this.database.executeWrite('PRAGMA wal_checkpoint(TRUNCATE)', [], 'system');

      // Copy database file
      fs.copyFileSync(this.dbPath, backupPath);

      // Handle encryption if enabled
      let isEncrypted = false;
      if (schedule.encrypt) {
        // Get encryption password from user_preferences
        const passwordValue = prefsReader.get('backupEncryptionPassword');

        if (passwordValue) {
          const encryptedPath = backupPath.replace('.db', '.db.enc');
          const encryptResult = encryptBackup(backupPath, encryptedPath, passwordValue);

          if (encryptResult.success) {
            // Remove unencrypted version
            fs.unlinkSync(backupPath);
            backupPath = encryptedPath;
            isEncrypted = true;
            this.logger.info('Backup encrypted successfully');
          } else {
            this.logger.error(`Backup encryption failed: ${encryptResult.error}`);
            // Continue with unencrypted backup
          }
        } else {
          this.logger.warn(
            'Encryption enabled but no password found, creating unencrypted backup'
          );
        }
      }

      const fileStats = fs.statSync(backupPath);

      // Log to export history
      this.database.executeWrite(
        `INSERT INTO export_history (export_type, file_path, file_size, status)
         VALUES ('scheduled', ?, ?, 'completed')`,
        [backupPath, fileStats.size],
        'export_history'
      );

      // Update schedule with last run time
      schedule.lastRun = now.toISOString();
      await new SetUserPreferenceCommand().execute(
        { db: this.database, simulationContext: createSimulationContext() },
        { key: 'exportSchedule', value: JSON.stringify(schedule) }
      );

      // Rotate old backups (keep maxBackups most recent)
      this.rotateBackups(this.backupDir, schedule.maxBackups);

      this.logger.info(
        `Scheduled backup completed: ${backupPath} (encrypted: ${isEncrypted})`
      );
      this.metricsCollector.increment('backup.scheduled.success');
      if (isEncrypted) {
        this.metricsCollector.increment('backup.scheduled.encrypted');
      }

      // Notify renderer
      const mainWindow = this.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('backup:completed', {
          type: 'scheduled',
          path: backupPath,
          size: fileStats.size,
          encrypted: isEncrypted,
        });
      }
    } catch (error) {
      this.logger.error(
        'Scheduled backup failed',
        error instanceof Error ? error : undefined
      );
      this.metricsCollector.increment('backup.scheduled.failure');

      // Log failure to history
      try {
        this.database.executeWrite(
          `INSERT INTO export_history (export_type, status, error_message)
           VALUES ('scheduled', 'failed', ?)`,
          [String(error)],
          'export_history'
        );
      } catch {
        // Ignore secondary error
      }
    }
  }

  /**
   * Rotate old backups, keeping only the most recent N files
   * Handles both encrypted (.db.enc) and unencrypted (.db) backups
   */
  private rotateBackups(backupDir: string, maxBackups: number): void {
    try {
      const files = fs
        .readdirSync(backupDir)
        .filter(
          (f) =>
            f.startsWith('scheduled-backup-') &&
            (f.endsWith('.db') || f.endsWith('.db.enc'))
        )
        .map((f) => ({
          name: f,
          path: path.join(backupDir, f),
          mtime: fs.statSync(path.join(backupDir, f)).mtime.getTime(),
        }))
        .sort((a, b) => b.mtime - a.mtime); // Newest first

      // Delete files beyond maxBackups
      for (let i = maxBackups; i < files.length; i++) {
        fs.unlinkSync(files[i].path);
        this.logger.info(`Rotated old backup: ${files[i].name}`);
      }
    } catch (error) {
      this.logger.warn(
        `Backup rotation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
