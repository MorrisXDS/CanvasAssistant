/**
 * IPC Handlers Index
 * Central export for all IPC handler modules
 */

export type { IpcContext, IpcHandlerRegistrar } from './IpcContext';
export { registerIntelligenceHandlers } from './intelligenceHandlers';
export { registerCalendarHandlers } from './calendarHandlers';
export { registerDataHandlers } from './dataHandlers';
export { registerFileHandlers } from './fileHandlers';
