/**
 * WorkloadOrchestrator - Coordinates Workload Analysis with Database
 *
 * This class orchestrates the workload analysis process:
 * 1. Fetches tasks and effort estimates
 * 2. Calls pure domain functions from WorkloadAnalyzer
 * 3. Persists snapshots to database
 * 4. Emits events for UI updates
 */

import { EventEmitter } from 'events';
import { Database } from '../../l1-persistence/Database';
import { VisibleDataProvider } from '../../l1-persistence/VisibleDataProvider';
import type {
  TaskRowWithPriority,
  CourseRowMinimal,
  WorkloadSnapshotRow,
  CompletionEventRow,
} from '../../l1-persistence/DatabaseRowTypes';
import { ILogger, createNoopLogger } from '../../l0-utilities/Logger';
import {
  analyzeWorkloadDistribution,
  calculateClusteringScore,
  suggestRedistribution,
  detectNeglectedCourses,
  getDailyWorkloadSummary,
  identifyDeadlineClusters,
  calculateCourseBalanceScore,
} from '../domain/WorkloadAnalyzer';
import { batchEstimateEffort } from '../domain/EffortEstimator';
import { ORCHESTRATOR_DEFAULTS } from '../domain/Constants';
import {
  WorkloadSnapshot,
  WorkloadDistribution,
  RedistributionSuggestion,
  NeglectedCourse,
  TaskForPriority,
  CourseForPriority,
  EffortEstimate,
  TaskCompletionEvent,
  DailyPlanEntry,
} from '../types';

/**
 * Configuration for WorkloadOrchestrator
 */
export interface WorkloadOrchestratorConfig {
  /** Default hours available per day (default: 4) */
  defaultAvailableHoursPerDay?: number;
  /** Days to look ahead for workload analysis (default: 14) */
  defaultLookAheadDays?: number;
}

const DEFAULT_CONFIG: Required<WorkloadOrchestratorConfig> = {
  ...ORCHESTRATOR_DEFAULTS.WORKLOAD,
};

/**
 * WorkloadOrchestrator manages workload analysis lifecycle
 *
 * Events:
 * - 'workload-calculated': Emitted when workload is analyzed
 * - 'snapshot-saved': Emitted when a daily snapshot is saved
 * - 'error': Emitted on errors
 */
export class WorkloadOrchestrator extends EventEmitter {
  private db: Database;
  private visibleDataProvider: VisibleDataProvider | null;
  private config: Required<WorkloadOrchestratorConfig>;
  private cachedDistribution: WorkloadDistribution | null = null;
  private effortEstimatesCache: Map<number, EffortEstimate> = new Map();
  private log: ILogger;

  constructor(
    db: Database,
    config?: WorkloadOrchestratorConfig,
    visibleDataProvider?: VisibleDataProvider,
    logger?: ILogger
  ) {
    super();
    this.db = db;
    this.visibleDataProvider = visibleDataProvider ?? null;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.log = logger || createNoopLogger('workloadOrchestrator');

    // Clear cache on visibility changes
    if (this.visibleDataProvider) {
      this.visibleDataProvider.on('visibility-changed', () => {
        this.cachedDistribution = null;
      });
      this.visibleDataProvider.on('settings-changed', () => {
        this.cachedDistribution = null;
      });
    }
  }

