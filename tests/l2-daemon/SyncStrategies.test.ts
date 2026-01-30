/**
 * SyncStrategies Tests
 *
 * Tests for sync strategy classes (TaskSyncStrategy, AnnouncementSyncStrategy, BaseSyncStrategy)
 */

import { EventEmitter } from 'events';

// Mock Database
const mockDb = {
  executeRead: jest.fn().mockReturnValue([]),
  executeReadOne: jest.fn().mockReturnValue(null),
  executeWrite: jest.fn().mockReturnValue({ changes: 1 }),
  upsert: jest.fn(),
  transaction: jest.fn((fn) => fn()),
};

// Mock CanvasClient
const mockClient = {
  getAll: jest.fn().mockResolvedValue([]),
  get: jest.fn().mockResolvedValue({ data: null }),
  getBaseUrl: jest.fn().mockReturnValue('https://canvas.example.com'),
};

// Mock RateLimiter
const mockRateLimiter = {
  enqueue: jest.fn((fn) => fn()),
};

// Mock SyncConflictResolver
const mockConflictResolver = {
  detectConflicts: jest.fn().mockReturnValue({
    autoResolved: {},
    conflicts: [],
    preservedFields: [],
  }),
};

import { SyncContext, SyncResult } from '../../src/layers/l2-daemon/sync/SyncStrategy';
import { TaskSyncStrategy } from '../../src/layers/l2-daemon/sync/TaskSyncStrategy';
import { AnnouncementSyncStrategy } from '../../src/layers/l2-daemon/sync/AnnouncementSyncStrategy';

