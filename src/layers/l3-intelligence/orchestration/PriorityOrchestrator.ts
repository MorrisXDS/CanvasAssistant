/**
 * PriorityOrchestrator - Coordinates Priority Calculation
 *
 * This class orchestrates the priority calculation process:
 * 1. Fetches data from repositories
 * 2. Calls pure domain functions from PriorityCalculator
 * 3. Persists results back to database
 * 4. Emits events for UI updates
 */

import { EventEmitter } from 'events';
import { Database } from '../../l1-persistence/Database';
import { VisibleDataProvider } from '../../l1-persistence/VisibleDataProvider';
import type {
  TaskRowMinimal,
  CourseRowMinimal,
  PolicyRowMinimal,
  GraceTokenRowMinimal,
} from '../../l1-persistence/DatabaseRowTypes';
import { calculatePriority } from '../domain/PriorityCalculator';
import { ORCHESTRATOR_DEFAULTS } from '../domain/Constants';
import {
  TaskForPriority,
  CourseForPriority,
  PolicyForPriority,
  PriorityCalculationResult,
  PriorityExplanation,
  PriorityInput,
  PriorityResult,
  GraceTokenPolicy,
  TaskQueue,
} from '../types';

/**
 * Configuration for PriorityOrchestrator
 */
export interface PriorityOrchestratorConfig {
  /** Refresh interval in milliseconds (default: 15 minutes) */
  refreshIntervalMs?: number;
  /** Whether to auto-refresh (default: true) */
  autoRefresh?: boolean;
}

const DEFAULT_CONFIG: Required<PriorityOrchestratorConfig> = {
  ...ORCHESTRATOR_DEFAULTS.PRIORITY,
};

/**
 * PriorityOrchestrator manages priority calculation lifecycle
 *
 * Events:
 * - 'priorities-calculated': Emitted when priorities are recalculated
 * - 'calculation-error': Emitted when calculation fails
 */
export class PriorityOrchestrator extends EventEmitter {
  private db: Database;
  private visibleDataProvider: VisibleDataProvider | null;
  private config: Required<PriorityOrchestratorConfig>;
  private refreshTimer: NodeJS.Timeout | null = null;
  private lastResult: PriorityCalculationResult | null = null;
  private pinnedTaskIds: Set<number> = new Set();

