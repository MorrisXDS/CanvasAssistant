/**
 * PolicyEngine - Comprehensive policy evaluation and grade calculation
 *
 * Handles:
 * - Late penalty calculation (composite pipeline)
 * - Grace token management
 * - Weight transfer logic
 * - Grade replacement rules
 * - Pain Index priority calculation
 */

import { Database } from '../l1-persistence/Database';

// ============ Types ============

export type PolicyType =
  | 'late_penalty'
  | 'grace_tokens'
  | 'drop_lowest'
  | 'weight_transfer'
  | 'grade_replacement';

export type ScopeType = 'course' | 'group' | 'task';

export interface LatePenaltyConfig {
  penaltyType: 'percentage_per_day' | 'percentage_per_hour' | 'flat' | 'tiered';
  penaltyValue: number;
  gracePeriodHours: number;
  hardCutoffDays: number | null;
  minGrade: number;
  applicableTypes: string[];
  excludedTypes: string[];
}

export interface GraceTokenConfig {
  totalTokens: number;
  hoursPerToken: number;
  maxTokensPerTask: number;
  applicableTypes: string[];
  excludedTypes: string[];
}

export interface DropLowestConfig {
  dropCount: number;
  category: string;
  minSubmissions: number;
}

export interface WeightTransferConfig {
  sourceTaskId?: number;
  sourceGroupId?: number;
  targetTaskId?: number;
  targetGroupId?: number;
  transferType: 'full' | 'partial' | 'conditional';
  transferPercent: number;
  conditionType?: 'missed' | 'lower' | 'always';
}

export interface GradeReplacementConfig {
  sourceTaskId?: number;
  sourceGroupId?: number;
  targetTaskId?: number;
  targetGroupId?: number;
  replacementType: 'if_higher' | 'always' | 'best_of';
  replacementRatio: number;
}

export interface Policy {
  id: number;
  courseId: number;
  policyType: PolicyType;
  policyName: string;
  scopeType: ScopeType;
  targetGroupId?: number;
  targetTaskId?: number;
  applicableTypes?: string[];
  excludedTypes?: string[];
  isActive: boolean;
  config: Record<string, unknown>;
}

export interface TaskWithPolicy {
  id: number;
  courseId: number;
  taskType: string;
  taskGroupId?: number;
  title: string;
  dueAt: string | null;
  weight: number;
  originalGrade: number | null;
  effectiveGrade: number | null;
  isCompleted: boolean;
  submissionStatus: string | null;
}

export interface PenaltyResult {
  originalGrade: number;
  effectiveGrade: number;
  penaltyApplied: number;
  reason: string;
  daysLate: number;
  isZeroed: boolean;
}

export interface PainIndexFactors {
  weight: number;
  penaltySeverity: number;
  daysUntilDue: number;
  graceTokenFactor: number;
  hasSafetyNet: boolean;
  daysUntilCutoff: number | null;
}

// ============ Policy Engine ============

export class PolicyEngine {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  // ============ Late Penalty Calculation ============

  /**
   * Calculate late penalty for a task using the composite pipeline model
   */
  calculateLatePenalty(
    task: TaskWithPolicy,
    submissionDate: Date,
    policy: Policy
  ): PenaltyResult {
    const config = policy.config as unknown as LatePenaltyConfig;
    const baseGrade = task.originalGrade ?? 0;

    // Check if task type is applicable
    if (!this.isTaskTypeApplicable(task.taskType, config.applicableTypes, config.excludedTypes)) {
      return {
        originalGrade: baseGrade,
        effectiveGrade: baseGrade,
        penaltyApplied: 0,
        reason: 'Policy not applicable to this task type',
        daysLate: 0,
        isZeroed: false,
      };
    }

    // Calculate days late
    if (!task.dueAt) {
      return {
        originalGrade: baseGrade,
        effectiveGrade: baseGrade,
        penaltyApplied: 0,
        reason: 'No due date',
        daysLate: 0,
        isZeroed: false,
      };
    }

    const dueDate = new Date(task.dueAt);
    const hoursLate = (submissionDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60);

    // Apply grace period
    const effectiveHoursLate = Math.max(0, hoursLate - (config.gracePeriodHours || 0));
    const daysLate = effectiveHoursLate / 24;

    if (effectiveHoursLate <= 0) {
      return {
        originalGrade: baseGrade,
        effectiveGrade: baseGrade,
        penaltyApplied: 0,
        reason: 'Submitted on time or within grace period',
        daysLate: 0,
        isZeroed: false,
      };
    }

    // Step 1: Check hard cutoff
    if (config.hardCutoffDays !== null && daysLate > config.hardCutoffDays) {
      return {
        originalGrade: baseGrade,
        effectiveGrade: 0,
        penaltyApplied: baseGrade,
        reason: `Exceeded ${config.hardCutoffDays}-day cutoff - zero grade`,
        daysLate,
        isZeroed: true,
      };
    }

    // Step 2: Apply gradual decay
    let penalty = 0;
    switch (config.penaltyType) {
      case 'percentage_per_day':
        penalty = daysLate * config.penaltyValue;
        break;
      case 'percentage_per_hour':
        penalty = effectiveHoursLate * config.penaltyValue;
        break;
      case 'flat':
        penalty = config.penaltyValue;
        break;
      case 'tiered':
        // Could implement tiered penalties here
        penalty = Math.min(daysLate * config.penaltyValue, 50);
        break;
    }

    // Step 3: Apply floor (minimum grade)
    let effectiveGrade = baseGrade - (baseGrade * penalty / 100);
    const minGrade = config.minGrade ?? 0;

    if (effectiveGrade < minGrade) {
      effectiveGrade = minGrade;
    }

    return {
      originalGrade: baseGrade,
      effectiveGrade,
      penaltyApplied: baseGrade - effectiveGrade,
      reason: `${penalty.toFixed(1)}% penalty applied (${daysLate.toFixed(1)} days late)`,
      daysLate,
      isZeroed: false,
    };
  }

