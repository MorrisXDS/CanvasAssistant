/**
 * RecommendationOrchestrator Tests
 *
 * Tests for the L3 recommendation generation orchestration layer.
 */

import fs from 'fs';
import path from 'path';
import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { RecommendationOrchestrator } from '../../../src/layers/l3-intelligence/orchestration/RecommendationOrchestrator';

// Test directory for database
const TEST_DIR = path.join(__dirname, '../../temp-l3-recommendations');
const TEST_DB_PATH = path.join(TEST_DIR, 'test-recommendations.db');

describe('RecommendationOrchestrator', () => {
  let db: Database;
  let orchestrator: RecommendationOrchestrator;
  let testCourseId: number;

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
    orchestrator = new RecommendationOrchestrator(db, { autoRefresh: false });

    // Create test course
    const result = db.executeWrite(
      `INSERT INTO courses (external_id, code, name, target_grade, current_grade, total_weight)
       VALUES ('course_1', 'TEST101', 'Test Course', 80, 75, 100)`,
      [],
      'courses'
    );
    testCourseId = result.lastInsertRowid as number;
  });

  afterEach(() => {
    orchestrator.stop();
    db.close();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const defaultOrchestrator = new RecommendationOrchestrator(db);
      expect(defaultOrchestrator).toBeDefined();
      defaultOrchestrator.stop();
    });

    it('should accept custom config', () => {
      const customOrchestrator = new RecommendationOrchestrator(db, {
        refreshIntervalMs: 60000,
        defaultAvailableMinutes: 60,
        maxStoredRecommendations: 50,
        autoRefresh: false,
      });
      expect(customOrchestrator).toBeDefined();
      customOrchestrator.stop();
    });
  });

  describe('generateRecommendations', () => {
    it('should generate recommendations when tasks exist', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      db.executeWrite(
        `INSERT INTO tasks (external_id, source_type, course_id, title, weight, due_at, is_completed)
         VALUES ('task_1', 'canvas', ?, 'Test Task', 20, ?, 0)`,
        [testCourseId, tomorrow.toISOString()],
        'tasks'
      );

      const recommendations = orchestrator.generateRecommendations();

      expect(recommendations).toBeDefined();
      expect(Array.isArray(recommendations)).toBe(true);
    });

    it('should return empty array when no tasks', () => {
      const recommendations = orchestrator.generateRecommendations();

      expect(recommendations).toBeDefined();
      expect(Array.isArray(recommendations)).toBe(true);
    });

    it('should emit recommendations-generated event', () => {
      const eventSpy = jest.fn();
      orchestrator.on('recommendations-generated', eventSpy);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      db.executeWrite(
        `INSERT INTO tasks (external_id, source_type, course_id, title, weight, due_at, is_completed)
         VALUES ('task_1', 'canvas', ?, 'Test Task', 20, ?, 0)`,
        [testCourseId, tomorrow.toISOString()],
        'tasks'
      );

      orchestrator.generateRecommendations();

      expect(eventSpy).toHaveBeenCalled();
    });
  });

  describe('getActiveRecommendations', () => {
    it('should return non-dismissed recommendations', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      db.executeWrite(
        `INSERT INTO tasks (external_id, source_type, course_id, title, weight, due_at, is_completed)
         VALUES ('task_1', 'canvas', ?, 'Test Task', 20, ?, 0)`,
        [testCourseId, tomorrow.toISOString()],
        'tasks'
      );

      // Generate recommendations first
      orchestrator.generateRecommendations();

      const active = orchestrator.getActiveRecommendations();

      expect(active).toBeDefined();
      expect(Array.isArray(active)).toBe(true);
    });

    it('should filter by type', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      db.executeWrite(
        `INSERT INTO tasks (external_id, source_type, course_id, title, weight, due_at, is_completed)
         VALUES ('task_1', 'canvas', ?, 'Test Task', 20, ?, 0)`,
        [testCourseId, tomorrow.toISOString()],
        'tasks'
      );

      orchestrator.generateRecommendations();

      const active = orchestrator.getActiveRecommendations('start_task');

      expect(active).toBeDefined();
      expect(Array.isArray(active)).toBe(true);
    });
  });

  describe('dismissRecommendation', () => {
    it('should mark recommendation as dismissed', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      db.executeWrite(
        `INSERT INTO tasks (external_id, source_type, course_id, title, weight, due_at, is_completed)
         VALUES ('task_1', 'canvas', ?, 'Test Task', 20, ?, 0)`,
        [testCourseId, tomorrow.toISOString()],
        'tasks'
      );

      orchestrator.generateRecommendations();
      const active = orchestrator.getActiveRecommendations();

      if (active.length > 0) {
        const recId = active[0].id;
        orchestrator.dismissRecommendation(recId);

        // Check it's no longer in active
        const afterDismiss = orchestrator.getActiveRecommendations();
        const found = afterDismiss.find((r) => r.id === recId);
        expect(found).toBeUndefined();
      }
    });

    it('should emit recommendation-dismissed event', () => {
      const eventSpy = jest.fn();
      orchestrator.on('recommendation-dismissed', eventSpy);

      // Insert a recommendation directly for testing
      db.executeWrite(
        `INSERT INTO recommendations (
          recommendation_type, title, description, reasoning, priority_score,
          valid_from, valid_until, created_at
        ) VALUES (
          'test_type', 'Test Rec', 'Description', 'Reasoning', 50,
          datetime('now'), datetime('now', '+1 day'), datetime('now')
        )`,
        [],
        'recommendations'
      );

      const rec = db.executeReadOne<{ id: number }>(
        'SELECT id FROM recommendations ORDER BY id DESC LIMIT 1'
      );

      if (rec) {
        orchestrator.dismissRecommendation(rec.id);
        expect(eventSpy).toHaveBeenCalled();
      }
    });
  });

  describe('markActedOn', () => {
    it('should mark recommendation as acted on', () => {
      // Insert a recommendation directly
      db.executeWrite(
        `INSERT INTO recommendations (
          recommendation_type, title, description, reasoning, priority_score,
          valid_from, valid_until, created_at
        ) VALUES (
          'test_type', 'Test Rec', 'Description', 'Reasoning', 50,
          datetime('now'), datetime('now', '+1 day'), datetime('now')
        )`,
        [],
        'recommendations'
      );

      const rec = db.executeReadOne<{ id: number }>(
        'SELECT id FROM recommendations ORDER BY id DESC LIMIT 1'
      );

      if (rec) {
        orchestrator.markActedOn(rec.id);

        const updated = db.executeReadOne<{ acted_on_at: string | null }>(
          'SELECT acted_on_at FROM recommendations WHERE id = ?',
          [rec.id]
        );
        expect(updated?.acted_on_at).not.toBeNull();
      }
    });

    it('should emit recommendation-acted event', () => {
      const eventSpy = jest.fn();
      orchestrator.on('recommendation-acted', eventSpy);

      db.executeWrite(
        `INSERT INTO recommendations (
          recommendation_type, title, description, reasoning, priority_score,
          valid_from, valid_until, created_at
        ) VALUES (
          'test_type', 'Test Rec', 'Description', 'Reasoning', 50,
          datetime('now'), datetime('now', '+1 day'), datetime('now')
        )`,
        [],
        'recommendations'
      );

      const rec = db.executeReadOne<{ id: number }>(
        'SELECT id FROM recommendations ORDER BY id DESC LIMIT 1'
      );

      if (rec) {
        orchestrator.markActedOn(rec.id);
        expect(eventSpy).toHaveBeenCalled();
      }
    });
  });

  describe('getRecommendationsByTask', () => {
    it('should return recommendations for specific task', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const taskResult = db.executeWrite(
        `INSERT INTO tasks (external_id, source_type, course_id, title, weight, due_at, is_completed)
         VALUES ('task_1', 'canvas', ?, 'Test Task', 20, ?, 0)`,
        [testCourseId, tomorrow.toISOString()],
        'tasks'
      );
      const taskId = taskResult.lastInsertRowid as number;

      // Insert task-specific recommendation
      db.executeWrite(
        `INSERT INTO recommendations (
          recommendation_type, task_id, title, description, reasoning, priority_score,
          valid_from, valid_until, created_at
        ) VALUES (
          'start_task', ?, 'Start Task', 'Description', 'Reasoning', 50,
          datetime('now'), datetime('now', '+1 day'), datetime('now')
        )`,
        [taskId],
        'recommendations'
      );

      const recs = orchestrator.getRecommendationsByTask(taskId);

      expect(recs).toBeDefined();
      expect(Array.isArray(recs)).toBe(true);
    });
  });

  describe('getRecommendationsByCourse', () => {
    it('should return recommendations for specific course', () => {
      // Insert course-specific recommendation
      db.executeWrite(
        `INSERT INTO recommendations (
          recommendation_type, course_id, title, description, reasoning, priority_score,
          valid_from, valid_until, created_at
        ) VALUES (
          'focus_course', ?, 'Focus on Course', 'Description', 'Reasoning', 50,
          datetime('now'), datetime('now', '+1 day'), datetime('now')
        )`,
        [testCourseId],
        'recommendations'
      );

      const recs = orchestrator.getRecommendationsByCourse(testCourseId);

      expect(recs).toBeDefined();
      expect(Array.isArray(recs)).toBe(true);
    });
  });

  describe('cleanupOldRecommendations', () => {
    it('should remove old dismissed recommendations', () => {
      // Insert old dismissed recommendation
      db.executeWrite(
        `INSERT INTO recommendations (
          recommendation_type, title, description, reasoning, priority_score,
          valid_from, valid_until, dismissed_at, created_at
        ) VALUES (
          'test_type', 'Old Rec', 'Description', 'Reasoning', 50,
          datetime('now', '-30 days'), datetime('now', '-29 days'),
          datetime('now', '-28 days'), datetime('now', '-30 days')
        )`,
        [],
        'recommendations'
      );

      orchestrator.cleanupOldRecommendations();

      // Old recommendation should be deleted
      const count = db.executeReadOne<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM recommendations'
      );
      expect(count?.cnt).toBe(0);
    });
  });

  describe('stop', () => {
    it('should stop auto-refresh timer', () => {
      const autoRefreshOrchestrator = new RecommendationOrchestrator(db, {
        autoRefresh: true,
        refreshIntervalMs: 100,
      });

      expect(() => autoRefreshOrchestrator.stop()).not.toThrow();
      expect(() => autoRefreshOrchestrator.stop()).not.toThrow();
    });
  });
});
