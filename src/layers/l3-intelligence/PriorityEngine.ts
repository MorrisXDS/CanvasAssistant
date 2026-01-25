/**
 * L3 Intelligence - Priority Engine
 *
 * Core priority calculation system that orchestrates all components
 * to produce ranked task lists with full explanations.
 */

import { EventEmitter } from 'events';
import { Database } from '../l1-persistence/Database';
import { PriorityConfig } from './PriorityConfig';
import { PolicyEvaluator } from './PolicyEvaluator';
import { DependencyResolver } from './DependencyResolver';
import {
  TaskQueue,
  PriorityFactor,
  GradeImpact,
  PriorityExplanation,
  TaskForPriority,
  CourseForPriority,
  PolicyForPriority,
  PriorityCalculationResult,
  PriorityPreferences,
} from './types';

/**
 * Raw task data from database
 */
interface TaskRow {
  id: number;
  course_id: number;
  title: string;
  due_at: string | null;
  unlock_at: string | null;
  points_possible: number | null;
  weight: number | null;
  is_completed: number;
  grade: number | null;
  completed_at: string | null;
}

/**
 * Raw course data from database
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
 * Raw policy data from database
 */
interface PolicyRow {
  id: number;
  course_id: number;
  policy_type: string;
  policy_name: string;
  policy_config: string;
  is_active: number;
}

/**
 * Priority Engine
 *
 * Calculates task priorities based on urgency, weight, policies,
 * dependencies, and course performance.
 */
export class PriorityEngine extends EventEmitter {
  private db: Database;
  private config: PriorityConfig;
  private policyEvaluator: PolicyEvaluator;
  private dependencyResolver: DependencyResolver;
  private preferences: PriorityPreferences;

  constructor(db: Database, config?: PriorityConfig) {
    super();
    this.db = db;
    this.config = config || new PriorityConfig();
    this.policyEvaluator = new PolicyEvaluator();
    this.dependencyResolver = new DependencyResolver(db);
    this.preferences = {
      dismissedNotices: new Map(),
      pinnedTaskIds: new Set(),
      showEstimatedSubmissions: true,
    };
  }

  /**
   * Calculate priorities for all tasks
   */
  calculateAll(now: Date = new Date()): PriorityCalculationResult {
    const result: PriorityCalculationResult = {
      queues: {
        pinned: [],
        active: [],
        overdue: [],
        deadlines: [],
        upcoming: [],
      },
      calculatedAt: now,
      nextRefreshAt: new Date(now.getTime() + 30 * 60 * 1000), // Default 30 min
      notices: [],
    };

    // Load all active tasks
    const tasks = this.loadTasks();
    const courseCache = new Map<number, CourseForPriority>();
    const policyCache = new Map<number, PolicyForPriority[]>();

    // Track earliest refresh interval in milliseconds
    // Minimum refresh of 30 seconds to prevent rapid refresh loops
    const MIN_REFRESH_MS = 30 * 1000;
    let earliestRefreshMs = Infinity;

    for (const task of tasks) {
      // Get course data (cached)
      let course = courseCache.get(task.courseId);
      if (course === undefined) {
        const loadedCourse = this.loadCourse(task.courseId);
        if (loadedCourse) {
          course = loadedCourse;
          courseCache.set(task.courseId, course);
        }
      }

      if (!course) continue;

      // Get policies (cached)
      let policies = policyCache.get(task.courseId);
      if (!policies) {
        policies = this.loadPolicies(task.courseId);
        policyCache.set(task.courseId, policies);
      }

      // Calculate priority
      const explanation = this.calculateTaskPriority(task, course, policies, now);

      // Determine queue
      const queue = this.determineQueue(task, explanation, policies, now);
      result.queues[queue].push(explanation);

      // Track earliest refresh time (in milliseconds)
      const hoursUntilDue = task.dueAt
        ? (task.dueAt.getTime() - now.getTime()) / (1000 * 60 * 60)
        : Infinity;
      const refreshIntervalMs = this.config.getRefreshIntervalForTask(hoursUntilDue);
      earliestRefreshMs = Math.min(earliestRefreshMs, refreshIntervalMs);

      // Check for notices
      this.checkNotices(task, explanation, result, now);
    }

    // Sort each queue by priority score (descending)
    for (const queue of Object.values(result.queues)) {
      queue.sort((a, b) => b.finalScore - a.finalScore);
    }

    // Set next refresh time with minimum guard to prevent rapid refresh loops
    if (earliestRefreshMs < Infinity) {
      const safeRefreshMs = Math.max(earliestRefreshMs, MIN_REFRESH_MS);
      result.nextRefreshAt = new Date(now.getTime() + safeRefreshMs);
    }

    this.emit('priorities-calculated', result);
    return result;
  }

