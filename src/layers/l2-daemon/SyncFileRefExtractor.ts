/**
 * Sync File Reference Extractor
 * Extracts and manages file references from HTML content (pages, assignments, syllabus, announcements, modules).
 */

import { Database } from '../l1-persistence';
import { HtmlFileExtractor, ExtractedFileReference } from './HtmlFileExtractor';
import { CanvasClient } from './CanvasClient';
import { RateLimiter } from './RateLimiter';
import { CanvasFile, mapFile } from './DataMappers';

export interface SyncFileRefExtractorConfig {
  db: Database;
  client: CanvasClient;
  rateLimiter: RateLimiter;
  htmlFileExtractor: HtmlFileExtractor;
}

export class SyncFileRefExtractor {
  private db: Database;
  private client: CanvasClient;
  private rateLimiter: RateLimiter;
  private htmlFileExtractor: HtmlFileExtractor;

  constructor(config: SyncFileRefExtractorConfig) {
    this.db = config.db;
    this.client = config.client;
    this.rateLimiter = config.rateLimiter;
    this.htmlFileExtractor = config.htmlFileExtractor;
  }

  /**
   * Extract all file references for a course
   */
  async extractAllFileReferences(localCourseId: number): Promise<{
    pages: { count: number; errors: string[] };
    assignments: { count: number; errors: string[] };
    syllabus: { count: number; errors: string[] };
    announcements: { count: number; errors: string[] };
    modules: { count: number; errors: string[] };
    total: number;
  }> {
    const [pages, assignments, syllabus, announcements, modules] = await Promise.all([
      this.extractPageFileRefs(localCourseId),
      this.extractAssignmentFileRefs(localCourseId),
      this.extractSyllabusFileRefs(localCourseId),
      this.extractAnnouncementFileRefs(localCourseId),
      this.extractModuleFileRefs(localCourseId),
    ]);

    const total =
      pages.count +
      assignments.count +
      syllabus.count +
      announcements.count +
      modules.count;

    return { pages, assignments, syllabus, announcements, modules, total };
  }