  // ============ Grace Token Management ============

  /**
   * Check if grace tokens can be used for a task
   */
  canUseGraceToken(
    task: TaskWithPolicy,
    courseId: number
  ): { canUse: boolean; tokensAvailable: number; hoursPerToken: number; maxTokens: number; reason?: string } {
    const tokenRecord = this.db.executeReadOne<{
      id: number;
      tokens_remaining: number;
      hours_per_token: number;
      max_tokens_per_task: number;
      applicable_types: string | null;
      excluded_types: string | null;
    }>(
      `SELECT gt.id, gt.tokens_remaining, gt.hours_per_token, gt.max_tokens_per_task,
              cp.applicable_types, cp.excluded_types
       FROM grace_tokens gt
       JOIN course_policies cp ON gt.policy_id = cp.id
       WHERE gt.course_id = ? AND cp.is_active = 1`,
      [courseId]
    );

    if (!tokenRecord) {
      return { canUse: false, tokensAvailable: 0, hoursPerToken: 0, maxTokens: 0, reason: 'No grace token policy' };
    }

    const applicableTypes = tokenRecord.applicable_types ? JSON.parse(tokenRecord.applicable_types) : [];
    const excludedTypes = tokenRecord.excluded_types ? JSON.parse(tokenRecord.excluded_types) : [];

    if (!this.isTaskTypeApplicable(task.taskType, applicableTypes, excludedTypes)) {
      return {
        canUse: false,
        tokensAvailable: tokenRecord.tokens_remaining,
        hoursPerToken: tokenRecord.hours_per_token,
        maxTokens: tokenRecord.max_tokens_per_task,
        reason: `Grace tokens not applicable to ${task.taskType} tasks`,
      };
    }

    // Check if already used tokens on this task
    const existingUsage = this.db.executeReadOne<{ tokens_used: number }>(
      `SELECT tokens_used FROM grace_token_usage WHERE grace_token_id = ? AND task_id = ?`,
      [tokenRecord.id, task.id]
    );

    const usedOnTask = existingUsage?.tokens_used ?? 0;
    const remainingForTask = tokenRecord.max_tokens_per_task - usedOnTask;

    if (tokenRecord.tokens_remaining <= 0) {
      return {
        canUse: false,
        tokensAvailable: 0,
        hoursPerToken: tokenRecord.hours_per_token,
        maxTokens: tokenRecord.max_tokens_per_task,
        reason: 'No tokens remaining',
      };
    }

    if (remainingForTask <= 0) {
      return {
        canUse: false,
        tokensAvailable: tokenRecord.tokens_remaining,
        hoursPerToken: tokenRecord.hours_per_token,
        maxTokens: tokenRecord.max_tokens_per_task,
        reason: `Max tokens (${tokenRecord.max_tokens_per_task}) already used on this task`,
      };
    }

    return {
      canUse: true,
      tokensAvailable: Math.min(tokenRecord.tokens_remaining, remainingForTask),
      hoursPerToken: tokenRecord.hours_per_token,
      maxTokens: tokenRecord.max_tokens_per_task,
    };
  }

