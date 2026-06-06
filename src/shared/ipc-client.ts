/**
 * IPC Client - Typed Client Generator for Renderer
 *
 * Provides type-safe IPC communication from renderer to main process.
 * Used by preload.ts to create the window.api object.
 */

import type { IpcRenderer, IpcRendererEvent } from 'electron';
import type {
  IpcChannel,
  IpcParams,
  IpcResult,
  PushEventChannel,
  PushEventPayload,
  OneWayChannel,
  OneWayParams,
  UpdatePreferences,
  UpdateAvailablePayload,
} from './ipc-contract';

/**
 * Creates a typed IPC client for the renderer process.
 * Call this in preload.ts with the ipcRenderer instance.
 */
export function createIpcClient(ipcRenderer: IpcRenderer) {
  /**
   * Invoke an IPC handler and return the result.
   * Type-safe based on the IPC contract.
   */
  async function invoke<T extends IpcChannel>(
    channel: T,
    ...args: IpcParams<T> extends void ? [] : [IpcParams<T>]
  ): Promise<IpcResult<T>> {
    // Handle channels that take multiple positional args
    const params = args[0];
    return ipcRenderer.invoke(channel, params);
  }

  /**
   * Send a one-way message (no response expected).
   */
  function send<T extends OneWayChannel>(
    channel: T,
    ...args: OneWayParams<T> extends void ? [] : [OneWayParams<T>]
  ): void {
    const params = args[0];
    if (params !== undefined) {
      ipcRenderer.send(channel, params);
    } else {
      ipcRenderer.send(channel);
    }
  }

  /**
   * Subscribe to push events from main process.
   * Returns an unsubscribe function.
   */
  function on<T extends PushEventChannel>(
    channel: T,
    callback: (payload: PushEventPayload<T>) => void
  ): () => void {
    const handler = (_event: IpcRendererEvent, data: PushEventPayload<T>) => {
      callback(data);
    };
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  }

  return { invoke, send, on };
}

export type IpcClient = ReturnType<typeof createIpcClient>;

/**
 * Type definition for the API exposed to the renderer process.
 * This is the type of window.api after contextBridge.exposeInMainWorld().
 */
export interface TypedApi {
  // Data Fetching
  getEnrollmentTerms: () => Promise<IpcResult<'data:getEnrollmentTerms'>>;
  getCourses: () => Promise<IpcResult<'data:getCourses'>>;
  getCourse: (courseId: number) => Promise<IpcResult<'data:getCourse'>>;
  getTasks: (courseId?: number) => Promise<IpcResult<'data:getTasks'>>;
  getNotifications: () => Promise<IpcResult<'data:getNotifications'>>;
  getNotification: (notificationId: number) => Promise<IpcResult<'data:getNotification'>>;
  getCourseNotifications: (
    courseId: number
  ) => Promise<IpcResult<'data:getCourseNotifications'>>;
  getAttachments: (notificationId: number) => Promise<IpcResult<'data:getAttachments'>>;
  getFileReferences: (
    notificationId: number
  ) => Promise<IpcResult<'data:getFileReferences'>>;
  getGradeHistory: (courseId: number) => Promise<IpcResult<'data:getGradeHistory'>>;
  getPastTermGrades: () => Promise<IpcResult<'data:getPastTermGrades'>>;
  getFiles: () => Promise<IpcResult<'data:getFiles'>>;

  // Attachments
  downloadAttachment: (attachmentId: number) => Promise<IpcResult<'attachment:download'>>;
  openAttachment: (attachmentId: number) => Promise<IpcResult<'attachment:open'>>;
  showAttachmentInFolder: (
    attachmentId: number
  ) => Promise<IpcResult<'attachment:showInFolder'>>;

  // Resources
  downloadResource: (resourceId: number) => Promise<IpcResult<'resource:download'>>;
  downloadResourceByExternalId: (
    externalId: string
  ) => Promise<IpcResult<'resource:downloadByExternalId'>>;
  openResource: (resourceId: number) => Promise<IpcResult<'resource:open'>>;
  openResourceByExternalId: (
    externalId: string
  ) => Promise<IpcResult<'resource:openByExternalId'>>;
  showResourceInFolder: (
    resourceId: number
  ) => Promise<IpcResult<'resource:showInFolder'>>;
  showResourceInFolderByExternalId: (
    externalId: string
  ) => Promise<IpcResult<'resource:showInFolderByExternalId'>>;

