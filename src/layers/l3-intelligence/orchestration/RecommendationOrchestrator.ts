/**
 * RecommendationOrchestrator - Coordinates Recommendation Generation with Database
 *
 * This class orchestrates the recommendation process:
 * 1. Fetches task and context data
 * 2. Calls pure domain functions from RecommendationEngine
 * 3. Persists recommendations to database
 * 4. Handles dismissals and actions
 * 5. Emits events for UI updates
 */

import { EventEmitter } from 'events';
import { Database } from '../../l1-persistence/Database';
import {
  generateAllRecommendations,
  getActiveRecommendations,
} from '../domain/RecommendationEngine';
import { identifyStrugglePatterns, calculateCourseDifficulty } from '../domain/BehaviorAnalytics';
import { batchEstimateEffort } from '../domain/EffortEstimator';
import { MessageProbationService } from '../domain/MessageProbationService';
import {
  Recommendation,
  RecommendationType,
  RecommendationContext,
  TaskForPriority,
  CourseForPriority,
  EffortEstimate,
  TaskCompletionEvent,
  StrugglePattern,
  CoursePerformance,
} from '../types';

/**
 * Raw recommendation from database
 */
interface RecommendationRow {
  id: number;
  recommendation_type: string;
  task_id: number | null;
  course_id: number | null;
  title: string;
  description: string;
  reasoning: string;
  priority_score: number;
  valid_from: string;
  valid_until: string;
  dismissed_at: string | null;
  acted_on_at: string | null;
  created_at: string;
}

/**
 * Raw task from database
 */
interface TaskRow {
  id: number;
  course_id: number;
  title: string;
  due_at: string | null;
  unlock_at: string | null;
  lock_at: string | null;
  points_possible: number | null;
  weight: number | null;
  is_completed: number;
  grade: number | null;
  task_type: string | null;
  task_group_id: number | null;
  submission_status: string | null;
}

/**
 * Raw course from database
 */
interface CourseRow {
  id: number;
  code: string;
  name: string;
  current_grade: number | null;
  target_grade: number;
  total_weight: number;
}

/**
 * Configuration for RecommendationOrchestrator
 */
export interface RecommendationOrchestratorConfig {
  /** How often to regenerate recommendations in milliseconds (default: 30 minutes) */
  refreshIntervalMs?: number;
  /** Default available minutes for context (default: 120) */
  defaultAvailableMinutes?: number;
  /** Maximum recommendations to keep in database (default: 100) */
  maxStoredRecommendations?: number;
  /** Whether to auto-refresh (default: true) */
  autoRefresh?: boolean;
}

const DEFAULT_CONFIG: Required<RecommendationOrchestratorConfig> = {
  refreshIntervalMs: 30 * 60 * 1000, // 30 minutes
  defaultAvailableMinutes: 120,
  maxStoredRecommendations: 100,
  autoRefresh: true,
};

/**
 * RecommendationOrchestrator manages recommendation lifecycle
 *
 * Events:
 * - 'recommendations-generated': Emitted when new recommendations are created
 * - 'recommendation-dismissed': Emitted when a recommendation is dismissed
 * - 'recommendation-acted': Emitted when user acts on a recommendation
 * - 'error': Emitted on errors
 */
export class RecommendationOrchestrator extends EventEmitter {
  private db: Database;
  private config: Required<RecommendationOrchestratorConfig>;
  private refreshTimer: NodeJS.Timeout | null = null;
  private cachedRecommendations: Recommendation[] = [];
  private probationService: MessageProbationService;

