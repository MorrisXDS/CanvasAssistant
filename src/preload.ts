/**
 * Preload Script - Secure IPC Bridge
 *
 * Exposes a safe, typed API to the renderer process.
 * All main process communication goes through this bridge.
 *
 * Types are imported from the shared IPC contract.
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type {
  SimulationState,
  SimulationChangeEvent,
  DbCommitEvent,
  SyncStatus,
} from './shared/ipc-contract';

/**
 * The API exposed to the renderer process.
 * Methods map to IPC channels defined in the contract.
 */
const api = {
  // ============ Platform ============
  /** Synchronous platform identifier — available on first render, no async flicker */
  platform: process.platform as 'win32' | 'darwin' | 'linux',

  // ============ Data Fetching ============

  getEnrollmentTerms: () => ipcRenderer.invoke('data:getEnrollmentTerms'),

  getCourses: () => ipcRenderer.invoke('data:getCourses'),

  getCourse: (courseId: number) => ipcRenderer.invoke('data:getCourse', courseId),

  getArchivedCourses: () => ipcRenderer.invoke('data:getArchivedCourses'),

  // Get tasks for an archived course (bypasses visibility filtering)
  // Archived courses are local-only sandboxes
  getTasksForArchivedCourse: (courseId: number) =>
    ipcRenderer.invoke('data:getTasksForArchivedCourse', courseId),

  // Tasks - requires courseIds for filtered fetch, or explicit 'all' for unfiltered
  getTasks: (options: { courseIds: number[] | 'all' } | number) => {
    if (typeof options === 'number') {
      // Legacy single courseId support
      return ipcRenderer.invoke('data:getTasks', options);
    }
    if (options.courseIds === 'all') {
      return ipcRenderer.invoke('data:getTasks');
    }
    return ipcRenderer.invoke('data:getTasks', { courseIds: options.courseIds });
  },

  // Notifications - requires courseIds for filtered fetch, or explicit 'all' for unfiltered
  getNotifications: (options: { courseIds: number[] | 'all' }) => {
    if (options.courseIds === 'all') {
      return ipcRenderer.invoke('data:getNotifications');
    }
    return ipcRenderer.invoke('data:getNotifications', { courseIds: options.courseIds });
  },

  getNotification: (notificationId: number) =>
    ipcRenderer.invoke('data:getNotification', notificationId),

  getCourseNotifications: (courseId: number) =>
    ipcRenderer.invoke('data:getCourseNotifications', courseId),

  getAttachments: (notificationId: number) =>
    ipcRenderer.invoke('data:getAttachments', notificationId),

  getFileReferences: (notificationId: number) =>
    ipcRenderer.invoke('data:getFileReferences', notificationId),

  getCourseAuthority: (courseId: number) =>
    ipcRenderer.invoke('data:getCourseAuthority', courseId),

  updateCourseAuthority: (
    courseId: number,
    settings: {
      latePenaltyAuthority?: 'canvas' | 'local' | 'both';
      dropLowestAuthority?: 'canvas' | 'local' | 'off';
      gradeCalcMode?: 'canvas' | 'local' | 'both';
    }
  ) => ipcRenderer.invoke('data:updateCourseAuthority', courseId, settings),

  // ============ Canvas Task Queue ============

  /**
   * Get pending queue entries (new Canvas tasks awaiting user review)
   */
  getTaskQueue: (options?: { status?: string }) =>
    ipcRenderer.invoke('data:getTaskQueue', options),

  /**
   * Get count of pending queue entries (for badges)
   */
  getTaskQueueCount: (options?: { courseId?: number }) =>
    ipcRenderer.invoke('data:getTaskQueueCount', options),

  /**
   * Get queue entries for a specific course
   */
  getTaskQueueForCourse: (courseId: number) =>
    ipcRenderer.invoke('data:getTaskQueueForCourse', courseId),

  /**
   * Accept a queued task (creates it as active coursework)
   * @param edits Optional edits to apply when creating the task
   */
  acceptQueuedTask: (
    queueId: number,
    edits?: {
      title?: string;
      dueAt?: string | null;
      startAt?: string | null;
      taskType?: string | null;
      weight?: number | null;
      location?: string | null;
      notes?: string | null;
    }
  ) => ipcRenderer.invoke('data:acceptQueuedTask', queueId, edits),

  /**
   * Reject a queued task (won't resurface on re-sync)
   */
  rejectQueuedTask: (queueId: number) =>
    ipcRenderer.invoke('data:rejectQueuedTask', queueId),

  /**
   * Bulk accept all pending queue entries
   */
  bulkAcceptQueuedTasks: (options?: { courseId?: number }) =>
    ipcRenderer.invoke('data:bulkAcceptQueuedTasks', options),

  /**
   * Merge a queued task with an existing user task
   */
  mergeQueuedTask: (params: {
    queueId: number;
    userTaskId: number;
    keepFromUser?: {
      notes?: boolean;
      dueAt?: boolean;
      title?: boolean;
      taskType?: boolean;
      description?: boolean;
      startAt?: boolean;
    };
  }) => ipcRenderer.invoke('data:mergeQueuedTask', params),

  /**
   * Check queued Canvas tasks for duplicate user tasks (exact or fuzzy title match).
   * Returns a match result per item — null match means no duplicate found.
   */
  checkQueueDuplicates: (
    items: Array<{
      queueId: number;
      courseId: number;
      title: string;
      dueAt: string | null;
      taskType: string | null;
    }>
  ) => ipcRenderer.invoke('data:checkQueueDuplicates', items),

  /**
   * DEBUG: Get queue and task state for debugging
   */
  debugGetQueueState: (courseId?: number) =>
    ipcRenderer.invoke('debug:getQueueState', courseId),

  /**
   * DEBUG: Force delete a task by ID (bypasses all checks)
   */
  debugForceDeleteTask: (taskId: number) =>
    ipcRenderer.invoke('debug:forceDeleteTask', taskId),

  /**
   * DEBUG: Check course auto-accept settings
   */
  debugGetCourseSettings: () => ipcRenderer.invoke('debug:getCourseSettings'),

  // ============ Task Link Suggestions ============

  getLinkSuggestions: (status?: string) =>
    ipcRenderer.invoke('data:getLinkSuggestions', status),

  acceptLinkSuggestion: (suggestionId: number) =>
    ipcRenderer.invoke('data:acceptLinkSuggestion', suggestionId),

  rejectLinkSuggestion: (suggestionId: number) =>
    ipcRenderer.invoke('data:rejectLinkSuggestion', suggestionId),

  getPendingSuggestionCount: () => ipcRenderer.invoke('data:getPendingSuggestionCount'),

  getCanvasTasksForLinking: (courseId: number) =>
    ipcRenderer.invoke('data:getCanvasTasksForLinking', courseId),

  manuallyLinkTasks: (userTaskId: number, canvasTaskId: number) =>
    ipcRenderer.invoke('data:manuallyLinkTasks', userTaskId, canvasTaskId),

  unlinkTasks: (canvasTaskId: number) =>
    ipcRenderer.invoke('data:unlinkTasks', canvasTaskId),

  getCourseSyllabus: (courseId: number) =>
    ipcRenderer.invoke('data:getCourseSyllabus', courseId),

  getCourseFiles: (courseId: number) =>
    ipcRenderer.invoke('data:getCourseFiles', courseId),

  getGradeHistory: (courseId: number) =>
    ipcRenderer.invoke('data:getGradeHistory', courseId),

  getFiles: () => ipcRenderer.invoke('data:getFiles'),

  // FileEntity (ADR-0008 PR-F.3) — forward-facing unified read channels.
  getFileEntity: (canvasId: string) => ipcRenderer.invoke('data:getFileEntity', canvasId),
  getFileEntitiesByCourse: (courseId: number) =>
    ipcRenderer.invoke('data:getFileEntitiesByCourse', courseId),
  getFileEntitiesForVisibleCourses: () =>
    ipcRenderer.invoke('data:getFileEntitiesForVisibleCourses'),

  getModuleItems: () => ipcRenderer.invoke('data:getModuleItems'),

  getResourceCanvasUrl: (resourceId: number, source: 'resource' | 'attachment') =>
    ipcRenderer.invoke('data:getResourceCanvasUrl', resourceId, source),

  getTaskCanvasUrl: (taskId: number) =>
    ipcRenderer.invoke('data:getTaskCanvasUrl', taskId),

  // ============ Attachments ============

  downloadAttachment: (attachmentId: number) =>
    ipcRenderer.invoke('attachment:download', attachmentId),

  openAttachment: (attachmentId: number) =>
    ipcRenderer.invoke('attachment:open', attachmentId),

  showAttachmentInFolder: (attachmentId: number) =>
    ipcRenderer.invoke('attachment:showInFolder', attachmentId),

  // ============ Resources (Canvas Files) ============

  downloadResource: (resourceId: number) =>
    ipcRenderer.invoke('resource:download', resourceId),

  downloadResourceByExternalId: (externalId: string) =>
    ipcRenderer.invoke('resource:downloadByExternalId', externalId),

  openResource: (resourceId: number, skipDependencyCheck?: boolean) =>
    ipcRenderer.invoke('resource:open', resourceId, skipDependencyCheck),

  openResourceByExternalId: (externalId: string) =>
    ipcRenderer.invoke('resource:openByExternalId', externalId),

  showResourceInFolder: (resourceId: number) =>
    ipcRenderer.invoke('resource:showInFolder', resourceId),

  showResourceInFolderByExternalId: (externalId: string) =>
    ipcRenderer.invoke('resource:showInFolderByExternalId', externalId),

  deleteResourceLocal: (resourceId: number) =>
    ipcRenderer.invoke('resource:deleteLocal', resourceId),

  // ============ HTML Dependencies ============

  /**
   * Check if an HTML resource has missing dependencies
   * Returns list of missing files with size info
   */
  checkHtmlDependencies: (resourceId: number) =>
    ipcRenderer.invoke('html:checkDependencies', resourceId),

  /**
   * Download missing dependencies for an HTML resource
   * Regenerates HTML with correct local paths after download
   */
  downloadHtmlDependencies: (resourceId: number) =>
    ipcRenderer.invoke('html:downloadDependencies', resourceId),

  /**
   * Open a Canvas file by its external ID
   * Downloads if not present locally, then opens with default application
   */
  openCanvasFile: (canvasFileId: string) =>
    ipcRenderer.invoke('canvas-file:open', canvasFileId),

  // ============ Files Directory ============

  getFilesDirectory: () => ipcRenderer.invoke('files:getDirectory'),

  openFilesDirectory: () => ipcRenderer.invoke('files:openDirectory'),

  selectFilesDirectory: () => ipcRenderer.invoke('files:selectDirectory'),

  setFilesDirectory: (newPath: string) =>
    ipcRenderer.invoke('files:setDirectory', newPath),

  clearFilesSync: () => ipcRenderer.invoke('files:clearSync'),

  // ============ Course Pages ============

  getPagesByCourse: (courseId: number) =>
    ipcRenderer.invoke('pages:getByCourse', courseId),

  getPage: (pageId: number) => ipcRenderer.invoke('pages:get', pageId),

  getPageByTitle: (title: string, courseId: number) =>
    ipcRenderer.invoke('pages:getByTitle', title, courseId),

  downloadPageContent: (moduleItemId: number) =>
    ipcRenderer.invoke('pages:downloadContent', moduleItemId),

  openPageFile: (moduleItemId: number, skipDependencyCheck?: boolean) =>
    ipcRenderer.invoke('pages:openFile', moduleItemId, skipDependencyCheck),

  exportPageHtml: (options: {
    courseId: number;
    pageId: number;
    title: string;
    bodyHtml: string;
  }) => ipcRenderer.invoke('pages:exportHtml', options),

  // ============ HTML Export ============

  exportHtmlBatch: (params: {
    courseId: number;
    items: Array<{
      sourceType: 'page' | 'assignment' | 'syllabus' | 'module' | 'announcement';
      sourceId: string;
      title: string;
      bodyHtml: string;
    }>;
  }) => ipcRenderer.invoke('html:exportBatch', params),

  getHtmlExports: (courseId: number) =>
    ipcRenderer.invoke('html:getExports', courseId) as Promise<
      Array<{ sourceType: string; sourceId: string; localPath: string }>
    >,

  // ============ Imported Calendars ============

  getImportedCalendars: () => ipcRenderer.invoke('calendar:getImportedCalendars'),

  parseICSPreview: (content: string, filename: string) =>
    ipcRenderer.invoke('calendar:parseICSPreview', content, filename),

  importICS: (params: {
    content: string;
    filename: string;
    name?: string;
    color?: string;
  }) => ipcRenderer.invoke('calendar:importICS', params),

  deleteImportedCalendar: (calendarId: number) =>
    ipcRenderer.invoke('calendar:deleteCalendar', calendarId),

  reimportCalendar: (calendarId: number, content: string) =>
    ipcRenderer.invoke('calendar:reimport', calendarId, content),

  toggleCalendarVisibility: (calendarId: number, isVisible: boolean) =>
    ipcRenderer.invoke('calendar:toggleVisibility', calendarId, isVisible),

  updateImportedCalendar: (
    calendarId: number,
    updates: { name?: string; color?: string }
  ) => ipcRenderer.invoke('calendar:updateCalendar', calendarId, updates),

  getCalendarEventsForRange: (params: {
    startDate: string;
    endDate: string;
    includeHidden?: boolean;
    timezone?: string; // IANA timezone for DST-aware recurrence expansion
  }) => ipcRenderer.invoke('calendar:getEventsForRange', params),

  createCalendarEvent: (data: {
    title: string;
    description?: string;
    startAt: string;
    endAt?: string;
    allDay: boolean;
    location?: string;
    courseId?: number;
    color?: string;
    notes?: string;
    reminderMinutes?: number;
  }) => ipcRenderer.invoke('calendar:createEvent', data),

  updateCalendarEvent: (
    id: number,
    data: {
      title?: string;
      description?: string;
      startAt?: string;
      endAt?: string;
      allDay?: boolean;
      location?: string;
      courseId?: number | null;
      color?: string;
      notes?: string;
      reminderMinutes?: number;
      taskType?: string;
      weight?: number;
    }
  ) => ipcRenderer.invoke('calendar:updateEvent', id, data),

  deleteCalendarEvent: (id: number) => ipcRenderer.invoke('calendar:deleteEvent', id),

  exportCalendarsBatch: (options: {
    mode: 'all' | 'selected';
    calendarIds?: number[];
    courseIds?: number[];
    includeUserEvents?: boolean;
    consolidate?: boolean;
    dateRange?: { start: string; end: string };
  }) => ipcRenderer.invoke('calendar:exportBatch', options),

  // ============ Commands ============

  dispatch: (command: string, params: unknown) =>
    ipcRenderer.invoke('command:dispatch', command, params),

  // ============ Simulation ============

  getSimulationState: (): Promise<SimulationState> =>
    ipcRenderer.invoke('simulation:getState'),

  clearSimulation: () => ipcRenderer.invoke('simulation:clear'),

  // ============ System ============

  getSystemState: () => ipcRenderer.invoke('system:state'),

  getHealthStatus: () => ipcRenderer.invoke('health:status'),

  getMetricsSummary: () => ipcRenderer.invoke('metrics:summary'),

  // ============ Renderer Logger ============
  // Sends logs from renderer to main process Logger

  log: {
    debug: (message: string, component?: string) =>
      ipcRenderer.invoke('log:renderer', 'debug', message, component),
    info: (message: string, component?: string) =>
      ipcRenderer.invoke('log:renderer', 'info', message, component),
    warn: (message: string, component?: string) =>
      ipcRenderer.invoke('log:renderer', 'warn', message, component),
    error: (message: string, component?: string) =>
      ipcRenderer.invoke('log:renderer', 'error', message, component),
  },

  // ============ Credentials ============

  hasCredential: async (): Promise<boolean> => {
    const result = await ipcRenderer.invoke('credentials:get');
    return result.hasCredential;
  },

  storeCredential: (token: string) => ipcRenderer.invoke('credentials:store', token),

  deleteCredential: () => ipcRenderer.invoke('credentials:delete'),

  // ============ Data Management ============

  clearAllData: (options?: { deleteToken?: boolean }) =>
    ipcRenderer.invoke('data:clearAll', options),

  // ============ Canvas ============

  getUserProfile: () => ipcRenderer.invoke('canvas:getUserProfile'),

  connectCanvas: (baseUrl: string) => ipcRenderer.invoke('canvas:connect', baseUrl),

  validateToken: (token: string, baseUrl: string) =>
    ipcRenderer.invoke('canvas:validateToken', token, baseUrl),

  // Debug: Direct Canvas API fetch (only available in development)
  canvasDebugFetch:
    process.env.NODE_ENV === 'development'
      ? (endpoint: string) => ipcRenderer.invoke('canvas:debugFetch', endpoint)
      : () =>
          Promise.resolve({
            success: false,
            error: 'Debug API only available in development',
          }),

  // ============ Sync ============

  syncFull: (options?: {
    termSelection?: 'all' | 'auto' | string;
    syncCanvasFiles?: boolean;
    syncAnnouncements?: boolean;
    courseIds?: number[];
    deferFileProcessing?: boolean;
  }) => ipcRenderer.invoke('sync:full', options),

  syncCourses: () => ipcRenderer.invoke('sync:courses'),

  // Process file references in background (for deferred file processing)
  processFileReferences: () => ipcRenderer.invoke('sync:processFileReferences'),

  syncFolderFiles: (params: {
    canvasFolderId: number;
    localCourseId: number;
    forceRefresh?: boolean;
  }) => ipcRenderer.invoke('sync:folderFiles', params),

  syncFolderByPath: (params: { courseId: number; folderPath: string }) =>
    ipcRenderer.invoke('sync:folderByPath', params),

  // ============ Sync Conflicts ============

  getPendingConflicts: () => ipcRenderer.invoke('sync:getPendingConflicts'),

  resolveSyncConflict: (resolution: {
    conflictId: string;
    useCanvasValue: boolean;
    rememberChoice: boolean;
    rememberForAll: boolean;
    expiresAt?: string | null;
  }) => ipcRenderer.invoke('sync:resolveConflict', resolution),

  resolveAllSyncConflicts: (useCanvasValues: boolean) =>
    ipcRenderer.invoke('sync:resolveAllConflicts', useCanvasValues),

  getSyncPreferences: () => ipcRenderer.invoke('sync:getSyncPreferences'),

  deleteSyncPreference: (entity: string, entityId: number | null, field: string) =>
    ipcRenderer.invoke('sync:deleteSyncPreference', entity, entityId, field),

  // ============ Last Sync Time ============

  getLastSyncTime: () =>
    ipcRenderer.invoke('sync:getLastSyncTime') as Promise<string | null>,

  // ============ Auto-Sync Preferences ============

  getAutoSyncPreferences: () => ipcRenderer.invoke('sync:getAutoSyncPreferences'),

  setAutoSyncPreferences: (prefs: {
    autoSyncEnabled: boolean;
    autoSyncInterval: number;
    autoAssignDueDate?: boolean;
    saveHtmlContent?: boolean;
    htmlUrlRewriting?: 'local' | 'original';
    downloadImages?: boolean;
    downloadLinkedFiles?: boolean;
    syncFiles?: boolean;
    syncAnnouncements?: boolean;
  }) => ipcRenderer.invoke('sync:setAutoSyncPreferences', prefs),

  // ============ Sync Updates Notifications ============

  getSyncUpdates: (options?: { includeResolved?: boolean; limit?: number }) =>
    ipcRenderer.invoke('syncUpdates:getAll', options),

  getSyncUpdatesCount: () => ipcRenderer.invoke('syncUpdates:getCount'),

  markSyncUpdatesSeen: (ids: number[]) =>
    ipcRenderer.invoke('syncUpdates:markSeen', { ids }),

  markAllSyncUpdatesSeen: (options?: {
    courseId?: number;
    entityType?: string;
    excludeConflicts?: boolean;
  }) => ipcRenderer.invoke('syncUpdates:markAllSeen', options),

  markSyncUpdateSeenByEntity: (entityType: string, entityId: number) =>
    ipcRenderer.invoke('syncUpdates:markSeenByEntity', { entityType, entityId }),

  resolveSyncUpdateConflict: (params: {
    updateId: number;
    resolution: 'local' | 'canvas';
    rememberChoice?: boolean;
  }) => ipcRenderer.invoke('syncUpdates:resolveConflict', params),

  cleanupSyncUpdates: (olderThanDays?: number) =>
    ipcRenderer.invoke('syncUpdates:cleanup', { olderThanDays }),

  // Debug/Test methods for notification dot system
  createTestSyncUpdates: () => ipcRenderer.invoke('syncUpdates:createTestData'),
  clearTestSyncUpdates: () => ipcRenderer.invoke('syncUpdates:clearTestData'),
  getSyncUpdatesStatus: () => ipcRenderer.invoke('syncUpdates:getStatus'),

  // Subscribe to sync updates push events
  onSyncUpdates: (
    callback: (event: {
      type: string;
      totalUnseen: number;
      conflictCount: number;
    }) => void
  ) => {
    const listener = (
      _event: unknown,
      data: { type: string; totalUnseen: number; conflictCount: number }
    ) => callback(data);
    ipcRenderer.on('sync:updates', listener);
    return () => ipcRenderer.removeListener('sync:updates', listener);
  },

  // ============ Local HTML Paths Settings ============

  getLocalHtmlPathsSettings: () =>
    ipcRenderer.invoke('settings:getLocalHtmlPathsSettings'),

  setLocalHtmlPathsSettings: (settings: {
    enabled: boolean;
    autoRegenerate: boolean;
    promptForMissing: boolean;
  }) => ipcRenderer.invoke('settings:setLocalHtmlPathsSettings', settings),

  // ============ Academic Settings ============

  getDefaultTargetGrade: () => ipcRenderer.invoke('settings:getDefaultTargetGrade'),

  setDefaultTargetGrade: (targetGrade: number) =>
    ipcRenderer.invoke('settings:setDefaultTargetGrade', targetGrade),

  // ============ Visibility Settings ============

  getTermSelection: () => ipcRenderer.invoke('settings:getTermSelection'),

  setTermSelection: (value: 'all' | 'auto' | number) =>
    ipcRenderer.invoke('settings:setTermSelection', value),

  getVisibleCourseIds: () => ipcRenderer.invoke('visibility:getVisibleCourseIds'),

  // ============ Course Settings ============

  getCourseSettings: (courseId: number) =>
    ipcRenderer.invoke('course:getSettings', courseId),

  updateCourseSettings: (
    courseId: number,
    settings: {
      autoAssignDueDate?: number | null;
      allowGuessedOverride?: number;
    }
  ) => ipcRenderer.invoke('course:updateSettings', courseId, settings),

  // ============ Data Export/Import ============

  exportDatabase: () => ipcRenderer.invoke('data:exportDatabase'),

  importDatabase: () => ipcRenderer.invoke('data:importDatabase'),

  importEncryptedBackup: (params: { filePath: string; password: string }) =>
    ipcRenderer.invoke('data:importEncryptedBackup', params),

  getDatabaseDiagnostics: () => ipcRenderer.invoke('data:getDatabaseDiagnostics'),

  exportCourseData: (params?: { courseIds?: number[]; includeFiles?: boolean }) =>
    ipcRenderer.invoke('data:exportCourseData', params),

  importCourseData: () => ipcRenderer.invoke('data:importCourseData'),

  // New selective export methods
  exportTasksCsv: (options?: { courseIds?: number[]; status?: string }) =>
    ipcRenderer.invoke('data:exportTasksCsv', options),

  exportGradesCsv: (options?: { courseIds?: number[] }) =>
    ipcRenderer.invoke('data:exportGradesCsv', options),

  exportSelective: (options: {
    courses?: number[];
    archivedCourses?: number[];
    includeTasks?: boolean;
    includeNotifications?: boolean;
    includeFiles?: boolean;
    includeGrades?: boolean;
    includeCalendar?: boolean;
    taskStatus?: 'all' | 'pending' | 'completed';
    dateRange?: { start: string; end: string };
    format: 'json' | 'csv' | 'zip';
    encrypt?: boolean;
    password?: string;
  }) => ipcRenderer.invoke('data:exportSelective', options),

  importEncrypted: (password: string) =>
    ipcRenderer.invoke('data:importEncrypted', password),

  getExportHistory: () => ipcRenderer.invoke('data:getExportHistory'),

  runScheduledBackup: () => ipcRenderer.invoke('data:runScheduledBackup'),

  // ============ Backup Schedule ============

  getBackupSchedule: () =>
    ipcRenderer.invoke('backup:getSchedule') as Promise<{
      success: boolean;
      error?: string;
      data?: {
        enabled: boolean;
        frequency: 'never' | 'daily' | 'weekly' | 'monthly';
        time?: string;
        dayOfWeek?: number;
        dayOfMonth?: number;
        destination: string;
        maxBackups: number;
        encrypt: boolean;
        lastRun?: string;
        nextRun?: string;
      };
    }>,

  setBackupSchedule: (schedule: {
    enabled: boolean;
    frequency: 'never' | 'daily' | 'weekly' | 'monthly';
    time?: string;
    dayOfWeek?: number;
    dayOfMonth?: number;
    destination: string;
    maxBackups: number;
    encrypt: boolean;
    encryptionPassword?: string;
  }) =>
    ipcRenderer.invoke('backup:setSchedule', schedule) as Promise<{
      success: boolean;
      error?: string;
      data?: unknown;
    }>,

  getBackupHistory: (limit?: number) =>
    ipcRenderer.invoke('backup:getHistory', limit) as Promise<{
      success: boolean;
      error?: string;
      data?: Array<{
        id: number;
        file_path: string | null;
        file_size: number | null;
        status: string;
        error_message: string | null;
        created_at: string;
        exists: boolean;
        encrypted: boolean;
      }>;
    }>,

  getBackupDirectoryInfo: () =>
    ipcRenderer.invoke('backup:getDirectoryInfo') as Promise<{
      success: boolean;
      error?: string;
      data?: {
        path: string;
        totalSize: number;
        fileCount: number;
      };
    }>,

  runBackupNow: () =>
    ipcRenderer.invoke('backup:runNow') as Promise<{
      success: boolean;
      error?: string;
      message?: string;
    }>,

  // Listen for backup completion events
  onBackupCompleted: (
    callback: (data: { type: string; path: string; size: number }) => void
  ): (() => void) => {
    const handler = (
      _event: IpcRendererEvent,
      data: { type: string; path: string; size: number }
    ) => {
      callback(data);
    };
    ipcRenderer.on('backup:completed', handler);
    return () => ipcRenderer.removeListener('backup:completed', handler);
  },

  // ============ Custom Task Types ============

  getTaskTypes: (courseId?: number) => ipcRenderer.invoke('taskTypes:getAll', courseId),

  createTaskType: (params: { name: string; displayName: string; courseId?: number }) =>
    ipcRenderer.invoke('taskTypes:create', params),

  deleteTaskType: (id: number) => ipcRenderer.invoke('taskTypes:delete', id),

  getCrashInfo: () => ipcRenderer.invoke('app:getCrashInfo'),

  // ============ Recovery & Safe Mode ============

  getRecoveryStatus: () =>
    ipcRenderer.invoke('app:getRecoveryStatus') as Promise<{
      safeMode: boolean;
      lastCrash: { timestamp: string; reason: string } | null;
      crashCount: number;
      message: string | null;
    }>,

  exitSafeMode: () => ipcRenderer.invoke('app:exitSafeMode'),

  dismissCrashNotification: () => ipcRenderer.invoke('app:dismissCrashNotification'),

  restartApp: () => ipcRenderer.invoke('app:restart'),

  reportError: (errorInfo: {
    message: string;
    stack?: string;
    componentStack?: string;
    timestamp: string;
  }) => ipcRenderer.invoke('app:reportError', errorInfo),

  // ============ Uninstall Preparation ============

  /**
   * Prepare for uninstall by cleaning up user data
   * @param options - What data to delete
   */
  prepareUninstall: (options: {
    deleteCredentials: boolean;
    deleteAppData: boolean;
    deleteDownloads: boolean;
  }) =>
    ipcRenderer.invoke('app:prepareUninstall', options) as Promise<{
      success: boolean;
      error?: string;
    }>,

  /**
   * Get app installation paths
   */
  getAppPath: () =>
    ipcRenderer.invoke('app:getAppPath') as Promise<{
      appPath: string;
      exePath: string;
      resourcesPath: string;
    }>,

  /**
   * Get current platform (win32, darwin, linux)
   */
  getPlatform: () => ipcRenderer.invoke('app:getPlatform') as Promise<string>,

  /**
   * Launch the Windows uninstaller (Windows only)
   */
  launchUninstaller: () =>
    ipcRenderer.invoke('app:launchUninstaller') as Promise<{
      success: boolean;
      error?: string;
    }>,

  /**
   * Open the app's location in file manager
   */
  openAppLocation: () =>
    ipcRenderer.invoke('app:openAppLocation') as Promise<{
      success: boolean;
      error?: string;
    }>,

  /**
   * Get Linux uninstall command (Linux only)
   */
  getLinuxUninstallCommand: () =>
    ipcRenderer.invoke('app:getLinuxUninstallCommand') as Promise<{
      type: 'appimage' | 'deb';
      command: string;
      path: string;
    }>,

  // ============ Window Controls ============

  windowMinimize: () => ipcRenderer.send('window:minimize'),

  windowMaximize: () => ipcRenderer.send('window:maximize'),

  windowClose: () => ipcRenderer.send('window:close'),

  windowHide: () => ipcRenderer.send('window:hide'),

  resetWindowSize: () => ipcRenderer.invoke('window:resetSize'),

  // ============ Window Behavior Settings ============

  getWindowBehavior: () =>
    ipcRenderer.invoke('settings:getWindowBehavior') as Promise<{
      closeAction: 'quit' | 'minimize-to-tray' | null;
      showTrayIcon: boolean;
    }>,

  setWindowBehavior: (settings: {
    closeAction: 'quit' | 'minimize-to-tray' | null;
    showTrayIcon: boolean;
  }) => ipcRenderer.invoke('settings:setWindowBehavior', settings),

  // Set close behavior and apply immediately (used by first-time dialog)
  setCloseBehaviorAndApply: (choice: 'minimize-to-tray' | 'quit') =>
    ipcRenderer.invoke('window:setCloseBehaviorAndApply', choice),

  // Export settings to file using native dialog
  exportSettingsToFile: (settings: Record<string, unknown>) =>
    ipcRenderer.invoke('settings:exportToFile', settings) as Promise<{
      success: boolean;
      error?: string;
      data?: { filePath: string };
    }>,

  // Import settings from file using native dialog
  importSettingsFromFile: () =>
    ipcRenderer.invoke('settings:importFromFile') as Promise<{
      success: boolean;
      error?: string;
      data?: { settings: Record<string, unknown>; filePath: string };
    }>,

  // Sync Canvas timezone from user profile
  syncCanvasTimezone: (timezone: string) =>
    ipcRenderer.invoke('settings:syncCanvasTimezone', { timezone }) as Promise<{
      success: boolean;
      error?: string;
      data?: { timezone: string };
    }>,

  // ============ Shell ============

  openExternal: (url: string) => ipcRenderer.send('shell:openExternal', url),

  saveFile: (options: {
    defaultName: string;
    content: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }) => ipcRenderer.invoke('file:save', options),

  // ============ Event Listeners ============

  onSimulationChanged: (
    callback: (event: SimulationChangeEvent) => void
  ): (() => void) => {
    const handler = (_event: IpcRendererEvent, data: SimulationChangeEvent) => {
      callback(data);
    };
    ipcRenderer.on('simulation:changed', handler);
    return () => ipcRenderer.removeListener('simulation:changed', handler);
  },

  onDbCommit: (callback: (event: DbCommitEvent) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, data: DbCommitEvent) => {
      callback(data);
    };
    ipcRenderer.on('db:commit', handler);
    return () => ipcRenderer.removeListener('db:commit', handler);
  },

  onSyncStatus: (callback: (status: SyncStatus) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, status: SyncStatus) => {
      callback(status);
    };
    ipcRenderer.on('sync:status', handler);
    return () => ipcRenderer.removeListener('sync:status', handler);
  },

  /**
   * Listen for file status changes (deletions, additions from FileWatcher)
   */
  onFileStatusChanged: (
    callback: (data: {
      type: 'deleted' | 'added';
      resourceId?: number;
      externalId?: string;
      path: string;
    }) => void
  ): (() => void) => {
    const handler = (_event: IpcRendererEvent, data: Parameters<typeof callback>[0]) => {
      callback(data);
    };
    ipcRenderer.on('file-status-changed', handler);
    return () => ipcRenderer.removeListener('file-status-changed', handler);
  },

  onSyncConflicts: (
    callback: (
      conflicts: Array<{
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
      }>
    ) => void
  ): (() => void) => {
    const handler = (
      _event: IpcRendererEvent,
      conflicts: Parameters<typeof callback>[0]
    ) => {
      callback(conflicts);
    };
    ipcRenderer.on('sync:conflicts', handler);
    return () => ipcRenderer.removeListener('sync:conflicts', handler);
  },

  /**
   * Listen for sync errors with type and error message
   */
  onSyncError: (
    callback: (data: { type: string; error: string }) => void
  ): (() => void) => {
    const handler = (_event: IpcRendererEvent, data: { type: string; error: string }) => {
      callback(data);
    };
    ipcRenderer.on('sync:error', handler);
    return () => ipcRenderer.removeListener('sync:error', handler);
  },

  /**
   * Listen for granular entity-level sync errors
   */
  onSyncEntityError: (
    callback: (data: {
      entity: string;
      externalId: string;
      error: string;
      courseName?: string;
    }) => void
  ): (() => void) => {
    const handler = (
      _event: IpcRendererEvent,
      data: { entity: string; externalId: string; error: string; courseName?: string }
    ) => {
      callback(data);
    };
    ipcRenderer.on('sync:entityError', handler);
    return () => ipcRenderer.removeListener('sync:entityError', handler);
  },

  /**
   * Listen for sync progress updates
   */
  onSyncProgress: (
    callback: (data: {
      syncId: string;
      phase: string;
      totalCourses: number;
      completedCourses: number;
      currentCourse?: string;
    }) => void
  ): (() => void) => {
    const handler = (
      _event: IpcRendererEvent,
      data: {
        syncId: string;
        phase: string;
        totalCourses: number;
        completedCourses: number;
        currentCourse?: string;
      }
    ) => {
      callback(data);
    };
    ipcRenderer.on('sync:progress', handler);
    return () => ipcRenderer.removeListener('sync:progress', handler);
  },

  /**
   * Listen for sync phase changes
   */
  onSyncPhase: (
    callback: (data: { phase: string; status: string }) => void
  ): (() => void) => {
    const handler = (
      _event: IpcRendererEvent,
      data: { phase: string; status: string }
    ) => {
      callback(data);
    };
    ipcRenderer.on('sync:phase', handler);
    return () => ipcRenderer.removeListener('sync:phase', handler);
  },

  /**
   * Listen for sync aborted events
   */
  onSyncAborted: (
    callback: (data: { reason: string; error: string }) => void
  ): (() => void) => {
    const handler = (
      _event: IpcRendererEvent,
      data: { reason: string; error: string }
    ) => {
      callback(data);
    };
    ipcRenderer.on('sync:aborted', handler);
    return () => ipcRenderer.removeListener('sync:aborted', handler);
  },

  onAuthExpired: (callback: (data: { reason: string }) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, data: { reason: string }) => {
      callback(data);
    };
    ipcRenderer.on('auth:expired', handler);
    return () => ipcRenderer.removeListener('auth:expired', handler);
  },

  onAppReset: (
    callback: (data: { tokenDeleted: boolean; clearLocalStorage: boolean }) => void
  ): (() => void) => {
    const handler = (
      _event: IpcRendererEvent,
      data: { tokenDeleted: boolean; clearLocalStorage: boolean }
    ) => {
      callback(data);
    };
    ipcRenderer.on('app:reset', handler);
    return () => ipcRenderer.removeListener('app:reset', handler);
  },

  /**
   * Listen for close behavior prompt (first-time close with no preference set)
   */
  onPromptCloseBehavior: (callback: () => void): (() => void) => {
    const handler = () => {
      callback();
    };
    ipcRenderer.on('window:promptCloseBehavior', handler);
    return () => ipcRenderer.removeListener('window:promptCloseBehavior', handler);
  },

  /**
   * Listen for recovery status updates (safe mode, crash recovery)
   */
  onRecoveryStatus: (
    callback: (data: {
      safeMode: boolean;
      lastCrash: { timestamp: string; reason: string } | null;
      message: string | null;
    }) => void
  ): (() => void) => {
    const handler = (
      _event: IpcRendererEvent,
      data: {
        safeMode: boolean;
        lastCrash: { timestamp: string; reason: string } | null;
        message: string | null;
      }
    ) => {
      callback(data);
    };
    ipcRenderer.on('app:recovery-status', handler);
    return () => ipcRenderer.removeListener('app:recovery-status', handler);
  },

  /**
   * Listen for shutdown notification from main process
   */
  onShutdownRequested: (
    callback: (data: { gracePeriodMs: number }) => void
  ): (() => void) => {
    const handler = (_event: IpcRendererEvent, data: { gracePeriodMs: number }) => {
      callback(data);
    };
    ipcRenderer.on('app:shutdown-requested', handler);
    return () => ipcRenderer.removeListener('app:shutdown-requested', handler);
  },

  /**
   * Acknowledge shutdown to main process
   */
  acknowledgeShutdown: () => ipcRenderer.send('app:shutdown-acknowledged'),

  /**
   * Listen for database corruption detected
   */
  onDatabaseCorruption: (
    callback: (data: { errors: string[]; canContinue: boolean }) => void
  ): (() => void) => {
    const handler = (
      _event: IpcRendererEvent,
      data: { errors: string[]; canContinue: boolean }
    ) => {
      callback(data);
    };
    ipcRenderer.on('app:database-corruption', handler);
    return () => ipcRenderer.removeListener('app:database-corruption', handler);
  },

  /**
   * Handle database corruption response
   */
  handleCorruption: (action: 'reset' | 'continue' | 'export') =>
    ipcRenderer.invoke('app:handleCorruption', action),

  /**
   * Listen for file drops (ICS files dropped on the window)
   * Electron intercepts file drops and sends content via IPC
   */
  onFileDropped: (
    callback: (data: { type: string; content: string; filename: string }) => void
  ): (() => void) => {
    const handler = (
      _event: IpcRendererEvent,
      data: { type: string; content: string; filename: string }
    ) => {
      callback(data);
    };
    ipcRenderer.on('file-dropped', handler);
    return () => ipcRenderer.removeListener('file-dropped', handler);
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

// Only log in development mode
if (process.env.NODE_ENV === 'development') {
  // eslint-disable-next-line cross-platform/no-console-in-main, no-console -- intentional dev-only log
  console.log('Preload script loaded - IPC API exposed as window.api');
}
