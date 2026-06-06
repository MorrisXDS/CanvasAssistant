/**
 * Update Channel IPC Handlers (ADR-0012)
 *
 * Thin adapters: no raw SQL. All reads go through UserPreferencesReader (L1);
 * all writes through SetUserPreferenceCommand (L4) via the established
 * backupScheduleHandlers pattern.
 */

import { ipcMain } from 'electron';
import type { IpcContext } from './IpcContext';
import { UserPreferencesReader } from '../../layers/l1-persistence';
import { SetUserPreferenceCommand } from '../../layers/l4-controller/commands/settings/SetUserPreferenceCommand';
import { createSimulationContext } from '../../layers/l4-controller/types';
import {
  DEFAULT_UPDATE_PREFERENCES,
  UpdatePreferencesSchema,
  type UpdatePreferences,
} from '../../shared/ipc-contract';

export function registerUpdateHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();
  const userPreferencesReader = new UserPreferencesReader(database);

  const runContext = () => ({
    db: database,
    simulationContext: createSimulationContext(),
  });

  // ---- Get update preferences ----
  ipcMain.handle('updates:getPrefs', () => {
    try {
      const raw = userPreferencesReader.get('updatePreferences');
      if (!raw) {
        return { success: true, data: { ...DEFAULT_UPDATE_PREFERENCES } };
      }
      let parsed;
      try {
        parsed = UpdatePreferencesSchema.safeParse(JSON.parse(raw));
      } catch {
        // Stored value is not valid JSON — return defaults rather than an error.
        return { success: true, data: { ...DEFAULT_UPDATE_PREFERENCES } };
      }
      if (!parsed.success) {
        return { success: true, data: { ...DEFAULT_UPDATE_PREFERENCES } };
      }
      return { success: true, data: parsed.data };
    } catch (error) {
      logger.error('updates:getPrefs failed', error as Error);
      return { success: false, error: String(error) };
    }
  });

  // ---- Set update preferences ----
  ipcMain.handle('updates:setPrefs', async (_event, prefs: UpdatePreferences) => {
    try {
      const parsed = UpdatePreferencesSchema.safeParse(prefs);
      if (!parsed.success) {
        return { success: false, error: 'Invalid update preferences shape' };
      }

      await new SetUserPreferenceCommand().execute(runContext(), {
        key: 'updatePreferences',
        value: JSON.stringify(parsed.data),
      });

      logger.info(
        `Update preferences saved: enabled=${parsed.data.enabled}, interval=${parsed.data.intervalHours}h`
      );
      return { success: true };
    } catch (error) {
      logger.error('updates:setPrefs failed', error as Error);
      return { success: false, error: String(error) };
    }
  });

  // ---- Trigger an immediate check ----
  ipcMain.handle('updates:checkNow', async () => {
    try {
      const updateChecker = ctx.getUpdateChecker?.();
      if (!updateChecker) {
        logger.warn('updates:checkNow: UpdateChecker not available');
        return { success: true }; // Not an error — feature may be disabled
      }
      await updateChecker.checkNow();
      return { success: true };
    } catch (error) {
      logger.error('updates:checkNow failed', error as Error);
      return { success: false, error: String(error) };
    }
  });
}
