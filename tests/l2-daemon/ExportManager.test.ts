/**
 * ExportManager Tests
 *
 * Tests for export functionality including CSV export, selective export, and encryption.
 *
 * NOTE: These tests require better-sqlite3 native module to be compiled for the correct
 * Node.js version. Run `npm rebuild better-sqlite3` if tests fail with MODULE_VERSION errors.
 */

import { ExportManager } from '../../src/layers/l2-daemon/ExportManager';
import { Database } from '../../src/layers/l1-persistence/Database';
import { VisibleDataProvider } from '../../src/layers/l1-persistence/VisibleDataProvider';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Skip tests if native module not available
const describeFn = process.env.SKIP_NATIVE_TESTS ? describe.skip : describe;

describeFn('ExportManager', () => {
  let database: Database;
  let visibleDataProvider: VisibleDataProvider;
  let exportManager: ExportManager;
  let tempDir: string;

  beforeAll(() => {
    // Create temp directory for test outputs
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-test-'));
  });

  afterAll(() => {
    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Create in-memory database for testing
    database = new Database({ dbPath: ':memory:' });

    // Create minimal schema for testing
    database.exec(`
      CREATE TABLE courses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT UNIQUE NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        current_grade REAL,
        target_grade REAL DEFAULT 85.0,
        target_grade_source TEXT DEFAULT 'default',
        total_weight REAL DEFAULT 0.0,
        color TEXT,
        nickname TEXT,
        is_hidden INTEGER DEFAULT 0,
        syllabus_body TEXT,
        last_synced_at TEXT,
        enrollment_term_id INTEGER,
        archived_at TEXT,
        archive_source TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        assessed_grade REAL
      );

      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT UNIQUE NOT NULL,
        course_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        due_at TEXT,
        due_time_known INTEGER DEFAULT 1,
        unlock_at TEXT,
        lock_at TEXT,
        weight REAL DEFAULT 0,
        grade REAL,
        points_possible REAL,
        priority_score REAL DEFAULT 0,
        is_completed INTEGER DEFAULT 0,
        is_optional INTEGER DEFAULT 0,
        completed_at TEXT,
        submission_status TEXT,
        user_submission_status TEXT,
        task_type TEXT,
        task_group_id INTEGER,
        calendar_event_id INTEGER,
        local_modified_at TEXT,
        field_sources TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(course_id) REFERENCES courses(id)
      );

      CREATE TABLE notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        course_id INTEGER,
        title TEXT NOT NULL,
        message TEXT,
        message_html TEXT,
        published_at TEXT,
        dismissed_at TEXT,
        url TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE course_policies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER NOT NULL,
        policy_type TEXT NOT NULL,
        policy_name TEXT,
        policy_config TEXT,
        raw_text TEXT,
        is_user_verified INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE grace_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER NOT NULL,
        policy_id INTEGER,
        total_tokens INTEGER DEFAULT 0,
        tokens_remaining INTEGER DEFAULT 0,
        hours_per_token INTEGER DEFAULT 24,
        max_tokens_per_task INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE course_pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        body_html TEXT,
        page_type TEXT
      );

      CREATE TABLE calendar_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER,
        title TEXT NOT NULL,
        description TEXT,
        start_at TEXT,
        end_at TEXT
      );

      CREATE TABLE export_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        export_type TEXT NOT NULL,
        file_path TEXT,
        file_size INTEGER,
        encrypted INTEGER DEFAULT 0,
        courses_included TEXT,
        tasks_exported INTEGER DEFAULT 0,
        files_exported INTEGER DEFAULT 0,
        status TEXT DEFAULT 'completed',
        error_message TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert test data - active courses
    database.executeWrite(
      `INSERT INTO courses (external_id, code, name, current_grade, target_grade)
       VALUES ('ext-1', 'CSC108', 'Introduction to Programming', 85.5, 85),
              ('ext-2', 'MAT137', 'Calculus I', 78.0, 80)`,
      [],
      'courses'
    );

    // Insert archived course
    database.executeWrite(
      `INSERT INTO courses (external_id, code, name, current_grade, target_grade, archived_at, archive_source)
       VALUES ('ext-3', 'CSC148', 'Introduction to Computer Science', 90.0, 85, '2023-12-15T00:00:00Z', 'user')`,
      [],
      'courses'
    );

    // Insert tasks for all courses including archived
    database.executeWrite(
      `INSERT INTO tasks (external_id, course_id, title, due_at, is_completed, grade, points_possible, weight, task_type, priority_score)
       VALUES ('task-1', 1, 'Assignment 1', '2024-02-15T23:59:00Z', 0, NULL, 100, 10, 'assignment', 75),
              ('task-2', 1, 'Midterm', '2024-02-20T14:00:00Z', 0, NULL, 100, 30, 'exam', 90),
              ('task-3', 1, 'Assignment 2', '2024-02-01T23:59:00Z', 1, 85, 100, 10, 'assignment', 50),
              ('task-4', 2, 'Problem Set 1', '2024-02-10T23:59:00Z', 1, 78, 100, 15, 'assignment', 60),
              ('task-5', 3, 'Archived Assignment', '2023-11-15T23:59:00Z', 1, 92, 100, 20, 'assignment', 40)`,
      [],
      'tasks'
    );

    // Create visible data provider mock
    visibleDataProvider = {
      getVisibleCourseIds: jest.fn().mockReturnValue([1, 2]),
      getVisibleCourses: jest.fn().mockReturnValue([
        { id: 1, code: 'CSC108', name: 'Introduction to Programming' },
        { id: 2, code: 'MAT137', name: 'Calculus I' },
      ]),
      getArchivedCourseIds: jest.fn().mockReturnValue([3]),
      getArchivedCourses: jest.fn().mockReturnValue([
        { id: 3, code: 'CSC148', name: 'Introduction to Computer Science', archived_at: '2023-12-15T00:00:00Z' },
      ]),
    } as unknown as VisibleDataProvider;

    exportManager = new ExportManager(database, visibleDataProvider, {
      filesDir: tempDir,
      appVersion: '1.0.0-test',
    });
  });

  afterEach(() => {
    if (database) {
      database.close();
    }
  });

  describe('exportTasksCsv', () => {
    it('should export tasks to CSV format', async () => {
      const outputPath = path.join(tempDir, 'tasks-export.csv');

      const result = await exportManager.exportTasksCsv(outputPath);

      expect(result.success).toBe(true);
      expect(result.filePath).toBe(outputPath);
      expect(result.tasksExported).toBe(4);
      expect(fs.existsSync(outputPath)).toBe(true);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const lines = content.split('\n');

      // Check header
      expect(lines[0]).toContain('Course');
      expect(lines[0]).toContain('Task Name');
      expect(lines[0]).toContain('Type');
      expect(lines[0]).toContain('Due Date');
      expect(lines[0]).toContain('Status');

      // Check data rows (header + 4 tasks)
      expect(lines.length).toBe(5);

      // Check content
      expect(content).toContain('CSC108');
      expect(content).toContain('Assignment 1');
      expect(content).toContain('assignment');
    });

    it('should filter by course IDs', async () => {
      const outputPath = path.join(tempDir, 'tasks-filtered.csv');

      const result = await exportManager.exportTasksCsv(outputPath, {
        courseIds: [1],
      });

      expect(result.success).toBe(true);
      expect(result.tasksExported).toBe(3); // Only CSC108 tasks

      const content = fs.readFileSync(outputPath, 'utf-8');
      expect(content).toContain('CSC108');
      expect(content).not.toContain('MAT137');
    });

    it('should filter by task status - pending', async () => {
      const outputPath = path.join(tempDir, 'tasks-pending.csv');

      const result = await exportManager.exportTasksCsv(outputPath, {
        status: 'pending',
      });

      expect(result.success).toBe(true);
      expect(result.tasksExported).toBe(2); // 2 pending tasks

      const content = fs.readFileSync(outputPath, 'utf-8');
      expect(content).toContain('pending');
      expect(content).not.toContain('completed');
    });

    it('should filter by task status - completed', async () => {
      const outputPath = path.join(tempDir, 'tasks-completed.csv');

      const result = await exportManager.exportTasksCsv(outputPath, {
        status: 'completed',
      });

      expect(result.success).toBe(true);
      expect(result.tasksExported).toBe(2); // 2 completed tasks
    });

    it('should return error when no visible courses', async () => {
      (visibleDataProvider.getVisibleCourseIds as jest.Mock).mockReturnValue([]);

      const outputPath = path.join(tempDir, 'tasks-empty.csv');
      const result = await exportManager.exportTasksCsv(outputPath);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No visible courses');
    });
  });

  describe('exportGradesCsv', () => {
    it('should export grades to CSV format', async () => {
      const outputPath = path.join(tempDir, 'grades-export.csv');

      const result = await exportManager.exportGradesCsv(outputPath);

      expect(result.success).toBe(true);
      expect(result.filePath).toBe(outputPath);
      expect(result.tasksExported).toBe(2); // Only graded tasks

      const content = fs.readFileSync(outputPath, 'utf-8');
      const lines = content.split('\n');

      // Check header
      expect(lines[0]).toContain('Course');
      expect(lines[0]).toContain('Assignment');
      expect(lines[0]).toContain('Points Earned');
      expect(lines[0]).toContain('Points Possible');
      expect(lines[0]).toContain('Letter Grade');

      // Check data rows (header + 2 graded tasks)
      expect(lines.length).toBe(3);
    });

    it('should calculate letter grades correctly', async () => {
      const outputPath = path.join(tempDir, 'grades-letters.csv');

      await exportManager.exportGradesCsv(outputPath);

      const content = fs.readFileSync(outputPath, 'utf-8');
      expect(content).toContain('A'); // 85% grade
      expect(content).toContain('B+'); // 78% grade
    });
  });

  describe('exportSelective', () => {
    it('should export selected courses to JSON', async () => {
      const outputPath = path.join(tempDir, 'selective-export.json');

      const result = await exportManager.exportSelective(outputPath, {
        courses: [1],
        includeTasks: true,
        includeNotifications: false,
        format: 'json',
      });

      expect(result.success).toBe(true);
      expect(result.coursesExported).toBe(1);
      expect(result.tasksExported).toBe(3);

      const content = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      expect(content.version).toBe('2.0');
      expect(content.courses).toHaveLength(1);
      expect(content.courses[0].code).toBe('CSC108');
      expect(content.tasks).toHaveLength(3);
    });

    it('should export all visible courses when none specified', async () => {
      const outputPath = path.join(tempDir, 'selective-all.json');

      const result = await exportManager.exportSelective(outputPath, {
        includeTasks: true,
        format: 'json',
      });

      expect(result.success).toBe(true);
      expect(result.coursesExported).toBe(2);
      expect(result.tasksExported).toBe(4);
    });

    it('should encrypt when requested', async () => {
      const outputPath = path.join(tempDir, 'selective-encrypted.cbk');
      const password = 'test-password-123';

      const result = await exportManager.exportSelective(outputPath, {
        format: 'json',
        encrypt: true,
        password,
      });

      expect(result.success).toBe(true);

      // File should contain encrypted data
      const content = JSON.parse(fs.readFileSync(result.filePath!, 'utf-8'));
      expect(content.version).toBe('1.0');
      expect(content.algorithm).toBe('aes-256-gcm');
      expect(content.salt).toBeDefined();
      expect(content.iv).toBeDefined();
      expect(content.authTag).toBeDefined();
      expect(content.data).toBeDefined();
    });

    it('should fail encryption without password', async () => {
      const outputPath = path.join(tempDir, 'selective-no-password.json');

      const result = await exportManager.exportSelective(outputPath, {
        format: 'json',
        encrypt: true,
        // No password provided
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Password required');
    });

    it('should filter tasks by status', async () => {
      const outputPath = path.join(tempDir, 'selective-pending.json');

      const result = await exportManager.exportSelective(outputPath, {
        format: 'json',
        taskStatus: 'pending',
      });

      expect(result.success).toBe(true);
      expect(result.tasksExported).toBe(2);

      const content = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      expect(content.tasks.every((t: { isCompleted: number }) => t.isCompleted === 0)).toBe(
        true
      );
    });

    it('should include archived courses when specified', async () => {
      const outputPath = path.join(tempDir, 'selective-with-archived.json');

      const result = await exportManager.exportSelective(outputPath, {
        format: 'json',
        archivedCourses: [3],
      });

      expect(result.success).toBe(true);
      // Should include visible courses (2) + archived courses (1) = 3
      expect(result.coursesExported).toBe(3);
      // Should include tasks from all 3 courses (4 + 1 = 5)
      expect(result.tasksExported).toBe(5);

      const content = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      expect(content.courses).toHaveLength(3);

      // Find the archived course and verify it has archivedAt
      const archivedCourse = content.courses.find((c: { code: string }) => c.code === 'CSC148');
      expect(archivedCourse).toBeDefined();
      expect(archivedCourse.archivedAt).toBe('2023-12-15T00:00:00Z');
    });

    it('should export only archived courses when no visible courses selected', async () => {
      const outputPath = path.join(tempDir, 'selective-archived-only.json');

      const result = await exportManager.exportSelective(outputPath, {
        courses: [], // Empty visible courses
        archivedCourses: [3],
        format: 'json',
      });

      expect(result.success).toBe(true);
      expect(result.coursesExported).toBe(1);
      expect(result.tasksExported).toBe(1);

      const content = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      expect(content.courses).toHaveLength(1);
      expect(content.courses[0].code).toBe('CSC148');
    });

    it('should include all archived courses with includeArchived flag', async () => {
      const outputPath = path.join(tempDir, 'selective-all-archived.json');

      const result = await exportManager.exportSelective(outputPath, {
        courses: [1], // Only one visible course
        includeArchived: true, // Include all archived
        format: 'json',
      });

      expect(result.success).toBe(true);
      // Should include 1 visible + 1 archived = 2
      expect(result.coursesExported).toBe(2);
    });
  });

  describe('importEncrypted', () => {
    it('should decrypt and return data', async () => {
      const password = 'import-test-password';
      const outputPath = path.join(tempDir, 'to-import.cbk');

      // First export encrypted
      await exportManager.exportSelective(outputPath, {
        format: 'json',
        encrypt: true,
        password,
      });

      // Then import it
      const result = await exportManager.importEncrypted(outputPath, password);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.version).toBe('2.0');
      expect(result.data?.courses).toBeDefined();
    });

    it('should fail with wrong password', async () => {
      const password = 'correct-password';
      const outputPath = path.join(tempDir, 'wrong-password.cbk');

      await exportManager.exportSelective(outputPath, {
        format: 'json',
        encrypt: true,
        password,
      });

      const result = await exportManager.importEncrypted(outputPath, 'wrong-password');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Decryption failed');
    });
  });

  describe('progress events', () => {
    it('should emit progress events during export', async () => {
      const progressEvents: string[] = [];

      exportManager.on('progress', (progress) => {
        progressEvents.push(progress.stage);
      });

      const outputPath = path.join(tempDir, 'progress-test.csv');
      await exportManager.exportTasksCsv(outputPath);

      expect(progressEvents).toContain('collecting');
      expect(progressEvents).toContain('writing');
      expect(progressEvents).toContain('complete');
    });
  });
});
