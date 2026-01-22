/**
 * Sync Engine - Orchestrates data synchronization from Canvas to local database
 *
 * Responsibilities:
 * - Fetches data from Canvas API via CanvasClient
 * - Transforms data using DataMappers
 * - Upserts data into local SQLite database
 * - Handles incremental sync using ETags
 * - Tracks sync metadata for optimization
 * - Detects policy-related announcements
 */

import { EventEmitter } from 'events';
import { CanvasClient } from './CanvasClient';
import { RateLimiter } from './RateLimiter';
import { Database } from '../l1-persistence/Database';
import {
  CanvasCourse,
  CanvasAssignment,
  CanvasAnnouncement,
  CanvasModule,
  CanvasModuleItem,
  CanvasPage,
  CanvasFile,
  CanvasFolder,
  mapCourse,
  mapAssignment,
  mapAnnouncement,
  mapModule,
  mapModuleItem,
  mapPage,
  mapFile,
  mapFolder,
  detectPolicyKeywords,
  calculatePolicyConfidence,
} from './DataMappers';

export interface SyncEngineConfig {
  client: CanvasClient;
  db: Database;
  rateLimiter?: RateLimiter;
}

export interface SyncResult {
  success: boolean;
  entity: string;
  count: number;
  errors: string[];
  duration: number;
}

export interface FullSyncResult {
  courses: SyncResult;
  tasks: SyncResult;
  announcements: SyncResult;
  modules: SyncResult;
  pages: SyncResult;
  folders: SyncResult;
  files: SyncResult;
  totalDuration: number;
  errors: string[];
}

export interface SyncOptions {
  /** Course IDs to sync (null = all courses) */
  courseIds?: number[] | null;
  /** Whether to sync Canvas files */
  syncCanvasFiles?: boolean;
  /** Whether to sync announcement attachments */
  syncAnnouncements?: boolean;
}

export interface SyncMetadata {
  endpoint: string;
  etag: string | null;
  last_synced_at: string;
}

/**
 * SyncEngine orchestrates the synchronization of Canvas data
 */
export class SyncEngine extends EventEmitter {
  private client: CanvasClient;
  private db: Database;
  private rateLimiter: RateLimiter;
  private isSyncing: boolean = false;

  constructor(config: SyncEngineConfig) {
    super();
    this.client = config.client;
    this.db = config.db;
    this.rateLimiter = config.rateLimiter || new RateLimiter();

    // Forward rate limit events
    this.rateLimiter.on('rate-limited', (info) => {
      this.emit('rate-limited', info);
    });
  }

