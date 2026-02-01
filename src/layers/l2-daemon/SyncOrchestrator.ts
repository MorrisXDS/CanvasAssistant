/**
 * Sync Orchestrator
 * Handles the two-phase fetch-commit sync logic for Canvas data synchronization.
 */

import { EventEmitter } from 'events';
import { CanvasClient } from './CanvasClient';
import { RateLimiter } from './RateLimiter';
import { Database } from '../l1-persistence/Database';
import { VisibleDataProvider } from '../l1-persistence/VisibleDataProvider';
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
import { SyncConflictResolver } from './SyncConflictResolver';
import { SyncCheckpointManager } from './SyncCheckpointManager';
import { SyncBackoffManager } from './SyncBackoffManager';
import type { ComponentLogger } from '../l0-utilities/Logger';
import type { SyncOptions, SyncResult, FullSyncResult, SyncCheckpoint } from './SyncEngineTypes';

export interface SyncOrchestratorConfig {
  client: CanvasClient;
  db: Database;
  rateLimiter: RateLimiter;
  conflictResolver: SyncConflictResolver;
  checkpointManager: SyncCheckpointManager;
  backoffManager: SyncBackoffManager;
  visibleDataProvider: VisibleDataProvider | null;
  emitter: EventEmitter;
  log: ComponentLogger | null;
  getDefaultTargetGrade: () => number;
  getCourseSettings: (courseId: number) => { autoAssignDueDate: boolean; allowGuessedOverride: boolean };
  getTodayEndTime: () => string;
  persistConflictData: (conflictId: string, tableName: string, data: Record<string, unknown>) => void;
  pendingConflictData: Map<string, { tableName: string; data: Record<string, unknown> }>;
  hasActiveDownloadFor: (sourceType: string, sourceId: string) => boolean;
  computeContentHash: (content: string | null | undefined) => string | null;
  updateContentHashAndDependencies: (
    sourceType: 'page' | 'assignment' | 'syllabus' | 'announcement',
    sourceId: string,
    newContent: string | null,
    courseId: number
  ) => void;
}

interface FetchedData {
  courses: CanvasCourse[];
  tasks: Map<number, CanvasAssignment[]>;
  announcements: Map<number, CanvasAnnouncement[]>;
  modules: Map<number, CanvasModule[]>;
  pages: Map<number, CanvasPage[]>;
  folders: Map<number, CanvasFolder[]>;
  files: Map<number, CanvasFile[]>;
}

export class SyncOrchestrator {
  private client: CanvasClient;
  private db: Database;
  private rateLimiter: RateLimiter;
  private conflictResolver: SyncConflictResolver;
  private checkpointManager: SyncCheckpointManager;
  private backoffManager: SyncBackoffManager;
  private visibleDataProvider: VisibleDataProvider | null;
  private emitter: EventEmitter;
  private log: ComponentLogger | null;
  private getDefaultTargetGrade: () => number;
  private getCourseSettings: (courseId: number) => { autoAssignDueDate: boolean; allowGuessedOverride: boolean };
  private getTodayEndTime: () => string;
  private persistConflictData: (conflictId: string, tableName: string, data: Record<string, unknown>) => void;
  private pendingConflictData: Map<string, { tableName: string; data: Record<string, unknown> }>;
  private hasActiveDownloadFor: (sourceType: string, sourceId: string) => boolean;
  private computeContentHash: (content: string | null | undefined) => string | null;
  private updateContentHashAndDependencies: (
    sourceType: 'page' | 'assignment' | 'syllabus' | 'announcement',
    sourceId: string,
    newContent: string | null,
    courseId: number
  ) => void;
  private isAborted: boolean = false;

