/**
 * AcceptLinkSuggestionCommand - Accept an auto-generated link suggestion.
 *
 * Links the suggestion's user task into the matched Canvas task (carrying
 * over weight / notes / expected grade), soft-deletes the now-merged user
 * task, and marks the suggestion accepted. Per ADR-0007 this is the write
 * path the `data:acceptLinkSuggestion` IPC handler routes through.
 */

import { LinkSuggestionReader, TaskReader } from '../../../l1-persistence';
import {
  Command,
  CommandContext,
  CommandResult,
  AcceptLinkSuggestionParams,
} from '../../types';

export class AcceptLinkSuggestionCommand implements Command<
  AcceptLinkSuggestionParams,
  { canvasTaskId: number }
> {
  readonly name = 'AcceptLinkSuggestion';

  async execute(
    context: CommandContext,
    params: AcceptLinkSuggestionParams
  ): Promise<CommandResult<{ canvasTaskId: number }>> {
    try {
      const suggestionReader = new LinkSuggestionReader(context.db);
      const taskReader = new TaskReader(context.db);

      const suggestion = suggestionReader.getById(params.suggestionId);
      if (!suggestion) {
        return { success: false, error: 'Suggestion not found' };
      }

      const userTask = taskReader.getById(suggestion.user_task_id);
      if (!userTask) {
        return { success: false, error: 'User task not found' };
      }

      const now = new Date().toISOString();

      // Link the user task's fields into the Canvas task
      context.db.executeWrite(
        `UPDATE tasks SET
          linked_from_user_task = ?,
          link_confidence = ?,
          link_method = 'suggested',
          weight = COALESCE(?, weight),
          notes = COALESCE(?, notes),
          user_expected_grade = COALESCE(?, user_expected_grade),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [
          userTask.external_id,
          suggestion.confidence,
          userTask.weight,
          userTask.notes,
          userTask.user_expected_grade,
          suggestion.canvas_task_id,
        ],
        'tasks'
      );

      // Soft-delete the now-merged user task
      context.db.executeWrite(
        `UPDATE tasks SET deleted_at = ?, merged_into_task_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [now, suggestion.canvas_task_id, userTask.id],
        'tasks'
      );

      // Mark the suggestion accepted
      context.db.executeWrite(
        `UPDATE link_suggestions SET status = 'accepted', resolved_at = ?, resolved_by = 'user' WHERE id = ?`,
        [now, params.suggestionId],
        'link_suggestions'
      );

      return { success: true, data: { canvasTaskId: suggestion.canvas_task_id } };
    } catch (error) {
      return {
        success: false,
        error: `Failed to accept link suggestion: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
