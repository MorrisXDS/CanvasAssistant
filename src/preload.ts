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
   * Get attachments for a notification
   */
  getAttachments: async (notificationId: number): Promise<NotificationAttachment[]> => {
    return ipcRenderer.invoke('data:getAttachments', notificationId);
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
   */
  syncFull: async (): Promise<ApiResult> => {
    return ipcRenderer.invoke('sync:full');
  },

  /**
   * Sync courses only
   */
  syncCourses: async (): Promise<ApiResult> => {
    return ipcRenderer.invoke('sync:courses');
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