  constructor(config: SyncOrchestratorConfig) {
    this.client = config.client;
    this.db = config.db;
    this.rateLimiter = config.rateLimiter;
    this.conflictResolver = config.conflictResolver;
    this.checkpointManager = config.checkpointManager;
    this.backoffManager = config.backoffManager;
    this.visibleDataProvider = config.visibleDataProvider;
    this.emitter = config.emitter;
    this.log = config.log;
    this.getDefaultTargetGrade = config.getDefaultTargetGrade;
    this.getCourseSettings = config.getCourseSettings;
    this.getTodayEndTime = config.getTodayEndTime;
    this.persistConflictData = config.persistConflictData;
    this.pendingConflictData = config.pendingConflictData;
    this.hasActiveDownloadFor = config.hasActiveDownloadFor;
    this.computeContentHash = config.computeContentHash;
    this.updateContentHashAndDependencies = config.updateContentHashAndDependencies;
  }

  setAborted(aborted: boolean): void {
    this.isAborted = aborted;
  }

  private checkAborted(): void {
    if (this.isAborted) {
      throw new Error('Sync aborted');
    }
  }

  /**
   * Execute the fetch phase - get all data from Canvas API
   */
  async executeFetchPhase(
    options: SyncOptions,
    syncId: string,
    checkpoint: SyncCheckpoint | null
  ): Promise<{
    fetched: FetchedData;
    visibleCoursesToSync: CanvasCourse[];
    errors: string[];
  }> {
    const errors: string[] = [];
    const syncCanvasFiles = options?.syncCanvasFiles ?? true;
    const syncAnnouncements = options?.syncAnnouncements ?? true;
    const termSelection = options?.termSelection ?? 'all';

    const fetched: FetchedData = {
      courses: [],
      tasks: new Map(),
      announcements: new Map(),
      modules: new Map(),
      pages: new Map(),
      folders: new Map(),
      files: new Map(),
    };

    // Restore from checkpoint if resuming
    const alreadyFetchedCourseIds = new Set<number>();
    if (checkpoint && checkpoint.phase === 'fetch') {
      fetched.courses = checkpoint.fetchedData.courses;
      for (const [courseIdStr, tasks] of Object.entries(checkpoint.fetchedData.tasks)) {
        const courseId = parseInt(courseIdStr, 10);
        fetched.tasks.set(courseId, tasks as CanvasAssignment[]);
        alreadyFetchedCourseIds.add(courseId);
      }
      for (const [courseIdStr, announcements] of Object.entries(checkpoint.fetchedData.announcements)) {
        fetched.announcements.set(parseInt(courseIdStr, 10), announcements as CanvasAnnouncement[]);
      }
      for (const [courseIdStr, modules] of Object.entries(checkpoint.fetchedData.modules)) {
        fetched.modules.set(parseInt(courseIdStr, 10), modules as CanvasModule[]);
      }
      for (const [courseIdStr, pages] of Object.entries(checkpoint.fetchedData.pages)) {
        fetched.pages.set(parseInt(courseIdStr, 10), pages as CanvasPage[]);
      }
      for (const [courseIdStr, folders] of Object.entries(checkpoint.fetchedData.folders)) {
        fetched.folders.set(parseInt(courseIdStr, 10), folders as CanvasFolder[]);
      }
      for (const [courseIdStr, files] of Object.entries(checkpoint.fetchedData.files)) {
        fetched.files.set(parseInt(courseIdStr, 10), files as CanvasFile[]);
      }
    }

    this.emitter.emit('sync-phase', { phase: 'fetch', status: 'started' });

    // Fetch courses
    if (!checkpoint || fetched.courses.length === 0) {
      fetched.courses = await this.rateLimiter.enqueue(
        () =>
          this.client.getAll<CanvasCourse>('/courses', {
            enrollment_state: 'active',
            include: ['total_scores', 'current_grading_period_scores', 'syllabus_body', 'term'],
          }),
        10
      );
    }

    // Early metadata commit
    await this.commitEarlyMetadata(fetched.courses);

    // Filter courses
    const visibleCoursesToSync = this.filterCourses(fetched.courses, termSelection);

    // Create checkpoint if needed
    if (!checkpoint) {
      this.checkpointManager.createCheckpoint(syncId, options || {}, visibleCoursesToSync.length);
      this.checkpointManager.updateCheckpointCourses(syncId, fetched.courses);
    }

    // Fetch course data
    const coursesToFetch = visibleCoursesToSync.filter((c) => !alreadyFetchedCourseIds.has(c.id));
    const COURSE_BATCH_SIZE = 10;
    let completedCount = alreadyFetchedCourseIds.size;

    for (let i = 0; i < coursesToFetch.length; i += COURSE_BATCH_SIZE) {
      const batch = coursesToFetch.slice(i, i + COURSE_BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map((course) =>
          this.fetchCourseData(course, fetched, syncId, syncCanvasFiles, syncAnnouncements)
        )
      );

      for (const courseErrors of batchResults) {
        errors.push(...courseErrors);
      }

      completedCount += batch.length;
      this.emitter.emit('sync-progress', {
        syncId,
        phase: 'fetch',
        totalCourses: visibleCoursesToSync.length,
        completedCourses: completedCount,
      });
    }

    this.emitter.emit('sync-phase', { phase: 'fetch', status: 'complete' });
    this.checkAborted();

    return { fetched, visibleCoursesToSync, errors };
  }

