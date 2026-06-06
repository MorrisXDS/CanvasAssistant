/**
 * L5 Presentation - Zustand Store
 *
 * Global state management for the renderer process.
 * Communicates with main process exclusively through IPC.
 * Subscribes to push events for real-time updates.
 *
 * Uses direct store patching for command results to avoid
 * unnecessary re-fetches and re-renders.
 *
 * Composed from slice modules in ./slices/ for maintainability.
 */

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { Store, StoreState } from '../types';
import {
  createCoreDataSlice,
  createTaskQueueSlice,
  createCalendarSlice,
  createTaskActionsSlice,
  createSyncSlice,
  createEventHandlerSlice,
  createSyncUpdatesSlice,
  createUpdateSlice,
} from './slices';
import type { StoreSet, StoreGet } from './storeUtils';

/**
 * Initial state
 */
const initialState: StoreState = {
  courses: [],
  tasks: [],
  notifications: [],
  taskQueue: [],
  taskQueueCount: 0,
  importedCalendars: [],
  calendarEvents: [],
  simulation: {
    isActive: false,
    startedAt: null,
    grades: [],
  },
  syncStatus: 'idle',
  syncMessage: null,
  isAutoSync: false,
  lastSyncedAt: null,
  lastSyncResult: null,
  systemState: null,
  healthStatus: null,
  isAuthenticated: false,
  isInitialized: false,
  authError: null,
  authReauthDeferred: false,
  lastError: null,
  syncConflicts: [],
  syncUpdates: {
    totalUnseen: 0,
    conflictCount: 0,
    informationalCount: 0,
    actionRequiredCount: 0,
    updates: [],
    lastFetchedAt: null,
  },
  // Update channel (ADR-0012)
  updateAvailable: null,
};

/**
 * Build a fresh Zustand store by composing all slices.
 *
 * Production code uses the module-singleton `useStore` exported below.
 * `createStore()` is **primarily a test utility** — `tests/test-utils/testEnv.ts`
 * calls it to spin up an isolated store per test, sidestepping the singleton
 * that would otherwise leak state across cases.
 *
 * Intentionally NOT re-exported from `store/index.ts` — production consumers
 * should only see `useStore`. Test utilities reach into this deeper path to
 * get the factory.
 */
export function createStore() {
  return create<Store>()(
    devtools(
      subscribeWithSelector((zustandSet, zustandGet) => {
        // Cast Zustand's set/get to our simplified slice types.
        // Zustand's set is a superset of StoreSet (accepts additional args like replace, action)
        // so this cast is safe - slices only use the subset we define.
        const set = zustandSet as unknown as StoreSet;
        const get = zustandGet as StoreGet;

        return {
          ...initialState,
          ...createCoreDataSlice(set, get),
          ...createTaskQueueSlice(set, get),
          ...createCalendarSlice(set, get),
          ...createTaskActionsSlice(set, get),
          ...createSyncSlice(set, get),
          ...createEventHandlerSlice(set, get),
          ...createSyncUpdatesSlice(set, get),
          ...createUpdateSlice(set, get),
        } as Store;
      }),
      { name: 'canvas-store' }
    )
  );
}

/**
 * The production Zustand store — a single shared instance for the whole
 * renderer process. Imperative consumers (storeSubscriptions, useSettingsSync)
 * depend on this being a module singleton; the factory above is purely additive.
 */
export const useStore = createStore();
