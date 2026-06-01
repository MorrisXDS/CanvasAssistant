/**
 * AnnouncementFileReferenceReader — read surface for `announcement_file_references`
 * joined to their (optional) linked `notification_attachments` row. Per ADR-0007.
 * Backs `data:getFileReferences`. Stateless; returns raw joined rows.
 */

import type { Database } from '../Database';

/** A file reference + its linked attachment columns (LEFT JOIN; att_* may be null). */
export interface FileReferenceRow {
  id: number;
  notification_id: number;
  attachment_id: number | null;
  start_position: number;
  end_position: number;
  matched_text: string;
  original_url: string | null;
  att_id: number | null;
  att_external_id: string | null;
  att_display_name: string | null;
  att_filename: string | null;
  att_url: string | null;
  att_size_bytes: number | null;
  att_content_type: string | null;
  att_local_path: string | null;
  att_download_status: string | null;
  att_downloaded_at: string | null;
}

export class AnnouncementFileReferenceReader {
  constructor(private readonly db: Database) {}

  /** File references for a notification (start-position order), with linked attachment. */
  getByNotificationId(notificationId: number): FileReferenceRow[] {
    return this.db.executeRead<FileReferenceRow>(
      `SELECT
          fr.id, fr.notification_id, fr.attachment_id, fr.start_position, fr.end_position,
          fr.matched_text, fr.original_url,
          a.id as att_id, a.external_id as att_external_id, a.display_name as att_display_name,
          a.filename as att_filename, a.url as att_url, a.size_bytes as att_size_bytes,
          a.content_type as att_content_type, a.local_path as att_local_path,
          a.download_status as att_download_status, a.downloaded_at as att_downloaded_at
        FROM announcement_file_references fr
        LEFT JOIN notification_attachments a ON fr.attachment_id = a.id
        WHERE fr.notification_id = ?
        ORDER BY fr.start_position`,
      [notificationId]
    );
  }
}
