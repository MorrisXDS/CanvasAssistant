/**
 * PriorityCalculator - Pure Domain Functions for Priority Calculation
 *
 * This module contains ONLY pure functions with no database access.
 * All data must be passed in through the PriorityInput interface.
 */

import {
  TaskQueue,
  TaskForPriority,
  CourseForPriority,
  PolicyForPriority,
  PriorityInput,
  PriorityResult,
  PriorityFactors,
  PriorityFactor,
  PriorityExplanation,
  SubmissionWindow,
  GradeImpact,
  GraceTokenPolicy,
  SubmissionStatus,
} from '../types';

/**
 * Task type weight multipliers from global_task_types table
 */
const TASK_TYPE_WEIGHTS: Record<string, number> = {
  final: 30,
  midterm: 25,
  exam: 20,
  project: 15,
  assignment: 10,
  lab: 10,
  quiz: 5,
  discussion: 5,
  attendance: 5,
  other: 5,
};

/**
 * Calculate task type boost based on task type
 */
export function calculateTaskTypeBoost(taskType: string): number {
  const weight = TASK_TYPE_WEIGHTS[taskType?.toLowerCase()] ?? 10;
  return (weight - 10) * 0.5; // -2.5 to +10 point adjustment
}

/**
 * Calculate urgency score based on time until due date
 */
export function calculateUrgencyScore(task: TaskForPriority, now: Date): number {
  if (!task.dueAt) return 30; // Medium urgency for no due date

  const msUntilDue = task.dueAt.getTime() - now.getTime();
  const hoursUntilDue = msUntilDue / (1000 * 60 * 60);

  if (hoursUntilDue < 0) {
    // Overdue - calculate based on how overdue
    const hoursOverdue = Math.abs(hoursUntilDue);
    if (hoursOverdue <= 24) return 90;
    if (hoursOverdue <= 72) return 80;
    if (hoursOverdue <= 168) return 60; // 1 week
    return 40; // Very overdue - might be too late
  }

  if (hoursUntilDue <= 6) return 100; // Critical
  if (hoursUntilDue <= 12) return 95;
  if (hoursUntilDue <= 24) return 85;
  if (hoursUntilDue <= 48) return 70;
  if (hoursUntilDue <= 72) return 60;
  if (hoursUntilDue <= 168) return 45; // 1 week
  if (hoursUntilDue <= 336) return 30; // 2 weeks

  return 20; // More than 2 weeks
}

/**
 * Calculate weight score based on task weight in course
 */
export function calculateWeightScore(task: TaskForPriority): number {
  const weight = task.weight ?? 0;
  // Scale: 0% weight = 0 points, 50%+ weight = 50 points
  return Math.min(weight, 50);
}

/**
 * Calculate course gap factor based on distance from target grade
 */
export function calculateCourseGapFactor(course: CourseForPriority): number {
  if (course.currentGrade === null) return 15; // No grade yet - medium importance

  const gap = course.targetGrade - course.currentGrade;

  if (gap <= 0) return 0; // Already at or above target
  if (gap <= 5) return 10;
  if (gap <= 10) return 20;
  if (gap <= 15) return 25;
  return 30; // Large gap - high importance
}

/**
 * Calculate lock time urgency boost
 */
export function calculateLockTimeUrgency(task: TaskForPriority, now: Date): number {
  if (!task.lockAt) return 0;

  const hoursUntilLock = (task.lockAt.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntilLock <= 0) return 0; // Already locked
  if (hoursUntilLock <= 6) return 50; // CRITICAL: Lock imminent
  if (hoursUntilLock <= 24) return 30; // HIGH: Locks today
  if (hoursUntilLock <= 72) return 15; // MEDIUM: Locks soon
  return 0;
}

/**
 * Calculate grace token salvage factor
 */
export function calculateGraceTokenFactor(
  task: TaskForPriority,
  policy: GraceTokenPolicy | null,
  now: Date
): number {
  if (!policy || policy.tokensRemaining === 0) return 0;
  if (task.isCompleted) return 0;
  if (!task.dueAt) return 0;

  const hoursOverdue = (now.getTime() - task.dueAt.getTime()) / (1000 * 60 * 60);
  if (hoursOverdue <= 0) return 0; // Not overdue

  // Guard against division by zero
  if (policy.hoursPerToken <= 0) return 0;

  const tokensNeeded = Math.ceil(hoursOverdue / policy.hoursPerToken);

  if (tokensNeeded > policy.maxTokensPerTask) {
    return -10; // Exceeds max per task - not salvageable
  }

  if (tokensNeeded <= policy.tokensRemaining) {
    // Salvageable with tokens - boost priority
    return 20 - tokensNeeded * 5; // Fewer tokens needed = more boost
  }

  return -10; // Not salvageable - lower priority
}

