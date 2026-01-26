/**
 * AddPolicyCommand - Manually add a course policy
 *
 * Allows users to add policies that were not auto-detected from
 * the syllabus or course announcements.
 */

import { Command, CommandContext, CommandResult } from '../types';

export type PolicyType =
  | 'grace_tokens'
  | 'late_penalty'
  | 'drop_lowest'
  | 'weight_transfer'
  | 'grade_replacement';

export interface AddPolicyParams {
  courseId: number;
  policyType: PolicyType;
  policyName: string;
  policyConfig: Record<string, unknown>;
  rawText?: string;
}

export interface AddPolicyResult {
  policyId: number;
}

export class AddPolicyCommand implements Command<AddPolicyParams, AddPolicyResult> {
  readonly name = 'AddPolicy';

  private readonly validPolicyTypes: PolicyType[] = [
    'grace_tokens',
    'late_penalty',
    'drop_lowest',
    'weight_transfer',
    'grade_replacement',
  ];

  validate(params: AddPolicyParams): { valid: boolean; error?: string } {
    if (!params.courseId || params.courseId <= 0) {
      return { valid: false, error: 'Course not found or invalid' };
    }

    if (!this.validPolicyTypes.includes(params.policyType)) {
      return {
        valid: false,
        error: `Invalid policy type. Must be one of: ${this.validPolicyTypes.join(', ')}`,
      };
    }

    if (!params.policyName || params.policyName.trim().length === 0) {
      return { valid: false, error: 'Policy name is required' };
    }

    if (!params.policyConfig || typeof params.policyConfig !== 'object') {
      return { valid: false, error: 'Policy config is required' };
    }

    // Validate config based on policy type
    const configValidation = this.validateConfig(params.policyType, params.policyConfig);
    if (!configValidation.valid) {
      return configValidation;
    }

    return { valid: true };
  }

  private validateConfig(
    policyType: PolicyType,
    config: Record<string, unknown>
  ): { valid: boolean; error?: string } {
    switch (policyType) {
      case 'grace_tokens':
        if (typeof config.total_tokens !== 'number' || config.total_tokens < 0) {
          return {
            valid: false,
            error: 'Grace tokens policy requires a valid token count (0 or more)',
          };
        }
        if (typeof config.hours_per_token !== 'number' || config.hours_per_token <= 0) {
          return {
            valid: false,
            error:
              'Grace tokens policy requires hours per token (must be greater than 0)',
          };
        }
        break;

      case 'late_penalty': {
        if (typeof config.penalty_value !== 'number') {
          return { valid: false, error: 'Late penalty policy requires a penalty value' };
        }
        const validPenaltyTypes = [
          'percentage_per_day',
          'percentage_per_hour',
          'flat',
          'tiered',
        ];
        if (!validPenaltyTypes.includes(config.penalty_type as string)) {
          return {
            valid: false,
            error: `Late penalty policy requires a penalty type: ${validPenaltyTypes.join(', ')}`,
          };
        }
        break;
      }

      case 'drop_lowest':
        if (typeof config.drop_count !== 'number' || config.drop_count < 1) {
          return {
            valid: false,
            error: 'Drop lowest policy requires how many to drop (at least 1)',
          };
        }
        if (typeof config.category !== 'string') {
          return {
            valid: false,
            error: 'Drop lowest policy requires an assignment category',
          };
        }
        break;

      case 'weight_transfer': {
        // Accept either old format (from_task/to_task) or new format (source_task_id/target_task_id)
        const hasSource =
          config.source_task_id || config.source_group_id || config.from_task;
        const hasTarget =
          config.target_task_id || config.target_group_id || config.to_task;

        if (!hasSource) {
          return {
            valid: false,
            error: 'Weight transfer policy requires a source assignment',
          };
        }
        if (!hasTarget) {
          return {
            valid: false,
            error: 'Weight transfer policy requires a target assignment',
          };
        }
        break;
      }

      case 'grade_replacement': {
        // Similar to weight_transfer but for grade replacement
        const hasReplacementSource = config.source_task_id || config.source_group_id;
        const hasReplacementTarget = config.target_task_id || config.target_group_id;

        if (!hasReplacementSource) {
          return {
            valid: false,
            error: 'Grade replacement policy requires a source assignment',
          };
        }
        if (!hasReplacementTarget) {
          return {
            valid: false,
            error: 'Grade replacement policy requires a target assignment',
          };
        }
        break;
      }
    }

    return { valid: true };
  }

  async execute(
    context: CommandContext,
    params: AddPolicyParams
  ): Promise<CommandResult<AddPolicyResult>> {
    const validation = this.validate(params);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      // Verify course exists
      const course = context.db.executeReadOne<{ id: number }>(
        'SELECT id FROM courses WHERE id = ?',
        [params.courseId]
      );

      if (!course) {
        return { success: false, error: 'Course not found' };
      }

      // Check for duplicate policy
      const existing = context.db.executeReadOne<{ id: number }>(
        `SELECT id FROM course_policies
         WHERE course_id = ? AND policy_type = ? AND policy_name = ?`,
        [params.courseId, params.policyType, params.policyName]
      );

      if (existing) {
        return {
          success: false,
          error: 'A policy with this type and name already exists for this course',
        };
      }

      // Add default fields to config based on type
      const fullConfig = this.addDefaultFields(params.policyType, params.policyConfig);

      // Insert the policy
      const result = context.db.executeWrite(
        `INSERT INTO course_policies
         (course_id, policy_type, policy_name, policy_config, raw_text, is_user_verified, is_active)
         VALUES (?, ?, ?, ?, ?, 1, 1)`,
        [
          params.courseId,
          params.policyType,
          params.policyName,
          JSON.stringify(fullConfig),
          params.rawText ?? null,
        ],
        'course_policies'
      );

      return {
        success: true,
        data: { policyId: result.lastInsertRowid },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to add policy: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private addDefaultFields(
    policyType: PolicyType,
    config: Record<string, unknown>
  ): Record<string, unknown> {
    const result = { type: policyType, ...config };

    switch (policyType) {
      case 'grace_tokens':
        return {
          ...result,
          tokens_used: config.tokens_used ?? 0,
          max_tokens_per_task: config.max_tokens_per_task ?? 2,
          applies_to: config.applies_to ?? [],
          excludes: config.excludes ?? ['exam', 'final', 'midterm'],
        };

      case 'late_penalty':
        return {
          ...result,
          grace_period_hours: config.grace_period_hours ?? 0,
          max_penalty: config.max_penalty ?? 100,
          cutoff_days: config.cutoff_days ?? null,
          applies_to: config.applies_to ?? [],
        };

      case 'drop_lowest':
        return {
          ...result,
          min_submissions: config.min_submissions ?? 1,
        };

      case 'weight_transfer':
        return {
          ...result,
          transfer_type: config.transfer_type ?? 'full',
          transfer_percent: config.transfer_percent ?? 100,
          condition_type: config.condition_type ?? 'always',
        };

      case 'grade_replacement':
        return {
          ...result,
          replacement_type: config.replacement_type ?? 'if_higher',
          replacement_ratio: config.replacement_ratio ?? 1.0,
        };

      default:
        return result;
    }
  }
}
