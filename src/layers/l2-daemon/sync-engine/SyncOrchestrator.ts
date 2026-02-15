/**
 * Sync Orchestrator (Facade)
 *
 * Delegates to orchestrator/ submodules for the actual logic:
 *   - SyncFetchPhase   : executeFetchPhase, filterCourses, checkpoint logic
 *   - SyncCommitPhase  : executeCommitPhase - the big commit transaction
 *   - SyncTaskLinker    : checkForUserTaskLinks, autoLinkTasks, queueLinkSuggestion
 *   - SyncUpdateRecorder: createSyncSession, recordSyncUpdate, recordResourceUpdates
 */

import { EventEmitter } from 'events';
import { CanvasClient } from '../client/CanvasClient';
import { RateLimiter } from '../resilience/RateLimiter';
import { Database, VisibleDataProvider } from '../../l1-persistence';
import { SyncConflictResolver } from './SyncConflictResolver';
import { SyncCheckpointManager } from './SyncCheckpointManager';
import { SyncBackoffManager } from './SyncBackoffManager';
import type { ComponentLogger } from '../../l0-utilities/Logger';
import type { SyncOptions, SyncCheckpoint } from './SyncEngineTypes';
import type { CanvasCourse } from '../data/DataMappers';
import type { OrchestratorContext, FetchedData } from './orchestrator/OrchestratorTypes';
import { executeFetchPhase } from './orchestrator/SyncFetchPhase';
import { executeCommitPhase } from './orchestrator/SyncCommitPhase';
import {
  createSyncSession,
  completeSyncSession,
  recordSyncUpdate,
  snapshotFileState,
  recordFileUpdates,
  type RecordSyncUpdateParams,
} from './orchestrator/SyncUpdateRecorder';

export interface SyncOrchestratorConfig {
  client: CanvasClient;
  db: Database;
  rateLimiter: RateLimiter;
  conflictResolver: SyncConflictResolver;
  checkpointManager: SyncCheckpointManager;
  backoffManager: SyncBackoffManager;
  visibleDataProvider: VisibleDataProvider | null;
  emitter: EventEmitter;
  log: ComponentLogger | null;
  getDefaultTargetGrade: () => number;
  getCourseSettings: (courseId: number) => {
    autoAssignDueDate: boolean;
    allowGuessedOverride: boolean;
  };
  getTodayEndTime: () => string;
  persistConflictData: (
    conflictId: string,
    tableName: string,
    data: Record<string, unknown>
  ) => void;
  pendingConflictData: Map<string, { tableName: string; data: Record<string, unknown> }>;
  hasActiveDownloadFor: (sourceType: string, sourceId: string) => boolean;
  computeContentHash: (content: string | null | undefined) => string | null;
  updateContentHashAndDependencies: (
    sourceType: 'page' | 'assignment' | 'syllabus' | 'announcement',
    sourceId: string,
    newContent: string | null,
    courseId: number
  ) => void;
}

export class SyncOrchestrator {
  private ctx: OrchestratorContext;

  constructor(config: SyncOrchestratorConfig) {
    this.ctx = {
      client: config.client,
      db: config.db,
      rateLimiter: config.rateLimiter,
      conflictResolver: config.conflictResolver,
      checkpointManager: config.checkpointManager,
      backoffManager: config.backoffManager,
      visibleDataProvider: config.visibleDataProvider,
      emitter: config.emitter,
      log: config.log,
      getDefaultTargetGrade: config.getDefaultTargetGrade,
      getCourseSettings: config.getCourseSettings,
      getTodayEndTime: config.getTodayEndTime,
      persistConflictData: config.persistConflictData,
      pendingConflictData: config.pendingConflictData,
      hasActiveDownloadFor: config.hasActiveDownloadFor,
      computeContentHash: config.computeContentHash,
      updateContentHashAndDependencies: config.updateContentHashAndDependencies,
      isAborted: false,
    };
  }

  setAborted(aborted: boolean): void {
    this.ctx.isAborted = aborted;
  }

  /**
   * Execute the fetch phase - get all data from Canvas API
   */
  async executeFetchPhase(
    options: SyncOptions,
    syncId: string,
    checkpoint: SyncCheckpoint | null
  ): Promise<{
    fetched: FetchedData;
    visibleCoursesToSync: CanvasCourse[];
    errors: string[];
  }> {
    return executeFetchPhase(this.ctx, options, syncId, checkpoint);
  }

  /**
   * Execute the commit phase - write all fetched data to database
   */
  executeCommitPhase(
    fetched: FetchedData,
    syncId: string
  ): { counts: Record<string, number>; errors: string[] } {
    return executeCommitPhase(this.ctx, fetched, syncId);
  }

  /**
   * Create a sync session for tracking updates
   */
  createSyncSession(syncId: string): void {
    createSyncSession(this.ctx, syncId);
  }

  /**
   * Complete a sync session with counts
   */
  completeSyncSession(
    syncId: string,
    counts: {
      newTasks: number;
      updatedTasks: number;
      newAnnouncements: number;
      gradeChanges: number;
      newFiles: number;
    }
  ): void {
    completeSyncSession(this.ctx, syncId, counts);
  }

  /**
   * Record a sync update (new item, update, grade change, etc.)
   */
  recordSyncUpdate(params: RecordSyncUpdateParams): void {
    recordSyncUpdate(this.ctx, params);
  }

  /**
   * Snapshot current file and page state before sync for comparison later
   */
  snapshotFileState(): Map<
    string,
    {
      id: number;
      remote_updated_at: string | null;
      course_id: number;
      title: string;
      type: 'file' | 'page';
    }
  > {
    return snapshotFileState(this.ctx);
  }

  /**
   * Record file and page sync_updates by comparing current state with snapshot
   */
  recordFileUpdates(
    syncSessionId: string,
    snapshot: Map<
      string,
      {
        id: number;
        remote_updated_at: string | null;
        course_id: number;
        title: string;
        type: 'file' | 'page';
      }
    >
  ): { newFiles: number; updatedFiles: number; newPages: number; updatedPages: number } {
    return recordFileUpdates(this.ctx, syncSessionId, snapshot);
  }
}
