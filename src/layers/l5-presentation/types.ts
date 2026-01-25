/**
 * L5 Presentation - Type Definitions
 *
 * Re-exports shared types and defines store-specific types.
 * All entity types come from the IPC contract (single source of truth).
 */

// Re-export all entity types from shared contract
export type {
  SyncStatus,
  Course,
  CourseDetail,
  EnrollmentTerm,
  Task,
  Notification,
  NotificationAttachment,
  AnnouncementFileReference,
  SimulatedGrade,
  SimulationState,
  HealthStatus,
  SystemState,
  ImportedCalendar,
  ExternalCalendarEvent,
  DisplayCalendarEvent,
  ParsedICSEvent,
  ICSImportPreview,
  PriorityItem,
  CourseSummary,
  Policy,
  GradeHistoryEntry,
  FileResource,
  FileAttachment,
  FilesData,
  UserProfile,
  SimulationChangeEvent,
  DbCommitEvent,
  SyncResultSummary,
  ApiResult,
} from '../../shared/ipc-contract';

// Re-export schemas for runtime validation if needed
export {
  SyncStatusSchema,
  CourseSchema,
  TaskSchema,
  NotificationSchema,
  SimulationStateSchema,
} from '../../shared/ipc-contract';

/**
 * IPC API contract - methods available from renderer
 * Now uses the TypedApi from shared module
 */
export type { TypedApi as IpcApi } from '../../shared/ipc-client';

/**
 * Store state shape
 */
export interface StoreState {
  // Data
  courses: import('../../shared/ipc-contract').Course[];
  tasks: import('../../shared/ipc-contract').Task[];
  notifications: import('../../shared/ipc-contract').Notification[];

  // Imported Calendars
  importedCalendars: import('../../shared/ipc-contract').ImportedCalendar[];
  calendarEvents: import('../../shared/ipc-contract').DisplayCalendarEvent[];

  // Simulation
  simulation: import('../../shared/ipc-contract').SimulationState;

  // System
  syncStatus: import('../../shared/ipc-contract').SyncStatus;
  syncMessage: string | null;
  isAutoSync: boolean;
  lastSyncedAt: string | null;
  lastSyncResult: import('../../shared/ipc-contract').SyncResultSummary | null;
  systemState: import('../../shared/ipc-contract').SystemState | null;
  healthStatus: import('../../shared/ipc-contract').HealthStatus | null;

  // Auth
  isAuthenticated: boolean;
  isInitialized: boolean;
  authError: { type: 'expired' | 'invalid'; reason?: string } | null;

  // Error handling
  lastError: string | null;

  // Sync conflicts
  syncConflicts: SyncConflictItem[];
}

export interface SyncConflictItem {
  id: string;
  entity: 'course' | 'task' | 'notification';
  entityId: number;
  externalId: string;
  entityName: string;
  field: string;
  fieldLabel: string;
  localValue: unknown;
  canvasValue: unknown;
  timestamp: string;
}

/**
 * Store actions
 */
export interface StoreActions {
  // Initialization
  initialize: () => Promise<void>;

  // Data fetching
  fetchCourses: () => Promise<void>;
  fetchTasks: (courseId?: number) => Promise<void>;
  fetchNotifications: () => Promise<void>;
  refreshAll: () => Promise<void>;

  // Imported Calendars
  fetchImportedCalendars: () => Promise<void>;
  fetchCalendarEventsForRange: (startDate: Date, endDate: Date) => Promise<void>;
  importICSFile: (content: string, filename: string, options?: { name?: string; color?: string }) => Promise<{ success: boolean; calendarId?: number; eventCount?: number }>;
  deleteImportedCalendar: (calendarId: number) => Promise<boolean>;
  toggleCalendarVisibility: (calendarId: number, isVisible: boolean) => Promise<boolean>;
  updateImportedCalendar: (calendarId: number, updates: { name?: string; color?: string }) => Promise<boolean>;

  // User Calendar Events CRUD
  createCalendarEvent: (data: {
    title: string;
    description?: string;
    startAt: string;
    endAt?: string;
    allDay: boolean;
    location?: string;
    courseId?: number;
  }) => Promise<{ success: boolean; id?: number }>;
  updateCalendarEvent: (id: number, data: {
    title?: string;
    description?: string;
    startAt?: string;
    endAt?: string;
    allDay?: boolean;
    location?: string;
  }) => Promise<boolean>;
  deleteCalendarEvent: (id: number) => Promise<boolean>;
  exportCalendarsBatch: (options: {
    mode: 'all' | 'selected';
    calendarIds?: number[];
    courseIds?: number[];
    includeUserEvents?: boolean;
    consolidate?: boolean;
    dateRange?: { start: string; end: string };
  }) => Promise<{ success: boolean; content?: string; eventCount?: number }>;

  // Commands
  updateTargetGrade: (courseId: number, targetGrade: number) => Promise<boolean>;
  markTaskComplete: (taskId: number, isComplete: boolean) => Promise<boolean>;
  dismissNotification: (notificationId: number) => Promise<boolean>;
  simulateGrade: (taskId: number, grade: number) => Promise<boolean>;
  clearSimulation: (taskId?: number) => Promise<boolean>;

  // Sync
  triggerSync: (
    type: 'full' | 'courses' | 'tasks' | 'notifications',
    options?: {
      termSelection?: 'all' | 'auto' | string;
      syncCanvasFiles?: boolean;
      syncAnnouncements?: boolean;
      isAutoSync?: boolean;
      courseIds?: number[];
    }
  ) => Promise<{ success: boolean; result?: unknown; summary?: import('../../shared/ipc-contract').SyncResultSummary; error?: string }>;
  clearSyncResult: () => void;
  dismissAutoSyncBanner: () => void;

  // Auth
  setAuthenticated: (authenticated: boolean) => void;
  setAuthError: (error: { type: 'expired' | 'invalid'; reason?: string } | null) => void;
  clearAuthError: () => void;

  // Internal
  handleSimulationChange: (event: import('../../shared/ipc-contract').SimulationChangeEvent) => void;
  handleDbCommit: (event: import('../../shared/ipc-contract').DbCommitEvent) => void;
  setError: (error: string | null) => void;

  // Sync conflicts
  addSyncConflicts: (conflicts: SyncConflictItem[]) => void;
  resolveSyncConflict: (conflictId: string, useCanvasValue: boolean, rememberChoice: boolean, rememberForAll: boolean) => Promise<void>;
  resolveAllSyncConflicts: (useCanvasValues: boolean) => Promise<void>;
  clearSyncConflicts: () => void;
}

export type Store = StoreState & StoreActions;
