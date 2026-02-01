/**
 * IPC Handlers Index
 * Central export for all IPC handler modules
 */

export type { IpcContext, IpcHandlerRegistrar } from './IpcContext';
export { registerIntelligenceHandlers } from './intelligenceHandlers';
export { registerCalendarHandlers } from './calendarHandlers';
export { registerDataHandlers } from './dataHandlers';
export { registerCourseDataHandlers } from './courseDataHandlers';
export { registerTaskDataHandlers } from './taskDataHandlers';
export { registerNotificationDataHandlers } from './notificationDataHandlers';
export { registerFileDataHandlers } from './fileDataHandlers';
export { registerFileHandlers } from './fileHandlers';
export { registerSyncHandlers } from './syncHandlers';
export { registerTaskTypesHandlers } from './taskTypesHandlers';
export { registerSystemHandlers } from './systemHandlers';
export { registerWindowHandlers } from './windowHandlers';
export { registerCredentialHandlers } from './credentialHandlers';
export { registerSettingsHandlers } from './settingsHandlers';
export { registerExportHandlers } from './exportHandlers';
export { registerDatabaseExportHandlers } from './databaseExportHandlers';
export { registerCourseExportHandlers } from './courseExportHandlers';
export { registerCsvExportHandlers } from './csvExportHandlers';
export { registerAppHandlers } from './appHandlers';
export { registerPagesHandlers } from './pagesHandlers';
export { registerHtmlExportHandlers } from './htmlExportHandlers';
export { registerResourceHandlers } from './resourceHandlers';
export { registerHtmlDependencyHandlers } from './htmlDependencyHandlers';
export { registerCommandHandlers } from './commandHandlers';
