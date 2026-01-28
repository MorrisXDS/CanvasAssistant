/**
 * SyncConflictResolver Tests
 * Tests for sync conflict preference expiration
 */

import { SyncConflictResolver, SyncPreference } from '../../src/layers/l2-daemon/SyncConflictResolver';

// Mock Database
const mockDb = {
  executeRead: jest.fn(),
  executeReadOne: jest.fn(),
  executeWrite: jest.fn(),
  exec: jest.fn(),
};

describe('SyncConflictResolver', () => {
  let resolver: SyncConflictResolver;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.executeRead.mockReturnValue([]);
    // @ts-expect-error - mock database
    resolver = new SyncConflictResolver(mockDb);
  });

  describe('preference expiration', () => {
    it('should return preference that has not expired', () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // Tomorrow
      const pref: SyncPreference = {
        entity: 'task',
        entityId: 1,
        field: 'grade',
        preferCanvas: false,
        createdAt: new Date().toISOString(),
        expiresAt: futureDate,
      };

      mockDb.executeRead.mockReturnValue([pref]);
      // @ts-expect-error - mock database
      resolver = new SyncConflictResolver(mockDb);

      const result = resolver.getPreference('task', 1, 'grade');
      expect(result).not.toBeNull();
      expect(result?.preferCanvas).toBe(false);
    });

    it('should return null and delete preference that has expired', () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // Yesterday
      const pref: SyncPreference = {
        entity: 'task',
        entityId: 1,
        field: 'grade',
        preferCanvas: false,
        createdAt: new Date().toISOString(),
        expiresAt: pastDate,
      };

      mockDb.executeRead.mockReturnValue([pref]);
      // @ts-expect-error - mock database
      resolver = new SyncConflictResolver(mockDb);

      const result = resolver.getPreference('task', 1, 'grade');
      expect(result).toBeNull();
      // Should have called delete
      expect(mockDb.executeWrite).toHaveBeenCalledWith(
        'DELETE FROM sync_preferences WHERE entity = ? AND entity_id IS ? AND field = ?',
        ['task', 1, 'grade'],
        'sync_preferences'
      );
    });

    it('should return preference with null expiresAt (never expires)', () => {
      const pref: SyncPreference = {
        entity: 'task',
        entityId: 1,
        field: 'grade',
        preferCanvas: true,
        createdAt: new Date().toISOString(),
        expiresAt: null,
      };

      mockDb.executeRead.mockReturnValue([pref]);
      // @ts-expect-error - mock database
      resolver = new SyncConflictResolver(mockDb);

      const result = resolver.getPreference('task', 1, 'grade');
      expect(result).not.toBeNull();
      expect(result?.preferCanvas).toBe(true);
    });

    it('should check global preference expiration', () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const globalPref: SyncPreference = {
        entity: 'task',
        entityId: null, // Global preference
        field: 'grade',
        preferCanvas: false,
        createdAt: new Date().toISOString(),
        expiresAt: pastDate,
      };

      mockDb.executeRead.mockReturnValue([globalPref]);
      // @ts-expect-error - mock database
      resolver = new SyncConflictResolver(mockDb);

      const result = resolver.getPreference('task', 999, 'grade');
      expect(result).toBeNull();
      // Should have called delete with null entityId
      expect(mockDb.executeWrite).toHaveBeenCalledWith(
        'DELETE FROM sync_preferences WHERE entity = ? AND entity_id IS ? AND field = ?',
        ['task', null, 'grade'],
        'sync_preferences'
      );
    });
  });

  describe('resolveConflict with expiration', () => {
    it('should save preference with expiresAt when rememberChoice is true', () => {
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      // Setup a pending conflict
      mockDb.executeRead.mockReturnValue([]);
      // @ts-expect-error - mock database
      resolver = new SyncConflictResolver(mockDb);

      // Add a conflict manually for testing
      const conflict = {
        id: 'task-123-grade-1',
        entity: 'task' as const,
        entityId: 1,
        externalId: '123',
        entityName: 'Test Task',
        field: 'grade',
        fieldLabel: 'Grade',
        localValue: 85,
        canvasValue: 90,
        timestamp: new Date().toISOString(),
      };
      // @ts-expect-error - accessing private member for testing
      resolver.pendingConflicts.set(conflict.id, conflict);

      resolver.resolveConflict({
        conflictId: conflict.id,
        useCanvasValue: false,
        rememberChoice: true,
        rememberForAll: false,
        expiresAt,
      });

      // Check that savePreference was called with expiresAt
      expect(mockDb.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO sync_preferences'),
        expect.arrayContaining([expiresAt]),
        'sync_preferences'
      );
    });
  });

  describe('course information in conflicts', () => {
    it('should include course info when detecting task conflicts', () => {
      mockDb.executeRead.mockReturnValue([]);
      // @ts-expect-error - mock database
      resolver = new SyncConflictResolver(mockDb);

      // Use 'title' field - it's a Canvas-provided field but NOT authoritative
      // (grade, due_at, etc. are authoritative and auto-resolve without conflict)
      const localRecord = {
        id: 1,
        title: 'My Custom Title',
        local_modified_fields: '["title"]',
        field_sources: '{"title": "user"}',
      };

      const canvasData = {
        title: 'Canvas Title',
      };

      const { conflicts } = resolver.detectConflicts(
        'task',
        'tasks',
        1,
        '123',
        'Test Assignment',
        localRecord,
        canvasData,
        { courseName: 'Introduction to Programming', courseId: 42 }
      );

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].courseName).toBe('Introduction to Programming');
      expect(conflicts[0].courseId).toBe(42);
    });

    it('should persist course info to pending conflicts', () => {
      mockDb.executeRead.mockReturnValue([]);
      // @ts-expect-error - mock database
      resolver = new SyncConflictResolver(mockDb);

      // Use 'title' field - not authoritative, can create conflict
      const localRecord = {
        id: 1,
        title: 'My Custom Title',
        local_modified_fields: '["title"]',
        field_sources: '{"title": "user"}',
      };

      const canvasData = {
        title: 'Canvas Title',
      };

      resolver.detectConflicts(
        'task',
        'tasks',
        1,
        '123',
        'Test Assignment',
        localRecord,
        canvasData,
        { courseName: 'Math 101', courseId: 5 }
      );

      // Check that saveConflict was called with course info
      expect(mockDb.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO pending_sync_conflicts'),
        expect.arrayContaining(['Math 101', 5]),
        'pending_sync_conflicts'
      );
    });

    it('should update existing conflict instead of creating duplicate', () => {
      mockDb.executeRead.mockReturnValue([]);
      // @ts-expect-error - mock database
      resolver = new SyncConflictResolver(mockDb);

      // Use 'title' field - not authoritative, can create conflict
      const localRecord = {
        id: 1,
        title: 'My Custom Title',
        local_modified_fields: '["title"]',
        field_sources: '{"title": "user"}',
      };

      // First sync - creates conflict
      const result1 = resolver.detectConflicts(
        'task',
        'tasks',
        1,
        '123',
        'Test Assignment',
        localRecord,
        { title: 'Canvas Title v1' },
        { courseName: 'Math 101', courseId: 5 }
      );

      expect(result1.conflicts).toHaveLength(1);
      const firstConflictId = result1.conflicts[0].id;

      // Second sync - should update existing conflict, not create new one
      const result2 = resolver.detectConflicts(
        'task',
        'tasks',
        1,
        '123',
        'Test Assignment',
        localRecord,
        { title: 'Canvas Title v2' }, // Different canvas value
        { courseName: 'Math 101', courseId: 5 }
      );

      expect(result2.conflicts).toHaveLength(1);
      // Should be the same conflict ID (updated, not new)
      expect(result2.conflicts[0].id).toBe(firstConflictId);
      // Should have updated canvas value
      expect(result2.conflicts[0].canvasValue).toBe('Canvas Title v2');

      // Total pending conflicts should still be 1
      expect(resolver.getPendingConflicts()).toHaveLength(1);
    });
  });
});
