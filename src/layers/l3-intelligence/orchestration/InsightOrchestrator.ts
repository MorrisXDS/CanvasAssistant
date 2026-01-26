/**
 * InsightOrchestrator - Coordinates Insight Generation with Database
 *
 * This class orchestrates the insight generation process:
 * 1. Fetches behavioral and performance data
 * 2. Calls pure domain functions from InsightGenerator
 * 3. Persists insights to database
 * 4. Handles acknowledgments
 * 5. Emits events for UI updates
 */

import { EventEmitter } from 'events';
import { Database } from '../../l1-persistence/Database';
import { VisibleDataProvider } from '../../l1-persistence/VisibleDataProvider';
import type {
  InsightRow,
  TaskRowWithFieldSources,
  CourseRowMinimal,
  CompletionEventRow,
} from '../../l1-persistence/DatabaseRowTypes';
import {
  generateAllInsights,
  getInsightIcon,
  getSeverityColor,
} from '../domain/InsightGenerator';
import {
  analyzeWeeklyRhythm,
  calculateCourseDifficulty,
} from '../domain/BehaviorAnalytics';
import { analyzeWorkloadDistribution } from '../domain/WorkloadAnalyzer';
import { batchEstimateEffort } from '../domain/EffortEstimator';
import { MessageProbationService } from '../domain/MessageProbationService';
import { ORCHESTRATOR_DEFAULTS } from '../domain/Constants';
import {
  Insight,
  InsightType,
  InsightSeverity,
  TaskCompletionEvent,
  WorkloadDistribution,
  TaskForPriority,
  CourseForPriority,
  EffortEstimate,
} from '../types';

/**
 * Configuration for InsightOrchestrator
 */
export interface InsightOrchestratorConfig {
  /** How often to regenerate insights in milliseconds (default: 6 hours) */
  refreshIntervalMs?: number;
  /** Maximum insights to keep in database (default: 50) */
  maxStoredInsights?: number;
  /** Whether to auto-refresh (default: true) */
  autoRefresh?: boolean;
}

const DEFAULT_CONFIG: Required<InsightOrchestratorConfig> = {
  ...ORCHESTRATOR_DEFAULTS.INSIGHT,
};

/**
 * InsightOrchestrator manages insight lifecycle
 *
 * Events:
 * - 'insights-generated': Emitted when new insights are created
 * - 'insight-acknowledged': Emitted when an insight is acknowledged
 * - 'new-insight': Emitted for each new significant insight
 * - 'error': Emitted on errors
 */
export class InsightOrchestrator extends EventEmitter {
  private db: Database;
  private visibleDataProvider: VisibleDataProvider | null;
  private config: Required<InsightOrchestratorConfig>;
  private refreshTimer: NodeJS.Timeout | null = null;
  private cachedInsights: Insight[] = [];
  private probationService: MessageProbationService;

  constructor(
    db: Database,
    config?: InsightOrchestratorConfig,
    visibleDataProvider?: VisibleDataProvider
  ) {
    super();
    this.db = db;
    this.visibleDataProvider = visibleDataProvider ?? null;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.probationService = new MessageProbationService(db);

    // Clear cache on visibility changes
    if (this.visibleDataProvider) {
      this.visibleDataProvider.on('visibility-changed', () => {
        this.cachedInsights = [];
      });
      this.visibleDataProvider.on('settings-changed', () => {
        this.cachedInsights = [];
      });
    }

    if (this.config.autoRefresh) {
      this.startAutoRefresh();
    }
  }

