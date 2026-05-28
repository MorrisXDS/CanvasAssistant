/**
 * FileEntityProvider — composes CanvasFileReader + AnnouncementAttachmentReader
 * into a single FileEntity read shape (ADR-0008).
 *
 * Stateless. No backing table — FileEntity is synthesized at read time
 * from the two physical sources (`resources.type='file'` and
 * `notification_attachments`), keyed by Canvas File ID (`external_id`,
 * exposed on the wire as `canvasId`).
 *
 * Visibility filtering: single-id lookups bypass; list-scope methods
 * require the caller to pre-filter course ids via `VisibilityOracle`
 * (per ADR-0007 sub-decision α).
 *
 * Canonical-field sourcing rule: the canvasFile presence wins when both
 * are present. When sources disagree on filename / size / content-type,
 * `logDivergence` records it via the injected logger; the consumer
 * sees the canvasFile value silently.
 */

import type { ComponentLogger } from '../l0-utilities/Logger';
import type {
  FileEntity,
  FileEntityAttachmentPresence,
  FileEntityCanvasFilePresence,
} from '../../shared/ipc-contract';
import type { CanvasFileRow, NotificationAttachmentRow } from './DatabaseRowTypes';
import { AnnouncementAttachmentReader } from './readers/AnnouncementAttachmentReader';
import { CanvasFileReader } from './readers/CanvasFileReader';

export class FileEntityProvider {
  constructor(
    private readonly canvasFileReader: CanvasFileReader,
    private readonly attachmentReader: AnnouncementAttachmentReader,
    private readonly logger: ComponentLogger
  ) {}

  /**
   * Lookup one FileEntity by Canvas File ID. Returns null when no
   * presence exists in either source (blob not synced or never seen).
   */
  findByCanvasId(canvasId: string): FileEntity | null {
    const file = this.canvasFileReader.getByExternalId(canvasId);
    const attachments = this.attachmentReader.getByExternalId(canvasId);
    if (!file && attachments.length === 0) return null;
    return this.compose(canvasId, file, attachments);
  }

  /**
   * Batch lookup. Returns a Map keyed by Canvas File ID; misses are
   * omitted so callers can detect them with `map.has(id)`.
   */
  findByCanvasIds(canvasIds: readonly string[]): Map<string, FileEntity> {
    const result = new Map<string, FileEntity>();
    if (canvasIds.length === 0) return result;

    const files = this.canvasFileReader.getByExternalIds(canvasIds);
    const attachments = this.attachmentReader.getByExternalIds(canvasIds);
    for (const canvasId of canvasIds) {
      const file = files.get(canvasId) ?? null;
      const atts = attachments.get(canvasId) ?? [];
      if (!file && atts.length === 0) continue;
      result.set(canvasId, this.compose(canvasId, file, atts));
    }
    return result;
  }

  /**
   * All FileEntities in the given course ids, sorted by displayName.
   * Empty input → empty array. The caller composes visibility via
   * `VisibilityOracle.getVisibleCourseIds()` before calling.
   */
  findByCourseIds(courseIds: readonly number[]): FileEntity[] {
    if (courseIds.length === 0) return [];

    const files = this.canvasFileReader.getByCourseIds(courseIds);
    const attachments = this.attachmentReader.getByCourseIds(courseIds);

    // Index attachments by external_id (one external_id → many rows).
    const attsByExternalId = new Map<string, NotificationAttachmentRow[]>();
    for (const att of attachments) {
      const existing = attsByExternalId.get(att.external_id);
      if (existing) {
        existing.push(att);
      } else {
        attsByExternalId.set(att.external_id, [att]);
      }
    }

    // Files always own a presence; pair with any matching attachments.
    const seen = new Set<string>();
    const result: FileEntity[] = [];
    for (const file of files) {
      seen.add(file.external_id);
      const atts = attsByExternalId.get(file.external_id) ?? [];
      result.push(this.compose(file.external_id, file, atts));
    }

    // Attachment-only blobs (no `resources` row) — emit one entity per
    // external_id, grouping the multi-announcement attachment rows.
    for (const [canvasId, atts] of attsByExternalId) {
      if (seen.has(canvasId)) continue;
      result.push(this.compose(canvasId, null, atts));
    }

    result.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return result;
  }

  /**
   * Build a FileEntity from the per-source rows. Applies the canonical-
   * field sourcing rule (canvasFile wins) and logs any divergence.
   */
  private compose(
    canvasId: string,
    file: CanvasFileRow | null,
    attachments: readonly NotificationAttachmentRow[]
  ): FileEntity {
    const canvasFilePresence: FileEntityCanvasFilePresence | null = file
      ? {
          resourceRowId: file.id,
          contextType: file.context_type,
          folderPath: file.folder_path,
          localPath: file.local_path,
          remoteUpdatedAt: file.remote_updated_at,
        }
      : null;

    const attachmentPresences: FileEntityAttachmentPresence[] = attachments.map((a) => ({
      attachmentRowId: a.id,
      notificationId: a.notification_id,
      downloadStatus: a.download_status,
      localPath: a.local_path,
      downloadedAt: a.downloaded_at,
    }));

    // Canonical-field sourcing — canvasFile wins; first attachment is fallback.
    const fallback = attachments[0];
    const filename = file?.title ?? fallback?.filename ?? '';
    const displayName = file?.title ?? fallback?.display_name ?? '';
    const sizeBytes = file?.size_bytes ?? fallback?.size_bytes ?? null;
    const contentType = file?.mime_type ?? fallback?.content_type ?? null;
    const courseId = file?.course_id ?? fallback?.course_id ?? 0;

    if (file && attachments.length > 0) {
      this.logDivergence(canvasId, file, attachments);
    }

    return {
      canvasId,
      uuid: null, // Canvas's UUID is not currently stored in either table.
      filename,
      displayName,
      sizeBytes,
      contentType,
      courseId,
      presences: {
        canvasFile: canvasFilePresence,
        attachments: attachmentPresences,
      },
    };
  }

  /**
   * Log fields where canvasFile and any attachment disagree. Does not
   * throw; the sourcing rule has already picked a winner. Surfacing
   * this lets a future sync bug become visible in `.logs/`.
   */
  private logDivergence(
    canvasId: string,
    file: CanvasFileRow,
    attachments: readonly NotificationAttachmentRow[]
  ): void {
    const divergent: Record<string, { canvasFile: unknown; attachment: unknown }> = {};
    const first = attachments[0];
    if (file.title !== first.display_name && file.title !== first.filename) {
      divergent.filename = { canvasFile: file.title, attachment: first.filename };
    }
    if (
      file.size_bytes !== null &&
      first.size_bytes !== null &&
      file.size_bytes !== first.size_bytes
    ) {
      divergent.sizeBytes = {
        canvasFile: file.size_bytes,
        attachment: first.size_bytes,
      };
    }
    if (
      file.mime_type !== null &&
      first.content_type !== null &&
      file.mime_type !== first.content_type
    ) {
      divergent.contentType = {
        canvasFile: file.mime_type,
        attachment: first.content_type,
      };
    }

    if (Object.keys(divergent).length > 0) {
      this.logger.warn('FileEntity sources diverge — canvasFile won', {
        canvasId,
        divergent,
      });
    }
  }
}
