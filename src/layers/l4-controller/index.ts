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
  CreateTaskTypeParams,
  DeleteTaskTypeParams,
  // Task linking command param types
  AcceptLinkSuggestionParams,
  RejectLinkSuggestionParams,
  ManuallyLinkTasksParams,
  UnlinkTasksParams,
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

// All commands (re-exported via barrel)
export {
  // Course commands
  ArchiveCourseCommand,
  ArchiveCourseParams,
  ArchiveCourseResult,
  UnarchiveCourseCommand,
  UnarchiveCourseParams,
  UnarchiveCourseResult,
  UpdateCoursePreferencesCommand,
  UpdateTargetGradeCommand,
  // Task commands
  CreateTaskCommand,
  DuplicateTaskCommand,
  UpdateTaskCommand,
  DeleteTaskCommand,
  MarkTaskCompleteCommand,
  CreateTaskTypeCommand,
  CreateTaskTypeResult,
  DeleteTaskTypeCommand,
  // Task linking commands
  AcceptLinkSuggestionCommand,
  RejectLinkSuggestionCommand,
  ManuallyLinkTasksCommand,
  UnlinkTasksCommand,
  // Queue commands
  AcceptQueuedTaskCommand,
  RejectQueuedTaskCommand,
  BulkAcceptQueuedTasksCommand,
  MergeQueuedTaskCommand,
  // Grade commands
  SimulateGradeCommand,
  ClearSimulationCommand,
  ClearSimulationResult,
  // Notification commands
  DismissNotificationCommand,
  // Syllabus commands
  SetCourseSyllabusCommand,
  MarkSyllabusReviewedCommand,
  RemoveCourseSyllabusCommand,
  // Sync commands
  TriggerSyncCommand,
  SyncRequestEvent,
} from './commands';
