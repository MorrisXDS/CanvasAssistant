/**
 * L4 Controller - Type Definitions
 *
 * Command pattern types for user actions.
 */

import { Database, VisibilityOracle } from '../l1-persistence';

/**
 * Command execution context - provides access to lower layers
 */
export interface CommandContext {
  db: Database;
  visibilityOracle?: VisibilityOracle;
  simulationContext: SimulationContext;
}

/**
 * Base command result
 */
export interface CommandResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Base command interface - all commands implement this
 */
export interface Command<TParams = unknown, TResult = void> {
  readonly name: string;
  execute(context: CommandContext, params: TParams): Promise<CommandResult<TResult>>;
  validate?(params: TParams): { valid: boolean; error?: string };
}

/**
 * Simulated grade change for what-if analysis
 */
export interface SimulatedGrade {
  taskId: number;
  courseId: number;
  originalGrade: number | null;
  simulatedGrade: number;
  timestamp: Date;
}

/**
 * Simulation context - holds temporary what-if state
 * Session-only, not persisted to database
 */
export interface SimulationContext {
  /** Map of taskId -> simulated grade */
  grades: Map<number, SimulatedGrade>;
  /** Whether simulation mode is active */
  isActive: boolean;
  /** When simulation started */
  startedAt: Date | null;
}

/**
 * Create a fresh simulation context
 */
export function createSimulationContext(): SimulationContext {
  return {
    grades: new Map(),
    isActive: false,
    startedAt: null,
  };
}

/**
 * Course preference fields that users can edit
 * Use null to explicitly clear color/nickname, undefined to skip update
 */
export interface CoursePreferences {
  targetGrade?: number;
  color?: string | null;
  nickname?: string | null;
  isHidden?: boolean;
  /** Course credits/units for weighted GPA calculation */
  credits?: number;
  /** Grade curve adjustment in percentage points (e.g., +5.0 or -3.0) */
  gradeCurveAdjustment?: number;
  /** Permanently dismiss the syllabus prompt for this course */
  syllabusPromptDismissed?: boolean;
}

/**
 * Command parameter types
 */
export interface UpdateTargetGradeParams {
  courseId: number;
  targetGrade: number;
}

export interface UpdateCoursePreferencesParams {
  courseId: number;
  preferences: CoursePreferences;
}

export interface DismissNotificationParams {
  notificationId: number;
}

export interface MarkTaskCompleteParams {
  taskId: number;
  isComplete: boolean;
}

export interface TriggerSyncParams {
  /** Optional: sync specific course only */
  courseId?: number;
  /** Sync type */
  type: 'full' | 'courses' | 'tasks' | 'notifications';
}

export interface SimulateGradeParams {
  taskId: number;
  grade: number;
}

export interface ClearSimulationParams {
  /** Optional: clear only specific task simulation */
  taskId?: number;
}

export interface CreateTaskParams {
  courseId: number;
  title: string;
  description?: string;
  /** When the task becomes available (Canvas unlock_at equivalent) */
  unlockAt?: string;
  /** User-defined start date - when to start working on the task */
  startAt?: string;
  dueAt?: string;
  weight?: number;
  pointsPossible?: number;
  taskType?: string;
  /** Location for the task (e.g., room, building) */
  location?: string;
}

export interface DuplicateTaskParams {
  taskId: number;
  /** Optional: override properties for the new task */
  overrides?: Partial<CreateTaskParams>;
}

export interface UpdateTaskParams {
  taskId: number;
  title?: string;
  description?: string | null;
  notes?: string | null;
  /** Start/unlock date for the task (ISO timestamp) */
  unlockAt?: string | null;
  dueAt?: string | null;
  weight?: number;
  grade?: number | null;
  pointsPossible?: number | null;
  isOptional?: boolean;
  taskType?: string | null;
  /** Location for the task (e.g., room, building) */
  location?: string | null;
}

export interface DeleteTaskParams {
  taskId: number;
  /** Force delete even if it's a Canvas-synced task */
  force?: boolean;
}

/**
 * Create a user-defined (custom) task type. `courseId` scopes the type to
 * a single course; omit it for a global type available everywhere.
 */
export interface CreateTaskTypeParams {
  name: string;
  displayName: string;
  courseId?: number;
}

/**
 * Delete a custom task type by id.
 */
export interface DeleteTaskTypeParams {
  id: number;
}

// =============================================================================
// Canvas Task Queue Command Params
// =============================================================================

/**
 * Accept a queued Canvas task, creating it as an active task
 */
export interface AcceptQueuedTaskParams {
  queueId: number;
  /** Optional edits to apply when creating the task */
  edits?: {
    title?: string;
    dueAt?: string | null;
    startAt?: string | null;
    taskType?: string | null;
    weight?: number | null;
    location?: string | null;
    notes?: string | null;
  };
}

/**
 * Reject a queued Canvas task (won't resurface on re-sync)
 */
export interface RejectQueuedTaskParams {
  queueId: number;
}

/**
 * Bulk accept all pending queued tasks for a course
 */
export interface BulkAcceptQueuedTasksParams {
  /** Optional: accept for specific course only */
  courseId?: number;
}

/**
 * Merge a queued Canvas task with an existing user task
 */
export interface MergeQueuedTaskParams {
  queueId: number;
  userTaskId: number;
  /** Which fields to keep from the user's task */
  keepFromUser?: {
    notes?: boolean;
    dueAt?: boolean;
    title?: boolean;
    description?: boolean;
    startAt?: boolean; // true = keep user's start_at, false = use Canvas unlock_at
    taskType?: boolean; // true = keep user's task_type, false = use Canvas task_type
  };
}

/**
 * Recalculated priority data after simulation
 */
export interface SimulationResult {
  /** Affected tasks with new priority scores */
  affectedTasks: Array<{
    id: number;
    originalPriority: number;
    simulatedPriority: number;
  }>;
  /** Course-level impact */
  courseImpact: {
    courseId: number;
    originalAssessedGrade: number;
    simulatedAssessedGrade: number;
    originalTargetDelta: number;
    simulatedTargetDelta: number;
  };
}
