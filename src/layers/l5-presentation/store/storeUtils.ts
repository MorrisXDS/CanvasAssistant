/**
 * Store Utilities
 * Shared helpers and types used by all store slices.
 */

import type { Store } from '../types';
import { createLogger } from '../../l6-ui/utils/rendererLogger';

const log = createLogger('storeUtils');

/**
 * Zustand-compatible set function type for store slices.
 * Uses a simplified signature that covers the patterns slices actually use:
 * - set({ key: value }) - partial state object
 * - set((state) => ({ key: value })) - updater function returning partial state
 */
export type StoreSet = (
  partial: Partial<Store> | ((state: Store) => Partial<Store>)
) => void;

/**
 * Zustand-compatible get function type for store slices.
 */
export type StoreGet = () => Store;

/**
 * Slice creator function type.
 * Each slice returns a partial store object containing its methods.
 */
export type SliceCreator = (set: StoreSet, get: StoreGet) => Partial<Store>;

/**
 * Get the IPC API from the window object (exposed by preload.ts)
 */
export function getApi() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = (window as any).api;
  if (!api) {
    log.warn('IPC API not available - running in non-Electron context');
    return null;
  }
  return api;
}

/**
 * Log user actions to the main process logger
 * All user actions are logged at 'info' level for comprehensive tracking
 */
export function logUserAction(action: string, data?: Record<string, unknown>): void {
  const api = getApi();
  if (!api?.log) return;

  const message = data ? `[UI] ${action}: ${JSON.stringify(data)}` : `[UI] ${action}`;

  api.log.info(message, 'store');
}
