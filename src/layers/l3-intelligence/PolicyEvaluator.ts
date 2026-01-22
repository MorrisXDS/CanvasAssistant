/**
 * L3 Intelligence - Policy Evaluator
 *
 * Evaluates course policies and calculates their impact on task priority.
 * Handles grace tokens, late penalties, drop lowest, weight transfer, etc.
 */

import {
  PriorityFactor,
  SubmissionWindow,
  TaskForPriority,
  PolicyForPriority,
  CourseForPriority,
} from './types';

/**
 * Grace token policy configuration
 */
interface GraceTokenPolicy {
  type: 'grace_tokens';
  total_tokens: number;
  tokens_used: number;
  hours_per_token: number;
  max_tokens_per_task: number;
  applies_to: string[];
  excludes: string[];
}

/**
 * Late penalty policy configuration
 */
interface LatePenaltyPolicy {
  type: 'late_penalty';
  penalty_type: 'percentage_per_day' | 'percentage_per_hour' | 'flat' | 'tiered';
  penalty_value: number;
  grace_period_hours: number;
  max_penalty: number;
  cutoff_days: number | null;
  applies_to: string[];
}

/**
 * Drop lowest policy configuration
 */
interface DropLowestPolicy {
  type: 'drop_lowest';
  category: string;
  drop_count: number;
  min_submissions: number;
}

/**
 * Weight transfer policy configuration
 */
interface WeightTransferPolicy {
  type: 'weight_transfer';
  from_task: string;
  to_task: string;
  condition: 'if_higher' | 'if_lower' | 'always' | 'if_missed';
  max_transfer_percent: number;
  transfer_ratio: number;
}

/**
 * Type guards for policy configurations
 */
function isGraceTokenPolicy(config: unknown): config is GraceTokenPolicy {
  if (typeof config !== 'object' || config === null) return false;
  const c = config as Record<string, unknown>;
  return (
    c.type === 'grace_tokens' &&
    typeof c.total_tokens === 'number' &&
    typeof c.hours_per_token === 'number'
  );
}

function isLatePenaltyPolicy(config: unknown): config is LatePenaltyPolicy {
  if (typeof config !== 'object' || config === null) return false;
  const c = config as Record<string, unknown>;
  return (
    c.type === 'late_penalty' &&
    typeof c.penalty_type === 'string' &&
    typeof c.penalty_value === 'number'
  );
}

function isDropLowestPolicy(config: unknown): config is DropLowestPolicy {
  if (typeof config !== 'object' || config === null) return false;
  const c = config as Record<string, unknown>;
  return (
    c.type === 'drop_lowest' &&
    typeof c.category === 'string' &&
    typeof c.drop_count === 'number'
  );
}

function isWeightTransferPolicy(config: unknown): config is WeightTransferPolicy {
  if (typeof config !== 'object' || config === null) return false;
  const c = config as Record<string, unknown>;
  return (
    c.type === 'weight_transfer' &&
    typeof c.from_task === 'string' &&
    typeof c.to_task === 'string'
  );
}

/**
 * Result of policy evaluation for a task
 */
export interface PolicyEvaluationResult {
  /** Total adjustment to priority score */
  adjustment: number;
  /** Individual factors from policies */
  factors: PriorityFactor[];
  /** Available submission windows based on policies */
  submissionWindows: SubmissionWindow[];
  /** Grace tokens available for this task */
  graceTokensAvailable: number;
  /** Whether task is in a droppable category */
  isDroppable: boolean;
  /** Whether task weight can transfer elsewhere */
  canTransferWeight: boolean;
  /** Recommendations based on policies */
  recommendations: string[];
}

/**
 * Policy Evaluator
 *
 * Analyzes course policies and determines their impact on task priority.
 */
