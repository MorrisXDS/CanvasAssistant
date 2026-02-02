/**
 * AnnouncementSyncStrategy - Handles syncing announcements from Canvas
 *
 * Extracted from SyncEngine to reduce complexity.
 */

import { BaseSyncStrategy, SyncResult, SyncContext } from './SyncStrategy';
import {
  mapAnnouncement,
  CanvasAnnouncement,
  detectPolicyKeywords,
  calculatePolicyConfidence,
} from '../DataMappers';

export interface AnnouncementSyncOptions {
  /** Callback for attachments pending download */
  onAttachmentsPending?: (event: AttachmentsPendingEvent) => void;
  /** Callback for policy detection */
  onPolicyDetected?: (event: PolicyDetectedEvent) => void;
}

export interface AttachmentsPendingEvent {
  notificationId: number;
  courseId: number;
  attachmentCount: number;
}

export interface PolicyDetectedEvent {
  notificationId: number;
  courseId: number;
  title: string;
  keywords: string[];
  confidence: number;
}

export class AnnouncementSyncStrategy extends BaseSyncStrategy {
  readonly entityType = 'announcements';

  private onAttachmentsPending?: (event: AttachmentsPendingEvent) => void;
  private onPolicyDetected?: (event: PolicyDetectedEvent) => void;

  constructor(context: SyncContext, options: AnnouncementSyncOptions = {}) {
    super(context);
    this.onAttachmentsPending = options.onAttachmentsPending;
    this.onPolicyDetected = options.onPolicyDetected;
  }

  async syncForCourse(
    canvasCourseId: number,
    localCourseId: number
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let count = 0;

    try {
      const announcements = await this.rateLimiter.enqueue(
        () =>
          this.client.getAll<CanvasAnnouncement>(
            `/courses/${canvasCourseId}/discussion_topics`,
            { only_announcements: true }
          ),
        3 // Lower priority
      );

      const baseUrl = this.client.getBaseUrl();

      this.db.transaction(() => {
        for (const announcement of announcements) {
          try {
            const mapped = mapAnnouncement(
              announcement,
              localCourseId,
              baseUrl,
              String(canvasCourseId)
            );

            // Insert notification
            this.db.upsert(
              'notifications',
              mapped.notification,
              ['source_type', 'source_id'],
              false
            );
            count++;

            // Get the notification ID for attachments and policy tracking
            const notificationRow = this.db.executeReadOne<{ id: number }>(
              'SELECT id FROM notifications WHERE source_id = ?',
              [String(announcement.id)]
            );

            if (notificationRow) {
              this.processAttachments(notificationRow.id, localCourseId, mapped);
              this.processFileReferences(notificationRow.id, mapped);
              this.processPolicyDetection(
                notificationRow.id,
                localCourseId,
                announcement,
                mapped
              );
            }
          } catch (error) {
            errors.push(
              `Announcement ${announcement.id}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      });

      return this.successResult(count, Date.now() - startTime, errors);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(
        `Failed to sync announcements for course ${canvasCourseId}: ${message}`
      );
      return this.failedResult(errors.join('; '), Date.now() - startTime);
    }
  }

  private processAttachments(
    notificationId: number,
    courseId: number,
    mapped: ReturnType<typeof mapAnnouncement>
  ): void {
    for (const attachment of mapped.attachments) {
      this.db.executeWrite(
        `INSERT INTO notification_attachments
         (notification_id, course_id, external_id, display_name, filename, url, size_bytes, content_type, download_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(notification_id, external_id) DO UPDATE SET
           display_name = excluded.display_name,
           filename = excluded.filename,
           url = excluded.url,
           size_bytes = excluded.size_bytes,
           content_type = excluded.content_type,
           download_status = COALESCE(notification_attachments.download_status, excluded.download_status)`,
        [
          notificationId,
          attachment.course_id,
          attachment.external_id,
          attachment.display_name,
          attachment.filename,
          attachment.url,
          attachment.size_bytes,
          attachment.content_type,
          'pending',
        ],
        'notification_attachments'
      );
    }

    if (mapped.attachments.length > 0) {
      this.onAttachmentsPending?.({
        notificationId,
        courseId,
        attachmentCount: mapped.attachments.length,
      });
    }
  }

  private processFileReferences(
    notificationId: number,
    mapped: ReturnType<typeof mapAnnouncement>
  ): void {
    if (mapped.fileReferences.length === 0) return;

    // Clear existing file references
    this.db.executeWrite(
      'DELETE FROM announcement_file_references WHERE notification_id = ?',
      [notificationId],
      'announcement_file_references'
    );

    for (const fileRef of mapped.fileReferences) {
      let attachmentId: number | null = null;
      if (fileRef.attachmentExternalId) {
        const attRow = this.db.executeReadOne<{ id: number }>(
          'SELECT id FROM notification_attachments WHERE notification_id = ? AND external_id = ?',
          [notificationId, fileRef.attachmentExternalId]
        );
        attachmentId = attRow?.id || null;
      }

      this.db.executeWrite(
        `INSERT INTO announcement_file_references
         (notification_id, attachment_id, start_position, end_position, matched_text, original_url)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          notificationId,
          attachmentId,
          fileRef.startPosition,
          fileRef.endPosition,
          fileRef.matchedText,
          fileRef.originalUrl,
        ],
        'announcement_file_references'
      );
    }
  }

  private processPolicyDetection(
    notificationId: number,
    courseId: number,
    announcement: CanvasAnnouncement,
    mapped: ReturnType<typeof mapAnnouncement>
  ): void {
    if (!mapped.notification.is_policy_related) return;

    const detection = detectPolicyKeywords(
      announcement.title + ' ' + announcement.message
    );
    const confidence = calculatePolicyConfidence(
      announcement.title + ' ' + announcement.message,
      detection.keywords
    );

    this.db.executeWrite(
      `INSERT INTO policy_announcements
       (notification_id, course_id, detected_policy_type, confidence_score, extracted_rules, is_confirmed)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(notification_id) DO UPDATE SET
         detected_policy_type = excluded.detected_policy_type,
         confidence_score = excluded.confidence_score,
         extracted_rules = excluded.extracted_rules`,
      [
        notificationId,
        courseId,
        detection.categories[0] || null,
        confidence,
        JSON.stringify({
          keywords: detection.keywords,
          categories: detection.categories,
        }),
        0,
      ],
      'policy_announcements'
    );

    this.onPolicyDetected?.({
      notificationId,
      courseId,
      title: announcement.title,
      keywords: detection.keywords,
      confidence,
    });
  }
}
