/**
 * SyncEngine Types
 * Type definitions for sync operations
 */

import type { CanvasClient } from './CanvasClient';
import type { RateLimiter } from './RateLimiter';
import type { Database } from '../l1-persistence/Database';
import type { VisibleDataProvider } from '../l1-persistence/VisibleDataProvider';
import type { FileDownloadManager } from '../l0-utilities/FileDownloadManager';
import type { HtmlContentSyncConfig } from '../l0-utilities/AppConfig';
import type { ComponentLogger } from '../l0-utilities/Logger';
import type { OperationCoordinator } from './OperationCoordinator';
import type {
  CanvasCourse,
  CanvasAssignment,
  CanvasAnnouncement,
  CanvasModule,
  CanvasPage,
  CanvasFolder,
  CanvasFile,
} from './DataMappers';

export interface SyncEngineConfig {
  client: CanvasClient;
  db: Database;
  rateLimiter?: RateLimiter;
  /** File download manager for resources */
  downloadManager?: FileDownloadManager;
  /** HTML content sync configuration */
  htmlContentSyncConfig?: HtmlContentSyncConfig;
  /** Base directory for file storage */
  filesBaseDir?: string;
  /** Optional logger for debug output */
  logger?: ComponentLogger;
  /** Visible data provider for filtering courses */
  visibleDataProvider?: VisibleDataProvider;
  /** Operation coordinator for sync/download conflict prevention */
  operationCoordinator?: OperationCoordinator;
}

export interface SyncResult {
  success: boolean;
  entity: string;
  count: number;
  errors: string[];
  duration: number;
}

export interface FullSyncResult {
  courses: SyncResult;
  tasks: SyncResult;
  announcements: SyncResult;
  modules: SyncResult;
  pages: SyncResult;
  folders: SyncResult;
  files: SyncResult;
  totalDuration: number;
  errors: string[];
}

export interface SyncOptions {
  /**
   * Term selection for filtering courses:
   * - 'all' or undefined: sync all courses
   * - 'auto': auto-detect current semester based on term end dates
   * - '<external-term-id>': sync only courses from specific term
   */
  termSelection?: 'all' | 'auto' | string;
  /** Whether to sync Canvas files */
  syncCanvasFiles?: boolean;
  /** Whether to sync announcement attachments */
  syncAnnouncements?: boolean;
  /** Specific course IDs to sync (if provided, only these courses are synced) */
  courseIds?: number[];
  /** Resume from an incomplete sync checkpoint */
  resumeFromCheckpoint?: boolean;
  /**
   * Defer file processing (Phase 3 & 4) to improve perceived sync speed.
   * When true, file references and HTML content are NOT processed during sync.
   * Call processFileReferencesBackground() separately to process them.
   */
  deferFileProcessing?: boolean;
}

/**
 * Checkpoint data for resumable sync
 */
export interface SyncCheckpoint {
  syncId: string;
  startedAt: string;
  phase: 'fetch' | 'commit' | 'completed' | 'failed';
  options: SyncOptions;
  /** Canvas course IDs that have been fully fetched */
  fetchedCourseIds: number[];
  /** Cached fetch data for already-fetched courses */
  fetchedData: {
    courses: CanvasCourse[];
    tasks: Record<number, CanvasAssignment[]>;
    announcements: Record<number, CanvasAnnouncement[]>;
    modules: Record<number, CanvasModule[]>;
    pages: Record<number, CanvasPage[]>;
    folders: Record<number, CanvasFolder[]>;
    files: Record<number, CanvasFile[]>;
  };
  totalCourses: number;
  completedCourses: number;
  lastError?: string;
  errorCount: number;
  lastUpdatedAt: string;
}

export interface SyncMetadata {
  endpoint: string;
  etag: string | null;
  last_synced_at: string;
}

/**
 * Diagnostic entry for debugging sync operations
 */
export interface SyncDiagnosticEntry {
  entity: string;
  externalId: string;
  action: 'insert' | 'update' | 'skip' | 'error';
  preservedFields?: Record<string, { before: unknown; after: unknown }>;
  updatedFields?: Record<string, { before: unknown; after: unknown }>;
  error?: string;
  timestamp: string;
}

/**
 * Backoff configuration for auth-failed endpoints
 */
export interface EndpointBackoff {
  endpoint: string;
  courseId: number | null;
  failureCount: number;
  lastFailureAt: Date;
  nextRetryAt: Date;
  lastSuccessAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
}

/**
 * Backoff constants
 */
export const BACKOFF_CONFIG = {
  /** Initial backoff delay after first failure (1 hour) */
  INITIAL_DELAY_MS: 60 * 60 * 1000,
  /** Maximum backoff delay (2 days) - after this we reset */
  MAX_DELAY_MS: 2 * 24 * 60 * 60 * 1000,
  /** Multiplier for exponential backoff */
  MULTIPLIER: 2,
  /** Jitter factor (0.1 = ±10%) */
  JITTER: 0.1,
} as const;
