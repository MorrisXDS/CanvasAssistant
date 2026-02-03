/**
 * Store Subscriptions
 * IPC event subscriptions for the Zustand store
 */

import type { SimulationChangeEvent, DbCommitEvent, SyncConflictItem } from './types';
import { useStore } from './store';

/**
 * Get the IPC API from the window object (exposed by preload.ts)
 */
function getApi() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = (window as any).api;
  if (!api) {
    console.warn('IPC API not available - running in non-Electron context');
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
    console.warn('Cannot subscribe to IPC events - API not available');
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
      console.debug(`[Store] sync:status received: ${status}`);
      useStore.setState({ syncStatus: status });
      // Update lastSyncedAt when sync completes successfully
      if (status === 'idle') {
        useStore.setState({ lastSyncedAt: new Date().toISOString() });
        // Refresh data after sync - await to ensure UI updates before processing other events
        // This fixes IPC event ordering race where db:commit events could arrive out of order
        try {
          await useStore.getState().refreshAll();
        } catch (err) {
          console.error('[Store] refreshAll failed after sync:status idle:', err);
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
      // Handle app reset from main process - clear localStorage and reload
      if (data.clearLocalStorage) {
        localStorage.clear();
      }
      // Reload to go back to login/onboarding
      window.location.reload();
    }) || (() => {});

  // Listen for file status changes from FileWatcher (deletions, additions)
  const unsubFileStatus =
    api.onFileStatusChanged?.(
      (data: { type: 'deleted' | 'added'; resourceId?: number; path: string }) => {
        console.debug(`[Store] file-status-changed: ${data.type} ${data.path}`);
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
  };
}
