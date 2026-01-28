/**
 * L2 Daemon - Export Manager
 *
 * Orchestrates all export types: selective export, CSV export, ZIP archives.
 * Supports encryption, progress events, and manifest generation.
 */

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { Database } from '../l1-persistence/Database';
import { VisibleDataProvider } from '../l1-persistence/VisibleDataProvider';
import { CryptoManager, EncryptedData } from '../l0-utilities/CryptoManager';
import { ComponentLogger, Logger } from '../l0-utilities/Logger';
import type {
  CourseRow,
  TaskRow,
  NotificationRow,
  PolicyRow,
  GraceTokenRow,
} from '../l1-persistence/DatabaseRowTypes';

// =============================================================================
// Types
// =============================================================================

export interface SelectiveExportOptions {
  /** Specific course IDs (empty = all visible) */
  courses?: number[];
  /** Include archived courses in export */
  includeArchived?: boolean;
  /** Specific archived course IDs to include */
  archivedCourses?: number[];
  /** Include tasks in export (default: true) */
  includeTasks?: boolean;
  /** Include notifications in export */
  includeNotifications?: boolean;
  /** Include actual file contents in ZIP */
  includeFiles?: boolean;
  /** Include grades data */
  includeGrades?: boolean;
  /** Include calendar events */
  includeCalendar?: boolean;
  /** Filter tasks by status */
  taskStatus?: 'all' | 'pending' | 'completed';
  /** Filter by date range */
  dateRange?: { start: Date; end: Date };
  /** Output format */
  format: 'json' | 'csv' | 'zip';
  /** Encrypt the export */
  encrypt?: boolean;
  /** Password for encryption (required if encrypt=true) */
  password?: string;
}

export interface CsvExportOptions {
  courseIds?: number[];
  /** Include all archived courses */
  includeArchived?: boolean;
  /** Specific archived course IDs to include */
  archivedCourseIds?: number[];
  status?: 'all' | 'pending' | 'completed';
  dateRange?: { start: Date; end: Date };
}

export interface ExportResult {
  success: boolean;
  filePath?: string;
  fileSize?: number;
  coursesExported?: number;
  tasksExported?: number;
  filesExported?: number;
  error?: string;
}

export interface ExportProgress {
  stage:
    | 'preparing'
    | 'collecting'
    | 'writing'
    | 'encrypting'
    | 'compressing'
    | 'complete';
  progress: number; // 0-100
  message: string;
  bytesWritten?: number;
  totalBytes?: number;
}

export interface ExportManifest {
  version: string;
  exportedAt: string;
  appVersion: string;
  format: 'json' | 'csv' | 'zip';
  encrypted: boolean;
  contents: {
    courses: number;
    tasks: number;
    notifications: number;
    files: number;
    pages: number;
    policies: number;
  };
  checksums?: Record<string, string>;
}

export interface ExportManagerConfig {
  logger?: Logger;
  filesDir?: string;
  appVersion?: string;
}

// CSV header definitions
const TASKS_CSV_HEADERS = [
  'Course',
  'Task Name',
  'Type',
  'Due Date',
  'Status',
  'Points Possible',
  'Grade',
  'Weight',
  'Priority',
  'Description',
];

const GRADES_CSV_HEADERS = [
  'Course',
  'Assignment',
  'Points Earned',
  'Points Possible',
  'Weight',
  'Percentage',
  'Letter Grade',
];

