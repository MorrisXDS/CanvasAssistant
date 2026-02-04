/**
 * Repositories - Data Access Layer
 *
 * Repositories encapsulate all database operations for each entity type.
 * They handle SQL queries and row-to-entity mapping.
 *
 * NOTE: Row types are now centralized in DatabaseRowTypes.ts
 */

export { BaseRepository } from './BaseRepository';
// Row types moved to ../DatabaseRowTypes.ts for single source of truth

export { CourseRepository } from './CourseRepository';
export type { CourseUpdates } from './CourseRepository';

export { TaskRepository } from './TaskRepository';
export type { TaskUpdates, CreateTaskParams } from './TaskRepository';

export { NotificationRepository } from './NotificationRepository';
export type { NotificationUpdates } from './NotificationRepository';
