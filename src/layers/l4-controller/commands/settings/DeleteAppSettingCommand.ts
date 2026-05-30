/**
 * DeleteAppSettingCommand - Delete one key from `app_settings`.
 *
 * Per ADR-0007 this is the write path the backup handler routes through to
 * clear a stored setting (e.g. the backup encryption password when
 * encryption is turned off).
 */

import {
  Command,
  CommandContext,
  CommandResult,
  DeleteAppSettingParams,
} from '../../types';

export class DeleteAppSettingCommand implements Command<DeleteAppSettingParams, void> {
  readonly name = 'DeleteAppSetting';

  validate(params: DeleteAppSettingParams): { valid: boolean; error?: string } {
    if (!params.key) {
      return { valid: false, error: 'Setting key is required' };
    }
    return { valid: true };
  }

  async execute(
    context: CommandContext,
    params: DeleteAppSettingParams
  ): Promise<CommandResult<void>> {
    const validation = this.validate(params);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      context.db.executeWrite(
        `DELETE FROM app_settings WHERE key = ?`,
        [params.key],
        'app_settings'
      );
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to delete app setting: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