  constructor(db: Database, config?: RecommendationOrchestratorConfig) {
    super();
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.probationService = new MessageProbationService(db);

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
        this.generateRecommendations();
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
   * Fetch tasks from database
   */
  private fetchTasks(): TaskForPriority[] {
    const rows = this.db.executeRead<TaskRow>(`
      SELECT
        id, course_id, title, due_at, unlock_at, lock_at,
        points_possible, weight, is_completed, grade,
        task_type, task_group_id, submission_status
      FROM tasks
      WHERE is_completed = 0
      ORDER BY due_at ASC
    `);

    return rows.map((row) => ({
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
    }));
  }

  /**
   * Fetch courses from database
   */
  private fetchCourses(): Map<number, CourseForPriority> {
    const rows = this.db.executeRead<CourseRow>(`
      SELECT id, code, name, current_grade, target_grade, total_weight
      FROM courses WHERE deleted_at IS NULL
    `);

    const map = new Map<number, CourseForPriority>();
    for (const row of rows) {
      map.set(row.id, {
        id: row.id,
        code: row.code,
        name: row.name,
        currentGrade: row.current_grade,
        targetGrade: row.target_grade,
        totalWeight: row.total_weight,
      });
    }
    return map;
  }

  /**
   * Fetch completion events
   */
  private fetchCompletionEvents(): TaskCompletionEvent[] {
    const rows = this.db.executeRead<{
      id: number;
      task_id: number;
      course_id: number;
      task_type: string;
      started_at: string | null;
      completed_at: string;
      due_at: string | null;
      time_to_complete_minutes: number | null;
      day_of_week: number;
      hour_of_day: number;
      days_before_due: number | null;
      was_late: number;
      score_achieved: number | null;
      points_possible: number | null;
    }>(`SELECT * FROM task_completion_events ORDER BY completed_at DESC LIMIT 100`);

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
   * Generate recommendations based on current context
   */
  generateRecommendations(availableMinutes?: number): Recommendation[] {
    const currentTime = new Date();
    const tasks = this.fetchTasks();
    const courses = this.fetchCourses();
    const events = this.fetchCompletionEvents();

    // Get effort estimates
    const effortEstimates = new Map<number, EffortEstimate>();
    const estimates = batchEstimateEffort(tasks, events);
    for (const est of estimates) {
      effortEstimates.set(est.taskId, est);
    }

    // Get behavior patterns
    const strugglePatterns = identifyStrugglePatterns(events);
    const coursePerformance = calculateCourseDifficulty(events, Array.from(courses.values()));

    // Build context
    const context: RecommendationContext = {
      currentTime,
      availableMinutes: availableMinutes ?? this.config.defaultAvailableMinutes,
      recentActivity: events.slice(0, 20),
      userPatterns: [],
    };

    // Generate recommendations
    let recommendations = generateAllRecommendations(
      tasks,
      courses,
      effortEstimates,
      events,
      strugglePatterns,
      coursePerformance,
      context
    );

    // Filter out grounded recommendations (duplicate prevention)
    recommendations = this.probationService.filterGrounded(
      recommendations,
      'recommendation',
      (rec) => this.probationService.generateContentHash(
        'recommendation',
        rec.type,
        rec.title,
        { taskId: rec.taskId, courseId: rec.courseId }
      )
    );

    // Save to database and record displays
    for (const rec of recommendations) {
      this.saveRecommendation(rec);

      // Record display for probation tracking
      const contentHash = this.probationService.generateContentHash(
        'recommendation',
        rec.type,
        rec.title,
        { taskId: rec.taskId, courseId: rec.courseId }
      );
      this.probationService.recordDisplay('recommendation', contentHash);
    }

    // Prune old recommendations
    this.pruneOldRecommendations();

    this.cachedRecommendations = recommendations;
    this.emit('recommendations-generated', recommendations);

    return recommendations;
  }

  /**
   * Save recommendation to database
   */
  private saveRecommendation(recommendation: Recommendation): number {
    const result = this.db.executeWrite(
      `INSERT INTO recommendations (
        recommendation_type, task_id, course_id, title, description,
        reasoning, priority_score, valid_from, valid_until
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        recommendation.type,
        recommendation.taskId,
        recommendation.courseId,
        recommendation.title,
        recommendation.description,
        recommendation.reasoning,
        recommendation.priorityScore,
        recommendation.validFrom.toISOString(),
        recommendation.validUntil.toISOString(),
      ],
      'recommendations'
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Get active (not dismissed, not expired) recommendations
   */
  getActiveRecommendations(): Recommendation[] {
    const now = new Date();
    const rows = this.db.executeRead<RecommendationRow>(`
      SELECT * FROM recommendations
      WHERE dismissed_at IS NULL
        AND acted_on_at IS NULL
        AND valid_from <= ?
        AND valid_until >= ?
      ORDER BY priority_score DESC
    `, [now.toISOString(), now.toISOString()]);

    return rows.map((row) => this.mapRecommendationRow(row));
  }

  /**
   * Get all recommendations (including dismissed)
   */
  getAllRecommendations(limit: number = 50): Recommendation[] {
    const rows = this.db.executeRead<RecommendationRow>(`
      SELECT * FROM recommendations
      ORDER BY created_at DESC
      LIMIT ?
    `, [limit]);

    return rows.map((row) => this.mapRecommendationRow(row));
  }

  /**
   * Map database row to domain type
   */
  private mapRecommendationRow(row: RecommendationRow): Recommendation {
    return {
      id: row.id,
      type: row.recommendation_type as RecommendationType,
      taskId: row.task_id,
      courseId: row.course_id,
      title: row.title,
      description: row.description,
      reasoning: row.reasoning,
      priorityScore: row.priority_score,
      validFrom: new Date(row.valid_from),
      validUntil: new Date(row.valid_until),
      dismissedAt: row.dismissed_at ? new Date(row.dismissed_at) : null,
      actedOnAt: row.acted_on_at ? new Date(row.acted_on_at) : null,
      createdAt: new Date(row.created_at),
    };
  }

  /**
   * Dismiss a recommendation
   */
  dismissRecommendation(recommendationId: number): boolean {
    const result = this.db.executeWrite(
      `UPDATE recommendations SET dismissed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [recommendationId],
      'recommendations'
    );

    if (result.changes > 0) {
      this.emit('recommendation-dismissed', { id: recommendationId });
      return true;
    }
    return false;
  }

  /**
   * Mark a recommendation as acted upon
   */
  markRecommendationActed(recommendationId: number): boolean {
    const result = this.db.executeWrite(
      `UPDATE recommendations SET acted_on_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [recommendationId],
      'recommendations'
    );

    if (result.changes > 0) {
      this.emit('recommendation-acted', { id: recommendationId });
      return true;
    }
    return false;
  }

  /**
   * Get recommendation by ID
   */
  getRecommendation(recommendationId: number): Recommendation | null {
    const row = this.db.executeReadOne<RecommendationRow>(
      `SELECT * FROM recommendations WHERE id = ?`,
      [recommendationId]
    );

    return row ? this.mapRecommendationRow(row) : null;
  }

  /**
   * Get recommendations for a specific task
   */
  getRecommendationsForTask(taskId: number): Recommendation[] {
    const now = new Date();
    const rows = this.db.executeRead<RecommendationRow>(`
      SELECT * FROM recommendations
      WHERE task_id = ?
        AND dismissed_at IS NULL
        AND valid_until >= ?
      ORDER BY priority_score DESC
    `, [taskId, now.toISOString()]);

    return rows.map((row) => this.mapRecommendationRow(row));
  }

  /**
   * Get recommendations for a specific course
   */
  getRecommendationsForCourse(courseId: number): Recommendation[] {
    const now = new Date();
    const rows = this.db.executeRead<RecommendationRow>(`
      SELECT * FROM recommendations
      WHERE course_id = ?
        AND dismissed_at IS NULL
        AND valid_until >= ?
      ORDER BY priority_score DESC
    `, [courseId, now.toISOString()]);

    return rows.map((row) => this.mapRecommendationRow(row));
  }

  /**
   * Prune old recommendations
   */
  private pruneOldRecommendations(): number {
    // Keep only the most recent N recommendations
    const result = this.db.executeWrite(
      `DELETE FROM recommendations
       WHERE id NOT IN (
         SELECT id FROM recommendations ORDER BY created_at DESC LIMIT ?
       )`,
      [this.config.maxStoredRecommendations],
      'recommendations'
    );

    return result.changes;
  }

  /**
   * Get cached recommendations
   */
  getCachedRecommendations(): Recommendation[] {
    return this.cachedRecommendations;
  }

  /**
   * Get recommendation statistics
   */
  getStatistics(): {
    totalGenerated: number;
    totalDismissed: number;
    totalActedOn: number;
    activeCount: number;
  } {
    const total = this.db.executeReadOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM recommendations`
    );
    const dismissed = this.db.executeReadOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM recommendations WHERE dismissed_at IS NOT NULL`
    );
    const actedOn = this.db.executeReadOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM recommendations WHERE acted_on_at IS NOT NULL`
    );
    const active = this.db.executeReadOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM recommendations
       WHERE dismissed_at IS NULL AND acted_on_at IS NULL
       AND valid_until >= datetime('now')`
    );

    return {
      totalGenerated: total?.count ?? 0,
      totalDismissed: dismissed?.count ?? 0,
      totalActedOn: actedOn?.count ?? 0,
      activeCount: active?.count ?? 0,
    };
  }
}
