/**
 * BehaviorTrackingOrchestrator - Coordinates Behavior Analysis with Database
 *
 * This class orchestrates the behavior tracking and analysis process:
 * 1. Records task completion events to database
 * 2. Refreshes pattern calculations periodically
 * 3. Manages event pruning for data hygiene
 * 4. Emits events for UI updates
 */

import { EventEmitter } from 'events';
import { Database } from '../../l1-persistence/Database';
import { VisibleDataProvider } from '../../l1-persistence/VisibleDataProvider';
import type {
  CompletionEventRow,
  BehaviorPatternRow,
  CourseRowMinimal,
} from '../../l1-persistence/DatabaseRowTypes';
import {
  analyzeWeeklyRhythm,
  calculateCourseDifficulty,
  identifyStrugglePatterns,
  analyzeCompletionTiming,
} from '../domain/BehaviorAnalytics';
import { ORCHESTRATOR_DEFAULTS } from '../domain/Constants';
import {
  TaskCompletionEvent,
  UserBehaviorPattern,
  WeeklyRhythm,
  CoursePerformance,
  StrugglePattern,
  CourseForPriority,
} from '../types';

/**
 * Configuration for BehaviorTrackingOrchestrator
 */
export interface BehaviorTrackingOrchestratorConfig {
  /** How often to refresh patterns in milliseconds (default: 1 hour) */
  refreshIntervalMs?: number;
  /** Maximum age of events to keep in days (default: 180) */
  maxEventAgeDays?: number;
  /** Whether to auto-refresh patterns (default: true) */
  autoRefresh?: boolean;
}

const DEFAULT_CONFIG: Required<BehaviorTrackingOrchestratorConfig> = {
  ...ORCHESTRATOR_DEFAULTS.BEHAVIOR_TRACKING,
};

/**
 * BehaviorTrackingOrchestrator manages behavior tracking lifecycle
 *
 * Events:
 * - 'patterns-updated': Emitted when patterns are recalculated
 * - 'event-recorded': Emitted when a completion event is recorded
 * - 'error': Emitted on errors
 */
export class BehaviorTrackingOrchestrator extends EventEmitter {
  private db: Database;
  private visibleDataProvider: VisibleDataProvider | null;
  private config: Required<BehaviorTrackingOrchestratorConfig>;
  private refreshTimer: NodeJS.Timeout | null = null;
  private cachedRhythm: WeeklyRhythm | null = null;
  private cachedCoursePerformance: CoursePerformance[] = [];
  private cachedStrugglePatterns: StrugglePattern[] = [];

