/**
 * L4 Controller - Type Definitions
 *
 * Command pattern types for user actions.
 */

import { Database } from '../l1-persistence/Database';
import { VisibleDataProvider } from '../l1-persistence/VisibleDataProvider';
import { PriorityEngine } from '../l3-intelligence/PriorityEngine';

/**
 * Command execution context - provides access to lower layers
 */
export interface CommandContext {
  db: Database;
  priorityEngine?: PriorityEngine;
  visibleDataProvider?: VisibleDataProvider;
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
 */
export interface CoursePreferences {
  targetGrade?: number;
  color?: string;
  nickname?: string;
  isHidden?: boolean;
  /** Course credits/units for weighted GPA calculation */
  credits?: number;
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
  /** Start/unlock date for the task (ISO timestamp) */
  unlockAt?: string;
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
  /** Start/unlock date for the task (ISO timestamp) */
  unlockAt?: string | null;
  dueAt?: string | null;
  weight?: number;
  grade?: number | null;
  pointsPossible?: number | null;
  isOptional?: boolean;
  taskType?: string | null;
  /** User-set submission status, independent of Canvas */
  userSubmissionStatus?: string | null;
  /** Location for the task (e.g., room, building) */
  location?: string | null;
}

export interface DeleteTaskParams {
  taskId: number;
  /** Force delete even if it's a Canvas-synced task */
  force?: boolean;
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
