/**
 * DeletePolicyCommand - Soft delete a course policy
 *
 * Uses soft delete (deactivate) instead of hard delete to preserve data.
 * Sets is_active = 0 rather than removing the row.
 */

import { Command, CommandContext, CommandResult } from '../types';

export interface DeletePolicyParams {
  policyId: number;
  /** If true, performs hard delete instead of soft delete */
  hardDelete?: boolean;
}

export interface DeletePolicyResult {
  deleted: boolean;
  /** Whether a soft delete (deactivation) was performed */
  deactivated: boolean;
}

export class DeletePolicyCommand implements Command<
  DeletePolicyParams,
  DeletePolicyResult
> {
  readonly name = 'DeletePolicy';

  validate(params: DeletePolicyParams): { valid: boolean; error?: string } {
    if (!params.policyId || params.policyId <= 0) {
      return { valid: false, error: 'Invalid policy ID' };
    }
    return { valid: true };
  }

  async execute(
    context: CommandContext,
    params: DeletePolicyParams
  ): Promise<CommandResult<DeletePolicyResult>> {
    const validation = this.validate(params);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      const policy = context.db.executeReadOne<{ id: number; is_active: number }>(
        'SELECT id, is_active FROM course_policies WHERE id = ?',
        [params.policyId]
      );

      if (!policy) {
        return { success: false, error: 'Policy not found' };
      }

      // Already deactivated - nothing to do
      if (!policy.is_active && !params.hardDelete) {
        return { success: true, data: { deleted: false, deactivated: false } };
      }

      if (params.hardDelete) {
        // Hard delete - actually remove the row (use sparingly)
        context.db.executeWrite(
          'DELETE FROM course_policies WHERE id = ?',
          [params.policyId],
          'course_policies'
        );
        return { success: true, data: { deleted: true, deactivated: false } };
      } else {
        // Soft delete - deactivate the policy
        context.db.executeWrite(
          'UPDATE course_policies SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [params.policyId],
          'course_policies'
        );
        return { success: true, data: { deleted: false, deactivated: true } };
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to delete policy: ${error}`,
      };
    }
  }
}