/**
 * Calculate submission status factor
 */
export function calculateSubmissionFactor(status: SubmissionStatus): number {
  switch (status) {
    case 'missing':
      return -30; // Already marked missing - recovery focus
    case 'late':
      return -10; // Submitted late - lower priority
    case 'submitted':
      return -50; // Already submitted - much lower
    case 'graded':
      return -100; // Done - effectively remove from active
    default:
      return 0; // unsubmitted or null - normal priority
  }
}

/**
 * Calculate policy adjustment based on applicable policies
 */
export function calculatePolicyAdjustment(
  task: TaskForPriority,
  policies: PolicyForPriority[],
  now: Date
): number {
  let adjustment = 0;

  for (const policy of policies) {
    if (policy.courseId !== task.courseId || !policy.isActive) continue;

    const config = policy.policyConfig;

    switch (policy.policyType) {
      case 'late_penalty': {
        if (!task.dueAt) break;
        const hoursOverdue = (now.getTime() - task.dueAt.getTime()) / (1000 * 60 * 60);
        if (hoursOverdue > 0) {
          const penaltyPerDay = (config.penaltyPerDay as number) || 10;
          const daysOverdue = Math.floor(hoursOverdue / 24);
          adjustment -= Math.min(daysOverdue * penaltyPerDay * 0.5, 50);
        }
        break;
      }

      case 'drop_lowest': {
        const dropCount = (config.dropCount as number) || 1;
        const isDropCandidate = (config.applyToType as string) === task.taskType;
        if (isDropCandidate && dropCount > 0) {
          adjustment -= 15; // Lower priority - might be dropped
        }
        break;
      }

      case 'bonus': {
        adjustment += 10; // Boost for bonus opportunities
        break;
      }
    }
  }

  return Math.max(-100, Math.min(20, adjustment));
}

/**
 * Assign task to appropriate queue
 */
export function assignQueue(task: TaskForPriority, now: Date): TaskQueue {
  if (task.isPinned) return 'pinned';

  // Check if task is locked (not yet available)
  if (task.unlockAt && task.unlockAt > now) {
    return 'upcoming';
  }

  // Check if submission is already done
  if (task.submissionStatus === 'graded' || task.submissionStatus === 'submitted') {
    return 'deadlines'; // Move to low-priority queue
  }

  // Check if overdue
  if (task.dueAt && task.dueAt < now && !task.isCompleted) {
    return 'overdue';
  }

  // Check if weight is 0 (deadline only, no grade impact)
  if (task.weight === 0 || task.weight === null) {
    return 'deadlines';
  }

  return 'active';
}

/**
 * Calculate all priority factors
 */
export function calculateAllFactors(input: PriorityInput): PriorityFactors {
  const { task, course, policies, graceTokenPolicy, now } = input;

  return {
    urgency: calculateUrgencyScore(task, now),
    weight: calculateWeightScore(task),
    courseGap: calculateCourseGapFactor(course),
    policyAdjustment: calculatePolicyAdjustment(task, policies, now),
    dependency: 0, // To be implemented with DependencyChecker
    taskTypeBoost: calculateTaskTypeBoost(task.taskType),
    lockTimeUrgency: calculateLockTimeUrgency(task, now),
    graceTokenFactor: calculateGraceTokenFactor(task, graceTokenPolicy, now),
    submissionFactor: calculateSubmissionFactor(task.submissionStatus),
  };
}

/**
 * Calculate final score from factors
 */
export function calculateFinalScore(factors: PriorityFactors): number {
  return (
    factors.urgency +
    factors.weight +
    factors.courseGap +
    factors.policyAdjustment +
    factors.dependency +
    factors.taskTypeBoost +
    factors.lockTimeUrgency +
    factors.graceTokenFactor +
    factors.submissionFactor
  );
}

/**
 * Format relative time for display
 */
function formatRelativeTime(date: Date, now: Date): string {
  const diff = date.getTime() - now.getTime();
  const hours = Math.abs(diff) / (1000 * 60 * 60);
  const days = hours / 24;

  if (days >= 1) {
    return `${Math.floor(days)} day${Math.floor(days) !== 1 ? 's' : ''}`;
  }
  return `${Math.floor(hours)} hour${Math.floor(hours) !== 1 ? 's' : ''}`;
}

/**
 * Build priority factors for explanation
 */
