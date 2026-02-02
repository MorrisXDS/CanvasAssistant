/**
 * Sync File Operations
 * Handles folders and files synchronization from Canvas.
 */

import type { SyncOperationContext, SyncOperationHelpers } from '../SyncOperationContext';
import { createSyncResult } from '../SyncOperationContext';
import type { SyncResult } from '../SyncEngineTypes';
import { CanvasFolder, CanvasFile, mapFolder, mapFile } from '../DataMappers';

export class SyncFileOperations {
  constructor(
    private ctx: SyncOperationContext,
    private helpers: SyncOperationHelpers
  ) {}

  /**
   * Sync folders for a specific course
   */
  async syncFolders(canvasCourseId: number, localCourseId: number): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let count = 0;
    const endpoint = `/courses/${canvasCourseId}/folders`;

    try {
      const result = await this.ctx.backoffManager.fetchWithBackoff(
        endpoint,
        canvasCourseId,
        () =>
          this.ctx.rateLimiter.enqueue(
            () => this.ctx.client.getAll<CanvasFolder>(endpoint),
            2
          )
      );

      if (result.skipped || !result.data) {
        return createSyncResult(
          'folders',
          0,
          result.error ? [result.error] : [],
          startTime
        );
      }

      const folders = result.data;

      this.ctx.db.transaction(() => {
        for (const folder of folders) {
          try {
            const localFolder = mapFolder(folder, localCourseId);
            this.ctx.db.upsert('resources', localFolder as Record<string, unknown>);
            count++;
          } catch (error) {
            errors.push(
              `Folder ${folder.name}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      });

      this.helpers.updateSyncMetadata(endpoint);

      return createSyncResult('folders', count, errors, startTime);
    } catch (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      errors.push(`Failed to sync folders for course ${canvasCourseId}: ${message}`);
      return createSyncResult('folders', count, errors, startTime);
    }
  }

  /**
   * Check if a file needs update based on remote timestamp
   */
  private fileNeedsUpdate(
    existing: { remote_updated_at: string | null } | null,
    file: CanvasFile
  ): boolean {
    if (!existing) return true;
    if (!existing.remote_updated_at) return true;
    const newTimestamp = file.modified_at || file.updated_at;
    if (!newTimestamp) return false;
    return existing.remote_updated_at !== newTimestamp;
  }

  /**
   * Sync files for a specific course
   */
  async syncFiles(canvasCourseId: number, localCourseId: number): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let count = 0;
    const endpoint = `/courses/${canvasCourseId}/files`;

    try {
      const result = await this.ctx.backoffManager.fetchWithBackoff(
        endpoint,
        canvasCourseId,
        () =>
          this.ctx.rateLimiter.enqueue(
            () => this.ctx.client.getAll<CanvasFile>(endpoint),
            2
          )
      );

      if (result.skipped || !result.data) {
        const fallbackResult = await this.syncFilesFromModules(
          canvasCourseId,
          localCourseId
        );
        return {
          success: fallbackResult.success,
          entity: 'files',
          count: fallbackResult.count,
          errors: [...(result.error ? [result.error] : []), ...fallbackResult.errors],
          duration: Date.now() - startTime,
        };
      }

      const files = result.data;

      const folderPathMap = new Map<number, string>();
      const dbFolders = this.ctx.db.executeRead<{
        external_id: string;
        folder_path: string | null;
      }>(
        'SELECT external_id, folder_path FROM resources WHERE course_id = ? AND type = ?',
        [localCourseId, 'folder']
      );
      for (const folder of dbFolders) {
        folderPathMap.set(parseInt(folder.external_id, 10), folder.folder_path || '');
      }

      this.ctx.db.transaction(() => {
        for (const file of files) {
          try {
            const folderPath = folderPathMap.get(file.folder_id) ?? null;
            const localFile = mapFile(file, localCourseId, null, folderPath);

            const existing = this.ctx.db.executeReadOne<{
              id: number;
              local_path: string | null;
              remote_updated_at: string | null;
            }>(
              'SELECT id, local_path, remote_updated_at FROM resources WHERE external_id = ?',
              [String(file.id)]
            );

            const needsUpdate = this.fileNeedsUpdate(existing ?? null, file);

            if (!needsUpdate) {
              continue;
            }

            if (existing?.local_path) {
              this.ctx.emitter.emit('file-updated', {
                resourceId: existing.id,
                externalId: String(file.id),
                filename: file.display_name,
                localPath: existing.local_path,
                oldTimestamp: existing.remote_updated_at,
                newTimestamp: localFile.remote_updated_at,
              });
            }

            this.ctx.db.upsert(
              'resources',
              localFile as Record<string, unknown>,
              'external_id',
              true
            );
            count++;
          } catch (error) {
            errors.push(
              `File ${file.display_name}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      });

      this.helpers.updateSyncMetadata(endpoint);

      return createSyncResult('files', count, errors, startTime);
    } catch (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      errors.push(`Failed to sync files for course ${canvasCourseId}: ${message}`);
      return createSyncResult('files', count, errors, startTime);
    }
  }

  /**
   * Sync files by extracting content_ids from module items
   */
  private async syncFilesFromModules(
    canvasCourseId: number,
    localCourseId: number
  ): Promise<{ success: boolean; count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    try {
      const fileItems = this.ctx.db.executeRead<{
        id: number;
        content_id: string | null;
        title: string;
      }>(
        `SELECT mi.id, mi.content_id, mi.title
         FROM module_items mi
         JOIN modules m ON mi.module_id = m.id
         WHERE m.course_id = ? AND mi.item_type = 'File' AND mi.content_id IS NOT NULL`,
        [localCourseId]
      );

      if (fileItems.length === 0) {
        return { success: true, count: 0, errors: [] };
      }

      for (const item of fileItems) {
        if (!item.content_id) continue;

        try {
          const fileId = item.content_id;
          const fileEndpoint = `/courses/${canvasCourseId}/files/${fileId}`;

          const response = await this.ctx.rateLimiter.enqueue(
            () => this.ctx.client.get<CanvasFile>(fileEndpoint),
            3
          );

          const file = response?.data;
          if (file) {
            const localFile = mapFile(file, localCourseId, null, 'Modules');

            this.ctx.db.upsert(
              'resources',
              localFile as Record<string, unknown>,
              'external_id',
              true
            );
            count++;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`File ${item.title}: ${message}`);
        }
      }

      return { success: true, count, errors };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Module fallback failed: ${message}`);
      return { success: false, count, errors };
    }
  }

  /**
   * Sync files for a specific folder
   */
  async syncFolderFiles(
    canvasFolderId: number,
    localCourseId: number,
    options: { forceRefresh?: boolean } = {}
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let count = 0;
    const endpoint = `/folders/${canvasFolderId}/files`;

    const isOnline = this.ctx.rateLimiter !== null;

    if (!isOnline && !options.forceRefresh) {
      const folder = this.ctx.db.executeReadOne<{ id: number }>(
        'SELECT id FROM resources WHERE external_id = ? AND course_id = ?',
        [String(canvasFolderId), localCourseId]
      );
      const internalFolderId = folder?.id ?? null;

      const cachedFiles = internalFolderId
        ? this.ctx.db.executeRead<{ id: number }>(
            `SELECT id FROM resources WHERE course_id = ? AND type = 'file' AND parent_folder_id = ?`,
            [localCourseId, internalFolderId]
          )
        : [];

      return createSyncResult('folder_files', cachedFiles.length, [], startTime);
    }

    try {
      const timeoutMs = 10000;
      const fetchPromise = this.ctx.rateLimiter.enqueue(
        () => this.ctx.client.getAll<CanvasFile>(endpoint),
        2
      );

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Folder sync timeout')), timeoutMs);
      });

      const files = await Promise.race([fetchPromise, timeoutPromise]);

      const folderRecord = this.ctx.db.executeReadOne<{ folder_path: string | null }>(
        'SELECT folder_path FROM resources WHERE external_id = ? AND type = ?',
        [String(canvasFolderId), 'folder']
      );
      const folderPath = folderRecord?.folder_path ?? null;

      this.ctx.db.transaction(() => {
        for (const file of files) {
          try {
            const localFile = mapFile(file, localCourseId, null, folderPath);

            const existing = this.ctx.db.executeReadOne<{
              id: number;
              local_path: string | null;
              remote_updated_at: string | null;
            }>(
              'SELECT id, local_path, remote_updated_at FROM resources WHERE external_id = ?',
              [String(file.id)]
            );

            const needsUpdate = this.fileNeedsUpdate(existing ?? null, file);

            if (!needsUpdate) {
              continue;
            }

            if (existing?.local_path) {
              this.ctx.emitter.emit('file-updated', {
                resourceId: existing.id,
                externalId: String(file.id),
                filename: file.display_name,
                localPath: existing.local_path,
                oldTimestamp: existing.remote_updated_at,
                newTimestamp: localFile.remote_updated_at,
              });
            }

            this.ctx.db.upsert(
              'resources',
              localFile as Record<string, unknown>,
              'external_id',
              true
            );
            count++;
          } catch (error) {
            errors.push(
              `File ${file.display_name}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      });

      return createSyncResult('folder_files', count, errors, startTime);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      const folder = this.ctx.db.executeReadOne<{ id: number }>(
        'SELECT id FROM resources WHERE external_id = ? AND course_id = ?',
        [String(canvasFolderId), localCourseId]
      );
      const internalFolderId = folder?.id ?? null;

      const cachedFiles = internalFolderId
        ? this.ctx.db.executeRead<{ id: number }>(
            `SELECT id FROM resources WHERE course_id = ? AND type = 'file' AND parent_folder_id = ?`,
            [localCourseId, internalFolderId]
          )
        : [];

      if (cachedFiles.length > 0) {
        return {
          success: true,
          entity: 'folder_files',
          count: cachedFiles.length,
          errors: [`API error (using cache): ${message}`],
          duration: Date.now() - startTime,
        };
      }

      errors.push(`Failed to sync folder ${canvasFolderId}: ${message}`);
      return createSyncResult('folder_files', 0, errors, startTime);
    }
  }
}