  /**
   * Start auto-refresh timer
   */
  private startAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = setInterval(() => {
      try {
        this.generateInsights();
      } catch (error) {
        this.emit('error', error);
      }
    }, this.config.refreshIntervalMs);
  }

  /**
   * Stop auto-refresh timer
   */
  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Fetch completion events from database
   */
  private fetchCompletionEvents(): TaskCompletionEvent[] {
    const rows = this.db.executeRead<CompletionEventRow>(
      `SELECT * FROM task_completion_events ORDER BY completed_at DESC`
    );

    return rows.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      courseId: row.course_id,
      taskType: row.task_type,
      startedAt: row.started_at ? new Date(row.started_at) : null,
      completedAt: new Date(row.completed_at),
      dueAt: row.due_at ? new Date(row.due_at) : null,
      timeToCompleteMinutes: row.time_to_complete_minutes,
      dayOfWeek: row.day_of_week,
      hourOfDay: row.hour_of_day,
      daysBeforeDue: row.days_before_due,
      wasLate: Boolean(row.was_late),
      scoreAchieved: row.score_achieved,
      pointsPossible: row.points_possible,
    }));
  }

  /**
   * Fetch tasks from database
   */
  private fetchTasks(): TaskForPriority[] {
    const visibleCourseIds = this.visibleDataProvider?.getVisibleCourseIds();

    let sql = `
      SELECT
        id, course_id, title, due_at, unlock_at, lock_at,
        points_possible, weight, is_completed, grade,
        task_type, task_group_id, submission_status, field_sources
      FROM tasks
      WHERE is_completed = 0
    `;

    if (visibleCourseIds && visibleCourseIds.length > 0) {
      sql += ` AND course_id IN (${visibleCourseIds.join(',')})`;
    } else if (visibleCourseIds && visibleCourseIds.length === 0) {
      return [];
    }

    sql += ` ORDER BY due_at ASC`;

    const rows = this.db.executeRead<TaskRowWithFieldSources>(sql);

    return rows.map((row) => {
      let fieldSources: Record<string, 'canvas' | 'user' | 'guessed'> | undefined;
      if (row.field_sources) {
        try {
          fieldSources = JSON.parse(row.field_sources);
        } catch {
          fieldSources = undefined;
        }
      }

      return {
        id: row.id,
        courseId: row.course_id,
        title: row.title,
        dueAt: row.due_at ? new Date(row.due_at) : null,
        unlockAt: row.unlock_at ? new Date(row.unlock_at) : null,
        lockAt: row.lock_at ? new Date(row.lock_at) : null,
        pointsPossible: row.points_possible,
        weight: row.weight,
        isCompleted: Boolean(row.is_completed),
        isPinned: false,
        grade: row.grade,
        submittedAt: null,
        taskType: row.task_type || 'assignment',
        taskGroupId: row.task_group_id,
        submissionStatus: row.submission_status as TaskForPriority['submissionStatus'],
        fieldSources,
      };
    });
  }

  /**
   * Fetch courses from database
   * Uses VisibleDataProvider to filter to visible courses only
   */
  private fetchCourses(): CourseForPriority[] {
    const visibleCourseIds = this.visibleDataProvider?.getVisibleCourseIds();

    let sql = `
      SELECT id, code, name, current_grade, target_grade, total_weight
      FROM courses WHERE deleted_at IS NULL
    `;

    if (visibleCourseIds && visibleCourseIds.length > 0) {
      sql += ` AND id IN (${visibleCourseIds.join(',')})`;
    } else if (visibleCourseIds && visibleCourseIds.length === 0) {
      return [];
    }

    const rows = this.db.executeRead<CourseRowMinimal>(sql);

    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      currentGrade: row.current_grade,
      targetGrade: row.target_grade,
      totalWeight: row.total_weight,
    }));
  }

  /**
   * Generate insights based on available data
   */
  generateInsights(): Insight[] {
    const currentTime = new Date();
    const events = this.fetchCompletionEvents();
    const tasks = this.fetchTasks();
    const courses = this.fetchCourses();

    // Calculate patterns
    const rhythm = analyzeWeeklyRhythm(events);
    const coursePerformance = calculateCourseDifficulty(events, courses);

    // Calculate workload (optional - may be null if no tasks)
    let workload: WorkloadDistribution | null = null;
    if (tasks.length > 0) {
      const effortEstimates = new Map<number, EffortEstimate>();
      const estimates = batchEstimateEffort(tasks, events);
      for (const est of estimates) {
        effortEstimates.set(est.taskId, est);
      }

      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 14);
      workload = analyzeWorkloadDistribution(tasks, startDate, endDate, effortEstimates);
    }

    // Generate insights
    let insights = generateAllInsights(
      events,
      coursePerformance,
      rhythm,
      workload,
      tasks,
      currentTime
    );

    // Filter out grounded insights (duplicate prevention)
    insights = this.probationService.filterGrounded(
      insights,
      'insight',
      (insight) =>
        this.probationService.generateContentHash(
          'insight',
          insight.type,
          insight.title,
          insight.data || {}
        ),
      (insight) => insight.type // Pass subType for type-specific frequency settings
    );

    // Save new insights and check for duplicates
    const existingTypes = new Set(
      this.getActiveInsights().map((i) => `${i.type}:${JSON.stringify(i.data)}`)
    );

    for (const insight of insights) {
      const key = `${insight.type}:${JSON.stringify(insight.data)}`;
      if (!existingTypes.has(key)) {
        const id = this.saveInsight(insight);
        insight.id = id;

        // Record display for probation tracking
        const contentHash = this.probationService.generateContentHash(
          'insight',
          insight.type,
          insight.title,
          insight.data || {}
        );
        this.probationService.recordDisplay('insight', contentHash, insight.type);

        // Emit for critical/warning insights
        if (insight.severity === 'critical' || insight.severity === 'warning') {
          this.emit('new-insight', insight);
        }
      }
    }

    // Prune old insights
    this.pruneOldInsights();

    this.cachedInsights = insights;
    this.emit('insights-generated', insights);

    return insights;
  }

  /**
   * Save insight to database
   */
  private saveInsight(insight: Insight): number {
    const result = this.db.executeWrite(
      `INSERT INTO user_insights (
        insight_type, title, description, severity, data_json, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        insight.type,
        insight.title,
        insight.description,
        insight.severity,
        JSON.stringify(insight.data),
        insight.expiresAt?.toISOString() ?? null,
      ],
      'user_insights'
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Get active (not acknowledged, not expired, not suppressed forever) insights
   */
  getActiveInsights(): Insight[] {
    const now = new Date();
    const rows = this.db.executeRead<InsightRow>(
      `
      SELECT * FROM user_insights
      WHERE acknowledged_at IS NULL
        AND (suppressed_forever IS NULL OR suppressed_forever = 0)
        AND (expires_at IS NULL OR expires_at >= ?)
      ORDER BY
        CASE severity
          WHEN 'critical' THEN 0
          WHEN 'warning' THEN 1
          WHEN 'info' THEN 2
        END,
        created_at DESC
    `,
      [now.toISOString()]
    );

    return rows.map((row) => this.mapInsightRow(row));
  }

  /**
   * Get all insights (including acknowledged)
   */
  getAllInsights(limit: number = 50): Insight[] {
    const rows = this.db.executeRead<InsightRow>(
      `
      SELECT * FROM user_insights
      ORDER BY created_at DESC
      LIMIT ?
    `,
      [limit]
    );

    return rows.map((row) => this.mapInsightRow(row));
  }

  /**
   * Map database row to domain type
   */
  private mapInsightRow(row: InsightRow): Insight {
    return {
      id: row.id,
      type: row.insight_type as InsightType,
      title: row.title,
      description: row.description,
      severity: row.severity as InsightSeverity,
      data: JSON.parse(row.data_json || '{}'),
      acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at) : null,
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      createdAt: new Date(row.created_at),
    };
  }

  /**
   * Acknowledge an insight
   */
  acknowledgeInsight(insightId: number): boolean {
    const result = this.db.executeWrite(
      `UPDATE user_insights SET acknowledged_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [insightId],
      'user_insights'
    );

    if (result.changes > 0) {
      this.emit('insight-acknowledged', { id: insightId });
      return true;
    }
    return false;
  }

  /**
   * Acknowledge all insights
   */
  acknowledgeAllInsights(): number {
    const result = this.db.executeWrite(
      `UPDATE user_insights SET acknowledged_at = CURRENT_TIMESTAMP WHERE acknowledged_at IS NULL`,
      [],
      'user_insights'
    );

    return result.changes;
  }

  /**
   * Permanently suppress an insight ("Never show again")
   * Sets suppressed_forever = 1 so it won't appear in getActiveInsights
   */
  suppressInsightForever(insightId: number): boolean {
    const result = this.db.executeWrite(
      `UPDATE user_insights SET suppressed_forever = 1 WHERE id = ?`,
      [insightId],
      'user_insights'
    );

    if (result.changes > 0) {
      this.emit('insight-suppressed', { id: insightId });
      return true;
    }
    return false;
  }

  /**
   * Get insight by ID
   */
  getInsight(insightId: number): Insight | null {
    const row = this.db.executeReadOne<InsightRow>(
      `SELECT * FROM user_insights WHERE id = ?`,
      [insightId]
    );

    return row ? this.mapInsightRow(row) : null;
  }

  /**
   * Get insights by type
   */
  getInsightsByType(type: InsightType): Insight[] {
    const rows = this.db.executeRead<InsightRow>(
      `
      SELECT * FROM user_insights
      WHERE insight_type = ?
      ORDER BY created_at DESC
    `,
      [type]
    );

    return rows.map((row) => this.mapInsightRow(row));
  }

  /**
   * Get insights by severity
   */
  getInsightsBySeverity(severity: InsightSeverity): Insight[] {
    const now = new Date();
    const rows = this.db.executeRead<InsightRow>(
      `
      SELECT * FROM user_insights
      WHERE severity = ?
        AND acknowledged_at IS NULL
        AND (expires_at IS NULL OR expires_at >= ?)
      ORDER BY created_at DESC
    `,
      [severity, now.toISOString()]
    );

    return rows.map((row) => this.mapInsightRow(row));
  }

  /**
   * Prune old insights
   */
  private pruneOldInsights(): number {
    const result = this.db.executeWrite(
      `DELETE FROM user_insights
       WHERE id NOT IN (
         SELECT id FROM user_insights ORDER BY created_at DESC LIMIT ?
       )`,
      [this.config.maxStoredInsights],
      'user_insights'
    );

    return result.changes;
  }

  /**
   * Get cached insights
   */
  getCachedInsights(): Insight[] {
    return this.cachedInsights;
  }

  /**
   * Get insight statistics
   */
  getStatistics(): {
    totalGenerated: number;
    totalAcknowledged: number;
    activeCount: number;
    bySeverity: Record<InsightSeverity, number>;
    byType: Record<string, number>;
  } {
    const total = this.db.executeReadOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM user_insights`
    );
    const acknowledged = this.db.executeReadOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM user_insights WHERE acknowledged_at IS NOT NULL`
    );
    const active = this.db.executeReadOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM user_insights
       WHERE acknowledged_at IS NULL
       AND (expires_at IS NULL OR expires_at >= datetime('now'))`
    );

    const severityCounts = this.db.executeRead<{ severity: string; count: number }>(`
      SELECT severity, COUNT(*) as count FROM user_insights
      WHERE acknowledged_at IS NULL
      GROUP BY severity
    `);

    const typeCounts = this.db.executeRead<{ insight_type: string; count: number }>(`
      SELECT insight_type, COUNT(*) as count FROM user_insights
      WHERE acknowledged_at IS NULL
      GROUP BY insight_type
    `);

    const bySeverity: Record<InsightSeverity, number> = {
      info: 0,
      warning: 0,
      critical: 0,
    };
    for (const row of severityCounts) {
      bySeverity[row.severity as InsightSeverity] = row.count;
    }

    const byType: Record<string, number> = {};
    for (const row of typeCounts) {
      byType[row.insight_type] = row.count;
    }

    return {
      totalGenerated: total?.count ?? 0,
      totalAcknowledged: acknowledged?.count ?? 0,
      activeCount: active?.count ?? 0,
      bySeverity,
      byType,
    };
  }

  /**
   * Get display helpers
   */
  getIcon(type: InsightType): string {
    return getInsightIcon(type);
  }

  getColor(severity: InsightSeverity): string {
    return getSeverityColor(severity);
  }
}
