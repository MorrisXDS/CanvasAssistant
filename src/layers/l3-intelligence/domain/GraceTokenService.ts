/**
 * GraceTokenService - Pure business logic for grace token management
 *
 * This service contains no database access or side effects.
 * It operates on pure data structures and returns validation/calculation results.
 */

import type { Task, Policy } from '../../../shared/ipc-contract';
import type { GraceTokenConfig } from '../../l1-persistence/repositories/PolicyRepository';

export interface TokenCheckResult {
  canUse: boolean;
  error?: string;
  availableTokens: number;
  requestedTokens: number;
}

export interface TokenApplicationResult {
  success: boolean;
  error?: string;
  tokensUsed: number;
  remainingTokens: number;
  newDeadline: Date;
  hoursExtended: number;
  updatedConfig: GraceTokenConfig;
}

export interface TokenStatus {
  totalTokens: number;
  usedTokens: number;
  availableTokens: number;
  hoursPerToken: number;
  maxTokensPerTask: number;
}

/**
 * Pure service for grace token business logic.
 */
export class GraceTokenService {
  /**
   * Get the status of grace tokens for a policy.
   */
  getStatus(config: GraceTokenConfig): TokenStatus {
    return {
      totalTokens: config.total_tokens,
      usedTokens: config.tokens_used,
      availableTokens: config.total_tokens - config.tokens_used,
      hoursPerToken: config.hours_per_token,
      maxTokensPerTask: config.max_tokens_per_task,
    };
  }

  /**
   * Check if grace tokens can be used for a task.
   *
   * @param policy The grace token policy
   * @param task The task to apply tokens to
   * @param tokensToUse Number of tokens to use
   */
  checkAvailability(
    policy: Policy & { policyConfig: GraceTokenConfig },
    task: Task,
    tokensToUse: number
  ): TokenCheckResult {
    const config = policy.policyConfig;
    const availableTokens = config.total_tokens - config.tokens_used;

    // Check if enough tokens available
    if (tokensToUse > availableTokens) {
      return {
        canUse: false,
        error: `Not enough tokens. Available: ${availableTokens}, requested: ${tokensToUse}`,
        availableTokens,
        requestedTokens: tokensToUse,
      };
    }

    // Check max per task limit
    if (tokensToUse > config.max_tokens_per_task) {
      return {
        canUse: false,
        error: `Cannot use more than ${config.max_tokens_per_task} tokens per task`,
        availableTokens,
        requestedTokens: tokensToUse,
      };
    }

    // Check if task has a due date
    if (!task.dueAt) {
      return {
        canUse: false,
        error: 'Task has no due date',
        availableTokens,
        requestedTokens: tokensToUse,
      };
    }

    // Check if task type is excluded
    if (this.isTaskExcluded(task, config)) {
      return {
        canUse: false,
        error: 'Grace tokens cannot be used for this task type',
        availableTokens,
        requestedTokens: tokensToUse,
      };
    }

    // Check if task type applies (if applies_to is specified)
    if (config.applies_to.length > 0 && !this.isTaskIncluded(task, config)) {
      return {
        canUse: false,
        error: 'Grace tokens do not apply to this task type',
        availableTokens,
        requestedTokens: tokensToUse,
      };
    }

    return {
      canUse: true,
      availableTokens,
      requestedTokens: tokensToUse,
    };
  }

  /**
   * Calculate the result of applying grace tokens to a task.
   *
   * @param config Current grace token configuration
   * @param task The task to apply tokens to
   * @param tokensToUse Number of tokens to use
   */
  calculateApplication(
    config: GraceTokenConfig,
    task: Task,
    tokensToUse: number
  ): TokenApplicationResult {
    if (!task.dueAt) {
      return {
        success: false,
        error: 'Task has no due date',
        tokensUsed: 0,
        remainingTokens: config.total_tokens - config.tokens_used,
        newDeadline: new Date(),
        hoursExtended: 0,
        updatedConfig: config,
      };
    }

    const hoursExtended = tokensToUse * config.hours_per_token;
    const originalDeadline = new Date(task.dueAt);
    const newDeadline = new Date(
      originalDeadline.getTime() + hoursExtended * 60 * 60 * 1000
    );

    // Create updated config with incremented tokens_used
    const updatedConfig: GraceTokenConfig = {
      ...config,
      tokens_used: config.tokens_used + tokensToUse,
    };

    return {
      success: true,
      tokensUsed: tokensToUse,
      remainingTokens: config.total_tokens - updatedConfig.tokens_used,
      newDeadline,
      hoursExtended,
      updatedConfig,
    };
  }

  /**
   * Check if a task is excluded from grace token usage.
   */
  private isTaskExcluded(task: Task, config: GraceTokenConfig): boolean {
    if (config.excludes.length === 0) {
      return false;
    }

    const titleLower = task.title.toLowerCase();
    return config.excludes.some((pattern) =>
      titleLower.includes(pattern.toLowerCase())
    );
  }

  /**
   * Check if a task is included in grace token eligibility.
   */
  private isTaskIncluded(task: Task, config: GraceTokenConfig): boolean {
    if (config.applies_to.length === 0) {
      return true; // If no applies_to specified, all tasks are included
    }

    const titleLower = task.title.toLowerCase();
    return config.applies_to.some((pattern) =>
      titleLower.includes(pattern.toLowerCase())
    );
  }

  /**
   * Create a default grace token configuration.
   */
  createDefaultConfig(overrides?: Partial<GraceTokenConfig>): GraceTokenConfig {
    return {
      total_tokens: overrides?.total_tokens ?? 3,
      tokens_used: overrides?.tokens_used ?? 0,
      hours_per_token: overrides?.hours_per_token ?? 24,
      max_tokens_per_task: overrides?.max_tokens_per_task ?? 1,
      applies_to: overrides?.applies_to ?? [],
      excludes: overrides?.excludes ?? ['exam', 'final', 'midterm'],
    };
  }

  /**
   * Format token status for display.
   */
  formatStatus(config: GraceTokenConfig): string {
    const available = config.total_tokens - config.tokens_used;
    return `${available}/${config.total_tokens} tokens available`;
  }

  /**
   * Calculate hours that can be extended with available tokens.
   */
  calculateMaxExtension(config: GraceTokenConfig): number {
    const available = config.total_tokens - config.tokens_used;
    return Math.min(available, config.max_tokens_per_task) * config.hours_per_token;
  }
}