  /**
   * Fetch incomplete tasks from database
   * Uses VisibleDataProvider to filter to visible courses only
   */
  private fetchTasks(): TaskForPriority[] {
    const visibleCourseIds = this.visibleDataProvider?.getVisibleCourseIds();

    let sql = `
      SELECT
        id, course_id, title, due_at, due_time_known, unlock_at, lock_at,
        points_possible, weight, is_completed, grade,
        task_type, task_group_id, submission_status, priority_score
      FROM tasks
      WHERE is_completed = 0
    `;

    if (visibleCourseIds && visibleCourseIds.length > 0) {
      sql += ` AND course_id IN (${visibleCourseIds.join(',')})`;
    } else if (visibleCourseIds && visibleCourseIds.length === 0) {
      return [];
    }

    sql += ` ORDER BY due_at ASC`;

    const rows = this.db.executeRead<TaskRowWithPriority>(sql);

    return rows.map((row) => ({
      id: row.id,
      courseId: row.course_id,
      title: row.title,
      dueAt: row.due_at ? new Date(row.due_at) : null,
      dueTimeKnown: Boolean(row.due_time_known ?? 1),
      unlockAt: row.unlock_at ? new Date(row.unlock_at) : null,
      lockAt: row.lock_at ? new Date(row.lock_at) : null,
      pointsPossible: row.points_possible,
      weight: row.weight,
      isCompleted: Boolean(row.is_completed),
      isPinned: false, // Would need separate table
      grade: row.grade,
      submittedAt: null,
      taskType: row.task_type || 'assignment',
      taskGroupId: row.task_group_id,
      submissionStatus: row.submission_status as TaskForPriority['submissionStatus'],
    }));
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
   * Fetch completion events from database (needed for effort estimation)
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
   * Calculate effort estimates for all tasks
   */
  private calculateEffortEstimates(
    tasks: TaskForPriority[]
  ): Map<number, EffortEstimate> {
    const events = this.fetchCompletionEvents();
    const estimates = batchEstimateEffort(tasks, events);

    const map = new Map<number, EffortEstimate>();
    for (const estimate of estimates) {
      map.set(estimate.taskId, estimate);
      // Also persist to database
      this.saveEffortEstimate(estimate);
    }

    this.effortEstimatesCache = map;
    return map;
  }

  /**
   * Save effort estimate to database
   */
  private saveEffortEstimate(estimate: EffortEstimate): void {
    this.db.executeWrite(
      `INSERT INTO effort_estimations (
        task_id, course_id, task_type, points_possible,
        estimated_minutes, actual_minutes, estimation_method, confidence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(task_id) DO UPDATE SET
        estimated_minutes = ?,
        estimation_method = ?,
        confidence = ?`,
      [
        estimate.taskId,
        estimate.courseId,
        estimate.taskType,
        estimate.pointsPossible,
        estimate.estimatedMinutes,
        estimate.actualMinutes,
        estimate.estimationMethod,
        estimate.confidence,
        estimate.estimatedMinutes,
        estimate.estimationMethod,
        estimate.confidence,
      ],
      'effort_estimations'
    );
  }

  /**
   * Analyze workload distribution for a date range
   */
  analyzeWorkload(startDate: Date = new Date(), endDate?: Date): WorkloadDistribution {
    const defaultEnd = new Date(startDate);
    defaultEnd.setDate(defaultEnd.getDate() + this.config.defaultLookAheadDays);
    const actualEndDate = endDate || defaultEnd;

    const tasks = this.fetchTasks();
    const effortEstimates = this.calculateEffortEstimates(tasks);

    const distribution = analyzeWorkloadDistribution(
      tasks,
      startDate,
      actualEndDate,
      effortEstimates
    );

    this.cachedDistribution = distribution;
    this.emit('workload-calculated', distribution);

    return distribution;
  }

  /**
   * Get clustering score for upcoming window
   */
  getClusteringScore(windowDays: number = 7): number {
    const tasks = this.fetchTasks();
    return calculateClusteringScore(tasks, windowDays);
  }

  /**
   * Get redistribution suggestions
   */
  getRedistributionSuggestions(
    availableHoursPerDay?: number
  ): RedistributionSuggestion[] {
    const tasks = this.fetchTasks();
    const effortEstimates =
      this.effortEstimatesCache.size > 0
        ? this.effortEstimatesCache
        : this.calculateEffortEstimates(tasks);

    return suggestRedistribution(
      tasks,
      availableHoursPerDay ?? this.config.defaultAvailableHoursPerDay,
      effortEstimates
    );
  }

  /**
   * Detect neglected courses
   */
  getNeglectedCourses(windowDays: number = 14): NeglectedCourse[] {
    const tasks = this.fetchTasks();
    const events = this.fetchCompletionEvents();
    const courses = this.fetchCourses();

    return detectNeglectedCourses(tasks, events, courses, windowDays);
  }

  /**
   * Get daily workload summary for a specific date
   */
  getDailySummary(date: Date = new Date()): ReturnType<typeof getDailyWorkloadSummary> {
    const tasks = this.fetchTasks();
    const effortEstimates =
      this.effortEstimatesCache.size > 0
        ? this.effortEstimatesCache
        : this.calculateEffortEstimates(tasks);

    return getDailyWorkloadSummary(tasks, effortEstimates, date);
  }

  /**
   * Get deadline clusters
   */
  getDeadlineClusters(
    windowHours: number = 48
  ): ReturnType<typeof identifyDeadlineClusters> {
    const tasks = this.fetchTasks();
    return identifyDeadlineClusters(tasks, windowHours);
  }

  /**
   * Get course balance score
   */
  getCourseBalanceScore(): number {
    const tasks = this.fetchTasks();
    const courses = this.fetchCourses();
    return calculateCourseBalanceScore(tasks, courses);
  }

  /**
   * Generate daily plan - ordered list of tasks for a day
   */
  generateDailyPlan(date: Date = new Date()): DailyPlanEntry[] {
    const tasks = this.fetchTasks();
    const courses = this.fetchCourses();
    const courseMap = new Map(courses.map((c) => [c.id, c]));
    const effortEstimates =
      this.effortEstimatesCache.size > 0
        ? this.effortEstimatesCache
        : this.calculateEffortEstimates(tasks);

    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    // Get tasks due today or overdue
    const relevantTasks = tasks.filter((t) => {
      if (!t.dueAt) return false;
      return t.dueAt <= dayEnd;
    });

    // Sort by urgency (earliest due first, then by priority score)
    relevantTasks.sort((a, b) => {
      if (a.dueAt && b.dueAt) {
        const timeDiff = a.dueAt.getTime() - b.dueAt.getTime();
        if (timeDiff !== 0) return timeDiff;
      }
      // Then by weight
      return (b.weight ?? 0) - (a.weight ?? 0);
    });

    return relevantTasks.map((task) => {
      const course = courseMap.get(task.courseId);
      const estimate = effortEstimates.get(task.id);

      let reason = '';
      if (task.dueAt && task.dueAt < dayStart) {
        reason = 'Overdue';
      } else if (task.dueAt && task.dueAt <= dayEnd) {
        reason = 'Due today';
      }

      if (task.weight && task.weight >= 15) {
        reason += reason ? ' - High impact' : 'High impact';
      }

      return {
        taskId: task.id,
        taskTitle: task.title,
        courseCode: course?.code || 'Unknown',
        dueAt: task.dueAt,
        estimatedMinutes: estimate?.estimatedMinutes ?? 60,
        priorityScore: 0, // Would need to fetch from tasks table
        recommendedStartTime: null, // Could be enhanced with rhythm data
        reason: reason || 'Scheduled',
      };
    });
  }

  /**
   * Save today's workload snapshot
   */
  saveDailySnapshot(): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dateStr = today.toISOString().split('T')[0];

    const summary = this.getDailySummary(today);
    const tasks = this.fetchTasks();
    const _effortEstimates = this.effortEstimatesCache;

    // Build tasks by course
    const tasksByCourse: Record<number, number> = {};
    const tasksByUrgency: Record<string, number> = summary.byUrgency;

    for (const task of tasks) {
      if (!task.dueAt) continue;
      const taskDate = task.dueAt.toISOString().split('T')[0];
      if (taskDate === dateStr) {
        tasksByCourse[task.courseId] = (tasksByCourse[task.courseId] || 0) + 1;
      }
    }

    const clusteringScore = this.getClusteringScore(7);

    this.db.executeWrite(
      `INSERT INTO workload_snapshots (
        snapshot_date, total_tasks_due, total_estimated_minutes,
        tasks_by_course, tasks_by_urgency, deadline_clustering_score
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(snapshot_date) DO UPDATE SET
        total_tasks_due = ?,
        total_estimated_minutes = ?,
        tasks_by_course = ?,
        tasks_by_urgency = ?,
        deadline_clustering_score = ?`,
      [
        dateStr,
        summary.totalTasks,
        summary.totalMinutes,
        JSON.stringify(tasksByCourse),
        JSON.stringify(tasksByUrgency),
        clusteringScore,
        summary.totalTasks,
        summary.totalMinutes,
        JSON.stringify(tasksByCourse),
        JSON.stringify(tasksByUrgency),
        clusteringScore,
      ],
      'workload_snapshots'
    );

    this.emit('snapshot-saved', { date: dateStr });
  }