  /**
   * Calculate priority for a single task
   */
  calculateTaskPriority(
    task: TaskForPriority,
    course: CourseForPriority,
    policies: PolicyForPriority[],
    now: Date = new Date()
  ): PriorityExplanation {
    const factors: PriorityFactor[] = [];
    let score = 0;

    // Check if pinned
    if (task.isPinned || this.preferences.pinnedTaskIds.has(task.id)) {
      return this.createPinnedExplanation(task, course, now);
    }

    // Check if no weight (deadlines queue)
    if (task.weight === null) {
      return this.createDeadlinesExplanation(task, course, now);
    }

    // Tasks without due dates have zero importance
    if (!task.dueAt) {
      return this.createNoDueDateExplanation(task, course, now);
    }

    const hoursUntilDue = (task.dueAt.getTime() - now.getTime()) / (1000 * 60 * 60);
    const isPastDue = hoursUntilDue < 0;

    // Calculate urgency factor
    if (task.dueAt && !isPastDue) {
      const urgencyFactor = this.calculateUrgencyFactor(hoursUntilDue);
      factors.push(urgencyFactor);
      score += urgencyFactor.impact * this.config.getFactorWeights().urgency;
    }

    // Calculate weight factor
    if (task.weight !== null && task.weight > 0) {
      const weightFactor = this.calculateWeightFactor(task.weight);
      factors.push(weightFactor);
      score += weightFactor.impact * this.config.getFactorWeights().taskWeight;
    }

    // Calculate course gap factor
    const gapFactor = this.calculateCourseGapFactor(course);
    if (gapFactor.impact !== 0) {
      factors.push(gapFactor);
      score += gapFactor.impact * this.config.getFactorWeights().courseGap;
    }

    // Evaluate policies
    const policyResult = this.policyEvaluator.evaluate(task, course, policies, now);
    factors.push(...policyResult.factors);
    score += policyResult.adjustment * this.config.getFactorWeights().policyAdjustment;

    // Check dependencies
    const depResult = this.dependencyResolver.resolve(task, course.id);
    if (depResult.factor) {
      factors.push(depResult.factor);
      score += depResult.factor.impact * this.config.getFactorWeights().dependencyBlocking;
    }

    // Calculate grade impact
    const gradeImpact = this.calculateGradeImpact(task, course, policies);

    // Determine queue and adjust score for overdue
    const queue = isPastDue && policyResult.graceTokensAvailable === 0 ? 'overdue' : 'active';

    if (queue === 'overdue') {
      score = this.calculateOverdueScore(task, course, policies, gradeImpact, factors, now);
    }

    // Calculate expiration
    const refreshInterval = this.config.getRefreshIntervalForTask(hoursUntilDue);

    return {
      taskId: task.id,
      finalScore: Math.round(score * 100) / 100,
      queue,
      factors,
      submissionWindows: policyResult.submissionWindows,
      gradeImpact,
      summary: this.generateSummary(task, factors, queue, hoursUntilDue),
      calculatedAt: now,
      expiresAt: new Date(now.getTime() + refreshInterval),
    };
  }

  /**
   * Calculate urgency factor based on hours until due
   */
  private calculateUrgencyFactor(hoursUntilDue: number): PriorityFactor {
    const multiplier = this.config.calculateUrgencyMultiplier(hoursUntilDue);
    const curve = this.config.getUrgencyCurve();

    let urgencyLevel: string;
    if (hoursUntilDue <= curve.criticalHours) {
      urgencyLevel = 'Critical';
    } else if (hoursUntilDue <= curve.highHours) {
      urgencyLevel = 'High';
    } else if (hoursUntilDue <= curve.mediumHours) {
      urgencyLevel = 'Medium';
    } else {
      urgencyLevel = 'Low';
    }

    // Base urgency score that increases as deadline approaches
    const baseScore = Math.max(0, 100 - hoursUntilDue);
    const impact = baseScore * multiplier;

    return {
      id: 'urgency',
      name: 'Urgency',
      icon: '⏰',
      impact: Math.round(impact),
      description: this.formatTimeRemaining(hoursUntilDue),
      recommendation: urgencyLevel === 'Critical' ? 'Submit as soon as possible' : undefined,
    };
  }

