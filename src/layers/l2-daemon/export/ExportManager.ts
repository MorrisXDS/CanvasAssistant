/**
 * L2 Daemon - Export Manager
 *
 * Orchestrates all export types: selective export, CSV export, ZIP archives.
 * Supports encryption, progress events, and manifest generation.
 */

import { EventEmitter } from 'events';
import fs from 'fs';
import { Database, VisibilityOracle } from '../../l1-persistence';
import { CryptoManager, EncryptedData } from '../../l0-utilities/CryptoManager';
import { ComponentLogger, Logger } from '../../l0-utilities/Logger';
import type { SyncEngine } from '../sync-engine/SyncEngine';

// Import types
import type {
  SelectiveExportOptions,
  CsvExportOptions,
  ExportResult,
  ExportProgress,
  ExportManagerConfig,
} from './ExportManagerTypes';

// Re-export types for backwards compatibility
export type {
  SelectiveExportOptions,
  CsvExportOptions,
  ExportResult,
  ExportProgress,
  ExportManifest,
  ExportManagerConfig,
} from './ExportManagerTypes';

// Import extracted functionality
import { exportTasksCsv, exportGradesCsv } from './CsvExporter';
import { createZipArchive } from './ZipExporter';
import {
  resolveCourseIds,
  collectExportData,
  CollectedExportData,
} from './ExportDataCollector';

/**
 * Export Manager for comprehensive data export functionality
 *
 * Features:
 * - Selective export (courses, tasks, notifications, files)
 * - CSV export for tasks and grades
 * - ZIP archives with file contents
 * - Encryption support via CryptoManager
 * - Progress events for UI feedback
 * - Manifest generation with checksums
 */
export class ExportManager extends EventEmitter {
  private readonly db: Database;
  private readonly visibilityOracle: VisibilityOracle;
  private readonly cryptoManager: CryptoManager;
  private readonly log: ComponentLogger;
  private readonly filesDir: string;
  private readonly appVersion: string;
  private readonly syncEngine: SyncEngine | null;

  constructor(
    db: Database,
    visibilityOracle: VisibilityOracle,
    config: ExportManagerConfig = {}
  ) {
    super();
    this.db = db;
    this.visibilityOracle = visibilityOracle;
    this.filesDir = config.filesDir ?? '';
    this.appVersion = config.appVersion ?? '1.0.0';
    this.syncEngine = config.syncEngine ?? null;

    if (config.logger) {
      this.log = config.logger.child('exportManager');
      this.cryptoManager = new CryptoManager({ logger: config.logger });
    } else {
      const defaultLogger = new Logger({ enableConsole: false });
      this.log = defaultLogger.child('exportManager');
      this.cryptoManager = new CryptoManager();
    }

    // Prevent unhandled error events from CryptoManager (e.g. wrong password decryption)
    this.cryptoManager.on('error', (err) => {
      this.log.debug('CryptoManager error handled', err?.type ?? 'unknown');
    });
  }

  /**
   * Check if sync is currently in progress
   */
  isSyncInProgress(): boolean {
    return this.syncEngine?.isBusy() ?? false;
  }

  /**
   * Export tasks to CSV format
   */
  async exportTasksCsv(
    outputPath: string,
    options: CsvExportOptions = {}
  ): Promise<ExportResult> {
    return exportTasksCsv(
      {
        db: this.db,
        resolveCourseIds: (ids, archived, archivedIds) =>
          resolveCourseIds(this.visibilityOracle, ids, archived, archivedIds),
        emitProgress: (stage, progress, message) =>
          this.emitProgress(stage as ExportProgress['stage'], progress, message),
        log: this.log,
      },
      outputPath,
      options
    );
  }

  /**
   * Export grades to CSV format
   */
  async exportGradesCsv(
    outputPath: string,
    options: CsvExportOptions = {}
  ): Promise<ExportResult> {
    return exportGradesCsv(
      {
        db: this.db,
        resolveCourseIds: (ids, archived, archivedIds) =>
          resolveCourseIds(this.visibilityOracle, ids, archived, archivedIds),
        emitProgress: (stage, progress, message) =>
          this.emitProgress(stage as ExportProgress['stage'], progress, message),
        log: this.log,
      },
      outputPath,
      options
    );
  }

