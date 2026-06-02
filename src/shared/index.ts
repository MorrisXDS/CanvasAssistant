/**
 * Shared Module - IPC Contract and Utilities
 *
 * Single source of truth for types shared between main and renderer.
 */

// Entity schemas and types
export {
  // Status enums
  SyncStatusSchema,
  DownloadStatusSchema,
  HealthProbeStatusSchema,
  PowerSourceSchema,
  CalendarSourceTypeSchema,
  UrgencyLevelSchema,

  // Core entities
  CourseSchema,
  CourseDetailSchema,
  EnrollmentTermSchema,
  TaskSchema,
  NotificationSchema,
  NotificationAttachmentSchema,
  AnnouncementFileReferenceSchema,
  GradeHistoryEntrySchema,

  // Simulation
  SimulatedGradeSchema,
  SimulationStateSchema,

  // System
  HealthStatusSchema,
  SystemStateSchema,

  // Calendar
  ImportedCalendarSchema,
  ExternalCalendarEventSchema,
  DisplayCalendarEventSchema,
  ParsedICSEventSchema,
  ICSImportPreviewSchema,

  // Dashboard views
  PriorityItemSchema,
  CourseSummarySchema,

  // Files
  FileResourceSchema,
  FileAttachmentSchema,
  FilesDataSchema,

  // User
  UserProfileSchema,

  // Events
  SimulationChangeEventSchema,
  DbCommitEventSchema,
  SyncResultSummarySchema,

  // API Result
  ApiResultSchema,

  // Contract definitions
  IpcContract,
  PushEventContract,
  OneWayContract,
} from './ipc-contract';

// Type exports
export type {
  // Status types
  SyncStatus,

  // Core entities
  Course,
  CourseDetail,
  EnrollmentTerm,
  Task,
  Notification,
  NotificationAttachment,
  AnnouncementFileReference,
  GradeHistoryEntry,

  // Simulation
  SimulatedGrade,
  SimulationState,

  // System
  HealthStatus,
  SystemState,

  // Calendar
  ImportedCalendar,
  ExternalCalendarEvent,
  DisplayCalendarEvent,
  ParsedICSEvent,
  ICSImportPreview,

  // Dashboard views
  PriorityItem,
  CourseSummary,

  // Files
  FileResource,
  FileAttachment,
  FilesData,

  // User
  UserProfile,

  // Events
  SimulationChangeEvent,
  DbCommitEvent,
  SyncResultSummary,

  // API Result
  ApiResult,

  // IPC types
  IpcChannel,
  IpcParams,
  IpcResult,
  PushEventChannel,
  PushEventPayload,
  OneWayChannel,
  OneWayParams,
} from './ipc-contract';

// Client utilities (for preload.ts)
export { createIpcClient } from './ipc-client';

export type { IpcClient, TypedApi } from './ipc-client';

// Handler utilities (for main.ts)
export { createIpcRegistry, createEventPusher, success, failure } from './ipc-handlers';

export type { IpcHandler, OneWayHandler, IpcRegistry, EventPusher } from './ipc-handlers';
