/**
 * Repositories - Data Access Layer
 *
 * Repositories encapsulate all database operations for each entity type.
 * They handle SQL queries and row-to-entity mapping.
 */

export { BaseRepository } from './BaseRepository';
export type { CourseRow, TaskRow, PolicyRow, NotificationRow } from './BaseRepository';

export { CourseRepository } from './CourseRepository';
export type { CourseUpdates } from './CourseRepository';

export { TaskRepository } from './TaskRepository';
export type { TaskUpdates, CreateTaskParams } from './TaskRepository';

export { PolicyRepository } from './PolicyRepository';
export type {
  PolicyConfig,
  GraceTokenConfig,
  PolicyUpdates,
  CreatePolicyParams,
} from './PolicyRepository';

export { NotificationRepository } from './NotificationRepository';
export type { NotificationUpdates } from './NotificationRepository';
