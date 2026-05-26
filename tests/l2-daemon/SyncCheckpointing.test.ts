/**
 * SyncCheckpointing Tests
 *
 * Tests for the sync checkpoint/resume functionality in SyncEngine.
 */

import { EventEmitter } from 'events';

// Mock Database
const mockDb = {
  executeRead: jest.fn(),
  executeReadOne: jest.fn(),
  executeWrite: jest.fn().mockReturnValue({ changes: 1, lastInsertRowid: 1 }),
  exec: jest.fn(),
  transaction: jest.fn((fn) => fn()),
  isWriteLocked: jest.fn().mockReturnValue(false),
  isOpen: true,
  upsert: jest.fn(),
};

// Mock CanvasClient
const mockClient = {
  getAll: jest.fn().mockResolvedValue([]),
  get: jest.fn().mockResolvedValue({ data: null }),
  getBaseUrl: jest.fn().mockReturnValue('https://canvas.example.com'),
  getAuthToken: jest.fn().mockReturnValue('test-token'),
};

// Mock RateLimiter
const mockRateLimiter = {
  enqueue: jest.fn((fn) => fn()),
  stop: jest.fn(),
  on: jest.fn(),
  emit: jest.fn(),
};

// Import after mocks are set up
jest.mock('../../src/layers/l1-persistence/Database', () => ({
  Database: jest.fn().mockImplementation(() => mockDb),
}));

jest.mock('../../src/layers/l2-daemon/client/CanvasClient', () => ({
  CanvasClient: jest.fn().mockImplementation(() => mockClient),
}));

jest.mock('../../src/layers/l2-daemon/resilience/RateLimiter', () => ({
  RateLimiter: jest.fn().mockImplementation(() => mockRateLimiter),
}));

jest.mock('../../src/layers/l2-daemon/sync-engine/SyncConflictResolver', () => ({
  SyncConflictResolver: jest.fn().mockImplementation(() => ({
    ensureTable: jest.fn(),
    getPendingConflicts: jest.fn().mockReturnValue([]),
    checkAndRecordConflict: jest.fn().mockReturnValue(null),
  })),
}));

jest.mock('../../src/layers/l2-daemon/html/HtmlFileExtractor', () => ({
  HtmlFileExtractor: jest.fn().mockImplementation(() => ({
    extract: jest.fn().mockReturnValue([]),
  })),
}));

import {
  SyncEngine,
  SyncCheckpoint,
  SyncOptions,
} from '../../src/layers/l2-daemon/sync-engine/SyncEngine';