  // Files Directory
  getFilesDirectory: () => Promise<IpcResult<'files:getDirectory'>>;
  openFilesDirectory: () => Promise<IpcResult<'files:openDirectory'>>;
  clearFilesSync: () => Promise<IpcResult<'files:clearSync'>>;

  // Course Pages
  getPagesByCourse: (courseId: number) => Promise<IpcResult<'pages:getByCourse'>>;
  getPage: (pageId: number) => Promise<IpcResult<'pages:get'>>;
  exportPageHtml: (
    options: IpcParams<'pages:exportHtml'>
  ) => Promise<IpcResult<'pages:exportHtml'>>;

  // Calendars
  getImportedCalendars: () => Promise<IpcResult<'calendar:getImportedCalendars'>>;
  parseICSPreview: (
    content: string,
    filename: string
  ) => Promise<IpcResult<'calendar:parseICSPreview'>>;
  importICS: (
    params: IpcParams<'calendar:importICS'>
  ) => Promise<IpcResult<'calendar:importICS'>>;
  deleteImportedCalendar: (
    calendarId: number
  ) => Promise<IpcResult<'calendar:deleteCalendar'>>;
  toggleCalendarVisibility: (
    calendarId: number,
    isVisible: boolean
  ) => Promise<IpcResult<'calendar:toggleVisibility'>>;
  updateImportedCalendar: (
    calendarId: number,
    updates: { name?: string; color?: string }
  ) => Promise<IpcResult<'calendar:updateCalendar'>>;
  getCalendarEventsForRange: (
    params: IpcParams<'calendar:getEventsForRange'>
  ) => Promise<IpcResult<'calendar:getEventsForRange'>>;

  // Commands
  dispatch: (command: string, params: unknown) => Promise<IpcResult<'command:dispatch'>>;

  // Simulation
  getSimulationState: () => Promise<IpcResult<'simulation:getState'>>;
  clearSimulation: () => Promise<IpcResult<'simulation:clear'>>;

  // System
  getSystemState: () => Promise<IpcResult<'system:state'>>;
  getHealthStatus: () => Promise<IpcResult<'health:status'>>;

  // Credentials
  hasCredential: () => Promise<boolean>;
  storeCredential: (token: string) => Promise<IpcResult<'credentials:store'>>;
  deleteCredential: () => Promise<IpcResult<'credentials:delete'>>;
  /** Tri-state auth status pull (ADR-0013). */
  getAuthStatus: () => Promise<IpcResult<'auth:getStatus'>>;

  // Canvas
  connectCanvas: (baseUrl: string) => Promise<IpcResult<'canvas:connect'>>;
  validateToken: (
    token: string,
    baseUrl: string
  ) => Promise<IpcResult<'canvas:validateToken'>>;
  getUserProfile: () => Promise<IpcResult<'canvas:getUserProfile'>>;

  // Sync
  syncFull: (options?: IpcParams<'sync:full'>) => Promise<IpcResult<'sync:full'>>;
  syncCourses: () => Promise<IpcResult<'sync:courses'>>;

  // File Operations
  saveFile: (options: IpcParams<'file:save'>) => Promise<IpcResult<'file:save'>>;

  // Window Controls
  windowMinimize: () => void;
  windowMaximize: () => void;
  windowClose: () => void;

  // Shell
  openExternal: (url: string) => void;

  // Event Listeners
  onSimulationChanged: (
    callback: (event: PushEventPayload<'simulation:changed'>) => void
  ) => () => void;
  onDbCommit: (callback: (event: PushEventPayload<'db:commit'>) => void) => () => void;
  onSyncStatus: (
    callback: (status: PushEventPayload<'sync:status'>) => void
  ) => () => void;

  // Update Channel (ADR-0012)
  getUpdatePrefs: () => Promise<{
    success: boolean;
    error?: string;
    data?: UpdatePreferences;
  }>;
  setUpdatePrefs: (
    prefs: UpdatePreferences
  ) => Promise<{ success: boolean; error?: string }>;
  checkForUpdatesNow: () => Promise<{ success: boolean; error?: string }>;
  onUpdateAvailable?: (callback: (payload: UpdateAvailablePayload) => void) => () => void;
}