function buildPriorityFactors(factors: PriorityFactors, task: TaskForPriority, now: Date): PriorityFactor[] {
  const result: PriorityFactor[] = [];

  // Urgency factor
  if (factors.urgency > 0) {
    let description = 'Time-based urgency';
    if (task.dueAt) {
      const diff = task.dueAt.getTime() - now.getTime();
      if (diff < 0) {
        description = `Overdue by ${formatRelativeTime(task.dueAt, now)}`;
      } else {
        description = `Due in ${formatRelativeTime(task.dueAt, now)}`;
      }
    }
    result.push({
      id: 'urgency',
      name: 'Urgency',
      icon: 'clock',
      impact: factors.urgency,
      description,
    });
  }

  // Weight factor
  if (factors.weight > 0) {
    result.push({
      id: 'weight',
      name: 'Grade Impact',
      icon: 'scale',
      impact: factors.weight,
      description: `Worth ${task.weight ?? 0}% of course grade`,
    });
  }

  // Course gap factor
  if (factors.courseGap > 0) {
    result.push({
      id: 'courseGap',
      name: 'Target Gap',
      icon: 'target',
      impact: factors.courseGap,
      description: 'Course grade below target',
    });
  }

  // Task type boost
  if (factors.taskTypeBoost !== 0) {
    result.push({
      id: 'taskType',
      name: 'Task Type',
      icon: 'tag',
      impact: factors.taskTypeBoost,
      description: `${task.taskType} priority weight`,
    });
  }

  // Lock time urgency
  if (factors.lockTimeUrgency > 0) {
    result.push({
      id: 'lockTime',
      name: 'Lock Deadline',
      icon: 'lock',
      impact: factors.lockTimeUrgency,
      description: task.lockAt ? `Locks in ${formatRelativeTime(task.lockAt, now)}` : 'Lock deadline approaching',
    });
  }

  // Grace token factor
  if (factors.graceTokenFactor !== 0) {
    result.push({
      id: 'graceToken',
      name: 'Grace Tokens',
      icon: 'ticket',
      impact: factors.graceTokenFactor,
      description: factors.graceTokenFactor > 0 ? 'Salvageable with tokens' : 'Not salvageable',
    });
  }

  // Submission factor
  if (factors.submissionFactor !== 0) {
    result.push({
      id: 'submission',
      name: 'Submission Status',
      icon: 'check',
      impact: factors.submissionFactor,
      description: `Status: ${task.submissionStatus || 'unsubmitted'}`,
    });
  }

  // Policy adjustment
  if (factors.policyAdjustment !== 0) {
    result.push({
      id: 'policy',
      name: 'Policy Impact',
      icon: 'book',
      impact: factors.policyAdjustment,
      description: 'Course policy adjustments',
    });
  }

  return result;
}

/**
 * Build submission windows for task
 */
function buildSubmissionWindows(task: TaskForPriority, graceTokenPolicy: GraceTokenPolicy | null, now: Date): SubmissionWindow[] {
  const windows: SubmissionWindow[] = [];

  if (!task.dueAt) return windows;

  const hoursUntilDue = (task.dueAt.getTime() - now.getTime()) / (1000 * 60 * 60);

  // On-time window
  if (hoursUntilDue > 0) {
    windows.push({
      type: 'on_time',
      deadline: task.dueAt,
      hoursRemaining: hoursUntilDue,
      label: 'On Time',
      available: true,
    });
  }

  // Grace token window
  if (graceTokenPolicy && graceTokenPolicy.tokensRemaining > 0) {
    const maxExtension = graceTokenPolicy.maxTokensPerTask * graceTokenPolicy.hoursPerToken;
    const tokenDeadline = new Date(task.dueAt.getTime() + maxExtension * 60 * 60 * 1000);
    const hoursUntilTokenDeadline = (tokenDeadline.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilTokenDeadline > 0) {
      windows.push({
        type: 'grace_token',
        deadline: tokenDeadline,
        hoursRemaining: hoursUntilTokenDeadline,
        label: 'With Grace Token',
        tokenCost: graceTokenPolicy.maxTokensPerTask,
        available: hoursUntilTokenDeadline > 0,
      });
    }
  }

  // Lock deadline
  if (task.lockAt) {
    const hoursUntilLock = (task.lockAt.getTime() - now.getTime()) / (1000 * 60 * 60);
    windows.push({
      type: 'cutoff',
      deadline: task.lockAt,
      hoursRemaining: hoursUntilLock,
      label: 'Hard Cutoff',
      available: hoursUntilLock > 0,
    });
  }

  return windows.sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
}

