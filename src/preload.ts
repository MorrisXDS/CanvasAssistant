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
  // ============ Data Fetching ============

  getEnrollmentTerms: () => ipcRenderer.invoke('data:getEnrollmentTerms'),

  getCourses: () => ipcRenderer.invoke('data:getCourses'),

  getCourse: (courseId: number) => ipcRenderer.invoke('data:getCourse', courseId),

  getTasks: (courseId?: number) => ipcRenderer.invoke('data:getTasks', courseId),

  getNotifications: () => ipcRenderer.invoke('data:getNotifications'),

  getNotification: (notificationId: number) =>
    ipcRenderer.invoke('data:getNotification', notificationId),

  getCourseNotifications: (courseId: number) =>
    ipcRenderer.invoke('data:getCourseNotifications', courseId),

  getAttachments: (notificationId: number) =>
    ipcRenderer.invoke('data:getAttachments', notificationId),

  getFileReferences: (notificationId: number) =>
    ipcRenderer.invoke('data:getFileReferences', notificationId),

  getPolicies: (courseId: number) =>
    ipcRenderer.invoke('data:getPolicies', courseId),

  getGradeHistory: (courseId: number) =>
    ipcRenderer.invoke('data:getGradeHistory', courseId),

  getFiles: () => ipcRenderer.invoke('data:getFiles'),

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

  openResource: (resourceId: number) =>
    ipcRenderer.invoke('resource:open', resourceId),

  showResourceInFolder: (resourceId: number) =>
    ipcRenderer.invoke('resource:showInFolder', resourceId),

  // ============ Files Directory ============

  getFilesDirectory: () => ipcRenderer.invoke('files:getDirectory'),

  openFilesDirectory: () => ipcRenderer.invoke('files:openDirectory'),

  selectFilesDirectory: () => ipcRenderer.invoke('files:selectDirectory'),

  setFilesDirectory: (newPath: string) => ipcRenderer.invoke('files:setDirectory', newPath),

  clearFilesSync: () => ipcRenderer.invoke('files:clearSync'),

  // ============ Course Pages ============

  getPagesByCourse: (courseId: number) => ipcRenderer.invoke('pages:getByCourse', courseId),

  getPage: (pageId: number) => ipcRenderer.invoke('pages:get', pageId),

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

  toggleCalendarVisibility: (calendarId: number, isVisible: boolean) =>
    ipcRenderer.invoke('calendar:toggleVisibility', calendarId, isVisible),

  updateImportedCalendar: (calendarId: number, updates: { name?: string; color?: string }) =>
    ipcRenderer.invoke('calendar:updateCalendar', calendarId, updates),

  getCalendarEventsForRange: (params: {
    startDate: string;
    endDate: string;
    includeHidden?: boolean;
  }) => ipcRenderer.invoke('calendar:getEventsForRange', params),

  // ============ Commands ============

  dispatch: (command: string, params: unknown) =>
    ipcRenderer.invoke('command:dispatch', command, params),

  // ============ Simulation ============

  getSimulationState: (): Promise<SimulationState> =>
    ipcRenderer.invoke('simulation:getState'),

  clearSimulation: () => ipcRenderer.invoke('simulation:clear'),

  // ============ Priorities ============

  calculatePriorities: () => ipcRenderer.invoke('priorities:calculate'),

  refreshPriorities: () => ipcRenderer.invoke('priorities:refresh'),

  getPriorityExplanation: (taskId: number) =>
    ipcRenderer.invoke('priorities:getExplanation', { taskId }),

  // ============ Intelligence - Recommendations ============

  getActiveRecommendations: () =>
    ipcRenderer.invoke('intelligence:getActiveRecommendations'),

  generateRecommendations: (availableMinutes?: number) =>
    ipcRenderer.invoke('intelligence:generateRecommendations', { availableMinutes }),

  dismissRecommendation: (recommendationId: number) =>
    ipcRenderer.invoke('intelligence:dismissRecommendation', recommendationId),

  actOnRecommendation: (recommendationId: number) =>
    ipcRenderer.invoke('intelligence:actOnRecommendation', recommendationId),

  getRecommendationStats: () =>
    ipcRenderer.invoke('intelligence:getRecommendationStats'),

  // ============ Intelligence - Insights ============

  getActiveInsights: () =>
    ipcRenderer.invoke('intelligence:getActiveInsights'),

  generateInsights: () =>
    ipcRenderer.invoke('intelligence:generateInsights'),

  acknowledgeInsight: (insightId: number) =>
    ipcRenderer.invoke('intelligence:acknowledgeInsight', insightId),

  acknowledgeAllInsights: () =>
    ipcRenderer.invoke('intelligence:acknowledgeAllInsights'),

  getInsightStats: () =>
    ipcRenderer.invoke('intelligence:getInsightStats'),

  // ============ Intelligence - Workload ============

  getWorkloadDistribution: (params?: { startDate?: string; endDate?: string }) =>
    ipcRenderer.invoke('intelligence:getWorkloadDistribution', params),

  getDailyPlan: (date?: string) =>
    ipcRenderer.invoke('intelligence:getDailyPlan', { date }),

  getEffortEstimate: (taskId: number) =>
    ipcRenderer.invoke('intelligence:getEffortEstimate', taskId),

  getClusteringScore: (windowDays?: number) =>
    ipcRenderer.invoke('intelligence:getClusteringScore', { windowDays }),

  // ============ System ============

  getSystemState: () => ipcRenderer.invoke('system:state'),

  getHealthStatus: () => ipcRenderer.invoke('health:status'),

  // ============ Credentials ============

  hasCredential: async (): Promise<boolean> => {
    const result = await ipcRenderer.invoke('credentials:get');
    return result.hasCredential;
  },

  storeCredential: (token: string) =>
    ipcRenderer.invoke('credentials:store', token),

  deleteCredential: () => ipcRenderer.invoke('credentials:delete'),

  // ============ Data Management ============

  clearAllData: () => ipcRenderer.invoke('data:clearAll'),

  // ============ Canvas ============

  getUserProfile: () => ipcRenderer.invoke('canvas:getUserProfile'),

  connectCanvas: (baseUrl: string) =>
    ipcRenderer.invoke('canvas:connect', baseUrl),

  validateToken: (token: string, baseUrl: string) =>
    ipcRenderer.invoke('canvas:validateToken', token, baseUrl),

  // Debug: Direct Canvas API fetch
  canvasDebugFetch: (endpoint: string) =>
    ipcRenderer.invoke('canvas:debugFetch', endpoint),

  // ============ Sync ============

  syncFull: (options?: {
    termSelection?: 'all' | 'auto' | string;
    syncCanvasFiles?: boolean;
    syncAnnouncements?: boolean;
    courseIds?: number[];
  }) => ipcRenderer.invoke('sync:full', options),

  syncCourses: () => ipcRenderer.invoke('sync:courses'),

  syncFolderFiles: (params: {
    canvasFolderId: number;
    localCourseId: number;
    forceRefresh?: boolean;
  }) => ipcRenderer.invoke('sync:folderFiles', params),

  syncFolderByPath: (params: {
    courseId: number;
    folderPath: string;
  }) => ipcRenderer.invoke('sync:folderByPath', params),

  // ============ Sync Conflicts ============

  getPendingConflicts: () => ipcRenderer.invoke('sync:getPendingConflicts'),

  resolveSyncConflict: (resolution: {
    conflictId: string;
    useCanvasValue: boolean;
    rememberChoice: boolean;
    rememberForAll: boolean;
  }) => ipcRenderer.invoke('sync:resolveConflict', resolution),

  resolveAllSyncConflicts: (useCanvasValues: boolean) =>
    ipcRenderer.invoke('sync:resolveAllConflicts', useCanvasValues),

  getSyncPreferences: () => ipcRenderer.invoke('sync:getSyncPreferences'),

  deleteSyncPreference: (entity: string, entityId: number | null, field: string) =>
    ipcRenderer.invoke('sync:deleteSyncPreference', entity, entityId, field),

  // ============ Auto-Sync Preferences ============

  getAutoSyncPreferences: () =>
    ipcRenderer.invoke('sync:getAutoSyncPreferences'),

  setAutoSyncPreferences: (prefs: { autoSyncEnabled: boolean; autoSyncInterval: number }) =>
    ipcRenderer.invoke('sync:setAutoSyncPreferences', prefs),

  // ============ Data Export/Backup ============

  exportDatabase: () => ipcRenderer.invoke('data:exportDatabase'),

  exportCourseData: (params?: { courseIds?: number[]; includeFiles?: boolean }) =>
    ipcRenderer.invoke('data:exportCourseData', params),

  importCourseData: () => ipcRenderer.invoke('data:importCourseData'),

  getCrashInfo: () => ipcRenderer.invoke('app:getCrashInfo'),

  // ============ Window Controls ============

  windowMinimize: () => ipcRenderer.send('window:minimize'),

  windowMaximize: () => ipcRenderer.send('window:maximize'),

  windowClose: () => ipcRenderer.send('window:close'),

  // ============ Shell ============

  openExternal: (url: string) => ipcRenderer.send('shell:openExternal', url),

  saveFile: (options: {
    defaultName: string;
    content: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }) => ipcRenderer.invoke('file:save', options),

  // ============ Event Listeners ============

  onSimulationChanged: (callback: (event: SimulationChangeEvent) => void): (() => void) => {
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

  onSyncConflicts: (callback: (conflicts: Array<{
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
  }>) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, conflicts: Parameters<typeof callback>[0]) => {
      callback(conflicts);
    };
    ipcRenderer.on('sync:conflicts', handler);
    return () => ipcRenderer.removeListener('sync:conflicts', handler);
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
  console.log('Preload script loaded - IPC API exposed as window.api');
}