  constructor(
    db: Database,
    config?: BehaviorTrackingOrchestratorConfig,
    visibleDataProvider?: VisibleDataProvider
  ) {
    super();
    this.db = db;
    this.visibleDataProvider = visibleDataProvider ?? null;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Clear cache on visibility changes
    if (this.visibleDataProvider) {
      this.visibleDataProvider.on('visibility-changed', () => {
        this.cachedRhythm = null;
        this.cachedCoursePerformance = [];
        this.cachedStrugglePatterns = [];
      });
      this.visibleDataProvider.on('settings-changed', () => {
        this.cachedRhythm = null;
        this.cachedCoursePerformance = [];
        this.cachedStrugglePatterns = [];
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
        this.refreshPatterns();
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
   * Record a task completion event
   */
  recordCompletionEvent(
    taskId: number,
    courseId: number,
    taskType: string,
    completedAt: Date,
    options: {
      startedAt?: Date;
      dueAt?: Date;
      scoreAchieved?: number;
      pointsPossible?: number;
    } = {}
  ): void {
    const { startedAt, dueAt, scoreAchieved, pointsPossible } = options;

    // Calculate derived fields
    const dayOfWeek = completedAt.getDay();
    const hourOfDay = completedAt.getHours();

    let timeToCompleteMinutes: number | null = null;
    if (startedAt) {
      timeToCompleteMinutes = Math.round(
        (completedAt.getTime() - startedAt.getTime()) / (1000 * 60)
      );
    }

    let daysBeforeDue: number | null = null;
    let wasLate = false;
    if (dueAt) {
      daysBeforeDue = Math.round(
        (dueAt.getTime() - completedAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      wasLate = daysBeforeDue < 0;
    }

    this.db.executeWrite(
      `INSERT INTO task_completion_events (
        task_id, course_id, task_type, started_at, completed_at, due_at,
        time_to_complete_minutes, day_of_week, hour_of_day, days_before_due,
        was_late, score_achieved, points_possible
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        taskId,
        courseId,
        taskType,
        startedAt?.toISOString() ?? null,
        completedAt.toISOString(),
        dueAt?.toISOString() ?? null,
        timeToCompleteMinutes,
        dayOfWeek,
        hourOfDay,
        daysBeforeDue,
        wasLate ? 1 : 0,
        scoreAchieved ?? null,
        pointsPossible ?? null,
      ],
      'task_completion_events'
    );

    this.emit('event-recorded', { taskId, courseId, taskType });
  }

  /**
   * Fetch all completion events from database
   */
  fetchCompletionEvents(limit?: number): TaskCompletionEvent[] {
    const sql = limit
      ? `SELECT * FROM task_completion_events ORDER BY completed_at DESC LIMIT ?`
      : `SELECT * FROM task_completion_events ORDER BY completed_at DESC`;

    const rows = limit
      ? this.db.executeRead<CompletionEventRow>(sql, [limit])
      : this.db.executeRead<CompletionEventRow>(sql);

    return rows.map((row) => this.mapEventRow(row));
  }

  /**
   * Fetch events for a specific course
   */
  fetchCourseEvents(courseId: number): TaskCompletionEvent[] {
    const rows = this.db.executeRead<CompletionEventRow>(
      `SELECT * FROM task_completion_events WHERE course_id = ? ORDER BY completed_at DESC`,
      [courseId]
    );

    return rows.map((row) => this.mapEventRow(row));
  }

  /**
   * Fetch events within a time range
   */
  fetchEventsByDateRange(startDate: Date, endDate: Date): TaskCompletionEvent[] {
    const rows = this.db.executeRead<CompletionEventRow>(
      `SELECT * FROM task_completion_events
       WHERE completed_at >= ? AND completed_at <= ?
       ORDER BY completed_at DESC`,
      [startDate.toISOString(), endDate.toISOString()]
    );

    return rows.map((row) => this.mapEventRow(row));
  }

  /**
   * Map database row to domain type
   */
  private mapEventRow(row: CompletionEventRow): TaskCompletionEvent {
    return {
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
    };
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
   * Refresh all behavior patterns
   */
  refreshPatterns(): void {
    const events = this.fetchCompletionEvents();
    const courses = this.fetchCourses();

    // Calculate patterns
    this.cachedRhythm = analyzeWeeklyRhythm(events);
    this.cachedCoursePerformance = calculateCourseDifficulty(events, courses);
    this.cachedStrugglePatterns = identifyStrugglePatterns(events);

    // Store patterns in database
    this.storePattern('weekly_rhythm', 'global', JSON.stringify(this.cachedRhythm), events.length);

    for (const course of this.cachedCoursePerformance) {
      this.storePattern(
        'course_difficulty',
        String(course.courseId),
        JSON.stringify(course),
        course.totalTasks
      );
    }

    for (const pattern of this.cachedStrugglePatterns) {
      this.storePattern(
        'task_type_performance',
        pattern.taskType,
        JSON.stringify(pattern),
        pattern.sampleSize
      );
    }

    this.emit('patterns-updated', {
      rhythm: this.cachedRhythm,
      coursePerformance: this.cachedCoursePerformance,
      strugglePatterns: this.cachedStrugglePatterns,
    });
  }

  /**
   * Store or update a pattern in database
   */
  private storePattern(
    patternType: string,
    patternKey: string,
    patternValue: string,
    sampleSize: number
  ): void {
    const confidence = Math.min(1, sampleSize / 50);

    this.db.executeWrite(
      `INSERT INTO user_behavior_patterns (pattern_type, pattern_key, pattern_value, sample_size, confidence, last_updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(pattern_type, pattern_key)
       DO UPDATE SET pattern_value = ?, sample_size = ?, confidence = ?, last_updated_at = CURRENT_TIMESTAMP`,
      [patternType, patternKey, patternValue, sampleSize, confidence, patternValue, sampleSize, confidence],
      'user_behavior_patterns'
    );
  }

  /**
   * Get cached weekly rhythm (or calculate if needed)
   */
  getWeeklyRhythm(): WeeklyRhythm {
    if (!this.cachedRhythm) {
      const events = this.fetchCompletionEvents();
      this.cachedRhythm = analyzeWeeklyRhythm(events);
    }
    return this.cachedRhythm;
  }

  /**
   * Get cached course performance (or calculate if needed)
   */
  getCoursePerformance(): CoursePerformance[] {
    if (this.cachedCoursePerformance.length === 0) {
      const events = this.fetchCompletionEvents();
      const courses = this.fetchCourses();
      this.cachedCoursePerformance = calculateCourseDifficulty(events, courses);
    }
    return this.cachedCoursePerformance;
  }

  /**
   * Get cached struggle patterns (or calculate if needed)
   */
  getStrugglePatterns(): StrugglePattern[] {
    if (this.cachedStrugglePatterns.length === 0) {
      const events = this.fetchCompletionEvents();
      this.cachedStrugglePatterns = identifyStrugglePatterns(events);
    }
    return this.cachedStrugglePatterns;
  }

  /**
   * Get completion timing statistics
   */
  getCompletionTiming(): ReturnType<typeof analyzeCompletionTiming> {
    const events = this.fetchCompletionEvents();
    return analyzeCompletionTiming(events);
  }

  /**
   * Prune old events beyond the configured max age
   */
  pruneOldEvents(): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.maxEventAgeDays);

    const result = this.db.executeWrite(
      `DELETE FROM task_completion_events WHERE completed_at < ?`,
      [cutoffDate.toISOString()],
      'task_completion_events'
    );

    return result.changes;
  }

  /**
   * Get event count
   */
  getEventCount(): number {
    const result = this.db.executeReadOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM task_completion_events`
    );
    return result?.count ?? 0;
  }
}
