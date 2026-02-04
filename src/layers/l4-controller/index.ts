/**
 * Layer 4 - Controller (Command Dispatcher)
 *
 * Validates and executes user commands with the command pattern.
 *
 * Features:
 * - Command pattern for all user actions
 * - Validation before execution
 * - Atomic transactions via L1
 * - What-if grade simulations (session-only)
 */

// Core types
export {
  Command,
  CommandContext,
  CommandResult,
  SimulationContext,
  SimulatedGrade,
  SimulationResult,
  CoursePreferences,
  createSimulationContext,
  // Parameter types
  UpdateTargetGradeParams,
  UpdateCoursePreferencesParams,
  DismissNotificationParams,
  MarkTaskCompleteParams,
  TriggerSyncParams,
  SimulateGradeParams,
  ClearSimulationParams,
  // Queue command param types
  AcceptQueuedTaskParams,
  RejectQueuedTaskParams,
  BulkAcceptQueuedTasksParams,
  MergeQueuedTaskParams,
} from './types';

// Simulation manager
export { SimulationManager, SimulationManagerOptions } from './SimulationManager';

// Command dispatcher
export {
  CommandDispatcher,
  CommandDispatcherOptions,
  CommandName,
} from './CommandDispatcher';

// Individual commands (for direct use if needed)
export { UpdateTargetGradeCommand } from './commands/UpdateTargetGradeCommand';
export { UpdateCoursePreferencesCommand } from './commands/UpdateCoursePreferencesCommand';
export { DismissNotificationCommand } from './commands/DismissNotificationCommand';
export { MarkTaskCompleteCommand } from './commands/MarkTaskCompleteCommand';
export { TriggerSyncCommand, SyncRequestEvent } from './commands/TriggerSyncCommand';
export { SimulateGradeCommand } from './commands/SimulateGradeCommand';
export {
  ClearSimulationCommand,
  ClearSimulationResult,
} from './commands/ClearSimulationCommand';
export {
  ArchiveCourseCommand,
  ArchiveCourseParams,
  ArchiveCourseResult,
} from './commands/ArchiveCourseCommand';
export {
  UnarchiveCourseCommand,
  UnarchiveCourseParams,
  UnarchiveCourseResult,
} from './commands/UnarchiveCourseCommand';

// Queue commands
export { AcceptQueuedTaskCommand } from './commands/AcceptQueuedTaskCommand';
export { RejectQueuedTaskCommand } from './commands/RejectQueuedTaskCommand';
export { BulkAcceptQueuedTasksCommand } from './commands/BulkAcceptQueuedTasksCommand';
export { MergeQueuedTaskCommand } from './commands/MergeQueuedTaskCommand';
