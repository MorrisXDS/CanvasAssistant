/**
 * Sync Content Operations
 * Handles announcements, modules, and pages synchronization.
 */

import type { SyncOperationContext, SyncOperationHelpers } from '../SyncOperationContext';
import { createSyncResult } from '../SyncOperationContext';
import type { SyncResult } from '../SyncEngineTypes';
import {
  CanvasAnnouncement,
  CanvasModule,
  CanvasModuleItem,
  CanvasPage,
  mapAnnouncement,
  mapModule,
  mapModuleItem,
  mapPage,
} from '../../data/DataMappers';

export class SyncContentOperations {
  constructor(
    private ctx: SyncOperationContext,
    private helpers: SyncOperationHelpers
  ) {}

  /**
   * Sync announcements for a specific course
   */
  async syncAnnouncements(
    canvasCourseId: number,
    localCourseId: number
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let count = 0;

    try {
      const announcements = await this.ctx.rateLimiter.enqueue(
        () =>
          this.ctx.client.getAll<CanvasAnnouncement>(
            `/courses/${canvasCourseId}/discussion_topics`,
            { only_announcements: true }
          ),
        3
      );

      const baseUrl = this.ctx.client.getBaseUrl();

      this.ctx.db.transaction(() => {
        for (const announcement of announcements) {
          try {
            const mapped = mapAnnouncement(
              announcement,
              localCourseId,
              baseUrl,
              String(canvasCourseId)
            );

            this.ctx.db.upsert(
              'notifications',
              mapped.notification,
              ['source_type', 'source_id'],
              false
            );
            count++;

            const notificationRow = this.ctx.db.executeReadOne<{ id: number }>(
              'SELECT id FROM notifications WHERE source_id = ?',
              [String(announcement.id)]
            );

            if (notificationRow) {
              // Insert attachments
              for (const attachment of mapped.attachments) {
                this.ctx.db.executeWrite(
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
                    notificationRow.id,
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
                this.ctx.emitter.emit('attachments-pending', {
                  notificationId: notificationRow.id,
                  courseId: localCourseId,
                  attachmentCount: mapped.attachments.length,
                });
              }

              // Insert file references
              if (mapped.fileReferences.length > 0) {
                this.ctx.db.executeWrite(
                  'DELETE FROM announcement_file_references WHERE notification_id = ?',
                  [notificationRow.id],
                  'announcement_file_references'
                );

                for (const fileRef of mapped.fileReferences) {
                  let attachmentId: number | null = null;
                  if (fileRef.attachmentExternalId) {
                    const attRow = this.ctx.db.executeReadOne<{ id: number }>(
                      'SELECT id FROM notification_attachments WHERE notification_id = ? AND external_id = ?',
                      [notificationRow.id, fileRef.attachmentExternalId]
                    );
                    attachmentId = attRow?.id || null;
                  }

                  this.ctx.db.executeWrite(
                    `INSERT INTO announcement_file_references
                     (notification_id, attachment_id, start_position, end_position, matched_text, original_url)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                      notificationRow.id,
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
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            errors.push(`Announcement ${announcement.id}: ${errorMsg}`);
            this.ctx.emitter.emit('sync-entity-error', {
              entity: 'announcement',
              externalId: String(announcement.id),
              courseId: canvasCourseId,
              error: errorMsg,
            });
          }
        }
      });

      this.helpers.updateSyncMetadata(`/courses/${canvasCourseId}/discussion_topics`);

      this.ctx.emitter.emit('sync-entity-complete', {
        entity: 'announcements',
        count,
        errors,
        courseId: canvasCourseId,
      });

      return createSyncResult('announcements', count, errors, startTime);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(
        `Failed to sync announcements for course ${canvasCourseId}: ${message}`
      );
      this.ctx.emitter.emit('sync-entity-error', {
        entity: 'announcements',
        courseId: canvasCourseId,
        error: message,
        fatal: true,
      });
      return createSyncResult('announcements', count, errors, startTime);
    }
  }

  /**
   * Sync modules for a specific course
   */
  async syncModules(canvasCourseId: number, localCourseId: number): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let count = 0;
    const endpoint = `/courses/${canvasCourseId}/modules`;

    try {
      const result = await this.ctx.backoffManager.fetchWithBackoff(
        endpoint,
        canvasCourseId,
        () =>
          this.ctx.rateLimiter.enqueue(
            () => this.ctx.client.getAll<CanvasModule>(endpoint, { include: ['items'] }),
            3
          )
      );

      if (result.skipped || !result.data) {
        return createSyncResult(
          'modules',
          0,
          result.error ? [result.error] : [],
          startTime
        );
      }

      const modules = result.data;
      const modulesWithItems: Array<{
        canvasModule: (typeof modules)[0];
        localModuleId: number;
      }> = [];

      this.ctx.db.transaction(() => {
        for (const module of modules) {
          try {
            const localModule = mapModule(module, localCourseId);
            this.ctx.db.upsert('modules', localModule);
            count++;

            const insertedModule = this.ctx.db.executeReadOne<{ id: number }>(
              'SELECT id FROM modules WHERE external_id = ?',
              [String(module.id)]
            );

            if (insertedModule && (module.items?.length || module.items_count > 0)) {
              modulesWithItems.push({
                canvasModule: module,
                localModuleId: insertedModule.id,
              });
            }
          } catch (error) {
            errors.push(
              `Module ${module.id}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      });

      // Sync module items
      for (const { canvasModule, localModuleId } of modulesWithItems) {
        if (canvasModule.items && canvasModule.items.length > 0) {
          this.ctx.db.transaction(() => {
            for (const item of canvasModule.items!) {
              const localItem = mapModuleItem(item, localModuleId);
              this.ctx.db.upsert('module_items', localItem);
            }
          });
        } else {
          await this.syncModuleItems(canvasCourseId, canvasModule.id, localModuleId);
        }
      }

      this.helpers.updateSyncMetadata(`/courses/${canvasCourseId}/modules`);

      return createSyncResult('modules', count, errors, startTime);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to sync modules for course ${canvasCourseId}: ${message}`);
      return createSyncResult('modules', count, errors, startTime);
    }
  }

  /**
   * Sync module items
   */
  private async syncModuleItems(
    canvasCourseId: number,
    canvasModuleId: number,
    localModuleId: number
  ): Promise<void> {
    try {
      const items = await this.ctx.rateLimiter.enqueue(
        () =>
          this.ctx.client.getAll<CanvasModuleItem>(
            `/courses/${canvasCourseId}/modules/${canvasModuleId}/items`
          ),
        2
      );

      for (const item of items) {
        const localItem = mapModuleItem(item, localModuleId);
        this.ctx.db.upsert('module_items', localItem);
      }
    } catch (error) {
      this.ctx.log?.error(
        `Failed to sync items for module ${canvasModuleId}`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Sync pages for a specific course
   */
  async syncPages(canvasCourseId: number, localCourseId: number): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let count = 0;
    const endpoint = `/courses/${canvasCourseId}/pages`;

    try {
      const result = await this.ctx.backoffManager.fetchWithBackoff(
        endpoint,
        canvasCourseId,
        () =>
          this.ctx.rateLimiter.enqueue(
            () => this.ctx.client.getAll<CanvasPage>(endpoint, { 'include[]': 'body' }),
            2
          )
      );

      let pages: CanvasPage[] = [];

      if (result.data && result.data.length > 0) {
        pages = result.data;
      } else if (!result.skipped) {
        try {
          const frontPageResponse = await this.ctx.rateLimiter.enqueue(
            () =>
              this.ctx.client.get<CanvasPage>(`/courses/${canvasCourseId}/front_page`),
            2
          );
          if (frontPageResponse.data) {
            pages = [frontPageResponse.data];
          }
        } catch {
          // No front page available
        }
      }

      if (pages.length === 0) {
        return createSyncResult(
          'pages',
          0,
          result.error ? [result.error] : [],
          startTime
        );
      }

      this.ctx.db.transaction(() => {
        for (const page of pages) {
          try {
            const pageType = page.front_page ? 'landing' : 'content';
            const localPage = mapPage(page, localCourseId, pageType);

            // Read existing hash before upsert for change detection
            const existingPage = this.ctx.db.executeReadOne<{
              content_hash: string | null;
            }>('SELECT content_hash FROM course_pages WHERE external_id = ?', [
              localPage.external_id,
            ]);

            this.ctx.db.upsert('course_pages', localPage);

            // Hash-based change detection for page content
            const newHash = this.helpers.computeContentHash(
              localPage.body_html as string | null
            );
            if (newHash) {
              const oldHash = existingPage?.content_hash ?? null;
              if (oldHash !== newHash) {
                // Content changed (or first sync) - update hash and dependencies
                this.helpers.updateContentHashAndDependencies(
                  'page',
                  localPage.external_id as string,
                  localPage.body_html as string | null,
                  localCourseId
                );

                // If content changed (not first sync), invalidate local HTML file
                if (oldHash !== null) {
                  const slug = localPage.url_slug || localPage.external_id;
                  this.ctx.db.executeWrite(
                    `UPDATE resources SET local_path = NULL
                     WHERE external_id = ? AND type = 'page'`,
                    [`html-page-${slug}`],
                    'resources'
                  );
                }
              }
            }

            count++;
          } catch (error) {
            errors.push(
              `Page ${page.url}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      });

      this.helpers.updateSyncMetadata(endpoint);

      return createSyncResult('pages', count, errors, startTime);
    } catch (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      errors.push(`Failed to sync pages for course ${canvasCourseId}: ${message}`);
      return createSyncResult('pages', count, errors, startTime);
    }
  }
}
