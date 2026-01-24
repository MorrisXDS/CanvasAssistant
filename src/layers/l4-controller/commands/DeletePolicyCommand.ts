/**
 * DeletePolicyCommand - Delete a course policy
 */

import {
  Command,
  CommandContext,
  CommandResult,
} from '../types';

export interface DeletePolicyParams {
  policyId: number;
}

export class DeletePolicyCommand
  implements Command<DeletePolicyParams, { deleted: boolean }>
{
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
  ): Promise<CommandResult<{ deleted: boolean }>> {
    const validation = this.validate(params);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      const policy = context.db.executeReadOne<{ id: number }>(
        'SELECT id FROM course_policies WHERE id = ?',
        [params.policyId]
      );

      if (!policy) {
        return { success: false, error: 'Policy not found' };
      }

      context.db.executeWrite(
        'DELETE FROM course_policies WHERE id = ?',
        [params.policyId],
        'course_policies'
      );

      return { success: true, data: { deleted: true } };
    } catch (error) {
      return {
        success: false,
        error: `Failed to delete policy: ${error}`,
      };
    }
  }
}
