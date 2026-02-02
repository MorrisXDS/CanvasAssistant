/**
 * CSV Exporter
 * Handles CSV export for tasks and grades
 */

import fs from 'fs';
import type { Database } from '../l1-persistence/Database';
import type { TaskRow } from '../l1-persistence/DatabaseRowTypes';
import type { CsvExportOptions, ExportResult } from './ExportManagerTypes';
import { TASKS_CSV_HEADERS, GRADES_CSV_HEADERS } from './ExportManagerTypes';

export interface CsvExporterDeps {
  db: Database;
  resolveCourseIds: (
    courseIds?: number[],
    includeArchived?: boolean,
    archivedCourseIds?: number[]
  ) => number[];
  emitProgress: (stage: string, progress: number, message: string) => void;
  log: { info: (msg: string) => void; error: (msg: string, err?: Error) => void };
}

/**
 * Escape CSV field value
 */
export function escapeCsv(value: string): string {
  if (!value) return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Get letter grade from percentage (UofT scale)
 */
export function getLetterGrade(percentage: number): string {
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
 * Export tasks to CSV format
 */
export async function exportTasksCsv(
  deps: CsvExporterDeps,
  outputPath: string,
  options: CsvExportOptions = {}
): Promise<ExportResult> {
  try {
    deps.emitProgress('collecting', 10, 'Collecting tasks...');

    const courseIds = deps.resolveCourseIds(
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

    const tasks = deps.db.executeRead<
      TaskRow & { course_code: string; course_name: string }
    >(sql, params);

    deps.emitProgress('writing', 50, 'Writing CSV...');

    // Generate CSV
    const rows: string[] = [TASKS_CSV_HEADERS.join(',')];

    for (const task of tasks) {
      const row = [
        escapeCsv(task.course_code),
        escapeCsv(task.title),
        escapeCsv(task.task_type || 'unknown'),
        task.due_at ? new Date(task.due_at).toLocaleDateString() : '',
        task.is_completed ? 'completed' : 'pending',
        task.points_possible?.toString() ?? '',
        task.grade?.toString() ?? '',
        task.weight ? `${task.weight}%` : '',
        task.priority_score?.toString() ?? '',
        escapeCsv(task.description || ''),
      ];
      rows.push(row.join(','));
    }

    const csvContent = rows.join('\n');
    fs.writeFileSync(outputPath, csvContent, 'utf-8');

    deps.emitProgress('complete', 100, 'Export complete');
    deps.log.info(`Tasks CSV exported: ${tasks.length} tasks to ${outputPath}`);

    return {
      success: true,
      filePath: outputPath,
      fileSize: Buffer.byteLength(csvContent),
      tasksExported: tasks.length,
    };
  } catch (error) {
    deps.log.error(
      'Failed to export tasks CSV',
      error instanceof Error ? error : undefined
    );
    return { success: false, error: String(error) };
  }
}

/**
 * Export grades to CSV format
 */
export async function exportGradesCsv(
  deps: CsvExporterDeps,
  outputPath: string,
  options: CsvExportOptions = {}
): Promise<ExportResult> {
  try {
    deps.emitProgress('collecting', 10, 'Collecting grades...');

    const courseIds = deps.resolveCourseIds(
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

    const tasks = deps.db.executeRead<
      TaskRow & { course_code: string; course_name: string }
    >(sql, courseIds);

    deps.emitProgress('writing', 50, 'Writing CSV...');

    // Generate CSV
    const rows: string[] = [GRADES_CSV_HEADERS.join(',')];

    for (const task of tasks) {
      const pointsPossible = task.points_possible ?? 100;
      const percentage =
        pointsPossible > 0 ? ((task.grade ?? 0) / pointsPossible) * 100 : 0;

      const row = [
        escapeCsv(task.course_code),
        escapeCsv(task.title),
        task.grade?.toString() ?? '0',
        pointsPossible.toString(),
        task.weight ? `${task.weight}%` : '',
        `${percentage.toFixed(1)}%`,
        getLetterGrade(percentage),
      ];
      rows.push(row.join(','));
    }

    const csvContent = rows.join('\n');
    fs.writeFileSync(outputPath, csvContent, 'utf-8');

    deps.emitProgress('complete', 100, 'Export complete');
    deps.log.info(`Grades CSV exported: ${tasks.length} grades to ${outputPath}`);

    return {
      success: true,
      filePath: outputPath,
      fileSize: Buffer.byteLength(csvContent),
      tasksExported: tasks.length,
    };
  } catch (error) {
    deps.log.error(
      'Failed to export grades CSV',
      error instanceof Error ? error : undefined
    );
    return { success: false, error: String(error) };
  }
}