  /**
   * Perform a full sync of all data
   * @param options Optional sync options to filter courses and content types
   */
  async syncAll(options?: SyncOptions): Promise<FullSyncResult> {
    if (this.isSyncing) {
      throw new Error('Sync already in progress');
    }

    this.isSyncing = true;
    const startTime = Date.now();
    const errors: string[] = [];

    // Default options
    const syncCanvasFiles = options?.syncCanvasFiles ?? true;
    const syncAnnouncements = options?.syncAnnouncements ?? true;
    const filterCourseIds = options?.courseIds ?? null;

    this.emit('sync-start', { type: 'full' });

    try {
      // Sync courses first (required for foreign keys)
      const coursesResult = await this.syncCourses();
      if (coursesResult.errors.length > 0) {
        errors.push(...coursesResult.errors);
      }

      // Get local course IDs for subsequent syncs
      let courses = this.db.executeRead<{ id: number; external_id: string }>(
        'SELECT id, external_id FROM courses WHERE deleted_at IS NULL'
      );

      // Filter courses if specified
      if (filterCourseIds && filterCourseIds.length > 0) {
        const filterSet = new Set(filterCourseIds);
        courses = courses.filter((c) => filterSet.has(c.id));
      }

      // Sync tasks, announcements, modules, folders, files in parallel for each course
      const taskResults: SyncResult[] = [];
      const announcementResults: SyncResult[] = [];
      const moduleResults: SyncResult[] = [];
      const pageResults: SyncResult[] = [];
      const folderResults: SyncResult[] = [];
      const fileResults: SyncResult[] = [];

      for (const course of courses) {
        const canvasCourseId = parseInt(course.external_id, 10);

        // Build parallel sync promises based on options
        const syncPromises: Promise<SyncResult>[] = [
          this.syncTasks(canvasCourseId, course.id),
          this.syncModules(canvasCourseId, course.id),
          this.syncPages(canvasCourseId, course.id),
        ];

        if (syncAnnouncements) {
          syncPromises.push(this.syncAnnouncements(canvasCourseId, course.id));
        }

        if (syncCanvasFiles) {
          // Sync folders first to get folder paths, then files
          syncPromises.push(this.syncFolders(canvasCourseId, course.id));
        }

        const results = await Promise.all(syncPromises);

        // Extract results based on what was synced
        let idx = 0;
        taskResults.push(results[idx++]);
        moduleResults.push(results[idx++]);
        pageResults.push(results[idx++]);

        if (syncAnnouncements) {
          announcementResults.push(results[idx++]);
        }

        if (syncCanvasFiles) {
          folderResults.push(results[idx++]);
          // Now sync files with folder path lookup
          const fileResult = await this.syncFiles(canvasCourseId, course.id);
          fileResults.push(fileResult);
        }
      }

      // Aggregate results (with defensive handling for undefined)
      const aggregateResults = (results: SyncResult[], entity: string): SyncResult => {
        const validResults = results.filter((r): r is SyncResult => r !== undefined && r !== null);
        return {
          success: validResults.every((r) => r.success),
          entity,
          count: validResults.reduce((sum, r) => sum + (r.count ?? 0), 0),
          errors: validResults.flatMap((r) => r.errors ?? []),
          duration: validResults.reduce((sum, r) => sum + (r.duration ?? 0), 0),
        };
      };

      const result: FullSyncResult = {
        courses: coursesResult,
        tasks: aggregateResults(taskResults, 'tasks'),
        announcements: aggregateResults(announcementResults, 'announcements'),
        modules: aggregateResults(moduleResults, 'modules'),
        pages: aggregateResults(pageResults, 'pages'),
        folders: aggregateResults(folderResults, 'folders'),
        files: aggregateResults(fileResults, 'files'),
        totalDuration: Date.now() - startTime,
        errors,
      };

      this.emit('sync-complete', result);
      return result;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Sync courses from Canvas
   */
  async syncCourses(): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let count = 0;

    this.emit('sync-entity-start', { entity: 'courses' });

    try {
      const courses = await this.rateLimiter.enqueue(
        () =>
          this.client.getAll<CanvasCourse>('/courses', {
            enrollment_state: 'active',
            include: ['total_scores', 'current_grading_period_scores', 'syllabus_body', 'term'],
          }),
        10 // High priority
      );

      const baseUrl = this.client.getBaseUrl();

      this.db.transaction(() => {
        // Extract enrollment terms from courses (Canvas includes term data with include[]=term)
        const termsMap = new Map<number, { id: number; name: string; start_at: string | null; end_at: string | null }>();

        console.debug('[SyncEngine] Processing courses for term extraction...');
        for (const course of courses) {
          console.debug(`[SyncEngine] Course ${course.course_code}: term=${JSON.stringify(course.term)}, enrollment_term_id=${course.enrollment_term_id}`);

          if (course.term) {
            if (!termsMap.has(course.term.id)) {
              termsMap.set(course.term.id, {
                id: course.term.id,
                name: course.term.name,
                start_at: course.term.start_at,
                end_at: course.term.end_at,
              });
              console.debug(`[SyncEngine] Added term: ${course.term.name} (${course.term.id}), end_at=${course.term.end_at}`);
            }
          } else if (course.enrollment_term_id) {
            // Fallback if term object not included
            if (!termsMap.has(course.enrollment_term_id)) {
              termsMap.set(course.enrollment_term_id, {
                id: course.enrollment_term_id,
                name: `Semester ${course.enrollment_term_id}`,
                start_at: null,
                end_at: null,
              });
              console.debug(`[SyncEngine] Added fallback term: Semester ${course.enrollment_term_id} (no term object)`);
            }
          }
        }

        console.debug('[SyncEngine] Terms extracted:', Array.from(termsMap.values()));

        // Upsert enrollment terms with full data
        for (const [termId, term] of termsMap) {
          this.db.executeWrite(
            `INSERT INTO enrollment_terms (external_id, name, start_at, end_at) VALUES (?, ?, ?, ?)
             ON CONFLICT(external_id) DO UPDATE SET name = excluded.name, start_at = excluded.start_at, end_at = excluded.end_at`,
            [String(termId), term.name, term.start_at, term.end_at],
            'enrollment_terms'
          );
        }

        for (const course of courses) {
          try {
            const localCourse = mapCourse(course, baseUrl);
            this.db.upsert('courses', localCourse);
            count++;
          } catch (error) {
            errors.push(`Course ${course.id}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      });

      // Try to fetch actual term names from Canvas API (may fail for non-admin users)
      this.fetchAndUpdateTermNames().catch(err => {
        console.debug('[SyncEngine] Could not fetch term names:', err);
      });

      // Update sync metadata
      this.updateSyncMetadata('/courses');

      this.emit('sync-entity-complete', { entity: 'courses', count });

      return {
        success: errors.length === 0,
        entity: 'courses',
        count,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to sync courses: ${message}`);
      return {
        success: false,
        entity: 'courses',
        count,
        errors,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Fetch enrollment term names from Canvas API and update the local database
   * This may fail for non-admin users, which is OK - we'll use placeholder names
   */
  private async fetchAndUpdateTermNames(): Promise<void> {
    try {
      const terms = await this.rateLimiter.enqueue(
        () => this.client.getEnrollmentTerms(),
        1 // Low priority
      );

      if (terms.length > 0) {
        this.db.transaction(() => {
          for (const term of terms) {
            this.db.executeWrite(
              `UPDATE enrollment_terms SET name = ?, start_at = ?, end_at = ? WHERE external_id = ?`,
              [term.name, term.start_at, term.end_at, String(term.id)],
              'enrollment_terms'
            );
          }
        });
        console.debug(`[SyncEngine] Updated ${terms.length} enrollment term names`);
      }
    } catch (error) {
      // Expected to fail for non-admin users, silent fail
      console.debug('[SyncEngine] Could not fetch enrollment terms (expected for students)');
    }
  }

  /**
   * Sync tasks (assignments) for a specific course
   *
   * Conflict Resolution Strategy:
   * - If a local task exists with same title (user-created), merge fields
   * - Canvas provides: title, description, due_at, points_possible, submission_types
   * - Preserve local fields: weight (user-set), priority_score (calculated), local_modified_at
   * - If Canvas provides null for a field, keep the local value
   */
  async syncTasks(canvasCourseId: number, localCourseId: number): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let count = 0;

    try {
      const assignments = await this.rateLimiter.enqueue(
        () =>
          this.client.getAll<CanvasAssignment>(
            `/courses/${canvasCourseId}/assignments`,
            { order_by: 'due_at' }
          ),
        5 // Medium priority
      );

      this.db.transaction(() => {
        for (const assignment of assignments) {
          try {
            const localTask = mapAssignment(assignment, localCourseId);

            // Check for existing local task by title (for user-created tasks)
            const existingByTitle = this.db.executeReadOne<{
              id: number;
              source_type: string;
              weight: number;
              priority_score: number;
              local_modified_at: string | null;
            }>(
              'SELECT id, source_type, weight, priority_score, local_modified_at FROM tasks WHERE course_id = ? AND title = ? AND external_id IS NULL',
              [localCourseId, localTask.title]
            );

            if (existingByTitle && existingByTitle.source_type === 'user') {
              // Merge: link the user task to Canvas, preserve user-set fields
              this.db.executeWrite(
                `UPDATE tasks SET
                  external_id = ?,
                  source_type = 'canvas',
                  description = COALESCE(?, description),
                  due_at = COALESCE(?, due_at),
                  unlock_at = COALESCE(?, unlock_at),
                  points_possible = COALESCE(?, points_possible),
                  submission_types = COALESCE(?, submission_types),
                  is_completed = ?,
                  updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
                [
                  localTask.external_id,
                  localTask.description,
                  localTask.due_at,
                  localTask.unlock_at,
                  localTask.points_possible,
                  localTask.submission_types,
                  localTask.is_completed,
                  existingByTitle.id,
                ],
                'tasks'
              );

              this.emit('task-merged', {
                localTaskId: existingByTitle.id,
                canvasId: assignment.id,
                title: localTask.title,
              });
            } else {
              // Standard upsert by external_id
              this.db.upsert('tasks', localTask);
            }

            count++;
          } catch (error) {
            errors.push(`Task ${assignment.id}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      });

      this.updateSyncMetadata(`/courses/${canvasCourseId}/assignments`);

      return {
        success: errors.length === 0,
        entity: 'tasks',
        count,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to sync tasks for course ${canvasCourseId}: ${message}`);
      return {
        success: false,
        entity: 'tasks',
        count,
        errors,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Sync announcements for a specific course
   */
  async syncAnnouncements(canvasCourseId: number, localCourseId: number): Promise<SyncResult> {
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
            this.db.upsert('notifications', mapped.notification, ['source_type', 'source_id'], false);
            count++;

            // Get the notification ID for attachments and policy tracking
            const notificationRow = this.db.executeReadOne<{ id: number }>(
              'SELECT id FROM notifications WHERE source_id = ?',
              [String(announcement.id)]
            );

            if (notificationRow) {
              // Insert attachments
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
                     content_type = excluded.content_type`,
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

              // Emit event for pending downloads
              if (mapped.attachments.length > 0) {
                this.emit('attachments-pending', {
                  notificationId: notificationRow.id,
                  courseId: localCourseId,
                  attachmentCount: mapped.attachments.length,
                });
              }

              // Insert file references (linking to attachments by external_id)
              if (mapped.fileReferences.length > 0) {
                // First, clear existing file references for this notification
                this.db.executeWrite(
                  'DELETE FROM announcement_file_references WHERE notification_id = ?',
                  [notificationRow.id],
                  'announcement_file_references'
                );

                for (const fileRef of mapped.fileReferences) {
                  // Find attachment_id by external_id if we have a match
                  let attachmentId: number | null = null;
                  if (fileRef.attachmentExternalId) {
                    const attRow = this.db.executeReadOne<{ id: number }>(
                      'SELECT id FROM notification_attachments WHERE notification_id = ? AND external_id = ?',
                      [notificationRow.id, fileRef.attachmentExternalId]
                    );
                    attachmentId = attRow?.id || null;
                  }

                  this.db.executeWrite(
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

              // If policy-related, create policy_announcement record
              if (mapped.notification.is_policy_related) {
                const detection = detectPolicyKeywords(announcement.title + ' ' + announcement.message);
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
                    notificationRow.id,
                    localCourseId,
                    detection.categories[0] || null,
                    confidence,
                    JSON.stringify({
                      keywords: detection.keywords,
                      categories: detection.categories,
                    }),
                    0, // SQLite boolean: false = 0
                  ],
                  'policy_announcements'
                );

                this.emit('policy-detected', {
                  notificationId: notificationRow.id,
                  courseId: localCourseId,
                  title: announcement.title,
                  keywords: detection.keywords,
                  confidence,
                });
              }
            }
          } catch (error) {
            errors.push(`Announcement ${announcement.id}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      });

      this.updateSyncMetadata(`/courses/${canvasCourseId}/discussion_topics`);

      return {
        success: errors.length === 0,
        entity: 'announcements',
        count,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to sync announcements for course ${canvasCourseId}: ${message}`);
      return {
        success: false,
        entity: 'announcements',
        count,
        errors,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Sync modules for a specific course
   */
  async syncModules(canvasCourseId: number, localCourseId: number): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let count = 0;

    try {
      const modules = await this.rateLimiter.enqueue(
        () =>
          this.client.getAll<CanvasModule>(
            `/courses/${canvasCourseId}/modules`,
            { include: ['items'] }
          ),
        3 // Lower priority
      );

      this.db.transaction(() => {
        for (const module of modules) {
          try {
            const localModule = mapModule(module, localCourseId);
            this.db.upsert('modules', localModule);
            count++;

            // Get local module ID for items
            const insertedModule = this.db.executeReadOne<{ id: number }>(
              'SELECT id FROM modules WHERE external_id = ?',
              [String(module.id)]
            );

            // Sync module items
            if (insertedModule && module.items_count > 0) {
              this.syncModuleItems(canvasCourseId, module.id, insertedModule.id);
            }
          } catch (error) {
            errors.push(`Module ${module.id}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      });

      this.updateSyncMetadata(`/courses/${canvasCourseId}/modules`);

      return {
        success: errors.length === 0,
        entity: 'modules',
        count,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to sync modules for course ${canvasCourseId}: ${message}`);
      return {
        success: false,
        entity: 'modules',
        count,
        errors,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Sync module items (called from within syncModules transaction)
   */
  private async syncModuleItems(
    canvasCourseId: number,
    canvasModuleId: number,
    localModuleId: number
  ): Promise<void> {
    try {
      const items = await this.rateLimiter.enqueue(
        () =>
          this.client.getAll<CanvasModuleItem>(
            `/courses/${canvasCourseId}/modules/${canvasModuleId}/items`
          ),
        2 // Low priority
      );

      for (const item of items) {
        const localItem = mapModuleItem(item, localModuleId);
        this.db.upsert('module_items', localItem);
      }
    } catch (error) {
      // Log but don't fail entire module sync
      console.error(`Failed to sync items for module ${canvasModuleId}:`, error);
    }
  }

  /**
   * Sync pages for a specific course (includes syllabus and landing page)
   */
  async syncPages(canvasCourseId: number, localCourseId: number): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let count = 0;

    try {
      // Sync course pages
      const pages = await this.rateLimiter.enqueue(
        () => this.client.getAll<CanvasPage>(`/courses/${canvasCourseId}/pages`),
        2
      );

      this.db.transaction(() => {
        for (const page of pages) {
          try {
            const pageType = page.front_page ? 'landing' : 'content';
            const localPage = mapPage(page, localCourseId, pageType);
            this.db.upsert('course_pages', localPage);
            count++;
          } catch (error) {
            errors.push(`Page ${page.url}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      });

      this.updateSyncMetadata(`/courses/${canvasCourseId}/pages`);

      return {
        success: errors.length === 0,
        entity: 'pages',
        count,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      // Pages endpoint might not be available for all courses
      if (message.includes('401') || message.includes('403')) {
        return {
          success: true,
          entity: 'pages',
          count: 0,
          errors: [],
          duration: Date.now() - startTime,
        };
      }
      errors.push(`Failed to sync pages for course ${canvasCourseId}: ${message}`);
      return {
        success: false,
        entity: 'pages',
        count,
        errors,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Sync folders for a specific course
   * This should be called before syncFiles to establish folder paths
   */
  async syncFolders(canvasCourseId: number, localCourseId: number): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let count = 0;

    try {
      // Fetch all folders for the course
      const folders = await this.rateLimiter.enqueue(
        () => this.client.getAll<CanvasFolder>(`/courses/${canvasCourseId}/folders`),
        2 // Lower priority
      );

      this.db.transaction(() => {
        for (const folder of folders) {
          try {
            const localFolder = mapFolder(folder, localCourseId);
            this.db.upsert('resources', localFolder);
            count++;
          } catch (error) {
            errors.push(`Folder ${folder.name}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      });

      this.updateSyncMetadata(`/courses/${canvasCourseId}/folders`);

      return {
        success: errors.length === 0,
        entity: 'folders',
        count,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      // Folders endpoint might not be available for all courses (403/404)
      if (message.includes('401') || message.includes('403') || message.includes('404')) {
        return {
          success: true,
          entity: 'folders',
          count: 0,
          errors: [],
          duration: Date.now() - startTime,
        };
      }
      errors.push(`Failed to sync folders for course ${canvasCourseId}: ${message}`);
      return {
        success: false,
        entity: 'folders',
        count,
        errors,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Sync files for a specific course
   * Requires syncFolders to be called first to establish folder paths
   */
  async syncFiles(canvasCourseId: number, localCourseId: number): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let count = 0;

    try {
      // Fetch all files for the course
      const files = await this.rateLimiter.enqueue(
        () => this.client.getAll<CanvasFile>(`/courses/${canvasCourseId}/files`),
        2 // Lower priority
      );

      // Build a lookup map from Canvas folder_id to folder_path
      // Folders should be synced before files
      const folderPathMap = new Map<number, string>();
      const folders = this.db.executeRead<{ external_id: string; folder_path: string | null }>(
        'SELECT external_id, folder_path FROM resources WHERE course_id = ? AND type = ?',
        [localCourseId, 'folder']
      );
      for (const folder of folders) {
        folderPathMap.set(parseInt(folder.external_id, 10), folder.folder_path || '');
      }

      this.db.transaction(() => {
        for (const file of files) {
          try {
            // Look up folder path from the folder_id
            const folderPath = folderPathMap.get(file.folder_id) ?? null;
            const localFile = mapFile(file, localCourseId, null, folderPath);
            this.db.upsert('resources', localFile);
            count++;
          } catch (error) {
            errors.push(`File ${file.display_name}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      });

      this.updateSyncMetadata(`/courses/${canvasCourseId}/files`);

      return {
        success: errors.length === 0,
        entity: 'files',
        count,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      // Files endpoint might not be available for all courses (403/404)
      if (message.includes('401') || message.includes('403') || message.includes('404')) {
        return {
          success: true,
          entity: 'files',
          count: 0,
          errors: [],
          duration: Date.now() - startTime,
        };
      }
      errors.push(`Failed to sync files for course ${canvasCourseId}: ${message}`);
      return {
        success: false,
        entity: 'files',
        count,
        errors,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Sync a single course by Canvas ID
   */
  async syncCourse(canvasCourseId: number): Promise<{
    course: SyncResult;
    tasks: SyncResult;
    announcements: SyncResult;
    modules: SyncResult;
    pages: SyncResult;
  }> {
    // Fetch and upsert the course
    const courseResult = await this.syncSingleCourse(canvasCourseId);

    if (!courseResult.success) {
      return {
        course: courseResult,
        tasks: { success: false, entity: 'tasks', count: 0, errors: ['Course sync failed'], duration: 0 },
        announcements: { success: false, entity: 'announcements', count: 0, errors: ['Course sync failed'], duration: 0 },
        modules: { success: false, entity: 'modules', count: 0, errors: ['Course sync failed'], duration: 0 },
        pages: { success: false, entity: 'pages', count: 0, errors: ['Course sync failed'], duration: 0 },
      };
    }

    // Get local course ID
    const localCourse = this.db.executeReadOne<{ id: number }>(
      'SELECT id FROM courses WHERE external_id = ?',
      [String(canvasCourseId)]
    );

    if (!localCourse) {
      return {
        course: courseResult,
        tasks: { success: false, entity: 'tasks', count: 0, errors: ['Course not found'], duration: 0 },
        announcements: { success: false, entity: 'announcements', count: 0, errors: ['Course not found'], duration: 0 },
        modules: { success: false, entity: 'modules', count: 0, errors: ['Course not found'], duration: 0 },
        pages: { success: false, entity: 'pages', count: 0, errors: ['Course not found'], duration: 0 },
      };
    }

    // Sync related data in parallel
    const [tasks, announcements, modules, pages] = await Promise.all([
      this.syncTasks(canvasCourseId, localCourse.id),
      this.syncAnnouncements(canvasCourseId, localCourse.id),
      this.syncModules(canvasCourseId, localCourse.id),
      this.syncPages(canvasCourseId, localCourse.id),
    ]);

    return { course: courseResult, tasks, announcements, modules, pages };
  }

  /**
   * Sync a single course (helper)
   */
  private async syncSingleCourse(canvasCourseId: number): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    try {
      const response = await this.rateLimiter.enqueue(
        () =>
          this.client.get<CanvasCourse>(`/courses/${canvasCourseId}`, {
            include: ['total_scores', 'current_grading_period_scores', 'syllabus_body'],
          }),
        10
      );

      const baseUrl = this.client.getBaseUrl();
      const localCourse = mapCourse(response.data, baseUrl);
      this.db.upsert('courses', localCourse);

      return {
        success: true,
        entity: 'courses',
        count: 1,
        errors: [],
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to sync course ${canvasCourseId}: ${message}`);
      return {
        success: false,
        entity: 'courses',
        count: 0,
        errors,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Update sync metadata for an endpoint
   */
  private updateSyncMetadata(endpoint: string, etag?: string): void {
    this.db.executeWrite(
      `INSERT INTO sync_metadata (endpoint, etag, last_synced_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(endpoint) DO UPDATE SET
         etag = excluded.etag,
         last_synced_at = CURRENT_TIMESTAMP`,
      [endpoint, etag || null],
      'sync_metadata'
    );
  }

  /**
   * Get sync metadata for an endpoint
   */
  getSyncMetadata(endpoint: string): SyncMetadata | undefined {
    return this.db.executeReadOne<SyncMetadata>(
      'SELECT * FROM sync_metadata WHERE endpoint = ?',
      [endpoint]
    );
  }

  /**
   * Get last sync time for all endpoints
   */
  getAllSyncMetadata(): SyncMetadata[] {
    return this.db.executeRead<SyncMetadata>('SELECT * FROM sync_metadata ORDER BY last_synced_at DESC');
  }

  /**
   * Check if currently syncing
   */
  isBusy(): boolean {
    return this.isSyncing;
  }

  /**
   * Get rate limiter status
   */
  getRateLimitStatus() {
    return this.rateLimiter.getStatus();
  }

  /**
   * Stop any ongoing sync operations
   */
  stop(): void {
    this.rateLimiter.stop();
    this.isSyncing = false;
  }
}