// =============================================================================
// ExportManager Class
// =============================================================================

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
  private readonly visibleDataProvider: VisibleDataProvider;
  private readonly cryptoManager: CryptoManager;
  private readonly log: ComponentLogger;
  private readonly filesDir: string;
  private readonly appVersion: string;

  constructor(
    db: Database,
    visibleDataProvider: VisibleDataProvider,
    config: ExportManagerConfig = {}
  ) {
    super();
    this.db = db;
    this.visibleDataProvider = visibleDataProvider;
    this.filesDir = config.filesDir ?? '';
    this.appVersion = config.appVersion ?? '1.0.0';

    if (config.logger) {
      this.log = config.logger.child('exportManager');
      this.cryptoManager = new CryptoManager({ logger: config.logger });
    } else {
      const defaultLogger = new Logger({ enableConsole: false });
      this.log = defaultLogger.child('exportManager');
      this.cryptoManager = new CryptoManager();
    }
  }

  /**
   * Export tasks to CSV format
   */
  async exportTasksCsv(
    outputPath: string,
    options: CsvExportOptions = {}
  ): Promise<ExportResult> {
    try {
      this.emitProgress('collecting', 10, 'Collecting tasks...');

      const courseIds = this.resolveCourseIds(
        options.courseIds,
        options.includeArchived,
        options.archivedCourseIds
      );
      if (courseIds.length === 0) {
        return { success: false, error: 'No courses to export' };
      }

      // Build query with filters
      let sql = `
        SELECT t.*, c.code as course_code, c.name as course_name
        FROM tasks t
        JOIN courses c ON t.course_id = c.id
        WHERE t.course_id IN (${courseIds.map(() => '?').join(', ')})
      `;
      const params: (string | number)[] = [...courseIds];

      if (options.status === 'pending') {
        sql += ' AND t.is_completed = 0';
      } else if (options.status === 'completed') {
        sql += ' AND t.is_completed = 1';
      }

      if (options.dateRange) {
        sql += ' AND t.due_at >= ? AND t.due_at <= ?';
        params.push(options.dateRange.start.toISOString());
        params.push(options.dateRange.end.toISOString());
      }

      sql += ' ORDER BY c.code, t.due_at';

      const tasks = this.db.executeRead<
        TaskRow & { course_code: string; course_name: string }
      >(sql, params);

      this.emitProgress('writing', 50, 'Writing CSV...');

      // Generate CSV
      const rows: string[] = [TASKS_CSV_HEADERS.join(',')];

      for (const task of tasks) {
        const row = [
          this.escapeCsv(task.course_code),
          this.escapeCsv(task.title),
          this.escapeCsv(task.task_type || 'unknown'),
          task.due_at ? new Date(task.due_at).toLocaleDateString() : '',
          task.is_completed ? 'completed' : 'pending',
          task.points_possible?.toString() ?? '',
          task.grade?.toString() ?? '',
          task.weight ? `${task.weight}%` : '',
          task.priority_score?.toString() ?? '',
          this.escapeCsv(task.description || ''),
        ];
        rows.push(row.join(','));
      }

      const csvContent = rows.join('\n');
      fs.writeFileSync(outputPath, csvContent, 'utf-8');

      this.emitProgress('complete', 100, 'Export complete');
      this.log.info(`Tasks CSV exported: ${tasks.length} tasks to ${outputPath}`);

      return {
        success: true,
        filePath: outputPath,
        fileSize: Buffer.byteLength(csvContent),
        tasksExported: tasks.length,
      };
    } catch (error) {
      this.log.error(
        'Failed to export tasks CSV',
        error instanceof Error ? error : undefined
      );
      return { success: false, error: String(error) };
    }
  }

  /**
   * Export grades to CSV format
   */
  async exportGradesCsv(
    outputPath: string,
    options: CsvExportOptions = {}
  ): Promise<ExportResult> {
    try {
      this.emitProgress('collecting', 10, 'Collecting grades...');

      const courseIds = this.resolveCourseIds(
        options.courseIds,
        options.includeArchived,
        options.archivedCourseIds
      );
      if (courseIds.length === 0) {
        return { success: false, error: 'No courses to export' };
      }

      // Fetch graded tasks (tasks with a grade)
      const sql = `
        SELECT t.*, c.code as course_code, c.name as course_name
        FROM tasks t
        JOIN courses c ON t.course_id = c.id
        WHERE t.course_id IN (${courseIds.map(() => '?').join(', ')})
          AND t.grade IS NOT NULL
        ORDER BY c.code, t.due_at
      `;

      const tasks = this.db.executeRead<
        TaskRow & { course_code: string; course_name: string }
      >(sql, courseIds);

      this.emitProgress('writing', 50, 'Writing CSV...');

      // Generate CSV
      const rows: string[] = [GRADES_CSV_HEADERS.join(',')];

      for (const task of tasks) {
        const pointsPossible = task.points_possible ?? 100;
        const percentage =
          pointsPossible > 0 ? ((task.grade ?? 0) / pointsPossible) * 100 : 0;

        const row = [
          this.escapeCsv(task.course_code),
          this.escapeCsv(task.title),
          task.grade?.toString() ?? '0',
          pointsPossible.toString(),
          task.weight ? `${task.weight}%` : '',
          `${percentage.toFixed(1)}%`,
          this.getLetterGrade(percentage),
        ];
        rows.push(row.join(','));
      }

      const csvContent = rows.join('\n');
      fs.writeFileSync(outputPath, csvContent, 'utf-8');

      this.emitProgress('complete', 100, 'Export complete');
      this.log.info(`Grades CSV exported: ${tasks.length} grades to ${outputPath}`);

      return {
        success: true,
        filePath: outputPath,
        fileSize: Buffer.byteLength(csvContent),
        tasksExported: tasks.length,
      };
    } catch (error) {
      this.log.error(
        'Failed to export grades CSV',
        error instanceof Error ? error : undefined
      );
      return { success: false, error: String(error) };
    }
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

      this.emitProgress('collecting', 5, 'Collecting data...');

      const courseIds = this.resolveCourseIds(
        options.courses,
        options.includeArchived,
        options.archivedCourses
      );
      if (courseIds.length === 0) {
        return { success: false, error: 'No courses to export' };
      }

      // Collect courses
      const courses = this.db.executeRead<CourseRow>(
        `SELECT * FROM courses WHERE id IN (${courseIds.map(() => '?').join(', ')})`,
        courseIds
      );

      this.emitProgress('collecting', 15, `Found ${courses.length} courses`);

      // Collect tasks if requested
      let tasks: TaskRow[] = [];
      if (options.includeTasks !== false) {
        let taskSql = `SELECT * FROM tasks WHERE course_id IN (${courseIds.map(() => '?').join(', ')})`;
        const taskParams: (string | number)[] = [...courseIds];

        if (options.taskStatus === 'pending') {
          taskSql += ' AND is_completed = 0';
        } else if (options.taskStatus === 'completed') {
          taskSql += ' AND is_completed = 1';
        }

        if (options.dateRange) {
          taskSql += ' AND due_at >= ? AND due_at <= ?';
          taskParams.push(options.dateRange.start.toISOString());
          taskParams.push(options.dateRange.end.toISOString());
        }

        tasks = this.db.executeRead<TaskRow>(taskSql, taskParams);
        this.emitProgress('collecting', 25, `Found ${tasks.length} tasks`);
      }

      // Collect notifications if requested
      let notifications: NotificationRow[] = [];
      if (options.includeNotifications) {
        notifications = this.db.executeRead<NotificationRow>(
          `SELECT * FROM notifications WHERE course_id IN (${courseIds.map(() => '?').join(', ')})`,
          courseIds
        );
        this.emitProgress(
          'collecting',
          35,
          `Found ${notifications.length} notifications`
        );
      }

      // Collect policies
      const policies = this.db.executeRead<PolicyRow>(
        `SELECT * FROM course_policies WHERE course_id IN (${courseIds.map(() => '?').join(', ')})`,
        courseIds
      );

      // Collect grace tokens
      const graceTokens = this.db.executeRead<GraceTokenRow>(
        `SELECT * FROM grace_tokens WHERE course_id IN (${courseIds.map(() => '?').join(', ')})`,
        courseIds
      );

      // Collect pages
      const pages = this.db.executeRead<Record<string, unknown>>(
        `SELECT * FROM course_pages WHERE course_id IN (${courseIds.map(() => '?').join(', ')})`,
        courseIds
      );

      // Collect calendar events if requested
      let calendarEvents: Record<string, unknown>[] = [];
      if (options.includeCalendar) {
        calendarEvents = this.db.executeRead<Record<string, unknown>>(
          `SELECT * FROM calendar_events WHERE course_id IN (${courseIds.map(() => '?').join(', ')})`,
          courseIds
        );
      }

      this.emitProgress('collecting', 45, 'Building export data...');

      // Build export data object
      const exportData = {
        exportedAt: new Date().toISOString(),
        version: '2.0',
        appVersion: this.appVersion,
        options: {
          format: options.format,
          encrypted: !!options.encrypt,
          includedCourses: courseIds,
          taskStatus: options.taskStatus || 'all',
          dateRange: options.dateRange
            ? {
                start: options.dateRange.start.toISOString(),
                end: options.dateRange.end.toISOString(),
              }
            : null,
        },
        courses: courses.map((c) => this.sanitizeCourseForExport(c)),
        tasks: tasks.map((t) => this.sanitizeTaskForExport(t)),
        notifications,
        policies,
        graceTokens,
        pages,
        calendarEvents,
      };

      // Handle different formats
      if (options.format === 'csv') {
        // For CSV, export tasks only
        return this.exportTasksCsv(outputPath, {
          courseIds: options.courses,
          status: options.taskStatus,
          dateRange: options.dateRange,
        });
      }

      if (options.format === 'zip') {
        return this.createZipArchive(outputPath, exportData, options);
      }

      // JSON format
      this.emitProgress('writing', 60, 'Writing JSON...');

      let jsonContent = JSON.stringify(exportData, null, 2);

      if (options.encrypt && options.password) {
        this.emitProgress('encrypting', 75, 'Encrypting data...');
        const encrypted = this.cryptoManager.encrypt(jsonContent, options.password);
        if (!encrypted) {
          return { success: false, error: 'Encryption failed' };
        }
        jsonContent = JSON.stringify(encrypted, null, 2);
        // Change extension to indicate encrypted
        if (!outputPath.endsWith('.cbk')) {
          outputPath = outputPath.replace(/\.json$/, '.cbk');
        }
      }

      fs.writeFileSync(outputPath, jsonContent, 'utf-8');

      this.emitProgress('complete', 100, 'Export complete');
      this.log.info(`Selective export complete: ${outputPath}`);

      return {
        success: true,
        filePath: outputPath,
        fileSize: Buffer.byteLength(jsonContent),
        coursesExported: courses.length,
        tasksExported: tasks.length,
      };
    } catch (error) {
      this.log.error(
        'Failed to perform selective export',
        error instanceof Error ? error : undefined
      );
      return { success: false, error: String(error) };
    }
  }

  /**
   * Create ZIP archive with files
   */
  private async createZipArchive(
    outputPath: string,
    exportData: Record<string, unknown>,
    options: SelectiveExportOptions
  ): Promise<ExportResult> {
    return new Promise((resolve) => {
      try {
        this.emitProgress('compressing', 50, 'Creating ZIP archive...');

        const output = fs.createWriteStream(outputPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        let filesExported = 0;

        output.on('close', () => {
          this.emitProgress('complete', 100, 'Export complete');
          this.log.info(
            `ZIP archive created: ${outputPath} (${archive.pointer()} bytes)`
          );

          resolve({
            success: true,
            filePath: outputPath,
            fileSize: archive.pointer(),
            coursesExported: (exportData.courses as unknown[])?.length || 0,
            tasksExported: (exportData.tasks as unknown[])?.length || 0,
            filesExported,
          });
        });

        archive.on('error', (err: Error) => {
          this.log.error('Archive error', err);
          resolve({ success: false, error: err.message });
        });

        archive.pipe(output);

        // Create manifest
        const manifest: ExportManifest = {
          version: '2.0',
          exportedAt: new Date().toISOString(),
          appVersion: this.appVersion,
          format: 'zip',
          encrypted: !!options.encrypt,
          contents: {
            courses: (exportData.courses as unknown[])?.length || 0,
            tasks: (exportData.tasks as unknown[])?.length || 0,
            notifications: (exportData.notifications as unknown[])?.length || 0,
            files: 0,
            pages: (exportData.pages as unknown[])?.length || 0,
            policies: (exportData.policies as unknown[])?.length || 0,
          },
          checksums: {},
        };

        // Add data files
        let dataContent = JSON.stringify(exportData, null, 2);

        if (options.encrypt && options.password) {
          const encrypted = this.cryptoManager.encrypt(dataContent, options.password);
          if (encrypted) {
            dataContent = JSON.stringify(encrypted);
            archive.append(dataContent, { name: 'data/export.encrypted.json' });
          }
        } else {
          archive.append(dataContent, { name: 'data/export.json' });
        }

        // Add manifest (always unencrypted)
        manifest.checksums!['data'] = this.cryptoManager.computeHash(dataContent);

        // Include actual files if requested
        if (options.includeFiles && this.filesDir) {
          this.emitProgress('compressing', 60, 'Adding files to archive...');

          const courses = exportData.courses as CourseRow[];
          for (const course of courses) {
            const courseDir = path.join(this.filesDir, course.code);
            if (fs.existsSync(courseDir)) {
              archive.directory(courseDir, `files/${course.code}`);
              // Count files
              const countFiles = (dir: string): number => {
                let count = 0;
                const items = fs.readdirSync(dir);
                for (const item of items) {
                  const itemPath = path.join(dir, item);
                  if (fs.statSync(itemPath).isDirectory()) {
                    count += countFiles(itemPath);
                  } else {
                    count++;
                  }
                }
                return count;
              };
              filesExported += countFiles(courseDir);
            }
          }
          manifest.contents.files = filesExported;
        }

        archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
        archive.finalize();
      } catch (error) {
        this.log.error(
          'Failed to create ZIP archive',
          error instanceof Error ? error : undefined
        );
        resolve({ success: false, error: String(error) });
      }
    });
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
   * Resolve course IDs - use provided or fall back to visible courses
   * @param courseIds - Specific course IDs to export
   * @param includeArchived - Include all archived courses
   * @param archivedCourseIds - Specific archived course IDs to include
   */
  private resolveCourseIds(
    courseIds?: number[],
    includeArchived?: boolean,
    archivedCourseIds?: number[]
  ): number[] {
    let result: number[] = [];

    // Handle visible courses
    if (courseIds && courseIds.length > 0) {
      // Validate that provided IDs are visible
      const visibleIds = new Set(this.visibleDataProvider.getVisibleCourseIds());
      result = courseIds.filter((id) => visibleIds.has(id));
    } else {
      result = this.visibleDataProvider.getVisibleCourseIds();
    }

    // Handle archived courses
    if (includeArchived) {
      // Include all archived courses
      const allArchivedIds = this.visibleDataProvider.getArchivedCourseIds();
      result = [...result, ...allArchivedIds];
    } else if (archivedCourseIds && archivedCourseIds.length > 0) {
      // Include specific archived courses
      const validArchivedIds = new Set(this.visibleDataProvider.getArchivedCourseIds());
      const filteredArchivedIds = archivedCourseIds.filter((id) =>
        validArchivedIds.has(id)
      );
      result = [...result, ...filteredArchivedIds];
    }

    // Remove duplicates
    return [...new Set(result)];
  }

  /**
   * Sanitize course data for export (remove internal fields)
   */
  private sanitizeCourseForExport(course: CourseRow): Record<string, unknown> {
    return {
      id: course.id,
      externalId: course.external_id,
      code: course.code,
      name: course.name,
      nickname: course.nickname,
      color: course.color,
      enrollmentTermId: course.enrollment_term_id,
      targetGrade: course.target_grade,
      targetGradeSource: course.target_grade_source,
      isHidden: course.is_hidden,
      currentGrade: course.current_grade,
      assessedGrade: course.assessed_grade,
      totalWeight: course.total_weight,
      syllabusBody: course.syllabus_body,
      archivedAt: course.archived_at,
      archiveSource: course.archive_source,
    };
  }

  /**
   * Sanitize task data for export (remove internal fields)
   */
  private sanitizeTaskForExport(task: TaskRow): Record<string, unknown> {
    return {
      id: task.id,
      externalId: task.external_id,
      courseId: task.course_id,
      title: task.title,
      description: task.description,
      dueAt: task.due_at,
      dueTimeKnown: task.due_time_known,
      unlockAt: task.unlock_at,
      lockAt: task.lock_at,
      weight: task.weight,
      grade: task.grade,
      pointsPossible: task.points_possible,
      priorityScore: task.priority_score,
      isCompleted: task.is_completed,
      isOptional: task.is_optional,
      completedAt: task.completed_at,
      submissionStatus: task.submission_status,
      userSubmissionStatus: task.user_submission_status,
      taskType: task.task_type,
      taskGroupId: task.task_group_id,
      fieldSources: task.field_sources,
    };
  }

  /**
   * Escape CSV field value
   */
  private escapeCsv(value: string): string {
    if (!value) return '';
    // If value contains comma, quote, or newline, wrap in quotes and escape internal quotes
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Get letter grade from percentage (UofT scale)
   */
  private getLetterGrade(percentage: number): string {
    if (percentage >= 90) return 'A+';
    if (percentage >= 85) return 'A';
    if (percentage >= 80) return 'A-';
    if (percentage >= 77) return 'B+';
    if (percentage >= 73) return 'B';
    if (percentage >= 70) return 'B-';
    if (percentage >= 67) return 'C+';
    if (percentage >= 63) return 'C';
    if (percentage >= 60) return 'C-';
    if (percentage >= 57) return 'D+';
    if (percentage >= 53) return 'D';
    if (percentage >= 50) return 'D-';
    return 'F';
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
