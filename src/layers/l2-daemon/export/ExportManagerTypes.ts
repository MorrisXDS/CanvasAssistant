/**
 * Export Manager Types
 * Type definitions for export functionality
 */

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
    modules: number;
    resources: number;
    syncPreferences: number;
    pendingConflicts: number;
  };
  checksums?: Record<string, string>;
}

export interface ExportManagerConfig {
  logger?: import('../../l0-utilities/Logger').Logger;
  filesDir?: string;
  appVersion?: string;
  /** Optional SyncEngine reference for sync status checks */
  syncEngine?: import('../sync-engine/SyncEngine').SyncEngine;
}

export interface ExportData {
  exportedAt: string;
  version: string;
  appVersion: string;
  options: {
    format: string;
    encrypted: boolean;
    includedCourses: number[];
    taskStatus: string;
    dateRange: { start: string; end: string } | null;
  };
  courses: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
  policies: Record<string, unknown>[];
  pages: Record<string, unknown>[];
  calendarEvents: Record<string, unknown>[];
  modules: Record<string, unknown>[];
  moduleItems: Record<string, unknown>[];
  resources: Record<string, unknown>[];
  syncMetadata: SyncMetadataExport;
}

export interface SyncMetadataExport {
  endpoints: Record<string, unknown>[];
  preferences: Record<string, unknown>[];
  pendingConflicts: Record<string, unknown>[];
  lastSyncedAt: string | null;
}

// CSV header definitions
export const TASKS_CSV_HEADERS = [
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

export const GRADES_CSV_HEADERS = [
  'Course',
  'Assignment',
  'Points Earned',
  'Points Possible',
  'Weight',
  'Percentage',
  'Letter Grade',
];
