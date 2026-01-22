/**
 * Layer 5 - Presentation (Zustand Store)
 *
 * Manages global application state in the renderer process.
 * Communicates with main process via IPC for all data operations.
 *
 * Features:
 * - Reactive state management with Zustand
 * - Real-time updates via IPC push events
 * - View model computations for UI
 * - Selectors for optimized re-renders
 */

// Core types
export type {
  Course,
  Task,
  Notification,
  SimulatedGrade,
  SimulationState,
  SystemState,
  HealthStatus,
  SyncStatus,
  PriorityItem,
  CourseSummary,
  StoreState,
  StoreActions,
  Store,
  IpcApi,
  SimulationChangeEvent,
  DbCommitEvent,
} from './types';

// Store
export { useStore, subscribeToIpcEvents, selectors } from './store';

// View models
export {
  DashboardViewModel,
  DashboardStats,
  computeDashboardViewModel,
  useDashboardViewModel,
  CourseDetailViewModel,
  TaskViewModel,
  GradeBreakdown,
  computeCourseDetailViewModel,
  useCourseDetailViewModel,
} from './viewModels';