  /**
   * Get historical snapshots
   */
  getHistoricalSnapshots(days: number = 30): WorkloadSnapshot[] {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const rows = this.db.executeRead<WorkloadSnapshotRow>(
      `SELECT * FROM workload_snapshots
       WHERE snapshot_date >= ?
       ORDER BY snapshot_date ASC`,
      [cutoff.toISOString().split('T')[0]]
    );

    return rows.map((row) => ({
      snapshotDate: new Date(row.snapshot_date),
      totalTasksDue: row.total_tasks_due,
      totalEstimatedMinutes: row.total_estimated_minutes,
      tasksByCourse: JSON.parse(row.tasks_by_course || '{}'),
      tasksByUrgency: JSON.parse(row.tasks_by_urgency || '{}'),
      deadlineClusteringScore: row.deadline_clustering_score,
    }));
  }

  /**
   * Get effort estimate for a task
   */
  getEffortEstimate(taskId: number): EffortEstimate | null {
    if (this.effortEstimatesCache.has(taskId)) {
      return this.effortEstimatesCache.get(taskId)!;
    }

    const row = this.db.executeReadOne<{
      task_id: number;
      course_id: number;
      task_type: string;
      points_possible: number | null;
      estimated_minutes: number;
      actual_minutes: number | null;
      estimation_method: string;
      confidence: number;
    }>(`SELECT * FROM effort_estimations WHERE task_id = ?`, [taskId]);

    if (!row) return null;

    return {
      taskId: row.task_id,
      courseId: row.course_id,
      taskType: row.task_type,
      pointsPossible: row.points_possible,
      estimatedMinutes: row.estimated_minutes,
      actualMinutes: row.actual_minutes,
      estimationMethod: row.estimation_method as EffortEstimate['estimationMethod'],
      confidence: row.confidence,
    };
  }

  /**
   * Get cached distribution
   */
  getCachedDistribution(): WorkloadDistribution | null {
    return this.cachedDistribution;
  }
}
