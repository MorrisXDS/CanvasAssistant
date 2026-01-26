/**
 * UpdatePolicyCommand - Update or verify a course policy
 *
 * Allows users to correct auto-detected policies or add missing details.
 * Marks the policy as user-verified after update.
 * Validates for duplicate policy names on rename.
 */

import {
  Command,
  CommandContext,
  CommandResult,
} from '../types';

export interface UpdatePolicyParams {
  policyId: number;
  updates: {
    policyName?: string;
    policyConfig?: Record<string, unknown>;
    isActive?: boolean;
  };
  markVerified?: boolean;
}

export interface UpdatePolicyResult {
  previousConfig: Record<string, unknown>;
  wasVerified: boolean;
}

export class UpdatePolicyCommand
  implements Command<UpdatePolicyParams, UpdatePolicyResult>
{
  readonly name = 'UpdatePolicy';

  validate(params: UpdatePolicyParams): { valid: boolean; error?: string } {
    if (!params.policyId || params.policyId <= 0) {
      return { valid: false, error: 'Invalid policy ID' };
    }

    if (!params.updates || Object.keys(params.updates).length === 0) {
      return { valid: false, error: 'No updates provided' };
    }

    // Validate policy name if provided
    if (params.updates.policyName !== undefined) {
      const trimmedName = params.updates.policyName.trim();
      if (trimmedName.length === 0) {
        return { valid: false, error: 'Policy name cannot be empty' };
      }
      if (trimmedName.length > 255) {
        return { valid: false, error: 'Policy name is too long (max 255 characters)' };
      }
    }

    return { valid: true };
  }

  async execute(
    context: CommandContext,
    params: UpdatePolicyParams
  ): Promise<CommandResult<UpdatePolicyResult>> {
    const validation = this.validate(params);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      // Get current policy with course_id for duplicate checking
      const policy = context.db.executeReadOne<{
        id: number;
        course_id: number;
        policy_name: string;
        policy_type: string;
        policy_config: string;
        is_user_verified: boolean;
        is_active: boolean;
      }>(
        'SELECT id, course_id, policy_name, policy_type, policy_config, is_user_verified, is_active FROM course_policies WHERE id = ?',
        [params.policyId]
      );

      if (!policy) {
        return { success: false, error: 'Policy not found' };
      }

      // Check for duplicate name if renaming
      if (params.updates.policyName !== undefined) {
        const newName = params.updates.policyName.trim();
        const existingPolicy = context.db.executeReadOne<{ id: number }>(
          'SELECT id FROM course_policies WHERE course_id = ? AND LOWER(policy_name) = LOWER(?) AND is_active = 1 AND id != ?',
          [policy.course_id, newName, params.policyId]
        );

        if (existingPolicy) {
          return { success: false, error: 'A policy with this name already exists' };
        }
      }

      const previousConfig = JSON.parse(policy.policy_config) as Record<string, unknown>;
      const wasVerified = Boolean(policy.is_user_verified);

      // Build update query
      const updates: string[] = [];
      const values: unknown[] = [];

      if (params.updates.policyName !== undefined) {
        updates.push('policy_name = ?');
        values.push(params.updates.policyName.trim());
      }

      if (params.updates.policyConfig !== undefined) {
        // Merge with existing config
        const newConfig = {
          ...previousConfig,
          ...params.updates.policyConfig,
        };
        updates.push('policy_config = ?');
        values.push(JSON.stringify(newConfig));
      }

      if (params.updates.isActive !== undefined) {
        updates.push('is_active = ?');
        values.push(params.updates.isActive ? 1 : 0);
      }

      // Mark as verified if requested (default true on update)
      if (params.markVerified !== false) {
        updates.push('is_user_verified = ?');
        values.push(1);
      }

      if (updates.length > 0) {
        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(params.policyId);

        context.db.executeWrite(
          `UPDATE course_policies SET ${updates.join(', ')} WHERE id = ?`,
          values,
          'course_policies'
        );
      }

      return {
        success: true,
        data: { previousConfig, wasVerified },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to update policy: ${error}`,
      };
    }
  }
}