  /**
   * Use grace tokens for a task
   */
  useGraceToken(taskId: number, tokensToUse: number): { success: boolean; hoursExtended: number; error?: string } {
    const task = this.db.executeReadOne<TaskWithPolicy>(
      `SELECT id, course_id as courseId, task_type as taskType, title FROM tasks WHERE id = ?`,
      [taskId]
    );

    if (!task) {
      return { success: false, hoursExtended: 0, error: 'Task not found' };
    }

    const canUse = this.canUseGraceToken(task, task.courseId);
    if (!canUse.canUse) {
      return { success: false, hoursExtended: 0, error: canUse.reason };
    }

    const actualTokens = Math.min(tokensToUse, canUse.tokensAvailable);
    const hoursExtended = actualTokens * canUse.hoursPerToken;

    // Get the grace token record
    const tokenRecord = this.db.executeReadOne<{ id: number; tokens_remaining: number }>(
      `SELECT gt.id, gt.tokens_remaining FROM grace_tokens gt
       JOIN course_policies cp ON gt.policy_id = cp.id
       WHERE gt.course_id = ? AND cp.is_active = 1`,
      [task.courseId]
    );

    if (!tokenRecord) {
      return { success: false, hoursExtended: 0, error: 'Grace token record not found' };
    }

    this.db.transaction(() => {
      // Update tokens remaining
      this.db.executeWrite(
        `UPDATE grace_tokens SET tokens_remaining = tokens_remaining - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [actualTokens, tokenRecord.id],
        'grace_tokens'
      );

      // Record usage
      this.db.executeWrite(
        `INSERT INTO grace_token_usage (grace_token_id, task_id, tokens_used, hours_extended)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(grace_token_id, task_id) DO UPDATE SET
           tokens_used = tokens_used + excluded.tokens_used,
           hours_extended = hours_extended + excluded.hours_extended`,
        [tokenRecord.id, taskId, actualTokens, hoursExtended],
        'grace_token_usage'
      );
    });

    return { success: true, hoursExtended };
  }

  // ============ Pain Index Calculation ============

  /**
   * Calculate the Pain Index for priority scoring
   * Formula: (Weight × (1 + PenaltySeverity)) / DaysUntilDue + GraceTokenFactor
   */
  calculatePainIndex(task: TaskWithPolicy, courseId: number): PainIndexFactors & { painIndex: number } {
    const now = new Date();
    let daysUntilDue = 365; // Default for tasks without due date

    if (task.dueAt) {
      const dueDate = new Date(task.dueAt);
      daysUntilDue = Math.max(0.1, (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    }

    // Get late penalty policy
    const latePolicy = this.db.executeReadOne<{
      penalty_value: number;
      hard_cutoff_days: number | null;
    }>(
      `SELECT pr.rule_value as penalty_value,
              (SELECT rule_value FROM policy_rules WHERE policy_id = cp.id AND rule_key = 'hard_cutoff_days') as hard_cutoff_days
       FROM course_policies cp
       LEFT JOIN policy_rules pr ON cp.id = pr.policy_id AND pr.rule_key = 'penalty_value'
       WHERE cp.course_id = ? AND cp.policy_type = 'late_penalty' AND cp.is_active = 1
       LIMIT 1`,
      [courseId]
    );

    const penaltySeverity = latePolicy?.penalty_value ? parseFloat(String(latePolicy.penalty_value)) / 10 : 0;
    const hardCutoffDays = latePolicy?.hard_cutoff_days ? parseFloat(String(latePolicy.hard_cutoff_days)) : null;

    // Check grace token availability
    const graceTokenInfo = this.canUseGraceToken(task, courseId);
    const hasSafetyNet = graceTokenInfo.canUse && graceTokenInfo.tokensAvailable > 0;
    const graceTokenFactor = hasSafetyNet ? -5 : (graceTokenInfo.tokensAvailable === 0 ? 5 : 0);

    // Calculate days until hard cutoff
    let daysUntilCutoff: number | null = null;
    if (hardCutoffDays !== null && task.dueAt) {
      const dueDate = new Date(task.dueAt);
      const cutoffDate = new Date(dueDate.getTime() + hardCutoffDays * 24 * 60 * 60 * 1000);
      daysUntilCutoff = Math.max(0, (cutoffDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    }

    // Pain Index formula
    const weight = task.weight || 1;
    const painIndex = (weight * (1 + penaltySeverity)) / daysUntilDue + graceTokenFactor;

    return {
      weight,
      penaltySeverity,
      daysUntilDue,
      graceTokenFactor,
      hasSafetyNet,
      daysUntilCutoff,
      painIndex: Math.max(0, painIndex * 10), // Scale for readability
    };
  }

  /**
   * Update pain index for all tasks in a course
   */
  updateCoursePainIndexes(courseId: number): void {
    const tasks = this.db.executeRead<TaskWithPolicy>(
      `SELECT id, course_id as courseId, task_type as taskType, task_group_id as taskGroupId,
              title, due_at as dueAt, weight, original_grade as originalGrade,
              effective_grade as effectiveGrade, is_completed as isCompleted,
              submission_status as submissionStatus
       FROM tasks WHERE course_id = ? AND is_completed = 0`,
      [courseId]
    );

    for (const task of tasks) {
      const factors = this.calculatePainIndex(task, courseId);

      this.db.executeWrite(
        `UPDATE tasks SET
           pain_index = ?,
           penalty_severity = ?,
           has_safety_net = ?,
           days_until_cutoff = ?,
           priority_score = ?,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          factors.painIndex,
          factors.penaltySeverity,
          factors.hasSafetyNet ? 1 : 0,
          factors.daysUntilCutoff,
          factors.painIndex, // Use pain index as priority score
          task.id,
        ],
        'tasks'
      );
    }
  }

