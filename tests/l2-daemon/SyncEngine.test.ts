import { SyncEngine } from '../../src/layers/l2-daemon/SyncEngine';
import { CanvasClient } from '../../src/layers/l2-daemon/CanvasClient';
import { RateLimiter } from '../../src/layers/l2-daemon/RateLimiter';
import { Database } from '../../src/layers/l1-persistence/Database';
import { MigrationRunner, coreMigrations } from '../../src/layers/l1-persistence/MigrationRunner';
import path from 'path';
import fs from 'fs';

describe('SyncEngine', () => {
  let db: Database;
  let client: CanvasClient;
  let rateLimiter: RateLimiter;
  let syncEngine: SyncEngine;
  const testDbPath = path.join(__dirname, '../../test-data/sync-test.db');

  // Mock client methods
  let mockGetAll: jest.SpyInstance;
  let mockGet: jest.SpyInstance;

  beforeAll(() => {
    // Ensure test directory exists
    const testDir = path.dirname(testDbPath);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  beforeEach(() => {
    // Clean up previous test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testDbPath + '-wal')) {
      fs.unlinkSync(testDbPath + '-wal');
    }
    if (fs.existsSync(testDbPath + '-shm')) {
      fs.unlinkSync(testDbPath + '-shm');
    }

    // Initialize database with migrations
    db = new Database({ dbPath: testDbPath });
    db.initialize();

    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();

    // Create a mock client
    client = {
      getAll: jest.fn(),
      get: jest.fn(),
      getBaseUrl: () => 'https://q.utoronto.ca',
    } as unknown as CanvasClient;

    mockGetAll = client.getAll as jest.Mock;
    mockGet = client.get as jest.Mock;

    // Fast rate limiter for tests
    rateLimiter = new RateLimiter({
      maxConcurrent: 5,
      minDelayMs: 0,
      maxRetries: 0,
      baseBackoffMs: 10,
    });

    syncEngine = new SyncEngine({
      client,
      db,
      rateLimiter,
    });
  });

  afterEach(() => {
    rateLimiter.stop();
    db.close();
  });

  describe('Course sync', () => {
    it('should sync courses from Canvas', async () => {
      const mockCourses = [
        {
          id: 12345,
          name: 'Introduction to Computer Science',
          course_code: 'CSC108',
          enrollment_term_id: 1,
          default_view: 'modules',
          enrollments: [{ type: 'student', computed_current_score: 87.5 }],
        },
        {
          id: 12346,
          name: 'Linear Algebra',
          course_code: 'MAT223',
          enrollment_term_id: 1,
          default_view: 'syllabus',
        },
      ];

      mockGetAll.mockResolvedValue(mockCourses);

      const result = await syncEngine.syncCourses();

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
      expect(result.errors).toHaveLength(0);

      // Verify courses in database
      const courses = db.executeRead<{ code: string; current_grade: number | null }>(
        'SELECT code, current_grade FROM courses ORDER BY code'
      );
      expect(courses).toHaveLength(2);
      expect(courses[0].code).toBe('CSC108');
      expect(courses[0].current_grade).toBe(87.5);
      expect(courses[1].code).toBe('MAT223');
      expect(courses[1].current_grade).toBeNull();
    });

    it('should handle sync errors gracefully', async () => {
      mockGetAll.mockRejectedValue(new Error('Network error'));

      const result = await syncEngine.syncCourses();

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Network error');
    });
  });

  describe('Task sync', () => {
    beforeEach(() => {
      // Insert a test course
      db.executeWrite(
        'INSERT INTO courses (external_id, code, name) VALUES (?, ?, ?)',
        ['12345', 'CSC108', 'Intro to CS'],
        'courses'
      );
    });

    it('should merge local user-created task with Canvas task of same name', async () => {
      // Insert a user-created task with same name as the Canvas assignment
      db.executeWrite(
        `INSERT INTO tasks (source_type, course_id, title, description, weight, priority_score)
         VALUES ('user', 1, 'Problem Set 3', 'My local notes', 10.0, 50.0)`,
        [],
        'tasks'
      );

      const mockAssignments = [
        {
          id: 98765,
          name: 'Problem Set 3', // Same name as local task
          description: '<p>Complete exercises</p>',
          due_at: '2024-02-15T23:59:00Z',
          unlock_at: null,
          lock_at: null,
          points_possible: 100,
          submission_types: ['online_upload'],
          has_submitted_submissions: false,
          course_id: 12345,
          grading_type: 'points',
          assignment_group_id: 1,
        },
      ];

      mockGetAll.mockResolvedValue(mockAssignments);

      // Listen for merge event
      const mergeHandler = jest.fn();
      syncEngine.on('task-merged', mergeHandler);

      const result = await syncEngine.syncTasks(12345, 1);

      expect(result.success).toBe(true);

      // Verify task was merged, not duplicated
      const tasks = db.executeRead<{
        id: number;
        external_id: string | null;
        source_type: string;
        title: string;
        weight: number;
        priority_score: number;
        points_possible: number;
        due_at: string;
      }>('SELECT * FROM tasks');

      expect(tasks).toHaveLength(1); // No duplicate
      expect(tasks[0].external_id).toBe('98765'); // Linked to Canvas
      expect(tasks[0].source_type).toBe('canvas'); // Updated to canvas
      expect(tasks[0].weight).toBe(10.0); // Local weight preserved
      expect(tasks[0].priority_score).toBe(50.0); // Local priority preserved
      expect(tasks[0].points_possible).toBe(100); // Canvas value applied
      expect(tasks[0].due_at).toBe('2024-02-15T23:59:00Z'); // Canvas value applied

      // Verify event was emitted
      expect(mergeHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Problem Set 3',
          canvasId: 98765,
        })
      );
    });

    it('should sync assignments as tasks', async () => {
      const mockAssignments = [
        {
          id: 98765,
          name: 'Problem Set 3',
          description: '<p>Complete exercises</p>',
          due_at: '2024-02-15T23:59:00Z',
          unlock_at: null,
          lock_at: null,
          points_possible: 100,
          submission_types: ['online_upload'],
          has_submitted_submissions: false,
          course_id: 12345,
          grading_type: 'points',
          assignment_group_id: 1,
        },
      ];

      mockGetAll.mockResolvedValue(mockAssignments);

      const result = await syncEngine.syncTasks(12345, 1);

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);

      // Verify task in database
      const tasks = db.executeRead<{ title: string; points_possible: number }>(
        'SELECT title, points_possible FROM tasks'
      );
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Problem Set 3');
      expect(tasks[0].points_possible).toBe(100);
    });
  });

  describe('Announcement sync', () => {
    beforeEach(() => {
      // Insert a test course
      db.executeWrite(
        'INSERT INTO courses (external_id, code, name) VALUES (?, ?, ?)',
        ['12345', 'CSC108', 'Intro to CS'],
        'courses'
      );
    });

    it('should sync regular announcements', async () => {
      const mockAnnouncements = [
        {
          id: 55555,
          title: 'Welcome to the course',
          message: '<p>Welcome everyone!</p>',
          posted_at: '2024-01-08T12:00:00Z',
          context_code: 'course_12345',
        },
      ];

      mockGetAll.mockResolvedValue(mockAnnouncements);

      const result = await syncEngine.syncAnnouncements(12345, 1);

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);

      // Verify notification in database
      const notifications = db.executeRead<{ title: string; is_policy_related: number }>(
        'SELECT title, is_policy_related FROM notifications'
      );
      expect(notifications).toHaveLength(1);
      expect(notifications[0].is_policy_related).toBeFalsy();
    });

    it('should detect policy-related announcements', async () => {
      const mockAnnouncements = [
        {
          id: 66666,
          title: 'Late Submission Policy Update',
          message: '<p>The grace period is now 48 hours with no penalty.</p>',
          posted_at: '2024-01-10T12:00:00Z',
          context_code: 'course_12345',
        },
      ];

      mockGetAll.mockResolvedValue(mockAnnouncements);

      // Listen for policy detection event
      const policyDetectedHandler = jest.fn();
      syncEngine.on('policy-detected', policyDetectedHandler);

      const result = await syncEngine.syncAnnouncements(12345, 1);

      expect(result.success).toBe(true);

      // Verify notification is marked as policy-related
      const notifications = db.executeRead<{ title: string; is_policy_related: number }>(
        'SELECT title, is_policy_related FROM notifications'
      );
      expect(notifications[0].is_policy_related).toBeTruthy();

      // Verify policy_announcements entry created
      const policyAnnouncements = db.executeRead<{ confidence_score: number }>(
        'SELECT confidence_score FROM policy_announcements'
      );
      expect(policyAnnouncements).toHaveLength(1);
      expect(policyAnnouncements[0].confidence_score).toBeGreaterThan(0);

      // Verify event was emitted
      expect(policyDetectedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          courseId: 1,
          keywords: expect.any(Array),
        })
      );
    });
  });

  describe('Module sync', () => {
    beforeEach(() => {
      db.executeWrite(
        'INSERT INTO courses (external_id, code, name) VALUES (?, ?, ?)',
        ['12345', 'CSC108', 'Intro to CS'],
        'courses'
      );
    });

    it('should sync modules', async () => {
      const mockModules = [
        {
          id: 33333,
          name: 'Week 1: Introduction',
          position: 1,
          unlock_at: null,
          require_sequential_progress: false,
          publish_final_grade: false,
          published: true,
          items_count: 0,
          items_url: '/api/v1/courses/12345/modules/33333/items',
        },
      ];

      mockGetAll.mockResolvedValue(mockModules);

      const result = await syncEngine.syncModules(12345, 1);

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);

      // Verify module in database
      const modules = db.executeRead<{ name: string; position: number }>(
        'SELECT name, position FROM modules'
      );
      expect(modules).toHaveLength(1);
      expect(modules[0].name).toBe('Week 1: Introduction');
    });
  });

  describe('Full sync', () => {
    it('should sync all entities', async () => {
      const mockCourses = [
        {
          id: 12345,
          name: 'Test Course',
          course_code: 'TEST101',
          enrollment_term_id: 1,
          default_view: 'modules',
        },
      ];

      // Mock all API calls
      mockGetAll.mockImplementation((endpoint: string) => {
        if (endpoint === '/courses') {
          return Promise.resolve(mockCourses);
        }
        return Promise.resolve([]);
      });

      const result = await syncEngine.syncAll();

      expect(result.courses.success).toBe(true);
      expect(result.courses.count).toBe(1);
      expect(result.totalDuration).toBeGreaterThan(0);
    });

    it('should prevent concurrent syncs', async () => {
      mockGetAll.mockImplementation(async () => {
        // Simulate slow API
        await new Promise((r) => setTimeout(r, 100));
        return [];
      });

      // Start first sync
      const firstSync = syncEngine.syncAll();

      // Try to start second sync immediately
      await expect(syncEngine.syncAll()).rejects.toThrow('Sync already in progress');

      // Wait for first sync to complete
      await firstSync;
    });

    it('should emit sync events', async () => {
      const startHandler = jest.fn();
      const completeHandler = jest.fn();

      syncEngine.on('sync-start', startHandler);
      syncEngine.on('sync-complete', completeHandler);

      mockGetAll.mockResolvedValue([]);

      await syncEngine.syncAll();

      expect(startHandler).toHaveBeenCalledWith({ type: 'full' });
      expect(completeHandler).toHaveBeenCalled();
    });
  });

  describe('Sync metadata', () => {
    it('should track sync metadata', async () => {
      mockGetAll.mockResolvedValue([]);

      await syncEngine.syncCourses();

      const metadata = syncEngine.getSyncMetadata('/courses');
      expect(metadata).toBeDefined();
      expect(metadata?.endpoint).toBe('/courses');
      expect(metadata?.last_synced_at).toBeDefined();
    });

    it('should list all sync metadata', async () => {
      mockGetAll.mockResolvedValue([]);

      await syncEngine.syncCourses();

      const allMetadata = syncEngine.getAllSyncMetadata();
      expect(allMetadata.length).toBeGreaterThan(0);
    });
  });

  describe('Status and control', () => {
    it('should report busy status during sync', async () => {
      mockGetAll.mockImplementation(async () => {
        // Check status during sync
        expect(syncEngine.isBusy()).toBe(true);
        return [];
      });

      expect(syncEngine.isBusy()).toBe(false);
      await syncEngine.syncAll();
      expect(syncEngine.isBusy()).toBe(false);
    });

    it('should provide rate limit status', () => {
      const status = syncEngine.getRateLimitStatus();

      expect(status).toHaveProperty('queueLength');
      expect(status).toHaveProperty('activeRequests');
      expect(status).toHaveProperty('isPaused');
    });

    it('should stop gracefully', () => {
      expect(() => syncEngine.stop()).not.toThrow();
    });
  });

  describe('Single course sync', () => {
    it('should sync a single course with all related data', async () => {
      const mockCourse = {
        id: 12345,
        name: 'Test Course',
        course_code: 'TEST101',
        enrollment_term_id: 1,
        default_view: 'modules',
      };

      mockGet.mockResolvedValue({
        data: mockCourse,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      });

      mockGetAll.mockResolvedValue([]);

      const result = await syncEngine.syncCourse(12345);

      expect(result.course.success).toBe(true);
      expect(result.tasks).toBeDefined();
      expect(result.announcements).toBeDefined();
      expect(result.modules).toBeDefined();
    });
  });
});