  /**
   * Calculate weight factor based on task weight
   */
  private calculateWeightFactor(weight: number): PriorityFactor {
    // Weight contribution to final grade
    const impact = weight * 2; // 1% weight = 2 points

    return {
      id: 'weight',
      name: 'Weight',
      icon: '⚖️',
      impact: Math.round(impact),
      description: `Worth ${weight}% of grade`,
    };
  }

  /**
   * Calculate course gap factor with achievability check
   *
   * Considers:
   * - Current gap to target
   * - Whether target is achievable with remaining weight
   * - Urgency scaling based on gap size
   */
  private calculateCourseGapFactor(
    course: CourseForPriority,
    remainingWeight?: number
  ): PriorityFactor {
    const currentGrade = course.currentGrade || 0;
    const gap = course.targetGrade - currentGrade;

    if (gap <= 0) {
      return {
        id: 'course_gap',
        name: 'Course Status',
        icon: '✓',
        impact: 0,
        description: 'Meeting target grade',
      };
    }

    // Calculate if target is achievable with remaining assignments
    // Assuming remaining assignments can be aced (100%)
    const effectiveRemainingWeight = remainingWeight ?? (100 - (course.totalWeight || 0));
    const maxPossibleGrade = currentGrade + effectiveRemainingWeight;
    const isAchievable = maxPossibleGrade >= course.targetGrade;

    if (!isAchievable) {
      // Target is mathematically unachievable
      return {
        id: 'course_gap',
        name: 'Target Unachievable',
        icon: '⚠️',
        impact: 40, // High impact to flag this situation
        description: `Target ${course.targetGrade}% not reachable (max possible: ${maxPossibleGrade.toFixed(1)}%)`,
        recommendation: 'Consider adjusting target grade',
      };
    }

    // Calculate urgency based on gap and remaining capacity
    // Higher urgency when gap is large relative to remaining weight
    const gapRatio = effectiveRemainingWeight > 0 ? gap / effectiveRemainingWeight : 1;
    const baseImpact = gap * 1.5;

    // Scale up impact if gap is significant portion of remaining capacity
    // gapRatio of 0.5 means need 50% of remaining points just to hit target
    const capacityMultiplier = 1 + Math.min(gapRatio, 1) * 0.5;
    const impact = Math.min(baseImpact * capacityMultiplier, 50); // Raised cap from 30 to 50

    let description = `${gap.toFixed(1)}% below target (${course.targetGrade}%)`;
    if (gapRatio > 0.7) {
      description += ' - high effort needed';
    }

    return {
      id: 'course_gap',
      name: 'Course Gap',
      icon: '📉',
      impact: Math.round(impact),
      description,
    };
  }

  /**
   * Calculate grade impact analysis
   *
   * Uses points-based grading calculation:
   * - Grade = totalPointsEarned / totalPointsPossible * 100
   * - If task skipped: newGrade = currentPointsEarned / (currentPointsPossible + taskPoints)
   * - If task aced: newGrade = (currentPointsEarned + taskPoints) / (currentPointsPossible + taskPoints)
   */
  private calculateGradeImpact(
    task: TaskForPriority,
    course: CourseForPriority,
    _policies: PolicyForPriority[]
  ): GradeImpact {
    const currentGrade = course.currentGrade || 0;
    const targetGrade = course.targetGrade;
    const taskWeight = task.weight;
    const taskPoints = task.pointsPossible || 0;

    // Guard against zero/null weight - this is a deadline-only task with no grade impact
    if (taskWeight === null || taskWeight === 0) {
      return {
        currentGrade,
        targetGrade,
        gapToTarget: targetGrade - currentGrade,
        gradeIfSkipped: currentGrade,
        gradeIfAverage: currentGrade,
        minScoreForTarget: null,
        riskLevel: 'low',
      };
    }

    // Points-based grading calculation
    // Estimate current points based on course total weight and current grade
    const coursePointsBasis = course.totalWeight || 100;
    const currentPointsPossible = (coursePointsBasis / 100) * 1000; // Normalize to 1000-point scale
    const currentPointsEarned = (currentGrade / 100) * currentPointsPossible;
    const totalPointsAfterTask = currentPointsPossible + taskPoints;

    // Guard against zero total points (shouldn't happen but be safe)
    if (totalPointsAfterTask === 0) {
      return {
        currentGrade,
        targetGrade,
        gapToTarget: targetGrade - currentGrade,
        gradeIfSkipped: currentGrade,
        gradeIfAverage: currentGrade,
        minScoreForTarget: null,
        riskLevel: 'low',
      };
    }

    // Calculate grade projections
    const gradeIfSkipped = (currentPointsEarned / totalPointsAfterTask) * 100;
    // gradeIfAced calculation available for future grade projection features
    const gradeIfAverage = ((currentPointsEarned + taskPoints * (currentGrade / 100)) / totalPointsAfterTask) * 100;

    // Calculate minimum score needed to reach target
    let minScoreForTarget: number | null = null;
    if (currentGrade < targetGrade && taskPoints > 0) {
      // Solve for score S: (currentPointsEarned + S) / totalPointsAfterTask >= targetGrade / 100
      const neededPoints = (targetGrade / 100) * totalPointsAfterTask - currentPointsEarned;
      const neededScore = (neededPoints / taskPoints) * 100;
      // Allow values > 100 to indicate bonus points needed
      minScoreForTarget = Math.min(Math.max(neededScore, 0), 150);
    }

    const gapToTarget = targetGrade - currentGrade;
    const dropIfSkipped = currentGrade - gradeIfSkipped;
    const riskLevel = this.config.calculateRiskLevel(dropIfSkipped);

    return {
      currentGrade,
      targetGrade,
      gapToTarget,
      gradeIfSkipped: Math.round(gradeIfSkipped * 10) / 10,
      gradeIfAverage: Math.round(gradeIfAverage * 10) / 10,
      minScoreForTarget: minScoreForTarget !== null ? Math.round(minScoreForTarget) : null,
      riskLevel,
    };
  }