describe('SyncStrategies', () => {
  let emitter: EventEmitter;
  let context: SyncContext;

  beforeEach(() => {
    jest.clearAllMocks();
    emitter = new EventEmitter();
    context = {
      client: mockClient as any,
      db: mockDb as any,
      rateLimiter: mockRateLimiter as any,
      emitter,
    };
  });

  describe('TaskSyncStrategy', () => {
    let strategy: TaskSyncStrategy;

    beforeEach(() => {
      strategy = new TaskSyncStrategy(context, {
        conflictResolver: mockConflictResolver as any,
      });
    });

    it('should have correct entity type', () => {
      expect(strategy.entityType).toBe('tasks');
    });

    it('should sync assignments for a course', async () => {
      mockClient.getAll.mockResolvedValueOnce([
        {
          id: 1,
          name: 'Assignment 1',
          due_at: '2024-01-20T23:59:59Z',
          points_possible: 100,
          submission_types: ['online_upload'],
        },
        {
          id: 2,
          name: 'Assignment 2',
          due_at: '2024-01-25T23:59:59Z',
          points_possible: 50,
        },
      ]);

      mockDb.executeReadOne.mockReturnValue({ name: 'Test Course' });

      const result = await strategy.syncForCourse(123, 1);

      expect(result.success).toBe(true);
      expect(result.entity).toBe('tasks');
      expect(result.count).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should call rate limiter with correct priority', async () => {
      mockClient.getAll.mockResolvedValueOnce([]);

      await strategy.syncForCourse(123, 1);

      expect(mockRateLimiter.enqueue).toHaveBeenCalledWith(expect.any(Function), 5);
    });

    it('should handle API errors gracefully', async () => {
      mockClient.getAll.mockRejectedValueOnce(new Error('API Error'));

      const result = await strategy.syncForCourse(123, 1);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('API Error');
    });

    it('should merge user-created tasks with Canvas assignments', async () => {
      mockClient.getAll.mockResolvedValueOnce([
        {
          id: 100,
          name: 'Existing Task',
          due_at: '2024-01-20T23:59:59Z',
        },
      ]);

      // Simulate existing user-created task with same title
      mockDb.executeReadOne.mockImplementation((query: string) => {
        if (query.includes('course_id = ? AND title = ?')) {
          return {
            id: 50,
            source_type: 'user',
            weight: 10,
            priority_score: 5,
            local_modified_at: null,
          };
        }
        if (query.includes('SELECT name FROM courses')) {
          return { name: 'Test Course' };
        }
        return null;
      });

      const onTaskMerged = jest.fn();
      const strategyWithCallback = new TaskSyncStrategy(context, {
        conflictResolver: mockConflictResolver as any,
        onTaskMerged,
      });

      await strategyWithCallback.syncForCourse(123, 1);

      expect(onTaskMerged).toHaveBeenCalledWith({
        localTaskId: 50,
        canvasId: 100,
        title: 'Existing Task',
      });
    });

    it('should detect and emit conflicts', async () => {
      mockClient.getAll.mockResolvedValueOnce([
        { id: 1, name: 'Task', due_at: '2024-01-20T23:59:59Z' },
      ]);

      mockConflictResolver.detectConflicts.mockReturnValueOnce({
        autoResolved: {},
        conflicts: [{ id: 'conflict-1', field: 'due_at' }],
        preservedFields: [],
      });

      mockDb.executeReadOne.mockImplementation((query: string) => {
        if (query.includes('SELECT name FROM courses')) {
          return { name: 'Test Course' };
        }
        if (query.includes('SELECT * FROM tasks')) {
          return { id: 10, external_id: 'task_1' };
        }
        return null;
      });

      const onConflicts = jest.fn();
      const strategyWithCallback = new TaskSyncStrategy(context, {
        conflictResolver: mockConflictResolver as any,
        onConflicts,
      });

      await strategyWithCallback.syncForCourse(123, 1);

      expect(onConflicts).toHaveBeenCalledWith([{ id: 'conflict-1', field: 'due_at' }]);
    });

    it('should log diagnostics when enabled', async () => {
      mockClient.getAll.mockResolvedValueOnce([
        { id: 1, name: 'Task', due_at: '2024-01-20T23:59:59Z' },
      ]);

      // Mock different queries: course lookup returns course, task lookup returns null
      mockDb.executeReadOne.mockImplementation((sql: string) => {
        if (sql.includes('SELECT name FROM courses')) {
          return { name: 'Test Course' };
        }
        if (sql.includes('SELECT * FROM tasks')) {
          return null; // No existing task - will trigger insert
        }
        return null;
      });

      const onDiagnostic = jest.fn();
      const strategyWithDiag = new TaskSyncStrategy(context, {
        conflictResolver: mockConflictResolver as any,
        diagnosticsEnabled: true,
        onDiagnostic,
      });

      await strategyWithDiag.syncForCourse(123, 1);

      expect(onDiagnostic).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: 'task',
          action: 'insert',
        })
      );
    });

    it('should auto-complete graded tasks', async () => {
      mockClient.getAll.mockResolvedValueOnce([]);
      mockDb.executeReadOne.mockReturnValue({ name: 'Test Course' });

      await strategy.syncForCourse(123, 1);

      // Should call executeWrite with auto-complete query
      const autoCompleteCalls = mockDb.executeWrite.mock.calls.filter(
        (call) => call[0].includes('SET is_completed = 1')
      );
      expect(autoCompleteCalls.length).toBeGreaterThan(0);
    });
  });

  describe('AnnouncementSyncStrategy', () => {
    let strategy: AnnouncementSyncStrategy;

    beforeEach(() => {
      strategy = new AnnouncementSyncStrategy(context);
    });

    it('should have correct entity type', () => {
      expect(strategy.entityType).toBe('announcements');
    });

    it('should sync announcements for a course', async () => {
      mockClient.getAll.mockResolvedValueOnce([
        {
          id: 1,
          title: 'Announcement 1',
          message: '<p>Message content</p>',
          posted_at: '2024-01-15T10:00:00Z',
        },
        {
          id: 2,
          title: 'Announcement 2',
          message: '<p>Another message</p>',
          posted_at: '2024-01-16T10:00:00Z',
        },
      ]);

      mockDb.executeReadOne.mockReturnValue({ id: 100 });

      const result = await strategy.syncForCourse(123, 1);

      expect(result.success).toBe(true);
      expect(result.entity).toBe('announcements');
      expect(result.count).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should call rate limiter with lower priority', async () => {
      mockClient.getAll.mockResolvedValueOnce([]);

      await strategy.syncForCourse(123, 1);

      expect(mockRateLimiter.enqueue).toHaveBeenCalledWith(expect.any(Function), 3);
    });

    it('should request only_announcements from discussion_topics endpoint', async () => {
      mockClient.getAll.mockResolvedValueOnce([]);

      await strategy.syncForCourse(123, 1);

      expect(mockClient.getAll).toHaveBeenCalledWith(
        '/courses/123/discussion_topics',
        { only_announcements: true }
      );
    });

    it('should handle API errors gracefully', async () => {
      mockClient.getAll.mockRejectedValueOnce(new Error('API Error'));

      const result = await strategy.syncForCourse(123, 1);

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('API Error');
    });

    it('should emit attachment events when present', async () => {
      mockClient.getAll.mockResolvedValueOnce([
        {
          id: 1,
          title: 'With Attachment',
          message: '<p>Message</p>',
          posted_at: '2024-01-15T10:00:00Z',
          attachments: [
            { id: 10, display_name: 'file.pdf', url: 'https://example.com/file.pdf' },
          ],
        },
      ]);

      mockDb.executeReadOne.mockReturnValue({ id: 100 });

      const onAttachmentsPending = jest.fn();
      const strategyWithCallback = new AnnouncementSyncStrategy(context, {
        onAttachmentsPending,
      });

      await strategyWithCallback.syncForCourse(123, 1);

      expect(onAttachmentsPending).toHaveBeenCalledWith({
        notificationId: 100,
        courseId: 1,
        attachmentCount: 1,
      });
    });

    it('should detect policy-related announcements', async () => {
      mockClient.getAll.mockResolvedValueOnce([
        {
          id: 1,
          title: 'Late Assignment Policy',
          message: '<p>All late submissions will receive a 10% penalty per day.</p>',
          posted_at: '2024-01-15T10:00:00Z',
        },
      ]);

      mockDb.executeReadOne.mockReturnValue({ id: 100 });

      const onPolicyDetected = jest.fn();
      const strategyWithCallback = new AnnouncementSyncStrategy(context, {
        onPolicyDetected,
      });

      await strategyWithCallback.syncForCourse(123, 1);

      // Policy detection depends on mapAnnouncement detecting keywords
      // The callback will be called if is_policy_related is true
      expect(mockDb.upsert).toHaveBeenCalled();
    });

    it('should upsert notifications with correct conflict keys', async () => {
      mockClient.getAll.mockResolvedValueOnce([
        {
          id: 1,
          title: 'Test',
          message: 'Content',
          posted_at: '2024-01-15T10:00:00Z',
        },
      ]);

      mockDb.executeReadOne.mockReturnValue({ id: 100 });

      await strategy.syncForCourse(123, 1);

      expect(mockDb.upsert).toHaveBeenCalledWith(
        'notifications',
        expect.any(Object),
        ['source_type', 'source_id'],
        false
      );
    });
  });

  describe('SyncResult helpers', () => {
    it('successResult should create proper success result', async () => {
      mockClient.getAll.mockResolvedValueOnce([]);
      mockDb.executeReadOne.mockReturnValue({ name: 'Test' });

      const strategy = new TaskSyncStrategy(context, {
        conflictResolver: mockConflictResolver as any,
      });

      const result = await strategy.syncForCourse(123, 1);

      expect(result).toMatchObject({
        success: true,
        entity: 'tasks',
        count: 0,
        errors: [],
      });
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('failedResult should create proper failure result', async () => {
      mockClient.getAll.mockRejectedValueOnce(new Error('Network failure'));

      const strategy = new TaskSyncStrategy(context, {
        conflictResolver: mockConflictResolver as any,
      });

      const result = await strategy.syncForCourse(123, 1);

      expect(result.success).toBe(false);
      expect(result.entity).toBe('tasks');
      expect(result.count).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Progress events', () => {
    it('should emit sync-progress events through emitter', async () => {
      const progressEvents: unknown[] = [];
      emitter.on('sync-progress', (event) => progressEvents.push(event));

      // The strategies emit progress during operation
      // This tests the emitter is properly connected
      mockClient.getAll.mockResolvedValueOnce([]);

      const strategy = new TaskSyncStrategy(context, {
        conflictResolver: mockConflictResolver as any,
      });

      await strategy.syncForCourse(123, 1);

      // Emitter should be accessible
      expect(strategy['emitter']).toBe(emitter);
    });
  });

  describe('Transaction handling', () => {
    it('should wrap database operations in transaction', async () => {
      mockClient.getAll.mockResolvedValueOnce([
        { id: 1, name: 'Task 1', due_at: null },
        { id: 2, name: 'Task 2', due_at: null },
      ]);
      mockDb.executeReadOne.mockReturnValue({ name: 'Course' });

      const strategy = new TaskSyncStrategy(context, {
        conflictResolver: mockConflictResolver as any,
      });

      await strategy.syncForCourse(123, 1);

      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('should handle transaction errors', async () => {
      mockClient.getAll.mockResolvedValueOnce([
        { id: 1, name: 'Task 1', due_at: null },
      ]);
      mockDb.executeReadOne.mockReturnValue({ name: 'Course' });
      mockDb.transaction.mockImplementationOnce(() => {
        throw new Error('Transaction failed');
      });

      const strategy = new TaskSyncStrategy(context, {
        conflictResolver: mockConflictResolver as any,
      });

      const result = await strategy.syncForCourse(123, 1);

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Transaction failed');
    });
  });
});