export class PolicyEvaluator {
  /**
   * Evaluate all policies for a task
   */
  evaluate(
    task: TaskForPriority,
    course: CourseForPriority,
    policies: PolicyForPriority[],
    now: Date = new Date()
  ): PolicyEvaluationResult {
    const result: PolicyEvaluationResult = {
      adjustment: 0,
      factors: [],
      submissionWindows: [],
      graceTokensAvailable: 0,
      isDroppable: false,
      canTransferWeight: false,
      recommendations: [],
    };

    if (!task.dueAt) {
      return result;
    }

    const hoursUntilDue = (task.dueAt.getTime() - now.getTime()) / (1000 * 60 * 60);
    const isPastDue = hoursUntilDue < 0;
    const hoursPastDue = Math.abs(Math.min(hoursUntilDue, 0));

    // Start with on-time window
    if (!isPastDue) {
      result.submissionWindows.push({
        type: 'on_time',
        deadline: task.dueAt,
        hoursRemaining: hoursUntilDue,
        label: 'On-time submission',
        available: true,
      });
    }

    // Evaluate each active policy
    for (const policy of policies.filter((p) => p.isActive)) {
      const config = policy.policyConfig;

      // Use type guards for safe casting
      if (policy.policyType === 'grace_tokens' && isGraceTokenPolicy(config)) {
        this.evaluateGraceTokens(
          task,
          config,
          result,
          hoursUntilDue,
          isPastDue,
          hoursPastDue
        );
      } else if (policy.policyType === 'late_penalty' && isLatePenaltyPolicy(config)) {
        this.evaluateLatePenalty(
          task,
          config,
          result,
          hoursUntilDue,
          isPastDue,
          hoursPastDue
        );
      } else if (policy.policyType === 'drop_lowest' && isDropLowestPolicy(config)) {
        this.evaluateDropLowest(task, config, result);
      } else if (policy.policyType === 'weight_transfer' && isWeightTransferPolicy(config)) {
        this.evaluateWeightTransfer(task, config, result);
      }
      // Skip policies that don't pass type guards (malformed config)
    }

    // Sort submission windows by deadline
    result.submissionWindows.sort((a, b) => a.deadline.getTime() - b.deadline.getTime());

    return result;
  }

  /**
   * Evaluate grace token policy
   */
  private evaluateGraceTokens(
    task: TaskForPriority,
    config: GraceTokenPolicy,
    result: PolicyEvaluationResult,
    hoursUntilDue: number,
    isPastDue: boolean,
    hoursPastDue: number
  ): void {
    // Check if policy applies to this task
    if (config.excludes?.some((pattern) => task.title.includes(pattern))) {
      return;
    }

    const tokensRemaining = config.total_tokens - config.tokens_used;
    result.graceTokensAvailable = Math.min(tokensRemaining, config.max_tokens_per_task);

    if (tokensRemaining <= 0) {
      return;
    }

    // Add submission windows for each token level
    const baseDeadline = task.dueAt!;
    for (let tokens = 1; tokens <= Math.min(tokensRemaining, config.max_tokens_per_task); tokens++) {
      const extensionHours = tokens * config.hours_per_token;
      const extendedDeadline = new Date(baseDeadline.getTime() + extensionHours * 60 * 60 * 1000);
      const hoursRemaining = (extendedDeadline.getTime() - Date.now()) / (1000 * 60 * 60);

      result.submissionWindows.push({
        type: 'grace_token',
        deadline: extendedDeadline,
        hoursRemaining,
        label: `Use ${tokens} grace token${tokens > 1 ? 's' : ''}`,
        tokenCost: tokens,
        available: hoursRemaining > 0,
      });
    }

    // Calculate priority adjustment
    if (isPastDue) {
      const tokensNeeded = Math.ceil(hoursPastDue / config.hours_per_token);
      if (tokensNeeded <= result.graceTokensAvailable) {
        // Task is salvageable - boost priority
        const boostFactor = 1.5 - (tokensNeeded * 0.1); // Less boost if more tokens needed
        result.adjustment += 20 * boostFactor;
        result.factors.push({
          id: 'grace_token_salvageable',
          name: 'Grace Tokens',
          icon: '🎫',
          impact: Math.round(20 * boostFactor),
          description: `${result.graceTokensAvailable} token${result.graceTokensAvailable > 1 ? 's' : ''} available`,
          recommendation: `Submit within ${Math.round((result.graceTokensAvailable * config.hours_per_token) - hoursPastDue)}h to use ${tokensNeeded} token${tokensNeeded > 1 ? 's' : ''}`,
        });
      }
    } else if (hoursUntilDue < 24 && result.graceTokensAvailable > 0) {
      // Not past due but urgent - note tokens as safety net
      result.adjustment += 5;
      result.factors.push({
        id: 'grace_token_available',
        name: 'Grace Tokens',
        icon: '🎫',
        impact: 5,
        description: `${result.graceTokensAvailable} token${result.graceTokensAvailable > 1 ? 's' : ''} as backup`,
      });
      result.recommendations.push(
        `You have ${result.graceTokensAvailable} grace token${result.graceTokensAvailable > 1 ? 's' : ''} if you need extra time`
      );
    }
  }

