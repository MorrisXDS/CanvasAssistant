/**
 * RejectLinkSuggestionCommand - Reject (mark rejected) a link suggestion.
 *
 * Per ADR-0007 this is the write path the `data:rejectLinkSuggestion` IPC
 * handler routes through.
 */

import {
  Command,
  CommandContext,
  CommandResult,
  RejectLinkSuggestionParams,
} from '../../types';

export class RejectLinkSuggestionCommand implements Command<
  RejectLinkSuggestionParams,
  void
> {
  readonly name = 'RejectLinkSuggestion';

  async execute(
    context: CommandContext,
    params: RejectLinkSuggestionParams
  ): Promise<CommandResult<void>> {
    try {
      const now = new Date().toISOString();
      context.db.executeWrite(
        `UPDATE link_suggestions SET status = 'rejected', resolved_at = ?, resolved_by = 'user' WHERE id = ?`,
        [now, params.suggestionId],
        'link_suggestions'
      );
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to reject link suggestion: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
