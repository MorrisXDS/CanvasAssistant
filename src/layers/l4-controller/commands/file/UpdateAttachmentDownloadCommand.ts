/**
 * UpdateAttachmentDownloadCommand — download-status writes for
 * `notification_attachments`, extracted from fileHandlers (ADR-0007).
 *
 * Backs the `attachment:download` flow: flip to 'downloading', then either
 * 'completed' (with local_path + downloaded_at) or 'failed'. SQL preserved
 * verbatim.
 */

import type { Database } from '../../../l1-persistence/Database';

export class UpdateAttachmentDownloadCommand {
  constructor(private readonly db: Database) {}

  /** Set just the download_status (e.g. 'downloading' / 'failed'). */
  setStatus(id: number, status: string): void {
    this.db.executeWrite(
      'UPDATE notification_attachments SET download_status = ? WHERE id = ?',
      [status, id],
      'notification_attachments'
    );
  }

  /**
   * Mark an attachment completed: status='completed' + local_path +
   * downloaded_at.
   */
  markDownloaded(id: number, localPath: string, downloadedAt: string): void {
    this.db.executeWrite(
      'UPDATE notification_attachments SET download_status = ?, local_path = ?, downloaded_at = ? WHERE id = ?',
      ['completed', localPath, downloadedAt, id],
      'notification_attachments'
    );
  }
}
