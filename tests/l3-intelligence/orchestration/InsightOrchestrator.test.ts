/**
 * InsightOrchestrator Tests
 *
 * Tests for the L3 insight generation orchestration layer.
 */

import fs from 'fs';
import path from 'path';
import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { InsightOrchestrator } from '../../../src/layers/l3-intelligence/orchestration/InsightOrchestrator';

// Test directory for database
const TEST_DIR = path.join(__dirname, '../../temp-l3-insights');
const TEST_DB_PATH = path.join(TEST_DIR, 'test-insights.db');

describe('InsightOrchestrator', () => {
  let db: Database;
  let orchestrator: InsightOrchestrator;
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
    orchestrator = new InsightOrchestrator(db, { autoRefresh: false });

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
      const defaultOrchestrator = new InsightOrchestrator(db);
      expect(defaultOrchestrator).toBeDefined();
      defaultOrchestrator.stop();
    });

    it('should accept custom config', () => {
      const customOrchestrator = new InsightOrchestrator(db, {
        refreshIntervalMs: 3600000,
        maxStoredInsights: 25,
        autoRefresh: false,
      });
      expect(customOrchestrator).toBeDefined();
      customOrchestrator.stop();
    });
  });

  describe('generateInsights', () => {
    it('should generate insights from task and course data', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      db.executeWrite(
        `INSERT INTO tasks (external_id, source_type, course_id, title, weight, due_at, is_completed)
         VALUES ('task_1', 'canvas', ?, 'Test Task', 20, ?, 0)`,
        [testCourseId, tomorrow.toISOString()],
        'tasks'
      );

      const insights = orchestrator.generateInsights();

      expect(insights).toBeDefined();
      expect(Array.isArray(insights)).toBe(true);
    });

    it('should return empty array when no data', () => {
      const insights = orchestrator.generateInsights();

      expect(insights).toBeDefined();
      expect(Array.isArray(insights)).toBe(true);
    });

    it('should emit insights-generated event', () => {
      const eventSpy = jest.fn();
      orchestrator.on('insights-generated', eventSpy);

      orchestrator.generateInsights();

      expect(eventSpy).toHaveBeenCalled();
    });
  });

  describe('getActiveInsights', () => {
    it('should return non-acknowledged insights', () => {
      // Insert test insight
      db.executeWrite(
        `INSERT INTO insights (
          insight_type, title, description, severity, data_json, created_at
        ) VALUES (
          'workload_spike', 'High Workload', 'You have many tasks due soon',
          'warning', '{}', datetime('now')
        )`,
        [],
        'insights'
      );

      const active = orchestrator.getActiveInsights();

      expect(active).toBeDefined();
      expect(Array.isArray(active)).toBe(true);
      expect(active.length).toBeGreaterThan(0);
    });

    it('should exclude acknowledged insights', () => {
      // Insert acknowledged insight
      db.executeWrite(
        `INSERT INTO insights (
          insight_type, title, description, severity, data_json,
          acknowledged_at, created_at
        ) VALUES (
          'workload_spike', 'Old Insight', 'Acknowledged',
          'warning', '{}', datetime('now'), datetime('now')
        )`,
        [],
        'insights'
      );

      const active = orchestrator.getActiveInsights();

      // Acknowledged insights should not be in active list
      const found = active.find((i) => i.title === 'Old Insight');
      expect(found).toBeUndefined();
    });

    it('should filter by severity', () => {
      // Insert insights with different severities
      db.executeWrite(
        `INSERT INTO insights (
          insight_type, title, description, severity, data_json, created_at
        ) VALUES
        ('test1', 'Info Insight', 'Info level', 'info', '{}', datetime('now')),
        ('test2', 'Warning Insight', 'Warning level', 'warning', '{}', datetime('now'))`,
        [],
        'insights'
      );

      const warnings = orchestrator.getActiveInsights('warning');

      expect(warnings).toBeDefined();
      // Should only have warning severity
      warnings.forEach((i) => {
        expect(i.severity).toBe('warning');
      });
    });
  });

  describe('acknowledgeInsight', () => {
    it('should mark insight as acknowledged', () => {
      db.executeWrite(
        `INSERT INTO insights (
          insight_type, title, description, severity, data_json, created_at
        ) VALUES (
          'test', 'Test Insight', 'Description', 'info', '{}', datetime('now')
        )`,
        [],
        'insights'
      );

      const insight = db.executeReadOne<{ id: number }>(
        'SELECT id FROM insights ORDER BY id DESC LIMIT 1'
      );

      if (insight) {
        orchestrator.acknowledgeInsight(insight.id);

        const updated = db.executeReadOne<{ acknowledged_at: string | null }>(
          'SELECT acknowledged_at FROM insights WHERE id = ?',
          [insight.id]
        );
        expect(updated?.acknowledged_at).not.toBeNull();
      }
    });

    it('should emit insight-acknowledged event', () => {
      const eventSpy = jest.fn();
      orchestrator.on('insight-acknowledged', eventSpy);

      db.executeWrite(
        `INSERT INTO insights (
          insight_type, title, description, severity, data_json, created_at
        ) VALUES (
          'test', 'Test Insight', 'Description', 'info', '{}', datetime('now')
        )`,
        [],
        'insights'
      );

      const insight = db.executeReadOne<{ id: number }>(
        'SELECT id FROM insights ORDER BY id DESC LIMIT 1'
      );

      if (insight) {
        orchestrator.acknowledgeInsight(insight.id);
        expect(eventSpy).toHaveBeenCalled();
      }
    });
  });

  describe('getInsightsByCourse', () => {
    it('should return insights for specific course', () => {
      // Insert course-specific insight
      db.executeWrite(
        `INSERT INTO insights (
          insight_type, title, description, severity, data_json, created_at
        ) VALUES (
          'grade_drop', 'Grade Dropping', 'Course grade is declining',
          'warning', ?, datetime('now')
        )`,
        [JSON.stringify({ courseId: testCourseId })],
        'insights'
      );

      const insights = orchestrator.getInsightsByCourse(testCourseId);

      expect(insights).toBeDefined();
      expect(Array.isArray(insights)).toBe(true);
    });
  });

  describe('cleanupOldInsights', () => {
    it('should remove old acknowledged insights', () => {
      // Insert old acknowledged insight
      db.executeWrite(
        `INSERT INTO insights (
          insight_type, title, description, severity, data_json,
          acknowledged_at, created_at
        ) VALUES (
          'old_type', 'Old Insight', 'Very old',
          'info', '{}', datetime('now', '-30 days'), datetime('now', '-30 days')
        )`,
        [],
        'insights'
      );

      orchestrator.cleanupOldInsights();

      const count = db.executeReadOne<{ cnt: number }>(
        "SELECT COUNT(*) as cnt FROM insights WHERE title = 'Old Insight'"
      );
      expect(count?.cnt).toBe(0);
    });

    it('should remove expired insights', () => {
      // Insert expired insight
      db.executeWrite(
        `INSERT INTO insights (
          insight_type, title, description, severity, data_json,
          expires_at, created_at
        ) VALUES (
          'expired_type', 'Expired Insight', 'Has expired',
          'info', '{}', datetime('now', '-1 day'), datetime('now', '-2 days')
        )`,
        [],
        'insights'
      );

      orchestrator.cleanupOldInsights();

      const count = db.executeReadOne<{ cnt: number }>(
        "SELECT COUNT(*) as cnt FROM insights WHERE title = 'Expired Insight'"
      );
      expect(count?.cnt).toBe(0);
    });
  });

  describe('getInsightHistory', () => {
    it('should return recent insights including acknowledged', () => {
      // Insert multiple insights
      db.executeWrite(
        `INSERT INTO insights (
          insight_type, title, description, severity, data_json, created_at
        ) VALUES
        ('type1', 'Insight 1', 'Desc 1', 'info', '{}', datetime('now')),
        ('type2', 'Insight 2', 'Desc 2', 'warning', '{}', datetime('now', '-1 hour'))`,
        [],
        'insights'
      );

      const history = orchestrator.getInsightHistory(7);

      expect(history).toBeDefined();
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(2);
    });
  });

  describe('stop', () => {
    it('should stop auto-refresh timer', () => {
      const autoRefreshOrchestrator = new InsightOrchestrator(db, {
        autoRefresh: true,
        refreshIntervalMs: 100,
      });

      expect(() => autoRefreshOrchestrator.stop()).not.toThrow();
      expect(() => autoRefreshOrchestrator.stop()).not.toThrow();
    });
  });
});
