/**
 * SetUserPreferenceCommand - Upsert one key/value row in `user_preferences`.
 *
 * The `value` is stored verbatim (callers serialize their own JSON). Per
 * ADR-0007 this is the write path the settings IPC handlers route through
 * for preference persistence.
 */

import {
  Command,
  CommandContext,
  CommandResult,
  SetUserPreferenceParams,
} from '../../types';

export class SetUserPreferenceCommand implements Command<SetUserPreferenceParams, void> {
  readonly name = 'SetUserPreference';

  validate(params: SetUserPreferenceParams): { valid: boolean; error?: string } {
    if (!params.key) {
      return { valid: false, error: 'Preference key is required' };
    }
    return { valid: true };
  }

  async execute(
    context: CommandContext,
    params: SetUserPreferenceParams
  ): Promise<CommandResult<void>> {
    const validation = this.validate(params);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      context.db.executeWrite(
        `INSERT INTO user_preferences (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [params.key, params.value],
        'user_preferences'
      );
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to set user preference: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
