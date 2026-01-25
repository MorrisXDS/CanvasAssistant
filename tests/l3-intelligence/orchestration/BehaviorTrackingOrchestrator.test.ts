/**
 * BehaviorTrackingOrchestrator Tests
 *
 * Tests for the L3 behavior tracking orchestration layer.
 */

import fs from 'fs';
import path from 'path';
import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { BehaviorTrackingOrchestrator } from '../../../src/layers/l3-intelligence/orchestration/BehaviorTrackingOrchestrator';

// Test directory for database
const TEST_DIR = path.join(__dirname, '../../temp-l3-behavior');
const TEST_DB_PATH = path.join(TEST_DIR, 'test-behavior.db');

describe('BehaviorTrackingOrchestrator', () => {
  let db: Database;
  let orchestrator: BehaviorTrackingOrchestrator;
  let testCourseId: number;
  let testTaskId: number;

  beforeAll(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    db = new Database({ dbPath: TEST_DB_PATH, verbose: false });
    db.initialize();

    const migrationRunner = new MigrationRunner(db);
    migrationRunner.loadMigrations(coreMigrations);
    migrationRunner.runAll();

    // Create with autoRefresh disabled for tests
    orchestrator = new BehaviorTrackingOrchestrator(db, { autoRefresh: false });

    // Create test course
    const courseResult = db.executeWrite(
      `INSERT INTO courses (external_id, code, name, target_grade, current_grade, total_weight)
       VALUES ('course_1', 'TEST101', 'Test Course', 80, 75, 100)`,
      [],
      'courses'
    );
    testCourseId = courseResult.lastInsertRowid as number;

    // Create test task
    const taskResult = db.executeWrite(
      `INSERT INTO tasks (external_id, source_type, course_id, title, weight, is_completed)
       VALUES ('task_1', 'canvas', ?, 'Test Task', 10, 0)`,
      [testCourseId],
      'tasks'
    );
    testTaskId = taskResult.lastInsertRowid as number;
  });

  afterEach(() => {
    orchestrator.stop();
    db.close();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const defaultOrchestrator = new BehaviorTrackingOrchestrator(db);
      expect(defaultOrchestrator).toBeDefined();
      defaultOrchestrator.stop();
    });

    it('should accept custom config', () => {
      const customOrchestrator = new BehaviorTrackingOrchestrator(db, {
        refreshIntervalMs: 3600000,
        maxEventAgeDays: 90,
        autoRefresh: false,
      });
      expect(customOrchestrator).toBeDefined();
      customOrchestrator.stop();
    });
  });

  describe('recordCompletionEvent', () => {
    it('should record completion event', () => {
      const completedAt = new Date();

      orchestrator.recordCompletionEvent(testTaskId, testCourseId, 'assignment', completedAt);

      expect(orchestrator.getEventCount()).toBe(1);
    });

    it('should record with all optional fields', () => {
      const completedAt = new Date();
      const startedAt = new Date(completedAt.getTime() - 60 * 60 * 1000); // 1 hour before
      const dueAt = new Date(completedAt.getTime() + 24 * 60 * 60 * 1000); // 1 day after

      orchestrator.recordCompletionEvent(testTaskId, testCourseId, 'quiz', completedAt, {
        startedAt,
        dueAt,
        scoreAchieved: 85,
        pointsPossible: 100,
      });

      expect(orchestrator.getEventCount()).toBe(1);
    });

    it('should emit event-recorded event', () => {
      const eventSpy = jest.fn();
      orchestrator.on('event-recorded', eventSpy);

      orchestrator.recordCompletionEvent(testTaskId, testCourseId, 'assignment', new Date());

      expect(eventSpy).toHaveBeenCalledWith({
        taskId: testTaskId,
        courseId: testCourseId,
        taskType: 'assignment',
      });
    });

    it('should calculate wasLate when due date is before completion', () => {
      const completedAt = new Date();
      const dueAt = new Date(completedAt.getTime() - 24 * 60 * 60 * 1000); // 1 day before

      orchestrator.recordCompletionEvent(testTaskId, testCourseId, 'assignment', completedAt, {
        dueAt,
      });

      const events = orchestrator.fetchCompletionEvents();
      expect(events[0].wasLate).toBe(true);
    });
  });

  describe('fetchCompletionEvents', () => {
    it('should return empty array initially', () => {
      const events = orchestrator.fetchCompletionEvents();
      expect(events).toEqual([]);
    });

    it('should return recorded events', () => {
      orchestrator.recordCompletionEvent(testTaskId, testCourseId, 'assignment', new Date());
      orchestrator.recordCompletionEvent(testTaskId + 1, testCourseId, 'quiz', new Date());

      const events = orchestrator.fetchCompletionEvents();

      expect(events.length).toBe(2);
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        orchestrator.recordCompletionEvent(testTaskId + i, testCourseId, 'assignment', new Date());
      }

      const events = orchestrator.fetchCompletionEvents(3);

      expect(events.length).toBe(3);
    });
  });

  describe('fetchCourseEvents', () => {
    it('should return events for specific course', () => {
      // Create second course
      const course2Result = db.executeWrite(
        `INSERT INTO courses (external_id, code, name, target_grade)
         VALUES ('course_2', 'OTHER101', 'Other Course', 80)`,
        [],
        'courses'
      );
      const course2Id = course2Result.lastInsertRowid as number;

      orchestrator.recordCompletionEvent(testTaskId, testCourseId, 'assignment', new Date());
      orchestrator.recordCompletionEvent(testTaskId + 1, course2Id, 'quiz', new Date());

      const course1Events = orchestrator.fetchCourseEvents(testCourseId);

      expect(course1Events.length).toBe(1);
      expect(course1Events[0].courseId).toBe(testCourseId);
    });
  });

  describe('fetchEventsByDateRange', () => {
    it('should return events within date range', () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      orchestrator.recordCompletionEvent(testTaskId, testCourseId, 'assignment', twoDaysAgo);
      orchestrator.recordCompletionEvent(testTaskId + 1, testCourseId, 'quiz', yesterday);
      orchestrator.recordCompletionEvent(testTaskId + 2, testCourseId, 'exam', now);

      const events = orchestrator.fetchEventsByDateRange(twoDaysAgo, yesterday);

      expect(events.length).toBe(2);
    });
  });

  describe('refreshPatterns', () => {
    it('should recalculate patterns from events', () => {
      // Record some events
      for (let i = 0; i < 5; i++) {
        orchestrator.recordCompletionEvent(testTaskId + i, testCourseId, 'assignment', new Date());
      }

      orchestrator.refreshPatterns();

      // Should have cached patterns
      expect(orchestrator.getWeeklyRhythm()).toBeDefined();
    });

    it('should emit patterns-updated event', () => {
      const eventSpy = jest.fn();
      orchestrator.on('patterns-updated', eventSpy);

      orchestrator.refreshPatterns();

      expect(eventSpy).toHaveBeenCalled();
    });
  });

  describe('getWeeklyRhythm', () => {
    it('should return rhythm without prior refresh', () => {
      const rhythm = orchestrator.getWeeklyRhythm();

      expect(rhythm).toBeDefined();
      expect(rhythm.productiveDays).toBeDefined();
      expect(rhythm.productiveHours).toBeDefined();
    });
  });

  describe('getCoursePerformance', () => {
    it('should return course performance', () => {
      // Record some events
      orchestrator.recordCompletionEvent(testTaskId, testCourseId, 'assignment', new Date());

      const performance = orchestrator.getCoursePerformance();

      expect(Array.isArray(performance)).toBe(true);
    });
  });

  describe('getStrugglePatterns', () => {
    it('should return struggle patterns', () => {
      const patterns = orchestrator.getStrugglePatterns();

      expect(Array.isArray(patterns)).toBe(true);
    });
  });

  describe('getCompletionTiming', () => {
    it('should return completion timing statistics', () => {
      const timing = orchestrator.getCompletionTiming();

      expect(timing).toBeDefined();
    });
  });

  describe('pruneOldEvents', () => {
    it('should remove old events', () => {
      // Insert old event directly
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 200); // 200 days ago

      db.executeWrite(
        `INSERT INTO task_completion_events (
          task_id, course_id, task_type, completed_at, day_of_week, hour_of_day, was_late
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [testTaskId, testCourseId, 'assignment', oldDate.toISOString(), 1, 10, 0],
        'task_completion_events'
      );

      // Also add a recent event
      orchestrator.recordCompletionEvent(testTaskId + 1, testCourseId, 'quiz', new Date());

      expect(orchestrator.getEventCount()).toBe(2);

      const pruned = orchestrator.pruneOldEvents();

      expect(pruned).toBe(1);
      expect(orchestrator.getEventCount()).toBe(1);
    });
  });

  describe('getEventCount', () => {
    it('should return correct count', () => {
      expect(orchestrator.getEventCount()).toBe(0);

      orchestrator.recordCompletionEvent(testTaskId, testCourseId, 'assignment', new Date());
      expect(orchestrator.getEventCount()).toBe(1);

      orchestrator.recordCompletionEvent(testTaskId + 1, testCourseId, 'quiz', new Date());
      expect(orchestrator.getEventCount()).toBe(2);
    });
  });

  describe('stop', () => {
    it('should stop auto-refresh timer', () => {
      const autoOrchestrator = new BehaviorTrackingOrchestrator(db, {
        autoRefresh: true,
        refreshIntervalMs: 100,
      });

      expect(() => autoOrchestrator.stop()).not.toThrow();
      expect(() => autoOrchestrator.stop()).not.toThrow(); // Second stop should also not throw
    });
  });
});
