/**
 * Shared types for orchestrator submodules.
 * All extracted functions receive an OrchestratorContext instead of `this`.
 */

import type { EventEmitter } from 'events';
import type { CanvasClient } from '../../client/CanvasClient';
import type { RateLimiter } from '../../resilience/RateLimiter';
import type { Database, VisibleDataProvider } from '../../../l1-persistence';
import type { SyncConflictResolver } from '../SyncConflictResolver';
import type { SyncCheckpointManager } from '../SyncCheckpointManager';
import type { SyncBackoffManager } from '../SyncBackoffManager';
import type { ComponentLogger } from '../../../l0-utilities/Logger';
import type {
  CanvasCourse,
  CanvasAssignment,
  CanvasAnnouncement,
  CanvasModule,
  CanvasPage,
  CanvasFile,
  CanvasFolder,
} from '../../data/DataMappers';

/**
 * Dependencies shared across all orchestrator submodules.
 */
export interface OrchestratorContext {
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
  isAborted: boolean;
}

export interface CanvasAssignmentGroup {
  id: number;
  name: string;
  position: number;
  group_weight: number | null;
  rules?: {
    drop_lowest?: number;
    drop_highest?: number;
    never_drop?: number[];
  };
}

export interface FetchedData {
  courses: CanvasCourse[];
  tasks: Map<number, CanvasAssignment[]>;
  announcements: Map<number, CanvasAnnouncement[]>;
  modules: Map<number, CanvasModule[]>;
  pages: Map<number, CanvasPage[]>;
  folders: Map<number, CanvasFolder[]>;
  files: Map<number, CanvasFile[]>;
  assignmentGroups: Map<number, CanvasAssignmentGroup[]>;
}

/**
 * Throws if the context indicates an abort.
 */
export function checkAborted(ctx: OrchestratorContext): void {
  if (ctx.isAborted) {
    throw new Error('Sync aborted');
  }
}
