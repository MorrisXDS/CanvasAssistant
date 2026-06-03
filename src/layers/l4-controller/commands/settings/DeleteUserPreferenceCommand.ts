/**
 * DeleteUserPreferenceCommand - Delete one key from `user_preferences`.
 *
 * Per ADR-0007 this is the write path the backup handler routes through to
 * clear a stored setting (e.g. the backup encryption password when
 * encryption is turned off). Mirror of `SetUserPreferenceCommand`.
 */

import {
  Command,
  CommandContext,
  CommandResult,
  DeleteUserPreferenceParams,
} from '../../types';

export class DeleteUserPreferenceCommand implements Command<
  DeleteUserPreferenceParams,
  void
> {
  readonly name = 'DeleteUserPreference';

  validate(params: DeleteUserPreferenceParams): { valid: boolean; error?: string } {
    if (!params.key) {
      return { valid: false, error: 'Preference key is required' };
    }
    return { valid: true };
  }

  async execute(
    context: CommandContext,
    params: DeleteUserPreferenceParams
  ): Promise<CommandResult<void>> {
    const validation = this.validate(params);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      context.db.executeWrite(
        `DELETE FROM user_preferences WHERE key = ?`,
        [params.key],
        'user_preferences'
      );
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to delete user preference: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