  /**
   * Calculate score for overdue tasks (recovery priority)
   *
   * Factors considered:
   * 1. Partial credit potential (can still earn points?)
   * 2. Late penalty severity (how much has been lost?)
   * 3. Cutoff urgency (how close to final deadline?)
   * 4. Risk level (grade impact if not submitted)
   */
  private calculateOverdueScore(
    task: TaskForPriority,
    course: CourseForPriority,
    policies: PolicyForPriority[],
    gradeImpact: GradeImpact,
    factors: PriorityFactor[],
    now: Date
  ): number {
    const weights = this.config.getFactorWeights();
    let score = 0;

    // Calculate days/hours overdue
    const dueAt = task.dueAt!;
    const msOverdue = now.getTime() - dueAt.getTime();
    const hoursOverdue = msOverdue / (1000 * 60 * 60);
    const daysOverdue = hoursOverdue / 24;

    // 1. Partial credit potential
    const maxScore = this.policyEvaluator.calculateMaxPossibleScore(task, policies, now);
    if (task.pointsPossible && task.pointsPossible > 0) {
      const partialCreditPercent = (maxScore / task.pointsPossible) * 100;

      if (maxScore === 0) {
        // Past cutoff - no points available
        const cutoffFactor: PriorityFactor = {
          id: 'past_cutoff',
          name: 'Past Cutoff',
          icon: '🚫',
          impact: -50,
          description: 'No submissions accepted - past deadline cutoff',
        };
        factors.push(cutoffFactor);
        score += cutoffFactor.impact;
      } else if (maxScore < task.pointsPossible) {
        // Partial credit available
        const partialFactor: PriorityFactor = {
          id: 'partial_credit',
          name: 'Partial Credit',
          icon: '📊',
          impact: Math.round(partialCreditPercent / 2),
          description: `Can still earn up to ${partialCreditPercent.toFixed(0)}%`,
        };
        factors.push(partialFactor);
        score += partialFactor.impact * weights.partialCredit;

        // 2. Late penalty factor (points already lost)
        const penaltyPercent = 100 - partialCreditPercent;
        if (penaltyPercent > 0) {
          const penaltyFactor: PriorityFactor = {
            id: 'late_penalty',
            name: 'Late Penalty',
            icon: '⏰',
            impact: -Math.round(penaltyPercent / 5), // -1 to -20 based on penalty
            description: `${penaltyPercent.toFixed(0)}% penalty applied`,
          };
          factors.push(penaltyFactor);
          score += penaltyFactor.impact;
        }
      } else {
        // Full credit still available (in grace period)
        const graceFactor: PriorityFactor = {
          id: 'grace_period',
          name: 'Grace Period',
          icon: '⏳',
          impact: 25,
          description: 'Still in grace period - no penalty yet',
        };
        factors.push(graceFactor);
        score += graceFactor.impact * weights.partialCredit;
      }
    }

    // 3. Cutoff urgency (if there's a cutoff approaching)
    const evaluation = this.policyEvaluator.evaluate(task, course, policies, now);
    const cutoffWindow = evaluation.submissionWindows.find(w => w.type === 'cutoff');
    if (cutoffWindow && cutoffWindow.hoursRemaining > 0 && cutoffWindow.hoursRemaining < 72) {
      // Within 72 hours of cutoff
      const urgencyImpact = Math.round(30 * (1 - cutoffWindow.hoursRemaining / 72));
      const cutoffUrgencyFactor: PriorityFactor = {
        id: 'cutoff_urgency',
        name: 'Cutoff Approaching',
        icon: '⚡',
        impact: urgencyImpact,
        description: `Only ${cutoffWindow.hoursRemaining.toFixed(1)}h until final cutoff`,
      };
      factors.push(cutoffUrgencyFactor);
      score += cutoffUrgencyFactor.impact;
    }

    // 4. Risk level (scaled by days overdue)
    const baseRiskMultiplier = {
      low: 0.5,
      medium: 1.0,
      high: 1.5,
      critical: 2.0,
    }[gradeImpact.riskLevel];

    // Increase risk multiplier based on days overdue (diminishing returns)
    const overdueMultiplier = Math.min(1 + Math.log1p(daysOverdue) * 0.3, 2.5);
    const effectiveRiskMultiplier = baseRiskMultiplier * overdueMultiplier;

    const riskFactor: PriorityFactor = {
      id: 'failure_risk',
      name: 'Risk Level',
      icon: gradeImpact.riskLevel === 'critical' ? '🚨' : '⚠️',
      impact: Math.round(20 * effectiveRiskMultiplier),
      description: `${gradeImpact.riskLevel.charAt(0).toUpperCase() + gradeImpact.riskLevel.slice(1)} risk` +
        (daysOverdue >= 1 ? ` (${daysOverdue.toFixed(1)} days overdue)` : ''),
    };
    factors.push(riskFactor);
    score += riskFactor.impact * weights.failureRisk;

    return score;
  }

