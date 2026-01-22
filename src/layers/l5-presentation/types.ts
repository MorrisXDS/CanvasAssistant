/**
 * L5 Presentation - Type Definitions
 *
 * Types for the Zustand store and view models.
 * All data flows from main process via IPC.
 */

/**
 * Sync status for displaying to user
 */
export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

/**
 * Course data as stored in the database
 */
export interface Course {
  id: number;
  externalId: string;
  code: string;
  name: string;
  targetGrade: number;
  assessedGrade: number | null;
  currentGrade: number | null;
  color: string | null;
  nickname: string | null;
  isHidden: boolean;
  lastSyncedAt: string | null;
}

/**
 * Task (assignment/lab/project) data
 */
export interface Task {
  id: number;
  externalId: string;
  courseId: number;
  title: string;
  description: string | null;
  dueAt: string | null;
  weight: number;
  grade: number | null;
  pointsPossible: number | null;
  priorityScore: number;
  isCompleted: boolean;
  completedAt: string | null;
  submissionStatus: string | null;
}

/**
 * Notification data
 */
export interface Notification {
  id: number;
  sourceType: string;
  sourceId: string;
  courseId: number | null;
  title: string;
  message: string;
  publishedAt: string;
  dismissedAt: string | null;
  url: string | null;
  attachments?: NotificationAttachment[];
}

/**
 * Notification attachment (file)
 */
export interface NotificationAttachment {
  id: number;
  notificationId: number;
  externalId: string;
  displayName: string;
  filename: string;
  url: string;
  sizeBytes: number | null;
  contentType: string | null;
  localPath: string | null;
  downloadStatus: 'pending' | 'downloading' | 'completed' | 'failed';
  downloadedAt: string | null;
}

/**
 * Simulated grade for what-if analysis
 */
export interface SimulatedGrade {
  taskId: number;
  courseId: number;
  originalGrade: number | null;
  simulatedGrade: number;
  timestamp: string;
}

/**
 * Simulation state from main process
 */
export interface SimulationState {
  isActive: boolean;
  startedAt: string | null;
  grades: SimulatedGrade[];
}

/**
 * Health status for system monitoring
 */
export interface HealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  probes: Record<string, {
    status: 'healthy' | 'degraded' | 'unhealthy';
    lastChecked: string | null;
  }>;
}

/**
 * System state from L0 SystemMonitor
 */
export interface SystemState {
  powerSource: 'battery' | 'ac' | 'unknown';
  batteryLevel: number | null;
  windowFocused: boolean;
  isFullscreen: boolean;
  canSync: boolean;
}

/**
 * Dashboard priority item for the main view
 */
export interface PriorityItem {
  task: Task;
  course: Course;
  urgencyLevel: 'critical' | 'high' | 'medium' | 'low';
  daysUntilDue: number | null;
  effectiveGrade: number | null; // Uses simulated grade if active
}

/**
 * Course summary for dashboard cards
 */
export interface CourseSummary {
  course: Course;
  taskCount: number;
  completedCount: number;
  upcomingCount: number;
  overdueCount: number;
  effectiveAssessedGrade: number | null; // With simulations applied
  targetDelta: number; // How far from target
}

/**
 * IPC API contract - methods available from renderer
 */
export interface IpcApi {
  // Data fetching
  getCourses: () => Promise<Course[]>;
  getTasks: (courseId?: number) => Promise<Task[]>;
  getNotifications: () => Promise<Notification[]>;

  // Commands
  dispatch: (command: string, params: unknown) => Promise<{ success: boolean; data?: unknown; error?: string }>;

  // Simulation
  getSimulationState: () => Promise<SimulationState>;
  clearSimulation: () => Promise<{ success: boolean }>;

  // System
  getSystemState: () => Promise<SystemState>;
  getHealthStatus: () => Promise<HealthStatus>;

  // Credentials
  hasCredential: () => Promise<boolean>;
  storeCredential: (token: string) => Promise<{ success: boolean }>;
  deleteCredential: () => Promise<{ success: boolean }>;

  // Canvas
  connectCanvas: (baseUrl: string) => Promise<{ success: boolean; error?: string }>;
  validateToken: (token: string, baseUrl: string) => Promise<{ valid: boolean; error?: string; user?: { name: string } }>;

  // Sync
  syncFull: () => Promise<{ success: boolean; error?: string }>;
  syncCourses: () => Promise<{ success: boolean; error?: string }>;

  // Event listeners
  onSimulationChanged: (callback: (event: SimulationChangeEvent) => void) => () => void;
  onDbCommit: (callback: (event: DbCommitEvent) => void) => () => void;
}

/**
 * Events pushed from main process
 */
export interface SimulationChangeEvent {
  type: 'started' | 'updated' | 'cleared';
  context?: SimulationState;
}

export interface DbCommitEvent {
  table: string;
}

/**
 * Store state shape
 */
export interface StoreState {
  // Data
  courses: Course[];
  tasks: Task[];
  notifications: Notification[];

  // Simulation
  simulation: SimulationState;

  // System
  syncStatus: SyncStatus;
  systemState: SystemState | null;
  healthStatus: HealthStatus | null;

  // Auth
  isAuthenticated: boolean;
  isInitialized: boolean;

  // Error handling
  lastError: string | null;
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

  // Commands
  updateTargetGrade: (courseId: number, targetGrade: number) => Promise<boolean>;
  markTaskComplete: (taskId: number, isComplete: boolean) => Promise<boolean>;
  dismissNotification: (notificationId: number) => Promise<boolean>;
  simulateGrade: (taskId: number, grade: number) => Promise<boolean>;
  clearSimulation: (taskId?: number) => Promise<boolean>;

  // Sync
  triggerSync: (type: 'full' | 'courses' | 'tasks' | 'notifications') => Promise<boolean>;

  // Auth
  setAuthenticated: (authenticated: boolean) => void;

  // Internal
  handleSimulationChange: (event: SimulationChangeEvent) => void;
  handleDbCommit: (event: DbCommitEvent) => void;
  setError: (error: string | null) => void;
}

export type Store = StoreState & StoreActions;
