/**
 * Store Subscriptions
 * IPC event subscriptions for the Zustand store
 */

import type {
  SimulationChangeEvent,
  DbCommitEvent,
  SyncConflictItem,
  UpdateAvailablePayload,
} from '../types';
import { useStore } from './store';
import { createLogger } from '../../l6-ui/utils/rendererLogger';

const log = createLogger('storeSubscriptions');

/**
 * Get the IPC API from the window object (exposed by preload.ts)
 */
function getApi() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = (window as any).api;
  if (!api) {
    log.warn('IPC API not available - running in non-Electron context');
    return null;
  }
  return api;
}

/**
 * Subscribe to IPC events from main process
 * Call this in the renderer entry point
 * @returns Cleanup function to unsubscribe all listeners
 */
export function subscribeToIpcEvents(): () => void {
  const api = getApi();
  if (!api) {
    log.warn('Cannot subscribe to IPC events - API not available');
    return () => {};
  }

  const unsubSimulation = api.onSimulationChanged((event: SimulationChangeEvent) => {
    useStore.getState().handleSimulationChange(event);
  });

  const unsubDbCommit = api.onDbCommit((event: DbCommitEvent) => {
    useStore.getState().handleDbCommit(event);
  });

  const unsubSyncStatus = api.onSyncStatus(
    async (status: 'idle' | 'syncing' | 'error') => {
      log.debug(`[Store] sync:status received: ${status}`);
      useStore.setState({ syncStatus: status });
      // Update lastSyncedAt when sync completes successfully
      if (status === 'idle') {
        useStore.setState({ lastSyncedAt: new Date().toISOString() });
        // Refresh data after sync - await to ensure UI updates before processing other events
        // This fixes IPC event ordering race where db:commit events could arrive out of order
        try {
          await useStore.getState().refreshAll();
        } catch (err) {
          log.error(
            '[Store] refreshAll failed after sync:status idle:',
            err instanceof Error ? err : undefined
          );
        }
      }
    }
  );

  const unsubSyncConflicts = api.onSyncConflicts((conflicts: SyncConflictItem[]) => {
    useStore.getState().addSyncConflicts(conflicts);
  });

  const unsubAuthExpired =
    api.onAuthExpired?.((data: { reason: string }) => {
      useStore.getState().setAuthError({ type: 'expired', reason: data.reason });
    }) || (() => {});

  const unsubAppReset =
    api.onAppReset?.((data: { tokenDeleted: boolean; clearLocalStorage: boolean }) => {
      // Immediately de-auth so React unmounts lazy-loaded routes before reload
      // This prevents "Failed to fetch dynamically imported module" errors
      if (data.tokenDeleted) {
        useStore.getState().setAuthenticated(false);
      }
      if (data.clearLocalStorage) {
        localStorage.clear();
      }
      window.location.reload();
    }) || (() => {});

  // Listen for file status changes from FileWatcher (deletions, additions)
  const unsubFileStatus =
    api.onFileStatusChanged?.(
      (data: { type: 'deleted' | 'added'; resourceId?: number; path: string }) => {
        log.debug(`[Store] file-status-changed: ${data.type} ${data.path}`);
        // Files aren't stored in zustand - components fetch them directly
        // Just broadcast an event so components can refetch if needed
        // The store will emit a custom event that FilesPage can listen to
        window.dispatchEvent(new CustomEvent('file-status-changed', { detail: data }));
      }
    ) || (() => {});

  // Listen for sync phase changes (staged progress)
  const unsubSyncPhase =
    api.onSyncPhase?.((data: { phase: string; status: string }) => {
      if (data.status === 'started') {
        const phaseMessages: Record<string, string> = {
          fetch: 'Loading courses...',
          commit: 'Saving data...',
          'file-refs': 'Processing files...',
          'html-content': 'Downloading content...',
        };
        const message = phaseMessages[data.phase] || `Syncing ${data.phase}...`;
        useStore.setState({ syncMessage: message });
      }
    }) || (() => {});

  // Listen for sync progress updates (per-course progress)
  const unsubSyncProgress =
    api.onSyncProgress?.(
      (data: {
        syncId: string;
        phase: string;
        totalCourses: number;
        completedCourses: number;
        currentCourse?: string;
      }) => {
        if (data.currentCourse) {
          useStore.setState({
            syncMessage: `Syncing ${data.currentCourse}... (${data.completedCourses}/${data.totalCourses})`,
          });
        }
      }
    ) || (() => {});

  // Listen for sync updates push events (for FAB badge updates)
  const unsubSyncUpdates =
    api.onSyncUpdates?.(
      (event: { type: string; totalUnseen: number; conflictCount: number }) => {
        log.info('[storeSubscriptions] Received sync:updates event');
        useStore.getState().handleSyncUpdatesEvent(event);
      }
    ) || (() => {});

  // Listen for update:available push events (ADR-0012)
  const unsubUpdateAvailable =
    api.onUpdateAvailable?.((payload: UpdateAvailablePayload) => {
      log.info(`[storeSubscriptions] Received update:available for v${payload.version}`);
      useStore.getState().setUpdateAvailable(payload);
    }) || (() => {});

  return () => {
    unsubSimulation();
    unsubDbCommit();
    unsubSyncStatus();
    unsubSyncConflicts();
    unsubAuthExpired();
    unsubAppReset();
    unsubFileStatus();
    unsubSyncPhase();
    unsubSyncProgress();
    unsubSyncUpdates();
    unsubUpdateAvailable();
  };
}
