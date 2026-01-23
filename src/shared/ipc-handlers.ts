/**
 * IPC Handlers - Typed Handler Registration for Main Process
 *
 * Provides type-safe IPC handler registration for the main process.
 * Used by main.ts to register handlers with compile-time type checking.
 */

import type { IpcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron';
import type {
  IpcChannel,
  IpcParams,
  IpcResult,
  OneWayChannel,
  OneWayParams,
  PushEventChannel,
  PushEventPayload,
} from './ipc-contract';

/**
 * Handler function type for invoke-style IPC handlers.
 */
export type IpcHandler<T extends IpcChannel> = (
  event: IpcMainInvokeEvent,
  params: IpcParams<T>
) => Promise<IpcResult<T>> | IpcResult<T>;

/**
 * Handler function type for one-way IPC handlers.
 */
export type OneWayHandler<T extends OneWayChannel> = (
  params: OneWayParams<T>
) => void;

/**
 * Creates a typed IPC handler registry for the main process.
 * Call this in main.ts with the ipcMain instance.
 */
export function createIpcRegistry(ipcMain: IpcMain) {
  const registeredHandlers = new Set<string>();

  /**
   * Register a typed IPC handler.
   * Provides compile-time type checking for params and result.
   */
  function handle<T extends IpcChannel>(
    channel: T,
    handler: IpcHandler<T>
  ): void {
    if (registeredHandlers.has(channel)) {
      console.warn(`[IPC] Handler for '${channel}' already registered, skipping`);
      return;
    }
    registeredHandlers.add(channel);
    ipcMain.handle(channel, handler as (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown);
  }

  /**
   * Register a one-way IPC handler (no response).
   */
  function on<T extends OneWayChannel>(
    channel: T,
    handler: OneWayHandler<T>
  ): void {
    ipcMain.on(channel, (_event, params: OneWayParams<T>) => {
      handler(params);
    });
  }

  /**
   * Remove a registered handler.
   */
  function removeHandler(channel: IpcChannel): void {
    ipcMain.removeHandler(channel);
    registeredHandlers.delete(channel);
  }

  /**
   * Get list of registered channels.
   */
  function getRegisteredChannels(): string[] {
    return Array.from(registeredHandlers);
  }

  return { handle, on, removeHandler, getRegisteredChannels };
}

export type IpcRegistry = ReturnType<typeof createIpcRegistry>;

/**
 * Creates a typed event emitter for pushing events to renderer.
 */
export function createEventPusher(getWindow: () => BrowserWindow | null) {
  /**
   * Push an event to the renderer process.
   */
  function push<T extends PushEventChannel>(
    channel: T,
    payload: PushEventPayload<T>
  ): void {
    const window = getWindow();
    if (window && !window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  }

  return { push };
}

export type EventPusher = ReturnType<typeof createEventPusher>;

/**
 * Helper to create a successful API result.
 */
export function success<T>(data?: T): { success: true; data?: T } {
  return data !== undefined ? { success: true, data } : { success: true };
}

/**
 * Helper to create a failed API result.
 */
export function failure(error: string): { success: false; error: string } {
  return { success: false, error };
}