  /**
   * Evaluate late penalty policy
   */
  private evaluateLatePenalty(
    task: TaskForPriority,
    config: LatePenaltyPolicy,
    result: PolicyEvaluationResult,
    hoursUntilDue: number,
    isPastDue: boolean,
    hoursPastDue: number
  ): void {
    if (!task.dueAt) return;

    const baseDeadline = task.dueAt;

    // Add grace period window if applicable
    if (config.grace_period_hours > 0) {
      const graceDeadline = new Date(
        baseDeadline.getTime() + config.grace_period_hours * 60 * 60 * 1000
      );
      const hoursRemaining = (graceDeadline.getTime() - Date.now()) / (1000 * 60 * 60);

      result.submissionWindows.push({
        type: 'late_penalty',
        deadline: graceDeadline,
        hoursRemaining,
        label: `Grace period (no penalty)`,
        penaltyPercent: 0,
        available: hoursRemaining > 0,
      });
    }

    // Add late submission windows with penalties
    if (config.cutoff_days) {
      const cutoffDeadline = new Date(
        baseDeadline.getTime() + config.cutoff_days * 24 * 60 * 60 * 1000
      );
      const hoursRemaining = (cutoffDeadline.getTime() - Date.now()) / (1000 * 60 * 60);

      // Add intermediate penalty windows (daily)
      for (let day = 1; day < config.cutoff_days; day++) {
        const penaltyDeadline = new Date(
          baseDeadline.getTime() + day * 24 * 60 * 60 * 1000
        );
        const dayHoursRemaining = (penaltyDeadline.getTime() - Date.now()) / (1000 * 60 * 60);
        const penalty = Math.min(day * config.penalty_value, config.max_penalty);

        if (dayHoursRemaining > 0) {
          result.submissionWindows.push({
            type: 'late_penalty',
            deadline: penaltyDeadline,
            hoursRemaining: dayHoursRemaining,
            label: `Late (−${penalty}%)`,
            penaltyPercent: penalty,
            available: true,
          });
        }
      }

      // Add cutoff window
      result.submissionWindows.push({
        type: 'cutoff',
        deadline: cutoffDeadline,
        hoursRemaining,
        label: `Cutoff (no submission accepted)`,
        available: false,
      });
    }

    // Calculate priority adjustment based on penalty severity
    if (isPastDue) {
      // Check if still in grace period
      if (hoursPastDue <= config.grace_period_hours) {
        result.adjustment += 15; // Urgent but no penalty yet
        result.factors.push({
          id: 'grace_period_active',
          name: 'Grace Period',
          icon: '⏳',
          impact: 15,
          description: `${Math.round(config.grace_period_hours - hoursPastDue)}h left in grace period`,
          recommendation: 'Submit now to avoid penalty',
        });
      } else if (config.cutoff_days && hoursPastDue < config.cutoff_days * 24) {
        // Past grace period but before cutoff
        const currentPenalty = Math.min(
          Math.ceil(hoursPastDue / 24) * config.penalty_value,
          config.max_penalty
        );
        result.adjustment -= currentPenalty / 2; // Reduce priority based on penalty
        result.factors.push({
          id: 'late_penalty_active',
          name: 'Late Penalty',
          icon: '⚠️',
          impact: -Math.round(currentPenalty / 2),
          description: `Currently −${currentPenalty}% penalty`,
          recommendation: `Submit soon to minimize penalty (max −${config.max_penalty}%)`,
        });
      } else if (config.cutoff_days && hoursPastDue >= config.cutoff_days * 24) {
        // Past cutoff
        result.adjustment -= 100; // Drastically reduce priority
        result.factors.push({
          id: 'past_cutoff',
          name: 'Past Cutoff',
          icon: '❌',
          impact: -100,
          description: 'Submission no longer accepted',
        });
      }
    } else if (config.penalty_value <= 2) {
      // Low penalty rate - slightly lower urgency
      result.adjustment -= 5;
      result.factors.push({
        id: 'low_penalty_rate',
        name: 'Low Penalty',
        icon: '📉',
        impact: -5,
        description: `Only −${config.penalty_value}%/day if late`,
      });
    }
  }

