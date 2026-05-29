/**
 * DeleteTaskTypeCommand - Delete a user-defined (custom) task type by id.
 *
 * Removes a row from `custom_task_types`. Per ADR-0007, this is the write
 * path the `taskTypes:delete` IPC handler routes through.
 */

import { TaskTypeReader } from '../../../l1-persistence';
import {
  Command,
  CommandContext,
  CommandResult,
  DeleteTaskTypeParams,
} from '../../types';

export class DeleteTaskTypeCommand implements Command<
  DeleteTaskTypeParams,
  { deleted: boolean }
> {
  readonly name = 'DeleteTaskType';

  validate(params: DeleteTaskTypeParams): { valid: boolean; error?: string } {
    if (!params.id || params.id <= 0) {
      return { valid: false, error: 'Invalid task type ID' };
    }
    return { valid: true };
  }

  async execute(
    context: CommandContext,
    params: DeleteTaskTypeParams
  ): Promise<CommandResult<{ deleted: boolean }>> {
    const validation = this.validate(params);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      const reader = new TaskTypeReader(context.db);
      if (!reader.getById(params.id)) {
        return { success: false, error: 'Task type not found' };
      }

      context.db.executeWrite(
        'DELETE FROM custom_task_types WHERE id = ?',
        [params.id],
        'custom_task_types'
      );

      return { success: true, data: { deleted: true } };
    } catch (error) {
      return {
        success: false,
        error: `Failed to delete task type: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
