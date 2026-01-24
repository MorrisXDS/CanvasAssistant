/**
 * DismissNotificationCommand - Mark a notification as dismissed
 *
 * Uses repository for data access.
 * Dismisses a notification so it no longer appears in the user's feed.
 * The notification is soft-deleted (dismissed_at timestamp set).
 */

import {
  Command,
  CommandContext,
  CommandResult,
  DismissNotificationParams,
} from '../types';
import { NotificationRepository } from '../../l1-persistence/repositories';

export class DismissNotificationCommand
  implements Command<DismissNotificationParams, { dismissedAt: Date }>
{
  readonly name = 'DismissNotification';

  validate(params: DismissNotificationParams): { valid: boolean; error?: string } {
    if (!params.notificationId || params.notificationId <= 0) {
      return { valid: false, error: 'Invalid notification ID' };
    }

    return { valid: true };
  }

  async execute(
    context: CommandContext,
    params: DismissNotificationParams
  ): Promise<CommandResult<{ dismissedAt: Date }>> {
    const validation = this.validate(params);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      const notificationRepo = new NotificationRepository(context.db);

      // Check if notification exists
      if (!notificationRepo.exists(params.notificationId)) {
        return { success: false, error: 'Notification not found' };
      }

      // Check if already dismissed
      if (notificationRepo.isDismissed(params.notificationId)) {
        return { success: false, error: 'Notification already dismissed' };
      }

      // Dismiss using repository
      notificationRepo.dismiss(params.notificationId);

      return {
        success: true,
        data: { dismissedAt: new Date() },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to dismiss notification: ${error}`,
      };
    }
  }
}