  /**
   * Determine which queue a task belongs to
   */
  private determineQueue(
    task: TaskForPriority,
    explanation: PriorityExplanation,
    policies: PolicyForPriority[],
    now: Date
  ): TaskQueue {
    if (task.isPinned || this.preferences.pinnedTaskIds.has(task.id)) {
      return 'pinned';
    }

    if (task.weight === null) {
      return 'deadlines';
    }

    // Tasks without due dates go to active queue with zero priority
    if (!task.dueAt) {
      return 'active';
    }

    const hoursUntilDue = (task.dueAt.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursUntilDue < 0) {
      // Check if grace tokens available
      const policyResult = this.policyEvaluator.evaluate(task, {} as CourseForPriority, policies, now);
      if (policyResult.graceTokensAvailable > 0) {
        return 'active'; // Keep in active with grace token availability
      }
      return 'overdue';
    }

    return 'active';
  }

  /**
   * Check for notices to display to user
   */
  private checkNotices(
    task: TaskForPriority,
    explanation: PriorityExplanation,
    result: PriorityCalculationResult,
    now: Date
  ): void {
    // Check for estimated submission (past due, not marked complete)
    if (
      task.dueAt &&
      task.dueAt.getTime() < now.getTime() &&
      !task.isCompleted &&
      !task.submittedAt
    ) {
      const hoursPastDue = (now.getTime() - task.dueAt.getTime()) / (1000 * 60 * 60);
      const config = this.config.getConfig();

      if (hoursPastDue >= config.assumeSubmittedAfterHours) {
        if (this.preferences.showEstimatedSubmissions) {
          const dismissed = this.preferences.dismissedNotices.get(task.id);
          if (!dismissed?.has('estimated_submission')) {
            result.notices.push({
              taskId: task.id,
              type: 'estimated_submission',
              message: `"${task.title}" may have been submitted. Score estimated at course average.`,
              dismissible: true,
            });
          }
        }
      }
    }

    // Check for expiring grace tokens
    if (explanation.submissionWindows.some((w) => w.type === 'grace_token' && w.hoursRemaining < 6)) {
      result.notices.push({
        taskId: task.id,
        type: 'token_expiring',
        message: `Grace token window for "${task.title}" expiring soon`,
        dismissible: true,
      });
    }

    // Check for blocked dependencies
    const depResult = this.dependencyResolver.resolve(task, task.courseId);
    if (!depResult.prerequisitesMet) {
      const dismissed = this.preferences.dismissedNotices.get(task.id);
      if (!dismissed?.has('dependency_blocked')) {
        result.notices.push({
          taskId: task.id,
          type: 'dependency_blocked',
          message: `"${task.title}" is blocked by incomplete prerequisites`,
          dismissible: false,
        });
      }
    }
  }