  /**
   * Execute the commit phase - write all fetched data to database
   */
  executeCommitPhase(
    fetched: FetchedData,
    syncId: string
  ): { counts: Record<string, number>; errors: string[] } {
    const errors: string[] = [];
    const counts = {
      courses: 0,
      tasks: 0,
      announcements: 0,
      modules: 0,
      pages: 0,
      folders: 0,
      files: 0,
    };

    this.emitter.emit('sync-phase', { phase: 'commit', status: 'started' });
    this.checkpointManager.markCheckpointCommitting(syncId);

    const baseUrl = this.client.getBaseUrl();

    this.db.transaction(() => {
      // Commit courses
      const defaultTargetGrade = this.getDefaultTargetGrade();
      for (const course of fetched.courses) {
        try {
          const localCourse = mapCourse(course, baseUrl, defaultTargetGrade);
          const existing = this.db.executeReadOne<Record<string, unknown>>(
            'SELECT * FROM courses WHERE external_id = ?',
            [localCourse.external_id]
          );

          const { autoResolved, conflicts, preservedFields } =
            this.conflictResolver.detectConflicts(
              'course',
              'courses',
              (existing?.id as number) || 0,
              localCourse.external_id,
              localCourse.name,
              existing,
              localCourse
            );

          if (conflicts.length > 0) {
            this.emitter.emit('sync-conflicts', { entity: 'course', conflicts });
            for (const conflict of conflicts) {
              const conflictData = { ...localCourse, id: existing?.id };
              this.pendingConflictData.set(conflict.id, { tableName: 'courses', data: conflictData });
              this.persistConflictData(conflict.id, 'courses', conflictData);
            }
          }

          const finalData: Record<string, unknown> = { ...localCourse };
          for (const [field, value] of Object.entries(autoResolved)) {
            finalData[field] = value;
          }
          if (existing) {
            for (const field of preservedFields) {
              if (existing[field] !== undefined) {
                finalData[field] = existing[field];
              }
            }
            for (const conflict of conflicts) {
              if (existing[conflict.field] !== undefined) {
                finalData[conflict.field] = existing[conflict.field];
              }
            }
          }

          this.db.upsert('courses', finalData, 'external_id', true, preservedFields);
          counts.courses++;
        } catch (error) {
          errors.push(`Course ${course.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Build course lookup
      const courseLookup = new Map<number, number>();
      for (const course of fetched.courses) {
        const row = this.db.executeReadOne<{ id: number }>(
          'SELECT id FROM courses WHERE external_id = ?',
          [String(course.id)]
        );
        if (row) {
          courseLookup.set(course.id, row.id);
        }
      }

      // Commit tasks
      for (const [canvasCourseId, tasks] of fetched.tasks) {
        const localCourseId = courseLookup.get(canvasCourseId);
        if (!localCourseId) continue;

        for (const assignment of tasks) {
          try {
            const localTask = mapAssignment(assignment, localCourseId);
            this.db.upsert('tasks', localTask, 'external_id', true);
            counts.tasks++;
          } catch (error) {
            errors.push(`Task ${assignment.id}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }

      // Commit announcements
      for (const [canvasCourseId, announcements] of fetched.announcements) {
        const localCourseId = courseLookup.get(canvasCourseId);
        if (!localCourseId) continue;

        for (const announcement of announcements) {
          try {
            const mapped = mapAnnouncement(announcement, localCourseId, baseUrl, String(canvasCourseId));
            this.db.upsert('notifications', mapped.notification, ['source_type', 'source_id'], false);
            counts.announcements++;
          } catch (error) {
            errors.push(`Announcement ${announcement.id}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }

      // Commit modules
      for (const [canvasCourseId, modules] of fetched.modules) {
        const localCourseId = courseLookup.get(canvasCourseId);
        if (!localCourseId) continue;

        for (const module of modules) {
          try {
            const localModule = mapModule(module, localCourseId);
            this.db.upsert('modules', localModule);
            counts.modules++;

            const insertedModule = this.db.executeReadOne<{ id: number }>(
              'SELECT id FROM modules WHERE external_id = ?',
              [String(module.id)]
            );

            if (insertedModule && module.items) {
              for (const item of module.items) {
                const localItem = mapModuleItem(item, insertedModule.id);
                this.db.upsert('module_items', localItem);
              }
            }
          } catch (error) {
            errors.push(`Module ${module.id}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }

      // Commit pages
      for (const [canvasCourseId, pages] of fetched.pages) {
        const localCourseId = courseLookup.get(canvasCourseId);
        if (!localCourseId) continue;

        for (const page of pages) {
          try {
            const pageType = page.front_page ? 'landing' : 'content';
            const localPage = mapPage(page, localCourseId, pageType);
            this.db.upsert('course_pages', localPage);
            counts.pages++;
          } catch (error) {
            errors.push(`Page ${page.url}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }

      // Commit folders
      for (const [canvasCourseId, folders] of fetched.folders) {
        const localCourseId = courseLookup.get(canvasCourseId);
        if (!localCourseId) continue;

        for (const folder of folders) {
          try {
            const localFolder = mapFolder(folder, localCourseId);
            this.db.upsert('resources', localFolder as Record<string, unknown>);
            counts.folders++;
          } catch (error) {
            errors.push(`Folder ${folder.name}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }

      // Commit files
      for (const [canvasCourseId, files] of fetched.files) {
        const localCourseId = courseLookup.get(canvasCourseId);
        if (!localCourseId) continue;

        // Build folder path map
        const folderPathMap = new Map<number, string>();
        const dbFolders = this.db.executeRead<{ external_id: string; folder_path: string | null }>(
          'SELECT external_id, folder_path FROM resources WHERE course_id = ? AND type = ?',
          [localCourseId, 'folder']
        );
        for (const folder of dbFolders) {
          folderPathMap.set(parseInt(folder.external_id, 10), folder.folder_path || '');
        }

        for (const file of files) {
          try {
            const folderPath = folderPathMap.get(file.folder_id) ?? null;
            const localFile = mapFile(file, localCourseId, null, folderPath);
            this.db.upsert('resources', localFile as Record<string, unknown>, 'external_id', true);
            counts.files++;
          } catch (error) {
            errors.push(`File ${file.display_name}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
    });

    this.emitter.emit('sync-phase', { phase: 'commit', status: 'complete' });

    return { counts, errors };
  }

  private async commitEarlyMetadata(courses: CanvasCourse[]): Promise<void> {
    const baseUrl = this.client.getBaseUrl();
    const defaultTargetGrade = this.getDefaultTargetGrade();

    // Extract and write enrollment terms
    const termsMap = new Map<number, { id: number; name: string; start_at: string | null; end_at: string | null }>();
    for (const course of courses) {
      if (course.term && !termsMap.has(course.term.id)) {
        termsMap.set(course.term.id, {
          id: course.term.id,
          name: course.term.name,
          start_at: course.term.start_at,
          end_at: course.term.end_at,
        });
      } else if (course.enrollment_term_id && !termsMap.has(course.enrollment_term_id)) {
        termsMap.set(course.enrollment_term_id, {
          id: course.enrollment_term_id,
          name: `Semester ${course.enrollment_term_id}`,
          start_at: null,
          end_at: null,
        });
      }
    }

    for (const [termId, term] of termsMap) {
      this.db.executeWrite(
        `INSERT INTO enrollment_terms (external_id, name, start_at, end_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(external_id) DO UPDATE SET name = excluded.name, start_at = excluded.start_at, end_at = excluded.end_at`,
        [String(termId), term.name, term.start_at, term.end_at],
        'enrollment_terms'
      );
    }

    // Write course metadata
    const preservedFields = ['target_grade', 'target_grade_source', 'is_hidden', 'archived_at', 'color', 'nickname'];
    for (const course of courses) {
      const localCourse = mapCourse(course, baseUrl, defaultTargetGrade);
      const existing = this.db.executeReadOne<Record<string, unknown>>(
        'SELECT * FROM courses WHERE external_id = ?',
        [localCourse.external_id]
      );

      const finalData: Record<string, unknown> = { ...localCourse };
      if (existing) {
        for (const field of preservedFields) {
          if (existing[field] !== undefined) {
            finalData[field] = existing[field];
          }
        }
      }

      if (finalData.syllabus_body && typeof finalData.syllabus_body === 'string') {
        finalData.syllabus_hash = this.computeContentHash(finalData.syllabus_body);
      }

      this.db.upsert('courses', finalData, 'external_id', true, preservedFields);
    }

    // Invalidate cache
    if (this.visibleDataProvider) {
      this.visibleDataProvider.invalidateCache();
    }
  }

  private filterCourses(courses: CanvasCourse[], termSelection: string): CanvasCourse[] {
    let coursesToSync = courses;

    if (termSelection !== 'all') {
      if (termSelection === 'auto') {
        const DAYS_BUFFER = 30;
        const now = new Date();
        const currentTermIds = new Set<number>();

        for (const course of courses) {
          if (course.term && course.term.end_at && course.term.name !== 'Default Term' && course.term.id !== 1) {
            const endDate = new Date(course.term.end_at);
            const adjustedEndDate = new Date(endDate.getTime() - DAYS_BUFFER * 24 * 60 * 60 * 1000);
            if (adjustedEndDate > now) {
              currentTermIds.add(course.term.id);
            }
          }
        }

        if (currentTermIds.size > 0) {
          coursesToSync = courses.filter((c) => c.term && currentTermIds.has(c.term.id));
        }
      } else {
        const selectedTermId = parseInt(termSelection, 10);
        if (!isNaN(selectedTermId)) {
          coursesToSync = courses.filter((c) => c.term && c.term.id === selectedTermId);
        }
      }
    }

    // Filter to visible courses
    if (this.visibleDataProvider) {
      const visibleLocalIds = new Set(this.visibleDataProvider.getVisibleCourseIds());
      const canvasToLocalId = new Map<number, number>();

      for (const course of coursesToSync) {
        const local = this.db.executeReadOne<{ id: number }>(
          'SELECT id FROM courses WHERE external_id = ?',
          [String(course.id)]
        );
        if (local) {
          canvasToLocalId.set(course.id, local.id);
        }
      }

      return coursesToSync.filter((c) => {
        const localId = canvasToLocalId.get(c.id);
        return localId !== undefined && visibleLocalIds.has(localId);
      });
    }

    return coursesToSync;
  }

  private async fetchCourseData(
    course: CanvasCourse,
    fetched: FetchedData,
    syncId: string,
    syncCanvasFiles: boolean,
    syncAnnouncements: boolean
  ): Promise<string[]> {
    const canvasCourseId = course.id;
    const errors: string[] = [];
    const fetchPromises: Promise<void>[] = [];

    // Tasks
    fetchPromises.push(
      this.rateLimiter
        .enqueue(
          () =>
            this.client.getAll<CanvasAssignment>(`/courses/${canvasCourseId}/assignments`, {
              order_by: 'due_at',
              'include[]': 'submission',
            }),
          5
        )
        .then((data) => {
          fetched.tasks.set(canvasCourseId, data);
        })
    );

    // Modules
    fetchPromises.push(
      (async () => {
        const endpoint = `/courses/${canvasCourseId}/modules`;
        const result = await this.backoffManager.fetchWithBackoff(endpoint, canvasCourseId, () =>
          this.rateLimiter.enqueue(
            () => this.client.getAll<CanvasModule>(endpoint, { include: ['items'] }),
            3
          )
        );
        fetched.modules.set(canvasCourseId, result.data || []);
      })()
    );

    // Pages
    fetchPromises.push(
      (async () => {
        const endpoint = `/courses/${canvasCourseId}/pages`;
        const result = await this.backoffManager.fetchWithBackoff(endpoint, canvasCourseId, () =>
          this.rateLimiter.enqueue(
            () => this.client.getAll<CanvasPage>(endpoint, { 'include[]': 'body' }),
            2
          )
        );
        if (result.data && result.data.length > 0) {
          fetched.pages.set(canvasCourseId, result.data);
        } else {
          try {
            const frontPageResponse = await this.rateLimiter.enqueue(
              () => this.client.get<CanvasPage>(`/courses/${canvasCourseId}/front_page`),
              2
            );
            fetched.pages.set(canvasCourseId, frontPageResponse.data ? [frontPageResponse.data] : []);
          } catch {
            fetched.pages.set(canvasCourseId, []);
          }
        }
      })()
    );

    // Announcements
    if (syncAnnouncements) {
      fetchPromises.push(
        this.rateLimiter
          .enqueue(
            () =>
              this.client.getAll<CanvasAnnouncement>(`/courses/${canvasCourseId}/discussion_topics`, {
                only_announcements: true,
              }),
            3
          )
          .then((data) => {
            fetched.announcements.set(canvasCourseId, data);
          })
      );
    }

    // Files and Folders
    if (syncCanvasFiles) {
      fetchPromises.push(
        (async () => {
          const endpoint = `/courses/${canvasCourseId}/folders`;
          const result = await this.backoffManager.fetchWithBackoff(endpoint, canvasCourseId, () =>
            this.rateLimiter.enqueue(() => this.client.getAll<CanvasFolder>(endpoint), 2)
          );
          fetched.folders.set(canvasCourseId, result.data || []);
        })()
      );

      fetchPromises.push(
        (async () => {
          const endpoint = `/courses/${canvasCourseId}/files`;
          const result = await this.backoffManager.fetchWithBackoff(endpoint, canvasCourseId, () =>
            this.rateLimiter.enqueue(() => this.client.getAll<CanvasFile>(endpoint), 2)
          );
          fetched.files.set(canvasCourseId, result.data || []);
        })()
      );
    }

    const results = await Promise.allSettled(fetchPromises);

    for (const result of results) {
      if (result.status === 'rejected') {
        const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
        errors.push(`Course ${canvasCourseId} fetch: ${reason}`);
      }
    }

    // Update checkpoint
    this.checkpointManager.updateCheckpointProgress(syncId, canvasCourseId, {
      tasks: fetched.tasks.get(canvasCourseId),
      announcements: fetched.announcements.get(canvasCourseId),
      modules: fetched.modules.get(canvasCourseId),
      pages: fetched.pages.get(canvasCourseId),
      folders: fetched.folders.get(canvasCourseId),
      files: fetched.files.get(canvasCourseId),
    });

    return errors;
  }
}
