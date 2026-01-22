/**
 * DismissNotificationCommand - Mark a notification as dismissed
 *
 * Dismisses a notification so it no longer appears in the user's feed.
 * The notification is soft-deleted (dismissed_at timestamp set).
 */

import {
  Command,
  CommandContext,
  CommandResult,
  DismissNotificationParams,
} from '../types';

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
      // Check if notification exists and is not already dismissed
      const notification = context.db.executeReadOne<{
        id: number;
        dismissed_at: string | null;
      }>(
        'SELECT id, dismissed_at FROM notifications WHERE id = ?',
        [params.notificationId]
      );

      if (!notification) {
        return { success: false, error: 'Notification not found' };
      }

      if (notification.dismissed_at) {
        return { success: false, error: 'Notification already dismissed' };
      }

      const dismissedAt = new Date();

      // Mark as dismissed
      context.db.executeWrite(
        'UPDATE notifications SET dismissed_at = ? WHERE id = ?',
        [dismissedAt.toISOString(), params.notificationId],
        'notifications'
      );

      return {
        success: true,
        data: { dismissedAt },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to dismiss notification: ${error}`,
      };
    }
  }
}