  /**
   * Extract file references from page HTML content
   */
  async extractPageFileRefs(
    localCourseId: number
  ): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    try {
      const pages = this.db.executeRead<{
        id: number;
        external_id: string;
        body_html: string | null;
        title: string;
      }>(
        'SELECT id, external_id, body_html, title FROM course_pages WHERE course_id = ? AND body_html IS NOT NULL',
        [localCourseId]
      );

      for (const page of pages) {
        if (!page.body_html) continue;

        const refs = this.htmlFileExtractor.extract(page.body_html);
        for (const ref of refs) {
          try {
            this.storeContentFileReference(localCourseId, 'page', page.external_id, ref);
            count++;
          } catch (error) {
            errors.push(
              `Page ${page.title}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      }

      return { count, errors };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to extract page file refs: ${message}`);
      return { count, errors };
    }
  }

  /**
   * Extract file references from assignment descriptions
   */
  async extractAssignmentFileRefs(
    localCourseId: number
  ): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    try {
      const tasks = this.db.executeRead<{
        id: number;
        external_id: string;
        description: string | null;
        title: string;
      }>(
        'SELECT id, external_id, description, title FROM tasks WHERE course_id = ? AND description IS NOT NULL AND source_type = ?',
        [localCourseId, 'canvas']
      );

      for (const task of tasks) {
        if (!task.description) continue;

        const refs = this.htmlFileExtractor.extract(task.description);
        for (const ref of refs) {
          try {
            this.storeContentFileReference(
              localCourseId,
              'assignment',
              task.external_id,
              ref
            );
            count++;
          } catch (error) {
            errors.push(
              `Assignment ${task.title}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      }

      return { count, errors };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to extract assignment file refs: ${message}`);
      return { count, errors };
    }
  }

  /**
   * Extract file references from syllabus body
   */
  async extractSyllabusFileRefs(
    localCourseId: number
  ): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    try {
      const course = this.db.executeReadOne<{
        id: number;
        external_id: string;
        syllabus_body: string | null;
        code: string;
      }>('SELECT id, external_id, syllabus_body, code FROM courses WHERE id = ?', [
        localCourseId,
      ]);

      if (!course?.syllabus_body) {
        return { count: 0, errors: [] };
      }

      const refs = this.htmlFileExtractor.extract(course.syllabus_body);
      for (const ref of refs) {
        try {
          this.storeContentFileReference(
            localCourseId,
            'syllabus',
            course.external_id,
            ref
          );
          count++;
        } catch (error) {
          errors.push(
            `Syllabus: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      return { count, errors };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to extract syllabus file refs: ${message}`);
      return { count, errors };
    }
  }

  /**
   * Extract file references from announcement HTML content
   */
  async extractAnnouncementFileRefs(
    localCourseId: number
  ): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    try {
      const announcements = this.db.executeRead<{
        id: number;
        source_id: string;
        message_html: string | null;
        title: string;
      }>(
        'SELECT id, source_id, message_html, title FROM notifications WHERE course_id = ? AND source_type = ? AND message_html IS NOT NULL',
        [localCourseId, 'canvas']
      );

      for (const announcement of announcements) {
        if (!announcement.message_html) continue;

        const refs = this.htmlFileExtractor.extract(announcement.message_html);
        for (const ref of refs) {
          try {
            this.storeContentFileReference(
              localCourseId,
              'announcement',
              announcement.source_id,
              ref
            );
            count++;
          } catch (error) {
            errors.push(
              `Announcement ${announcement.title}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      }

      return { count, errors };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to extract announcement file refs: ${message}`);
      return { count, errors };
    }
  }

  /**
   * Extract file references from module items with type='File'
   */
  async extractModuleFileRefs(
    localCourseId: number
  ): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    try {
      const fileItems = this.db.executeRead<{
        id: number;
        external_id: string;
        content_id: string;
        url: string | null;
        title: string;
        module_id: number;
      }>(
        `SELECT mi.id, mi.external_id, mi.content_id, mi.url, mi.title, mi.module_id
         FROM module_items mi
         JOIN modules m ON mi.module_id = m.id
         WHERE m.course_id = ? AND mi.item_type = 'File' AND mi.content_id IS NOT NULL`,
        [localCourseId]
      );

      if (fileItems.length === 0) {
        return { count: 0, errors: [] };
      }

      for (const item of fileItems) {
        try {
          const ref: ExtractedFileReference = {
            canvasFileId: item.content_id,
            matchedUrl: item.url || `/files/${item.content_id}`,
            patternType: 'api',
            isDownloadLink: true,
          };
          this.storeContentFileReference(localCourseId, 'module', item.external_id, ref);
          count++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`Module item ${item.external_id}: ${msg}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Module file refs extraction failed: ${msg}`);
    }

    return { count, errors };
  }

  /**
   * Store a content file reference in the database
   */
  private storeContentFileReference(
    courseId: number,
    sourceType: 'page' | 'assignment' | 'syllabus' | 'module' | 'announcement',
    sourceId: string,
    ref: ExtractedFileReference
  ): void {
    const existingResource = this.db.executeReadOne<{ id: number }>(
      'SELECT id FROM resources WHERE external_id = ?',
      [ref.canvasFileId]
    );

    this.db.executeWrite(
      `INSERT INTO content_file_references
       (course_id, source_type, source_id, canvas_file_id, extracted_url, resource_id, download_status)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(course_id, source_type, source_id, canvas_file_id) DO UPDATE SET
         extracted_url = excluded.extracted_url,
         resource_id = COALESCE(content_file_references.resource_id, excluded.resource_id)`,
      [
        courseId,
        sourceType,
        sourceId,
        ref.canvasFileId,
        ref.matchedUrl,
        existingResource?.id || null,
        existingResource ? 'completed' : 'pending',
      ],
      'content_file_references'
    );
  }

  /**
   * Fetch files that were discovered in HTML but not in resources table
   */
  async fetchMissingFileReferences(
    localCourseId: number,
    canvasCourseId?: number
  ): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    try {
      let resolvedCanvasCourseId = canvasCourseId;
      if (!resolvedCanvasCourseId) {
        const course = this.db.executeReadOne<{ external_id: string }>(
          'SELECT external_id FROM courses WHERE id = ?',
          [localCourseId]
        );
        if (!course) {
          return { count: 0, errors: ['Course not found'] };
        }
        resolvedCanvasCourseId = parseInt(course.external_id, 10);
      }

      const pendingRefs = this.db.executeRead<{
        id: number;
        canvas_file_id: string;
        source_type: string;
        source_id: string;
      }>(
        `SELECT id, canvas_file_id, source_type, source_id FROM content_file_references
         WHERE course_id = ? AND download_status = 'pending' AND resource_id IS NULL`,
        [localCourseId]
      );

      const BATCH_SIZE = 3;
      for (let i = 0; i < pendingRefs.length; i += BATCH_SIZE) {
        const batch = pendingRefs.slice(i, i + BATCH_SIZE);

        const results = await Promise.all(
          batch.map(async (ref) => {
            try {
              const fileEndpoint = `/courses/${resolvedCanvasCourseId}/files/${ref.canvas_file_id}`;

              const response = await this.rateLimiter.enqueue(
                () => this.client.get<CanvasFile>(fileEndpoint),
                3
              );

              const file = response?.data;
              if (file) {
                const localFile = mapFile(file, localCourseId, null, null);
                this.db.upsert(
                  'resources',
                  localFile as Record<string, unknown>,
                  'external_id',
                  true
                );

                const resourceRow = this.db.executeReadOne<{ id: number }>(
                  'SELECT id FROM resources WHERE external_id = ?',
                  [ref.canvas_file_id]
                );

                if (resourceRow) {
                  this.db.executeWrite(
                    `UPDATE content_file_references
                     SET resource_id = ?, download_status = 'completed'
                     WHERE id = ?`,
                    [resourceRow.id, ref.id],
                    'content_file_references'
                  );
                }

                return { success: true, error: null };
              }
              return { success: false, error: 'No file data' };
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              this.db.executeWrite(
                `UPDATE content_file_references SET download_status = 'failed' WHERE id = ?`,
                [ref.id],
                'content_file_references'
              );
              return { success: false, error: message };
            }
          })
        );

        for (const result of results) {
          if (result.success) {
            count++;
          } else if (result.error) {
            errors.push(result.error);
          }
        }
      }

      return { count, errors };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to fetch missing file refs: ${message}`);
      return { count, errors };
    }
  }

  /**
   * Get context folder path for a source type
   */
  getContextFolder(sourceType: string, sourceId: string): string {
    switch (sourceType) {
      case 'page':
        return `pages/${sourceId}`;
      case 'assignment':
        return `assignments/${sourceId}`;
      case 'syllabus':
        return 'syllabus';
      case 'announcement':
        return `announcements/${sourceId}`;
      case 'module':
        return `modules/${sourceId}`;
      default:
        return 'files';
    }
  }
}
