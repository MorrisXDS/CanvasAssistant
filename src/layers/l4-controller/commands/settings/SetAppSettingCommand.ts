/**
 * SetAppSettingCommand - Upsert one key/value row in `app_settings`.
 *
 * The `value` is stored verbatim (callers serialize their own JSON). Per
 * ADR-0007 this is a write path the settings/backup IPC handlers route
 * through. Distinct from `SetUserPreferenceCommand` (`user_preferences`).
 */

import { Command, CommandContext, CommandResult, SetAppSettingParams } from '../../types';

export class SetAppSettingCommand implements Command<SetAppSettingParams, void> {
  readonly name = 'SetAppSetting';

  validate(params: SetAppSettingParams): { valid: boolean; error?: string } {
    if (!params.key) {
      return { valid: false, error: 'Setting key is required' };
    }
    return { valid: true };
  }

  async execute(
    context: CommandContext,
    params: SetAppSettingParams
  ): Promise<CommandResult<void>> {
    const validation = this.validate(params);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      context.db.executeWrite(
        `INSERT INTO app_settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [params.key, params.value],
        'app_settings'
      );
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to set app setting: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
