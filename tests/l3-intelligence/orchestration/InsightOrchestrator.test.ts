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
        `INSERT INTO user_insights (
          insight_type, title, description, severity, data_json, created_at
        ) VALUES (
          'workload_spike', 'High Workload', 'You have many tasks due soon',
          'warning', '{}', datetime('now')
        )`,
        [],
        'user_insights'
      );

      const active = orchestrator.getActiveInsights();

      expect(active).toBeDefined();
      expect(Array.isArray(active)).toBe(true);
      expect(active.length).toBeGreaterThan(0);
    });

    it('should exclude acknowledged insights', () => {
      // Insert acknowledged insight
      db.executeWrite(
        `INSERT INTO user_insights (
          insight_type, title, description, severity, data_json,
          acknowledged_at, created_at
        ) VALUES (
          'workload_spike', 'Old Insight', 'Acknowledged',
          'warning', '{}', datetime('now'), datetime('now')
        )`,
        [],
        'user_insights'
      );

      const active = orchestrator.getActiveInsights();

      // Acknowledged insights should not be in active list
      const found = active.find((i) => i.title === 'Old Insight');
      expect(found).toBeUndefined();
    });

    it('should filter by severity', () => {
      // Insert insights with different severities
      db.executeWrite(
        `INSERT INTO user_insights (
          insight_type, title, description, severity, data_json, created_at
        ) VALUES
        ('test1', 'Info Insight', 'Info level', 'info', '{}', datetime('now')),
        ('test2', 'Warning Insight', 'Warning level', 'warning', '{}', datetime('now'))`,
        [],
        'user_insights'
      );

      const warnings = orchestrator.getInsightsBySeverity('warning');

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
        `INSERT INTO user_insights (
          insight_type, title, description, severity, data_json, created_at
        ) VALUES (
          'test', 'Test Insight', 'Description', 'info', '{}', datetime('now')
        )`,
        [],
        'user_insights'
      );

      const insight = db.executeReadOne<{ id: number }>(
        'SELECT id FROM user_insights ORDER BY id DESC LIMIT 1'
      );

      if (insight) {
        orchestrator.acknowledgeInsight(insight.id);

        const updated = db.executeReadOne<{ acknowledged_at: string | null }>(
          'SELECT acknowledged_at FROM user_insights WHERE id = ?',
          [insight.id]
        );
        expect(updated?.acknowledged_at).not.toBeNull();
      }
    });

    it('should emit insight-acknowledged event', () => {
      const eventSpy = jest.fn();
      orchestrator.on('insight-acknowledged', eventSpy);

      db.executeWrite(
        `INSERT INTO user_insights (
          insight_type, title, description, severity, data_json, created_at
        ) VALUES (
          'test', 'Test Insight', 'Description', 'info', '{}', datetime('now')
        )`,
        [],
        'user_insights'
      );

      const insight = db.executeReadOne<{ id: number }>(
        'SELECT id FROM user_insights ORDER BY id DESC LIMIT 1'
      );

      if (insight) {
        orchestrator.acknowledgeInsight(insight.id);
        expect(eventSpy).toHaveBeenCalled();
      }
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