  // ============ Task Type Matching ============

  /**
   * Check if a task type is applicable given include/exclude lists
   */
  private isTaskTypeApplicable(
    taskType: string,
    applicableTypes: string[],
    excludedTypes: string[]
  ): boolean {
    // If excluded, return false
    if (excludedTypes && excludedTypes.length > 0) {
      if (excludedTypes.includes(taskType) || excludedTypes.includes('*')) {
        return false;
      }
    }

    // If applicable list is empty or contains '*', apply to all
    if (!applicableTypes || applicableTypes.length === 0 || applicableTypes.includes('*')) {
      return true;
    }

    return applicableTypes.includes(taskType);
  }

  /**
   * Auto-categorize a task based on Canvas assignment group name
   */
  autoCategorizeTakType(canvasGroupName: string): string {
    const lowerName = canvasGroupName.toLowerCase();

    const patterns: Record<string, string[]> = {
      quiz: ['quiz', 'assessment'],
      exam: ['exam', 'test', 'term test', 'termtest'],
      midterm: ['midterm', 'mid-term', 'mid term'],
      final: ['final', 'final exam'],
      project: ['project', 'capstone'],
      lab: ['lab', 'laboratory', 'practical'],
      discussion: ['discussion', 'forum', 'participation'],
      attendance: ['attendance', 'presence'],
      assignment: ['assignment', 'homework', 'hw'],
    };

    for (const [type, keywords] of Object.entries(patterns)) {
      if (keywords.some(k => lowerName.includes(k))) {
        return type;
      }
    }

    return 'other';
  }

  // ============ Get Policies for Task ============

  /**
   * Get all applicable policies for a task
   */
  getApplicablePolicies(task: TaskWithPolicy): Policy[] {
    const policies = this.db.executeRead<{
      id: number;
      course_id: number;
      policy_type: string;
      policy_name: string;
      policy_config: string;
      scope_type: string;
      target_group_id: number | null;
      target_task_id: number | null;
      applicable_types: string | null;
      excluded_types: string | null;
      is_active: boolean;
    }>(
      `SELECT * FROM course_policies
       WHERE course_id = ? AND is_active = 1
       AND (
         scope_type = 'course'
         OR (scope_type = 'group' AND target_group_id = ?)
         OR (scope_type = 'task' AND target_task_id = ?)
       )`,
      [task.courseId, task.taskGroupId || 0, task.id]
    );

    return policies
      .map(p => ({
        id: p.id,
        courseId: p.course_id,
        policyType: p.policy_type as PolicyType,
        policyName: p.policy_name,
        scopeType: p.scope_type as ScopeType,
        targetGroupId: p.target_group_id ?? undefined,
        targetTaskId: p.target_task_id ?? undefined,
        applicableTypes: p.applicable_types ? JSON.parse(p.applicable_types) : undefined,
        excludedTypes: p.excluded_types ? JSON.parse(p.excluded_types) : undefined,
        isActive: Boolean(p.is_active),
        config: JSON.parse(p.policy_config),
      }))
      .filter(p => this.isTaskTypeApplicable(
        task.taskType,
        p.applicableTypes || [],
        p.excludedTypes || []
      ));
  }
}