/**
 * Build grade impact analysis using points-based calculation
 *
 * Uses the formula:
 * - Grade = totalPointsEarned / totalPointsPossible * 100
 * - If task skipped: newGrade = currentPointsEarned / (currentPointsPossible + taskPoints)
 * - If task aced: newGrade = (currentPointsEarned + taskPoints) / (currentPointsPossible + taskPoints)
 */
function buildGradeImpact(task: TaskForPriority, course: CourseForPriority): GradeImpact {
  const currentGrade = course.currentGrade ?? 0;
  const targetGrade = course.targetGrade;
  const taskWeight = task.weight;
  const taskPoints = task.pointsPossible ?? 0;

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

  // Guard against zero total points
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
  const gradeIfAverage = ((currentPointsEarned + taskPoints * (currentGrade / 100)) / totalPointsAfterTask) * 100;

  // Calculate minimum score needed
  const gapToTarget = targetGrade - currentGrade;
  let minScoreForTarget: number | null = null;
  if (currentGrade < targetGrade && taskPoints > 0) {
    const neededPoints = (targetGrade / 100) * totalPointsAfterTask - currentPointsEarned;
    const neededScore = (neededPoints / taskPoints) * 100;
    // Allow values > 100 to indicate bonus points needed
    minScoreForTarget = Math.min(Math.max(neededScore, 0), 150);
  }

  // Determine risk level based on grade drop if skipped
  const dropIfSkipped = currentGrade - gradeIfSkipped;
  let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
  if (dropIfSkipped >= 10) riskLevel = 'critical';
  else if (dropIfSkipped >= 5) riskLevel = 'high';
  else if (dropIfSkipped >= 2) riskLevel = 'medium';

  return {
    currentGrade,
    targetGrade,
    gapToTarget,
    gradeIfSkipped,
    gradeIfAverage,
    minScoreForTarget,
    riskLevel,
  };
}

/**
 * Generate summary string for task
 */
function generateSummary(task: TaskForPriority, queue: TaskQueue, score: number, now: Date): string {
  if (queue === 'upcoming' && task.unlockAt) {
    return `Unlocks in ${formatRelativeTime(task.unlockAt, now)}`;
  }

  if (queue === 'overdue' && task.dueAt) {
    return `Overdue by ${formatRelativeTime(task.dueAt, now)}`;
  }

  if (task.dueAt) {
    const hoursUntilDue = (task.dueAt.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursUntilDue <= 24) {
      return `Due in ${formatRelativeTime(task.dueAt, now)} - Priority ${Math.round(score)}`;
    }
  }

  return `Priority score: ${Math.round(score)}`;
}

/**
 * Main priority calculation function - PURE, NO DB ACCESS
 */
export function calculatePriority(input: PriorityInput): PriorityResult {
  const { task, course, graceTokenPolicy, now } = input;

  // Assign to queue first
  const queue = assignQueue(task, now);

  // Special case: upcoming tasks get score 0
  if (queue === 'upcoming') {
    const factors: PriorityFactors = {
      urgency: 0,
      weight: 0,
      courseGap: 0,
      policyAdjustment: 0,
      dependency: 0,
      taskTypeBoost: 0,
      lockTimeUrgency: 0,
      graceTokenFactor: 0,
      submissionFactor: 0,
    };

    return {
      taskId: task.id,
      queue,
      score: 0,
      factors,
      reason: task.unlockAt ? `Unlocks ${formatRelativeTime(task.unlockAt, now)}` : 'Not yet available',
      explanation: {
        taskId: task.id,
        finalScore: 0,
        queue,
        factors: [],
        submissionWindows: [],
        gradeImpact: buildGradeImpact(task, course),
        summary: task.unlockAt ? `Unlocks in ${formatRelativeTime(task.unlockAt, now)}` : 'Not yet available',
        calculatedAt: now,
        expiresAt: new Date(now.getTime() + 15 * 60 * 1000), // 15 minutes
      },
    };
  }

  // Calculate all factors
  const factors = calculateAllFactors(input);
  const score = calculateFinalScore(factors);

  // Build explanation
  const explanation: PriorityExplanation = {
    taskId: task.id,
    finalScore: score,
    queue,
    factors: buildPriorityFactors(factors, task, now),
    submissionWindows: buildSubmissionWindows(task, graceTokenPolicy, now),
    gradeImpact: buildGradeImpact(task, course),
    summary: generateSummary(task, queue, score, now),
    calculatedAt: now,
    expiresAt: new Date(now.getTime() + 15 * 60 * 1000), // 15 minutes
  };

  return {
    taskId: task.id,
    queue,
    score,
    factors,
    reason: explanation.summary,
    explanation,
  };
}