  /**
   * Perform selective export with all options
   */
  async exportSelective(
    outputPath: string,
    options: SelectiveExportOptions
  ): Promise<ExportResult> {
    try {
      // Validate encryption options
      if (options.encrypt && !options.password) {
        return { success: false, error: 'Password required for encrypted export' };
      }

      // Check if sync is in progress
      if (this.isSyncInProgress()) {
        return { success: false, error: 'Cannot export while sync is in progress' };
      }

      this.emitProgress('collecting', 5, 'Collecting data...');

      // Collect all data
      const collected = collectExportData(
        {
          db: this.db,
          visibilityOracle: this.visibilityOracle,
          appVersion: this.appVersion,
          emitProgress: (stage, progress, message) =>
            this.emitProgress(stage as ExportProgress['stage'], progress, message),
        },
        options
      );

      if ('error' in collected) {
        return { success: false, error: collected.error };
      }

      const data = collected as CollectedExportData;

      // Build export data object
      const exportData = {
        exportedAt: new Date().toISOString(),
        version: '2.1',
        appVersion: this.appVersion,
        options: {
          format: options.format,
          encrypted: !!options.encrypt,
          includedCourses: data.courseIds,
          taskStatus: options.taskStatus || 'all',
          dateRange: options.dateRange
            ? {
                start: options.dateRange.start.toISOString(),
                end: options.dateRange.end.toISOString(),
              }
            : null,
        },
        courses: data.courses,
        tasks: data.tasks,
        notifications: data.notifications,
        policies: data.policies,
        graceTokens: data.graceTokens,
        pages: data.pages,
        calendarEvents: data.calendarEvents,
        modules: data.modules,
        moduleItems: data.moduleItems,
        resources: data.resources,
        syncMetadata: data.syncMetadata,
      };

      // Handle different formats
      if (options.format === 'csv') {
        return this.exportTasksCsv(outputPath, {
          courseIds: options.courses,
          status: options.taskStatus,
          dateRange: options.dateRange,
        });
      }

      if (options.format === 'zip') {
        return createZipArchive(
          {
            cryptoManager: this.cryptoManager,
            filesDir: this.filesDir,
            appVersion: this.appVersion,
            emitProgress: (stage, progress, message) =>
              this.emitProgress(stage as ExportProgress['stage'], progress, message),
            log: this.log,
          },
          outputPath,
          exportData,
          options
        );
      }

      // JSON format
      return this.exportJson(outputPath, exportData, options);
    } catch (error) {
      this.log.error(
        'Failed to perform selective export',
        error instanceof Error ? error : undefined
      );
      return { success: false, error: String(error) };
    }
  }

  /**
   * Export to JSON format (with optional encryption)
   */
  private exportJson(
    outputPath: string,
    exportData: Record<string, unknown>,
    options: SelectiveExportOptions
  ): ExportResult {
    this.emitProgress('writing', 60, 'Writing JSON...');

    let jsonContent = JSON.stringify(exportData, null, 2);
    let finalPath = outputPath;

    if (options.encrypt && options.password) {
      this.emitProgress('encrypting', 75, 'Encrypting data...');
      const encrypted = this.cryptoManager.encrypt(jsonContent, options.password);
      if (!encrypted) {
        return { success: false, error: 'Encryption failed' };
      }
      jsonContent = JSON.stringify(encrypted, null, 2);
      if (!finalPath.endsWith('.cbk')) {
        finalPath = finalPath.replace(/\.json$/, '.cbk');
      }
    }

    fs.writeFileSync(finalPath, jsonContent, 'utf-8');

    this.emitProgress('complete', 100, 'Export complete');
    this.log.info(`Selective export complete: ${finalPath}`);

    const courses = exportData.courses as unknown[];
    const tasks = exportData.tasks as unknown[];

    return {
      success: true,
      filePath: finalPath,
      fileSize: Buffer.byteLength(jsonContent),
      coursesExported: courses?.length || 0,
      tasksExported: tasks?.length || 0,
    };
  }

  /**
   * Import encrypted export file
   */
  async importEncrypted(
    filePath: string,
    password: string
  ): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      let data: unknown;

      try {
        data = JSON.parse(fileContent);
      } catch {
        return { success: false, error: 'Invalid file format' };
      }

      // Check if it's encrypted
      if (this.cryptoManager.isValidEncryptedData(data)) {
        const decrypted = this.cryptoManager.decryptToString(
          data as EncryptedData,
          password
        );
        if (!decrypted) {
          return {
            success: false,
            error: 'Decryption failed - wrong password or corrupted file',
          };
        }
        data = JSON.parse(decrypted);
      }

      return { success: true, data: data as Record<string, unknown> };
    } catch (error) {
      this.log.error(
        'Failed to import encrypted file',
        error instanceof Error ? error : undefined
      );
      return { success: false, error: String(error) };
    }
  }

  /**
   * Emit progress event
   */
  private emitProgress(
    stage: ExportProgress['stage'],
    progress: number,
    message: string,
    bytesWritten?: number,
    totalBytes?: number
  ): void {
    const progressData: ExportProgress = {
      stage,
      progress,
      message,
      bytesWritten,
      totalBytes,
    };
    this.emit('progress', progressData);
  }
}
