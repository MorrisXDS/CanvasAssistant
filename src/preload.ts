/**
 * Preload Script - Secure IPC Bridge
 *
 * Exposes a safe, typed API to the renderer process.
 * All main process communication goes through this bridge.
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

/**
 * Type definitions for the exposed API
 * These match the IpcApi interface in L5 types
 */
interface ApiResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

interface Course {
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
  enrollmentTermId: number | null;
}

interface EnrollmentTerm {
  id: number;
  externalId: string;
  name: string;
  startAt: string | null;
  endAt: string | null;
}

interface Task {
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

interface Notification {
  id: number;
  sourceType: string;
  sourceId: string;
  courseId: number | null;
  title: string;
  message: string;
  publishedAt: string;
  dismissedAt: string | null;
  url: string | null;
}

interface NotificationAttachment {
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

interface SimulationState {
  isActive: boolean;
  startedAt: string | null;
  grades: Array<{
    taskId: number;
    courseId: number;
    originalGrade: number | null;
    simulatedGrade: number;
    timestamp: string;
  }>;
}

interface CourseDetail {
  id: number;
  externalId: string;
  code: string;
  name: string;
  targetGrade: number;
  assessedGrade: number | null;
  currentGrade: number | null;
  totalWeight: number;
  color: string | null;
  nickname: string | null;
  isHidden: boolean;
  syllabusBody: string | null;
  lastSyncedAt: string | null;
}

interface Policy {
  id: number;
  courseId: number;
  policyType: string;
  policyName: string;
  policyConfig: Record<string, unknown>;
  rawText: string | null;
  isUserVerified: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface GradeHistoryEntry {
  id: number;
  courseId: number;
  grade: number;
  recordedAt: string;
}

interface FileResource {
  id: number;
  externalId: string;
  courseId: number;
  parentFolderId: number | null;
  folderPath: string | null;
  type: string;
  title: string;
  url: string | null;
  localPath: string | null;
  sizeBytes: number | null;
  mimeType: string | null;
  syncedAt: string | null;
  source: 'resource';
}

interface FileAttachment {
  id: number;
  notificationId: number;
  courseId: number;
  externalId: string;
  displayName: string;
  filename: string;
  url: string;
  sizeBytes: number | null;
  contentType: string | null;
  localPath: string | null;
  downloadStatus: string;
  downloadedAt: string | null;
  courseCode: string;
  courseName: string;
  notificationTitle: string;
  source: 'attachment';
}

interface FilesData {
  resources: FileResource[];
  attachments: FileAttachment[];
}

interface SystemState {
  powerSource: 'battery' | 'ac' | 'unknown';
  batteryLevel: number | null;
  windowFocused: boolean;
  isFullscreen: boolean;
  canSync: boolean;
}

interface HealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  probes: Record<string, {
    status: 'healthy' | 'degraded' | 'unhealthy';
    lastChecked: string | null;
  }>;
}

/**
 * The API exposed to the renderer process
 */
const api = {
  // ============ Data Fetching ============

  /**
   * Get all courses from the database
   */
  /**
   * Get enrollment terms
   */
  getEnrollmentTerms: async (): Promise<EnrollmentTerm[]> => {
    return ipcRenderer.invoke('data:getEnrollmentTerms');
  },

  getCourses: async (): Promise<Course[]> => {
    return ipcRenderer.invoke('data:getCourses');
  },

  /**
   * Get tasks, optionally filtered by course
   */
  getTasks: async (courseId?: number): Promise<Task[]> => {
    return ipcRenderer.invoke('data:getTasks', courseId);
  },

  /**
   * Get all notifications
   */
  getNotifications: async (): Promise<Notification[]> => {
    return ipcRenderer.invoke('data:getNotifications');
  },

  /**
   * Get a single notification by ID
   */
  getNotification: async (notificationId: number): Promise<Notification | null> => {
    return ipcRenderer.invoke('data:getNotification', notificationId);
  },

  /**
   * Get attachments for a notification
   */
  getAttachments: async (notificationId: number): Promise<NotificationAttachment[]> => {
    return ipcRenderer.invoke('data:getAttachments', notificationId);
  },

  /**
   * Get file references for a notification (detected file mentions with linked attachments)
   */
  getFileReferences: async (notificationId: number): Promise<Array<{
    id: number;
    notificationId: number;
    attachmentId: number | null;
    startPosition: number;
    endPosition: number;
    matchedText: string;
    originalUrl: string | null;
    attachment?: NotificationAttachment;
  }>> => {
    return ipcRenderer.invoke('data:getFileReferences', notificationId);
  },

  /**
   * Get a single course by ID with full details
   */
  getCourse: async (courseId: number): Promise<CourseDetail | null> => {
    return ipcRenderer.invoke('data:getCourse', courseId);
  },

  /**
   * Get policies for a course
   */
  getPolicies: async (courseId: number): Promise<Policy[]> => {
    return ipcRenderer.invoke('data:getPolicies', courseId);
  },

  /**
   * Get grade history for a course
   */
  getGradeHistory: async (courseId: number): Promise<GradeHistoryEntry[]> => {
    return ipcRenderer.invoke('data:getGradeHistory', courseId);
  },

  /**
   * Get notifications/announcements for a specific course
   */
  getCourseNotifications: async (courseId: number): Promise<Notification[]> => {
    return ipcRenderer.invoke('data:getCourseNotifications', courseId);
  },

  /**
   * Get all files (resources + notification attachments)
   */
  getFiles: async (): Promise<FilesData> => {
    return ipcRenderer.invoke('data:getFiles');
  },

  // ============ Attachments ============

  /**
   * Download an attachment
   */
  downloadAttachment: async (attachmentId: number): Promise<ApiResult<{ localPath: string }>> => {
    return ipcRenderer.invoke('attachment:download', attachmentId);
  },

  /**
   * Open a downloaded attachment
   */
  openAttachment: async (attachmentId: number): Promise<ApiResult> => {
    return ipcRenderer.invoke('attachment:open', attachmentId);
  },

  /**
   * Show attachment in file explorer
   */
  showAttachmentInFolder: async (attachmentId: number): Promise<ApiResult> => {
    return ipcRenderer.invoke('attachment:showInFolder', attachmentId);
  },

  // ============ Resources (Canvas Files) ============

  /**
   * Download a resource (Canvas file)
   */
  downloadResource: async (resourceId: number): Promise<ApiResult<{ localPath: string }>> => {
    return ipcRenderer.invoke('resource:download', resourceId);
  },

  /**
   * Open a downloaded resource
   */
  openResource: async (resourceId: number): Promise<ApiResult> => {
    return ipcRenderer.invoke('resource:open', resourceId);
  },

  /**
   * Show resource in file explorer
   */
  showResourceInFolder: async (resourceId: number): Promise<ApiResult> => {
    return ipcRenderer.invoke('resource:showInFolder', resourceId);
  },

  // ============ Files Directory ============

  /**
   * Get the files download directory path
   */
  getFilesDirectory: async (): Promise<{ path: string }> => {
    return ipcRenderer.invoke('files:getDirectory');
  },

  /**
   * Open the files directory in file explorer
   */
  openFilesDirectory: async (): Promise<ApiResult> => {
    return ipcRenderer.invoke('files:openDirectory');
  },

  /**
   * Clear all synced files data (resources and attachments)
   * This removes synced file info from the database so it can be re-synced
   */
  clearFilesSync: async (): Promise<ApiResult> => {
    return ipcRenderer.invoke('files:clearSync');
  },

  // ============ Imported Calendars ============

  /**
   * Get all imported calendars
   */
  getImportedCalendars: async (): Promise<Array<{
    id: number;
    name: string;
    filename: string;
    fileHash: string | null;
    color: string;
    eventCount: number;
    isVisible: boolean;
    importedAt: string;
    updatedAt: string;
  }>> => {
    return ipcRenderer.invoke('calendar:getImportedCalendars');
  },

  /**
   * Parse ICS content for preview (without importing)
   */
  parseICSPreview: async (content: string, filename: string): Promise<{
    calendarName: string;
    filename: string;
    events: Array<{
      uid: string;
      summary: string;
      description: string | null;
      dtstart: Date | null;
      dtend: Date | null;
      allDay: boolean;
      location: string | null;
      rrule: string | null;
      exdates: string[] | null;
      sequence: number;
    }>;
    hasRecurringEvents: boolean;
    dateRange: { start: Date; end: Date } | null;
    warnings: string[];
  }> => {
    return ipcRenderer.invoke('calendar:parseICSPreview', content, filename);
  },

  /**
   * Import ICS calendar
   */
  importICS: async (params: {
    content: string;
    filename: string;
    name?: string;
    color?: string;
  }): Promise<ApiResult<{ calendarId: number; eventCount: number }>> => {
    return ipcRenderer.invoke('calendar:importICS', params);
  },

  /**
   * Delete an imported calendar (and all its events)
   */
  deleteImportedCalendar: async (calendarId: number): Promise<ApiResult> => {
    return ipcRenderer.invoke('calendar:deleteCalendar', calendarId);
  },

  /**
   * Toggle calendar visibility
   */
  toggleCalendarVisibility: async (calendarId: number, isVisible: boolean): Promise<ApiResult> => {
    return ipcRenderer.invoke('calendar:toggleVisibility', calendarId, isVisible);
  },

  /**
   * Update calendar metadata (name, color)
   */
  updateImportedCalendar: async (calendarId: number, updates: {
    name?: string;
    color?: string;
  }): Promise<ApiResult> => {
    return ipcRenderer.invoke('calendar:updateCalendar', calendarId, updates);
  },

  /**
   * Get calendar events for a date range (with recurring events expanded)
   */
  getCalendarEventsForRange: async (params: {
    startDate: string;
    endDate: string;
    includeHidden?: boolean;
  }): Promise<Array<{
    id: number;
    externalId: string | null;
    sourceType: 'canvas' | 'user' | 'imported';
    courseId: number | null;
    importedCalendarId: number | null;
    title: string;
    description: string | null;
    startAt: string;
    endAt: string | null;
    allDay: boolean;
    location: string | null;
    uid: string | null;
    recurrenceRule: string | null;
    isRecurrenceInstance: boolean;
    recurrenceDate?: string;
    color: string;
    calendarName?: string;
  }>> => {
    return ipcRenderer.invoke('calendar:getEventsForRange', params);
  },

  // ============ Commands ============

  /**
   * Dispatch a command to L4 Controller
   */
  dispatch: async (command: string, params: unknown): Promise<ApiResult> => {
    return ipcRenderer.invoke('command:dispatch', command, params);
  },

  // ============ Simulation ============

  /**
   * Get current simulation state
   */
  getSimulationState: async (): Promise<SimulationState> => {
    return ipcRenderer.invoke('simulation:getState');
  },

  /**
   * Clear all simulations
   */
  clearSimulation: async (): Promise<ApiResult> => {
    return ipcRenderer.invoke('simulation:clear');
  },

  // ============ System ============

  /**
   * Get current system state (battery, focus, etc.)
   */
  getSystemState: async (): Promise<SystemState> => {
    return ipcRenderer.invoke('system:state');
  },

  /**
   * Get health check status
   */
  getHealthStatus: async (): Promise<HealthStatus> => {
    return ipcRenderer.invoke('health:status');
  },

  // ============ Credentials ============

  /**
   * Check if credentials exist
   */
  hasCredential: async (): Promise<boolean> => {
    const result = await ipcRenderer.invoke('credentials:get');
    return result.hasCredential;
  },

  /**
   * Store a credential
   */
  storeCredential: async (token: string): Promise<ApiResult> => {
    return ipcRenderer.invoke('credentials:store', token);
  },

  /**
   * Delete stored credential
   */
  deleteCredential: async (): Promise<ApiResult> => {
    return ipcRenderer.invoke('credentials:delete');
  },

  // ============ Canvas ============

  /**
   * Get the current user's Canvas profile
   */
  getUserProfile: async (): Promise<{ name: string; email: string | null; avatarUrl: string | null } | null> => {
    return ipcRenderer.invoke('canvas:getUserProfile');
  },

  /**
   * Connect to Canvas with stored credentials
   */
  connectCanvas: async (baseUrl: string): Promise<ApiResult> => {
    return ipcRenderer.invoke('canvas:connect', baseUrl);
  },

  /**
   * Validate a Canvas API token
   */
  validateToken: async (token: string, baseUrl: string): Promise<{
    valid: boolean;
    error?: string;
    user?: { name: string };
  }> => {
    return ipcRenderer.invoke('canvas:validateToken', token, baseUrl);
  },

  // ============ Sync ============

  /**
   * Trigger a full sync
   * @param options Optional sync options to filter courses and content types
   */
  syncFull: async (options?: {
    courseIds?: number[];
    syncCanvasFiles?: boolean;
    syncAnnouncements?: boolean;
  }): Promise<ApiResult> => {
    return ipcRenderer.invoke('sync:full', options);
  },

  /**
   * Sync courses only
   */
  syncCourses: async (): Promise<ApiResult> => {
    return ipcRenderer.invoke('sync:courses');
  },

  // ============ Window Controls ============

  /**
   * Minimize the window
   */
  windowMinimize: (): void => {
    ipcRenderer.send('window:minimize');
  },

  /**
   * Maximize/restore the window
   */
  windowMaximize: (): void => {
    ipcRenderer.send('window:maximize');
  },

  /**
   * Close the window
   */
  windowClose: (): void => {
    ipcRenderer.send('window:close');
  },

  // ============ Shell ============

  /**
   * Open URL in default browser
   */
  openExternal: (url: string): void => {
    ipcRenderer.send('shell:openExternal', url);
  },

  /**
   * Save file with dialog
   */
  saveFile: async (options: {
    defaultName: string;
    content: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }): Promise<ApiResult<{ filePath: string }>> => {
    return ipcRenderer.invoke('file:save', options);
  },

  // ============ Event Listeners ============

  /**
   * Subscribe to simulation state changes
   * Returns unsubscribe function
   */
  onSimulationChanged: (callback: (event: { type: string; context?: SimulationState }) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, data: { type: string; context?: SimulationState }) => {
      callback(data);
    };
    ipcRenderer.on('simulation:changed', handler);
    return () => {
      ipcRenderer.removeListener('simulation:changed', handler);
    };
  },

  /**
   * Subscribe to database commit events
   * Returns unsubscribe function
   */
  onDbCommit: (callback: (event: { table: string }) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, data: { table: string }) => {
      callback(data);
    };
    ipcRenderer.on('db:commit', handler);
    return () => {
      ipcRenderer.removeListener('db:commit', handler);
    };
  },

  /**
   * Subscribe to sync status changes
   * Returns unsubscribe function
   */
  onSyncStatus: (callback: (status: 'idle' | 'syncing' | 'error') => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, status: 'idle' | 'syncing' | 'error') => {
      callback(status);
    };
    ipcRenderer.on('sync:status', handler);
    return () => {
      ipcRenderer.removeListener('sync:status', handler);
    };
  },
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('api', api);

// Type declaration for TypeScript consumers
declare global {
  interface Window {
    api: typeof api;
  }
}

console.log('Preload script loaded - IPC API exposed as window.api');
