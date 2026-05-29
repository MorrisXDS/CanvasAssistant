/**
 * CreateTaskTypeCommand - Create a user-defined (custom) task type.
 *
 * Writes a row to `custom_task_types`. The `name` is normalized to
 * lowercase-with-underscores and must be unique. Per ADR-0007, this is
 * the write path the `taskTypes:create` IPC handler routes through.
 */

import { TaskTypeReader } from '../../../l1-persistence';
import {
  Command,
  CommandContext,
  CommandResult,
  CreateTaskTypeParams,
} from '../../types';

export interface CreateTaskTypeResult {
  id: number;
  name: string;
  displayName: string;
  courseId: number | null;
}

export class CreateTaskTypeCommand implements Command<
  CreateTaskTypeParams,
  CreateTaskTypeResult
> {
  readonly name = 'CreateTaskType';

  validate(params: CreateTaskTypeParams): { valid: boolean; error?: string } {
    if (!params.name || !params.displayName) {
      return { valid: false, error: 'Name and display name are required' };
    }
    return { valid: true };
  }

  async execute(
    context: CommandContext,
    params: CreateTaskTypeParams
  ): Promise<CommandResult<CreateTaskTypeResult>> {
    const validation = this.validate(params);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      // Normalize name to lowercase with underscores
      const normalizedName = params.name.toLowerCase().replace(/\s+/g, '_');
      const displayName = params.displayName.trim();
      const courseId = params.courseId ?? null;

      // Enforce the UNIQUE(name) constraint with a friendly error
      const reader = new TaskTypeReader(context.db);
      if (reader.getByName(normalizedName)) {
        return { success: false, error: 'A task type with this name already exists' };
      }

      const result = context.db.executeWrite(
        `INSERT INTO custom_task_types (name, display_name, course_id)
         VALUES (?, ?, ?)`,
        [normalizedName, displayName, courseId],
        'custom_task_types'
      );

      return {
        success: true,
        data: {
          id: result.lastInsertRowid as number,
          name: normalizedName,
          displayName,
          courseId,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create task type: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