  /**
   * Evaluate drop lowest policy
   */
  private evaluateDropLowest(
    task: TaskForPriority,
    config: DropLowestPolicy,
    result: PolicyEvaluationResult
  ): void {
    // Check if task matches the category (simplified check)
    const taskMatchesCategory =
      task.title.toLowerCase().includes(config.category.toLowerCase());

    if (taskMatchesCategory) {
      result.isDroppable = true;
      result.adjustment -= 10; // Slightly lower priority
      result.factors.push({
        id: 'drop_lowest',
        name: 'Drop Policy',
        icon: '📋',
        impact: -10,
        description: `Lowest ${config.drop_count} in "${config.category}" dropped`,
        recommendation: 'Consider skipping if struggling with other tasks',
      });
    }
  }

  /**
   * Evaluate weight transfer policy
   */
  private evaluateWeightTransfer(
    task: TaskForPriority,
    config: WeightTransferPolicy,
    result: PolicyEvaluationResult
  ): void {
    const isSourceTask = task.title.includes(config.from_task);
    const isTargetTask = task.title.includes(config.to_task);

    if (isSourceTask) {
      result.canTransferWeight = true;
      result.adjustment -= 8;
      result.factors.push({
        id: 'weight_transfer_source',
        name: 'Weight Transfer',
        icon: '⚖️',
        impact: -8,
        description: `Weight can transfer to ${config.to_task}`,
        recommendation: `If ${config.condition.replace('_', ' ')}, weight moves to ${config.to_task}`,
      });
    }

    if (isTargetTask) {
      result.adjustment += 10;
      result.factors.push({
        id: 'weight_transfer_target',
        name: 'Weight Transfer',
        icon: '⚖️',
        impact: 10,
        description: `May absorb weight from ${config.from_task}`,
      });
    }
  }

  /**
   * Calculate maximum possible score considering penalties
   */
  calculateMaxPossibleScore(
    task: TaskForPriority,
    policies: PolicyForPriority[],
    now: Date = new Date()
  ): number {
    if (!task.dueAt || !task.pointsPossible) {
      return task.pointsPossible || 0;
    }

    const hoursUntilDue = (task.dueAt.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursUntilDue >= 0) {
      return task.pointsPossible;
    }

    const hoursPastDue = Math.abs(hoursUntilDue);

    // Find applicable late penalty policy
    const latePenaltyPolicy = policies.find(
      (p) => p.isActive && p.policyType === 'late_penalty'
    );

    if (!latePenaltyPolicy) {
      return task.pointsPossible;
    }

    const config = latePenaltyPolicy.policyConfig;
    if (!isLatePenaltyPolicy(config)) {
      return task.pointsPossible;
    }

    // Check if past cutoff
    if (config.cutoff_days && hoursPastDue >= config.cutoff_days * 24) {
      return 0;
    }

    // Check if in grace period
    if (hoursPastDue <= config.grace_period_hours) {
      return task.pointsPossible;
    }

    // Calculate penalty
    const penaltyPercent = Math.min(
      Math.ceil((hoursPastDue - config.grace_period_hours) / 24) * config.penalty_value,
      config.max_penalty
    );

    return task.pointsPossible * (1 - penaltyPercent / 100);
  }
}