describe('SyncCheckpointing', () => {
  let syncEngine: SyncEngine;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock implementations
    mockDb.executeReadOne.mockReturnValue(null);
    mockDb.executeRead.mockReturnValue([]);
    mockDb.isWriteLocked.mockReturnValue(false);
    mockClient.getAll.mockResolvedValue([]);

    syncEngine = new SyncEngine({
      client: mockClient as any,
      db: mockDb as any,
      rateLimiter: mockRateLimiter as any,
    });
  });

  afterEach(() => {
    (syncEngine as any).releaseSyncMutex?.();
  });

  describe('hasResumableSync', () => {
    it('should return false when no checkpoint exists', () => {
      mockDb.executeReadOne.mockReturnValue(null);

      expect(syncEngine.hasResumableSync()).toBe(false);
    });

    it('should return true when incomplete checkpoint exists', () => {
      mockDb.executeReadOne.mockReturnValue({
        sync_id: 'sync-123',
        started_at: new Date().toISOString(),
        phase: 'fetch',
        options_json: '{}',
        fetched_course_ids: '[]',
        fetched_data_json: null,
        total_courses: 5,
        completed_courses: 2,
        last_error: null,
        error_count: 0,
        last_updated_at: new Date().toISOString(),
      });

      expect(syncEngine.hasResumableSync()).toBe(true);
    });
  });

  describe('getIncompleteCheckpoint', () => {
    it('should return null when no checkpoint exists', () => {
      mockDb.executeReadOne.mockReturnValue(null);

      const checkpoint = syncEngine.getIncompleteCheckpoint();

      expect(checkpoint).toBeNull();
    });

    it('should return checkpoint data when one exists', () => {
      const startedAt = new Date().toISOString();
      const lastUpdatedAt = new Date().toISOString();

      mockDb.executeReadOne.mockReturnValue({
        sync_id: 'sync-abc123',
        started_at: startedAt,
        phase: 'fetch',
        options_json: JSON.stringify({ termSelection: 'auto' }),
        fetched_course_ids: JSON.stringify([100, 101]),
        fetched_data_json: JSON.stringify({
          courses: [{ id: 100, name: 'Course 1' }],
          tasks: { 100: [{ id: 1, name: 'Task 1' }] },
          announcements: {},
          modules: {},
          pages: {},
          folders: {},
          files: {},
        }),
        total_courses: 5,
        completed_courses: 2,
        last_error: null,
        error_count: 0,
        last_updated_at: lastUpdatedAt,
      });

      const checkpoint = syncEngine.getIncompleteCheckpoint();

      expect(checkpoint).not.toBeNull();
      expect(checkpoint?.syncId).toBe('sync-abc123');
      expect(checkpoint?.phase).toBe('fetch');
      expect(checkpoint?.fetchedCourseIds).toEqual([100, 101]);
      expect(checkpoint?.fetchedData.courses).toHaveLength(1);
      expect(checkpoint?.totalCourses).toBe(5);
      expect(checkpoint?.completedCourses).toBe(2);
    });

    it('should not return checkpoint with too many errors', () => {
      mockDb.executeReadOne.mockReturnValue(null); // Query excludes error_count >= 3

      const checkpoint = syncEngine.getIncompleteCheckpoint();

      expect(checkpoint).toBeNull();
    });
  });

  describe('clearIncompleteCheckpoints', () => {
    it('should mark incomplete checkpoints as failed', () => {
      syncEngine.clearIncompleteCheckpoints();

      expect(mockDb.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining("SET phase = 'failed'"),
        expect.any(Array),
        'sync_checkpoints'
      );
    });
  });

  describe('syncAll with checkpointing', () => {
    it('should create checkpoint when starting fresh sync', async () => {
      // Mock courses response
      mockClient.getAll.mockResolvedValueOnce([
        { id: 100, name: 'Course 1', course_code: 'CS101' },
        { id: 101, name: 'Course 2', course_code: 'CS102' },
      ]);

      // Mock user preferences for target grade
      mockDb.executeReadOne.mockImplementation((query: string) => {
        if (query.includes('user_preferences')) {
          return null;
        }
        if (query.includes('courses WHERE external_id')) {
          return { id: 1 };
        }
        return null;
      });

      await syncEngine.syncAll({ termSelection: 'all' });

      // Should have created a checkpoint
      expect(mockDb.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO sync_checkpoints'),
        expect.any(Array),
        'sync_checkpoints'
      );
    });

    it('should emit sync-progress events during sync', async () => {
      const progressEvents: any[] = [];
      syncEngine.on('sync-progress', (data) => progressEvents.push(data));

      mockClient.getAll.mockResolvedValueOnce([
        { id: 100, name: 'Course 1', course_code: 'CS101' },
      ]);

      await syncEngine.syncAll();

      expect(progressEvents.length).toBeGreaterThan(0);
      expect(progressEvents[0]).toHaveProperty('syncId');
      expect(progressEvents[0]).toHaveProperty('phase', 'fetch');
    });

    it('should complete checkpoint after successful sync', async () => {
      mockClient.getAll.mockResolvedValueOnce([]);

      await syncEngine.syncAll();

      // Should have marked checkpoint as completed
      expect(mockDb.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining("SET phase = 'completed'"),
        expect.any(Array),
        'sync_checkpoints'
      );
    });

    it('should emit sync-start with syncId and resuming flag', async () => {
      const startEvents: any[] = [];
      syncEngine.on('sync-start', (data) => startEvents.push(data));

      mockClient.getAll.mockResolvedValueOnce([]);

      await syncEngine.syncAll();

      expect(startEvents).toHaveLength(1);
      expect(startEvents[0]).toHaveProperty('syncId');
      expect(startEvents[0]).toHaveProperty('resuming', false);
    });
  });

  describe('syncAll with resume', () => {
    it('should resume from checkpoint when option is set', async () => {
      // Set up a checkpoint to resume from
      mockDb.executeReadOne.mockImplementation((query: string) => {
        if (query.includes('sync_checkpoints')) {
          return {
            sync_id: 'sync-resume-123',
            started_at: new Date().toISOString(),
            phase: 'fetch',
            options_json: JSON.stringify({ termSelection: 'all' }),
            fetched_course_ids: JSON.stringify([100]),
            fetched_data_json: JSON.stringify({
              courses: [
                { id: 100, name: 'Course 1', course_code: 'CS101' },
                { id: 101, name: 'Course 2', course_code: 'CS102' },
              ],
              tasks: { 100: [] },
              announcements: {},
              modules: { 100: [] },
              pages: { 100: [] },
              folders: {},
              files: {},
            }),
            total_courses: 2,
            completed_courses: 1,
            last_error: null,
            error_count: 0,
            last_updated_at: new Date().toISOString(),
          };
        }
        return null;
      });

      const resumeEvents: any[] = [];
      syncEngine.on('sync-resume', (data) => resumeEvents.push(data));

      await syncEngine.syncAll({ resumeFromCheckpoint: true });

      // Should have emitted resume event
      expect(resumeEvents).toHaveLength(1);
      expect(resumeEvents[0].syncId).toBe('sync-resume-123');
    });

    it('should skip already-fetched courses when resuming', async () => {
      // Set up checkpoint with course 100 already fetched
      mockDb.executeReadOne.mockImplementation((query: string) => {
        if (query.includes('sync_checkpoints')) {
          return {
            sync_id: 'sync-resume-456',
            started_at: new Date().toISOString(),
            phase: 'fetch',
            options_json: '{}',
            fetched_course_ids: JSON.stringify([100]),
            fetched_data_json: JSON.stringify({
              courses: [
                { id: 100, name: 'Course 1', course_code: 'CS101' },
                { id: 101, name: 'Course 2', course_code: 'CS102' },
              ],
              tasks: { 100: [{ id: 1 }] },
              announcements: { 100: [] },
              modules: { 100: [] },
              pages: { 100: [] },
              folders: {},
              files: {},
            }),
            total_courses: 2,
            completed_courses: 1,
            last_error: null,
            error_count: 0,
            last_updated_at: new Date().toISOString(),
          };
        }
        return null;
      });

      // Count how many times we fetch assignments per course
      let assignmentFetchCount = 0;
      mockRateLimiter.enqueue.mockImplementation((fn: () => Promise<any>) => {
        const result = fn();
        return result;
      });

      mockClient.getAll.mockImplementation((endpoint: string) => {
        if (endpoint.includes('/assignments')) {
          assignmentFetchCount++;
        }
        return Promise.resolve([]);
      });

      await syncEngine.syncAll({ resumeFromCheckpoint: true });

      // Should only fetch assignments for course 101 (not 100 which was already fetched)
      expect(assignmentFetchCount).toBe(1);
    });

    it('should start fresh when no checkpoint available', async () => {
      mockDb.executeReadOne.mockReturnValue(null);

      const startEvents: any[] = [];
      syncEngine.on('sync-start', (data) => startEvents.push(data));

      mockClient.getAll.mockResolvedValueOnce([]);

      await syncEngine.syncAll({ resumeFromCheckpoint: true });

      expect(startEvents).toHaveLength(1);
      expect(startEvents[0].resuming).toBe(false);
    });
  });

  describe('checkpoint error handling', () => {
    it('should mark checkpoint as failed on fetch error', async () => {
      mockClient.getAll.mockRejectedValueOnce(new Error('Network error'));

      try {
        await syncEngine.syncAll();
      } catch {
        // Expected to fail
      }

      // Should have marked checkpoint as failed
      expect(mockDb.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining("SET phase = 'failed'"),
        expect.arrayContaining(['Network error']),
        'sync_checkpoints'
      );
    });

    it('should preserve checkpoint data on partial failure', async () => {
      // First course succeeds, second fails
      let callCount = 0;
      mockClient.getAll.mockImplementation((endpoint: string) => {
        if (endpoint === '/courses') {
          return Promise.resolve([
            { id: 100, name: 'Course 1', course_code: 'CS101' },
            { id: 101, name: 'Course 2', course_code: 'CS102' },
          ]);
        }
        callCount++;
        if (callCount > 4) {
          // Fail on second course's fetches
          return Promise.reject(new Error('Partial failure'));
        }
        return Promise.resolve([]);
      });

      try {
        await syncEngine.syncAll();
      } catch {
        // May or may not throw depending on error handling
      }

      // Should have saved progress for first course
      const updateCalls = mockDb.executeWrite.mock.calls.filter((call) =>
        call[0].includes('UPDATE sync_checkpoints')
      );
      expect(updateCalls.length).toBeGreaterThan(0);
    });
  });
});
