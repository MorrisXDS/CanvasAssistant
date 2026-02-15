/**
 * Data Mappers - Transform Canvas API responses to local database schema
 *
 * FACADE: This file re-exports from submodules for backward compatibility.
 * New code should import directly from submodules when possible.
 */

// Re-export all types from DataMapperTypes for backward compatibility
export type {
  CanvasTerm,
  CanvasCourse,
  CanvasSubmission,
  CanvasAssignment,
  CanvasAttachment,
  CanvasAnnouncement,
  CanvasModule,
  CanvasModuleItem,
  CanvasPage,
  CanvasFile,
  CanvasFolder,
  LocalCourse,
  LocalTask,
  LocalNotification,
  LocalNotificationAttachment,
  LocalModule,
  LocalModuleItem,
  LocalPage,
  LocalResource,
  MappedAnnouncement,
  FileReference,
  LocalCanvasTaskQueue,
} from './DataMapperTypes';

// Course mappers
export {
  safeParse,
  mapAttachment,
  getDefaultCreditsFromCode,
  mapCourse,
} from './courseMappers';

// Task mappers
export { mapAssignment, _deriveTaskType, mapAssignmentToQueueEntry } from './taskMappers';

// Content mappers
export { mapAnnouncement, mapModule, mapModuleItem, mapPage } from './contentMappers';

// File mappers
export { mapFile, mapFolder } from './fileMappers';

// HTML parsing utilities
export {
  htmlToPlainText,
  extractHtmlLinks,
  detectFileReferences,
} from './htmlParsingUtils';

// Policy detection
export {
  POLICY_KEYWORDS,
  detectPolicyKeywords,
  calculatePolicyConfidence,
} from './policyDetection';