  constructor(
    db: Database,
    config?: PriorityOrchestratorConfig,
    visibleDataProvider?: VisibleDataProvider
  ) {
    super();
    this.db = db;
    this.visibleDataProvider = visibleDataProvider ?? null;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Listen for visibility changes to recalculate
    if (this.visibleDataProvider) {
      this.visibleDataProvider.on('visibility-changed', () => this.calculateAll());
      this.visibleDataProvider.on('settings-changed', () => this.calculateAll());
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
        this.calculateAll();
      } catch (error) {
        this.emit('calculation-error', error);
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
   * Pin/unpin a task
   */
  pinTask(taskId: number, pinned: boolean): void {
    if (pinned) {
      this.pinnedTaskIds.add(taskId);
    } else {
      this.pinnedTaskIds.delete(taskId);
    }
  }

  /**
   * Get last calculation result
   */
  getLastResult(): PriorityCalculationResult | null {
    return this.lastResult;
  }

  /**
   * Fetch tasks for priority calculation
   * Uses VisibleDataProvider to filter to visible courses only
   */
  private fetchTasks(): TaskForPriority[] {
    // Get visible course IDs from VisibleDataProvider if available
    const visibleCourseIds = this.visibleDataProvider?.getVisibleCourseIds();

    let sql = `
      SELECT
        t.id, t.course_id, t.title, t.due_at, t.unlock_at, t.lock_at,
        t.points_possible, t.weight, t.is_completed, t.grade, t.completed_at,
        t.task_type, t.task_group_id, t.submission_status
      FROM tasks t
      WHERE t.is_completed = 0
    `;

    // Filter by visible courses if VisibleDataProvider is available
    if (visibleCourseIds && visibleCourseIds.length > 0) {
      sql += ` AND t.course_id IN (${visibleCourseIds.join(',')})`;
    } else if (visibleCourseIds && visibleCourseIds.length === 0) {
      // No visible courses means no tasks to process
      return [];
    }

    sql += ` ORDER BY t.due_at ASC`;

    const rows = this.db.executeRead<TaskRowMinimal>(sql);

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
      isPinned: this.pinnedTaskIds.has(row.id),
      grade: row.grade,
      submittedAt: row.completed_at ? new Date(row.completed_at) : null,
      taskType: row.task_type || 'assignment',
      taskGroupId: row.task_group_id,
      submissionStatus: row.submission_status as TaskForPriority['submissionStatus'],
    }));
  }

  /**
   * Fetch courses for priority calculation
   * Uses VisibleDataProvider to filter to visible courses only
   */
  private fetchCourses(): Map<number, CourseForPriority> {
    // Get visible course IDs from VisibleDataProvider if available
    const visibleCourseIds = this.visibleDataProvider?.getVisibleCourseIds();

    let sql = `
      SELECT id, code, name, current_grade, target_grade, total_weight
      FROM courses
      WHERE deleted_at IS NULL
    `;

    // Filter by visible courses if VisibleDataProvider is available
    if (visibleCourseIds && visibleCourseIds.length > 0) {
      sql += ` AND id IN (${visibleCourseIds.join(',')})`;
    } else if (visibleCourseIds && visibleCourseIds.length === 0) {
      // No visible courses
      return new Map();
    }

    const rows = this.db.executeRead<CourseRowMinimal>(sql);

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
   * Fetch policies for priority calculation
   */
  private fetchPolicies(): PolicyForPriority[] {
    const rows = this.db.executeRead<PolicyRowMinimal>(`
      SELECT id, course_id, policy_type, policy_name, policy_config, is_active
      FROM course_policies
      WHERE is_active = 1
    `);

    return rows.map((row) => ({
      id: row.id,
      courseId: row.course_id,
      policyType: row.policy_type,
      policyName: row.policy_name,
      policyConfig: JSON.parse(row.policy_config || '{}'),
      isActive: Boolean(row.is_active),
    }));
  }

  /**
   * Fetch grace token policies
   */
  private fetchGraceTokenPolicies(): Map<number, GraceTokenPolicy> {
    const rows = this.db.executeRead<GraceTokenRowMinimal>(`
      SELECT course_id, total_tokens, tokens_remaining, hours_per_token, max_tokens_per_task
      FROM grace_tokens
    `);

    const map = new Map<number, GraceTokenPolicy>();
    for (const row of rows) {
      map.set(row.course_id, {
        totalTokens: row.total_tokens,
        tokensRemaining: row.tokens_remaining,
        hoursPerToken: row.hours_per_token,
        maxTokensPerTask: row.max_tokens_per_task,
      });
    }
    return map;
  }

  /**
   * Update priority score in database
   */
  private updatePriorityScore(taskId: number, score: number): void {
    this.db.executeWrite(
      'UPDATE tasks SET priority_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [score, taskId],
      'tasks'
    );
  }

  /**
   * Calculate priorities for all incomplete tasks
   */
  calculateAll(now: Date = new Date()): PriorityCalculationResult {
    try {
      // Fetch all data
      const tasks = this.fetchTasks();
      const courses = this.fetchCourses();
      const policies = this.fetchPolicies();
      const graceTokenPolicies = this.fetchGraceTokenPolicies();

      // Initialize result queues
      const queues: PriorityCalculationResult['queues'] = {
        pinned: [],
        active: [],
        overdue: [],
        deadlines: [],
        upcoming: [],
      };
      const notices: PriorityCalculationResult['notices'] = [];

      // Calculate priority for each task
      const results: PriorityResult[] = [];

      for (const task of tasks) {
        const course = courses.get(task.courseId);
        if (!course) {
          // Skip tasks with missing courses (can happen during partial sync or data inconsistency)
          continue;
        }

        // Filter policies for this course
        const coursePolicies = policies.filter((p) => p.courseId === task.courseId);
        const graceTokenPolicy = graceTokenPolicies.get(task.courseId) || null;

        // Build input for pure calculation
        const input: PriorityInput = {
          task,
          course,
          policies: coursePolicies,
          graceTokenPolicy,
          now,
        };

        // Calculate priority (pure function)
        const result = calculatePriority(input);
        results.push(result);

        // Update database
        this.updatePriorityScore(task.id, result.score);

        // Add to appropriate queue
        queues[result.queue].push(result.explanation);

        // Generate notices
        if (result.factors.graceTokenFactor > 0 && graceTokenPolicy) {
          notices.push({
            taskId: task.id,
            type: 'token_expiring',
            message: `Task "${task.title}" can be salvaged with grace tokens`,
            dismissible: true,
          });
        }
      }

      // Sort each queue by score descending
      for (const queue of Object.values(queues)) {
        queue.sort((a, b) => b.finalScore - a.finalScore);
      }

      // Build final result
      const result: PriorityCalculationResult = {
        queues,
        calculatedAt: now,
        nextRefreshAt: new Date(now.getTime() + this.config.refreshIntervalMs),
        notices,
      };

      this.lastResult = result;
      this.emit('priorities-calculated', result);

      return result;
    } catch (error) {
      this.emit('calculation-error', error);
      throw error;
    }
  }

  /**
   * Get priority explanation for a specific task
   */
  getExplanation(taskId: number, now: Date = new Date()): PriorityExplanation | null {
    // Check if we have a cached result
    if (this.lastResult) {
      for (const queue of Object.values(this.lastResult.queues)) {
        const explanation = queue.find((e) => e.taskId === taskId);
        if (explanation) {
          return explanation;
        }
      }
    }

    // Calculate fresh
    const taskRow = this.db.executeReadOne<TaskRowMinimal>(`
      SELECT
        t.id, t.course_id, t.title, t.due_at, t.unlock_at, t.lock_at,
        t.points_possible, t.weight, t.is_completed, t.grade, t.completed_at,
        t.task_type, t.task_group_id, t.submission_status
      FROM tasks t
      WHERE t.id = ?
    `, [taskId]);

    if (!taskRow) return null;

    const courseRow = this.db.executeReadOne<CourseRowMinimal>(`
      SELECT id, code, name, current_grade, target_grade, total_weight
      FROM courses WHERE id = ?
    `, [taskRow.course_id]);

    if (!courseRow) return null;

    const task: TaskForPriority = {
      id: taskRow.id,
      courseId: taskRow.course_id,
      title: taskRow.title,
      dueAt: taskRow.due_at ? new Date(taskRow.due_at) : null,
      unlockAt: taskRow.unlock_at ? new Date(taskRow.unlock_at) : null,
      lockAt: taskRow.lock_at ? new Date(taskRow.lock_at) : null,
      pointsPossible: taskRow.points_possible,
      weight: taskRow.weight,
      isCompleted: Boolean(taskRow.is_completed),
      isPinned: this.pinnedTaskIds.has(taskRow.id),
      grade: taskRow.grade,
      submittedAt: taskRow.completed_at ? new Date(taskRow.completed_at) : null,
      taskType: taskRow.task_type || 'assignment',
      taskGroupId: taskRow.task_group_id,
      submissionStatus: taskRow.submission_status as TaskForPriority['submissionStatus'],
    };

    const course: CourseForPriority = {
      id: courseRow.id,
      code: courseRow.code,
      name: courseRow.name,
      currentGrade: courseRow.current_grade,
      targetGrade: courseRow.target_grade,
      totalWeight: courseRow.total_weight,
    };

    const policies = this.fetchPolicies().filter((p) => p.courseId === task.courseId);
    const graceTokenPolicy = this.fetchGraceTokenPolicies().get(task.courseId) || null;

    const input: PriorityInput = {
      task,
      course,
      policies,
      graceTokenPolicy,
      now,
    };

    const result = calculatePriority(input);
    return result.explanation;
  }

  /**
   * Recalculate priorities for tasks in a specific course
   */
  recalculateForCourse(courseId: number, now: Date = new Date()): void {
    const course = this.fetchCourses().get(courseId);
    if (!course) return;

    const policies = this.fetchPolicies().filter((p) => p.courseId === courseId);
    const graceTokenPolicy = this.fetchGraceTokenPolicies().get(courseId) || null;

    const tasks = this.fetchTasks().filter((t) => t.courseId === courseId);

    for (const task of tasks) {
      const input: PriorityInput = {
        task,
        course,
        policies,
        graceTokenPolicy,
        now,
      };

      const result = calculatePriority(input);
      this.updatePriorityScore(task.id, result.score);
    }

    // Emit event but don't fully recalculate all queues
    this.emit('course-priorities-updated', { courseId });
  }
}
