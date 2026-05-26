/**
 * Test Utilities
 *
 * Common helpers and mocks for testing.
 */

export {
  createTestRegistry,
  createTestDatabase,
  MockLogger,
  MockMetricsCollector,
  MockHealthCheck,
} from './TestRegistry';

export type { TestRegistryOptions } from './TestRegistry';

export {
  mockCanvasAssignment,
  mockCanvasCourse,
  seedCourse,
  seedTask,
  seedQueueEntry,
  readQueue,
  readTasks,
  readConflicts,
  readLinkSuggestions,
} from './syncScenarios';

export type {
  MockAssignmentOptions,
  MockCourseOptions,
  SeedTaskOptions,
  SeedQueueEntryOptions,
  QueueRow,
  TaskRow,
  ConflictRow,
  LinkSuggestionRow,
} from './syncScenarios';