  /**
   * Create explanation for pinned task
   */
  private createPinnedExplanation(
    task: TaskForPriority,
    course: CourseForPriority,
    now: Date
  ): PriorityExplanation {
    return {
      taskId: task.id,
      finalScore: Infinity, // Always at top
      queue: 'pinned',
      factors: [
        {
          id: 'pinned',
          name: 'Pinned',
          icon: '📌',
          impact: 0,
          description: 'Manually pinned to top',
        },
      ],
      submissionWindows: [],
      gradeImpact: this.calculateGradeImpact(task, course, []),
      summary: 'Pinned task',
      calculatedAt: now,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000), // Refresh daily
    };
  }

  /**
   * Create explanation for deadlines queue task (no weight)
   */
  private createDeadlinesExplanation(
    task: TaskForPriority,
    course: CourseForPriority,
    now: Date
  ): PriorityExplanation {
    const hoursUntilDue = task.dueAt
      ? (task.dueAt.getTime() - now.getTime()) / (1000 * 60 * 60)
      : Infinity;

    return {
      taskId: task.id,
      finalScore: task.dueAt ? -hoursUntilDue : -Infinity, // Sort by deadline
      queue: 'deadlines',
      factors: [
        {
          id: 'no_weight',
          name: 'Ungraded',
          icon: '📋',
          impact: 0,
          description: 'Not included in grade calculation',
        },
      ],
      submissionWindows: task.dueAt
        ? [
            {
              type: 'on_time',
              deadline: task.dueAt,
              hoursRemaining: Math.max(0, hoursUntilDue),
              label: 'Deadline',
              available: hoursUntilDue > 0,
            },
          ]
        : [],
      gradeImpact: {
        currentGrade: course.currentGrade || 0,
        targetGrade: course.targetGrade,
        gapToTarget: course.targetGrade - (course.currentGrade || 0),
        gradeIfSkipped: course.currentGrade || 0,
        gradeIfAverage: course.currentGrade || 0,
        minScoreForTarget: null,
        riskLevel: 'low',
      },
      summary: task.dueAt ? this.formatTimeRemaining(hoursUntilDue) : 'No deadline',
      calculatedAt: now,
      expiresAt: new Date(now.getTime() + 6 * 60 * 60 * 1000), // Refresh every 6 hours
    };
  }

  /**
   * Create explanation for task with no due date (zero importance)
   */
  private createNoDueDateExplanation(
    task: TaskForPriority,
    course: CourseForPriority,
    now: Date
  ): PriorityExplanation {
    return {
      taskId: task.id,
      finalScore: 0, // Zero importance
      queue: 'active',
      factors: [
        {
          id: 'no_due_date',
          name: 'No Due Date',
          icon: '📅',
          impact: 0,
          description: 'No deadline set - complete at your discretion',
        },
      ],
      submissionWindows: [],
      gradeImpact: {
        currentGrade: course.currentGrade || 0,
        targetGrade: course.targetGrade,
        gapToTarget: course.targetGrade - (course.currentGrade || 0),
        gradeIfSkipped: course.currentGrade || 0,
        gradeIfAverage: course.currentGrade || 0,
        minScoreForTarget: null,
        riskLevel: 'low',
      },
      summary: 'No due date - zero priority',
      calculatedAt: now,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000), // Refresh daily
    };
  }

  /**
   * Generate human-readable summary
   */
  private generateSummary(
    task: TaskForPriority,
    factors: PriorityFactor[],
    queue: TaskQueue,
    hoursUntilDue: number
  ): string {
    if (queue === 'overdue') {
      return 'Past due - check partial credit options';
    }

    if (hoursUntilDue <= 6) {
      return 'Critical: Due very soon!';
    }

    if (hoursUntilDue <= 24) {
      return `Due ${this.formatTimeRemaining(hoursUntilDue)}`;
    }

    const topFactor = factors.reduce(
      (max, f) => (f.impact > max.impact ? f : max),
      factors[0]
    );

    return topFactor?.description || 'Ready to work on';
  }

  /**
   * Format time remaining as human-readable string
   */
  private formatTimeRemaining(hours: number): string {
    if (hours < 0) {
      const pastHours = Math.abs(hours);
      if (pastHours < 1) return `${Math.round(pastHours * 60)} minutes overdue`;
      if (pastHours < 24) return `${Math.round(pastHours)} hours overdue`;
      return `${Math.round(pastHours / 24)} days overdue`;
    }

    if (hours < 1) return `${Math.round(hours * 60)} minutes left`;
    if (hours < 24) return `${Math.round(hours)} hours left`;
    if (hours < 48) return 'Due tomorrow';
    return `Due in ${Math.round(hours / 24)} days`;
  }

  /**
   * Load tasks from database
   */
  private loadTasks(): TaskForPriority[] {
    const rows = this.db.executeRead<TaskRow & {
      lock_at: string | null;
      task_type: string | null;
      task_group_id: number | null;
      submission_status: string | null;
    }>(
      `SELECT id, course_id, title, due_at, unlock_at, lock_at, points_possible,
              weight, is_completed, grade, completed_at, task_type, task_group_id, submission_status
       FROM tasks
       WHERE is_completed = 0 OR (is_completed = 1 AND completed_at > datetime('now', '-7 days'))
       ORDER BY due_at`
    );

    return rows.map((row) => ({
      id: row.id,
      courseId: row.course_id,
      title: row.title,
      dueAt: row.due_at ? new Date(row.due_at) : null,
      unlockAt: row.unlock_at ? new Date(row.unlock_at) : null,
      lockAt: row.lock_at ? new Date(row.lock_at) : null,
      pointsPossible: row.points_possible,
      weight: row.weight,
      isCompleted: row.is_completed === 1,
      isPinned: this.preferences.pinnedTaskIds.has(row.id),
      grade: row.grade,
      submittedAt: row.completed_at ? new Date(row.completed_at) : null,
      taskType: row.task_type || 'assignment',
      taskGroupId: row.task_group_id,
      submissionStatus: row.submission_status as TaskForPriority['submissionStatus'],
    }));
  }

  /**
   * Load course from database
   */
  private loadCourse(courseId: number): CourseForPriority | null {
    const row = this.db.executeReadOne<CourseRow>(
      `SELECT id, code, name, current_grade, target_grade, total_weight
       FROM courses WHERE id = ?`,
      [courseId]
    );

    if (!row) return null;

    return {
      id: row.id,
      code: row.code,
      name: row.name,
      currentGrade: row.current_grade,
      targetGrade: row.target_grade || this.config.getDefaultTargetGrade(),
      totalWeight: row.total_weight || 0,
    };
  }

  /**
   * Load policies from database
   */
  private loadPolicies(courseId: number): PolicyForPriority[] {
    const rows = this.db.executeRead<PolicyRow>(
      `SELECT id, course_id, policy_type, policy_name, policy_config, is_active
       FROM course_policies WHERE course_id = ? AND is_active = 1`,
      [courseId]
    );

    return rows
      .map((row) => {
        let policyConfig: Record<string, unknown>;
        try {
          policyConfig = JSON.parse(row.policy_config);
        } catch {
          // Skip policies with invalid JSON config
          return null;
        }
        return {
          id: row.id,
          courseId: row.course_id,
          policyType: row.policy_type,
          policyName: row.policy_name,
          policyConfig,
          isActive: row.is_active === 1,
        };
      })
      .filter((p): p is PolicyForPriority => p !== null);
  }

  /**
   * Pin a task
   */
  pinTask(taskId: number): void {
    this.preferences.pinnedTaskIds.add(taskId);
    this.emit('task-pinned', { taskId });
  }

  /**
   * Unpin a task
   */
  unpinTask(taskId: number): void {
    this.preferences.pinnedTaskIds.delete(taskId);
    this.emit('task-unpinned', { taskId });
  }

  /**
   * Dismiss a notice
   */
  dismissNotice(taskId: number, noticeType: string): void {
    if (!this.preferences.dismissedNotices.has(taskId)) {
      this.preferences.dismissedNotices.set(taskId, new Set());
    }
    this.preferences.dismissedNotices.get(taskId)!.add(noticeType);
    this.emit('notice-dismissed', { taskId, noticeType });
  }

  /**
   * Get current configuration
   */
  getConfig(): PriorityConfig {
    return this.config;
  }

  /**
   * Get simulated priority for a task with an overridden grade
   * Used for what-if analysis to show how priority would change
   * @param taskId - The task ID
   * @param simulatedGrade - The simulated grade (0-100)
   * @param now - Current time for calculation
   * @returns The simulated priority score, or null if task not found
   */
  getSimulatedTaskPriority(
    taskId: number,
    simulatedGrade: number,
    now: Date = new Date()
  ): number | null {
    const rows = this.db.executeRead<TaskRow & {
      lock_at: string | null;
      task_type: string | null;
      task_group_id: number | null;
      submission_status: string | null;
    }>(
      `SELECT id, course_id, title, due_at, unlock_at, lock_at, points_possible,
              weight, is_completed, grade, completed_at, task_type, task_group_id, submission_status
       FROM tasks WHERE id = ?`,
      [taskId]
    );

    if (rows.length === 0) return null;

    const row = rows[0];

    // Create task with simulated grade
    const task: TaskForPriority = {
      id: row.id,
      courseId: row.course_id,
      title: row.title,
      dueAt: row.due_at ? new Date(row.due_at) : null,
      unlockAt: row.unlock_at ? new Date(row.unlock_at) : null,
      lockAt: row.lock_at ? new Date(row.lock_at) : null,
      pointsPossible: row.points_possible,
      weight: row.weight,
      isCompleted: row.is_completed === 1,
      isPinned: this.preferences.pinnedTaskIds.has(row.id),
      grade: simulatedGrade, // Use simulated grade instead of actual
      submittedAt: row.completed_at ? new Date(row.completed_at) : null,
      taskType: row.task_type || 'assignment',
      taskGroupId: row.task_group_id,
      submissionStatus: row.submission_status as TaskForPriority['submissionStatus'],
    };

    const course = this.loadCourse(task.courseId);
    if (!course) return null;

    // Simulate the course's assessed grade with the simulated task grade
    const simulatedCourse = this.simulateCourseGrade(course, task.courseId, [
      { taskId, grade: simulatedGrade },
    ]);

    const policies = this.loadPolicies(task.courseId);
    const explanation = this.calculateTaskPriority(task, simulatedCourse, policies, now);

    return explanation.finalScore;
  }

  /**
   * Create a copy of course data with simulated grades applied
   * @param course - Original course data
   * @param courseId - Course ID
   * @param simulations - Array of task ID to simulated grade mappings
   * @returns Course data with updated assessed grade
   */
  private simulateCourseGrade(
    course: CourseForPriority,
    courseId: number,
    simulations: Array<{ taskId: number; grade: number }>
  ): CourseForPriority {
    // Get all tasks for the course with their grades and weights
    const tasks = this.db.executeRead<{
      id: number;
      grade: number | null;
      weight: number | null;
    }>('SELECT id, grade, weight FROM tasks WHERE course_id = ?', [courseId]);

    // Build simulation map
    const simulationMap = new Map(simulations.map((s) => [s.taskId, s.grade]));

    // Calculate simulated assessed grade
    let weightedSum = 0;
    let totalWeight = 0;

    for (const task of tasks) {
      const weight = task.weight ?? 0;
      if (weight <= 0) continue;

      // Use simulated grade if available, otherwise use actual grade
      const effectiveGrade = simulationMap.has(task.id)
        ? simulationMap.get(task.id)!
        : task.grade;

      if (effectiveGrade !== null) {
        weightedSum += effectiveGrade * weight;
        totalWeight += weight;
      }
    }

    const simulatedAssessedGrade = totalWeight > 0 ? weightedSum / totalWeight : null;

    // Return course with simulated current grade
    return {
      ...course,
      currentGrade: simulatedAssessedGrade,
    };
  }

  /**
   * Get explanation for a specific task
   */
  getTaskExplanation(taskId: number, now: Date = new Date()): PriorityExplanation | null {
    const rows = this.db.executeRead<TaskRow & {
      lock_at: string | null;
      task_type: string | null;
      task_group_id: number | null;
      submission_status: string | null;
    }>(
      `SELECT id, course_id, title, due_at, unlock_at, lock_at, points_possible,
              weight, is_completed, grade, completed_at, task_type, task_group_id, submission_status
       FROM tasks WHERE id = ?`,
      [taskId]
    );

    if (rows.length === 0) return null;

    const row = rows[0];
    const task: TaskForPriority = {
      id: row.id,
      courseId: row.course_id,
      title: row.title,
      dueAt: row.due_at ? new Date(row.due_at) : null,
      unlockAt: row.unlock_at ? new Date(row.unlock_at) : null,
      lockAt: row.lock_at ? new Date(row.lock_at) : null,
      pointsPossible: row.points_possible,
      weight: row.weight,
      isCompleted: row.is_completed === 1,
      isPinned: this.preferences.pinnedTaskIds.has(row.id),
      grade: row.grade,
      submittedAt: row.completed_at ? new Date(row.completed_at) : null,
      taskType: row.task_type || 'assignment',
      taskGroupId: row.task_group_id,
      submissionStatus: row.submission_status as TaskForPriority['submissionStatus'],
    };

    const course = this.loadCourse(task.courseId);
    if (!course) return null;

    const policies = this.loadPolicies(task.courseId);

    return this.calculateTaskPriority(task, course, policies, now);
  }
}
