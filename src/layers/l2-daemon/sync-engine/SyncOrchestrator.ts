/**
 * Sync Orchestrator
 * Handles the two-phase fetch-commit sync logic for Canvas data synchronization.
 */

import { EventEmitter } from 'events';
import { CanvasClient } from '../client/CanvasClient';
import { RateLimiter } from '../resilience/RateLimiter';
import { Database, VisibleDataProvider } from '../../l1-persistence';
import {
  CanvasCourse,
  CanvasAssignment,
  CanvasAnnouncement,
  CanvasModule,
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
  mapAssignmentToQueueEntry,
} from '../data/DataMappers';
import { SyncConflictResolver } from './SyncConflictResolver';
import { SyncCheckpointManager } from './SyncCheckpointManager';
import { SyncBackoffManager } from './SyncBackoffManager';
import { findMatchingCanvasTask, LINK_THRESHOLDS } from './sync/TaskMatcher';
import type { ComponentLogger } from '../../l0-utilities/Logger';
import type { SyncOptions, SyncCheckpoint } from './SyncEngineTypes';

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
  getCourseSettings: (courseId: number) => {
    autoAssignDueDate: boolean;
    allowGuessedOverride: boolean;
  };
  getTodayEndTime: () => string;
  persistConflictData: (
    conflictId: string,
    tableName: string,
    data: Record<string, unknown>
  ) => void;
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
  assignmentGroups: Map<number, CanvasAssignmentGroup[]>;
}

interface CanvasAssignmentGroup {
  id: number;
  name: string;
  position: number;
  group_weight: number | null;
  rules?: {
    drop_lowest?: number;
    drop_highest?: number;
    never_drop?: number[];
  };
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
  private getCourseSettings: (courseId: number) => {
    autoAssignDueDate: boolean;
    allowGuessedOverride: boolean;
  };
  private getTodayEndTime: () => string;
  private persistConflictData: (
    conflictId: string,
    tableName: string,
    data: Record<string, unknown>
  ) => void;
  private pendingConflictData: Map<
    string,
    { tableName: string; data: Record<string, unknown> }
  >;
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
      assignmentGroups: new Map(),
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
      for (const [courseIdStr, announcements] of Object.entries(
        checkpoint.fetchedData.announcements
      )) {
        fetched.announcements.set(
          parseInt(courseIdStr, 10),
          announcements as CanvasAnnouncement[]
        );
      }
      for (const [courseIdStr, modules] of Object.entries(
        checkpoint.fetchedData.modules
      )) {
        fetched.modules.set(parseInt(courseIdStr, 10), modules as CanvasModule[]);
      }
      for (const [courseIdStr, pages] of Object.entries(checkpoint.fetchedData.pages)) {
        fetched.pages.set(parseInt(courseIdStr, 10), pages as CanvasPage[]);
      }
      for (const [courseIdStr, folders] of Object.entries(
        checkpoint.fetchedData.folders
      )) {
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
            include: [
              'total_scores',
              'current_grading_period_scores',
              'syllabus_body',
              'term',
            ],
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
      this.checkpointManager.createCheckpoint(
        syncId,
        options || {},
        visibleCoursesToSync.length
      );
      this.checkpointManager.updateCheckpointCourses(syncId, fetched.courses);
    }

    // Fetch course data
    const coursesToFetch = visibleCoursesToSync.filter(
      (c) => !alreadyFetchedCourseIds.has(c.id)
    );
    const COURSE_BATCH_SIZE = 10;
    let completedCount = alreadyFetchedCourseIds.size;

    for (let i = 0; i < coursesToFetch.length; i += COURSE_BATCH_SIZE) {
      const batch = coursesToFetch.slice(i, i + COURSE_BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map((course) =>
          this.fetchCourseData(
            course,
            fetched,
            syncId,
            syncCanvasFiles,
            syncAnnouncements
          )
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
      assignmentGroups: 0,
    };

    // Track sync updates for the FAB notification
    const updateCounts = {
      newTasks: 0,
      updatedTasks: 0,
      newAnnouncements: 0,
      gradeChanges: 0,
      newFiles: 0,
      fieldUpdates: 0,
      conflicts: 0,
    };

    this.emitter.emit('sync-phase', { phase: 'commit', status: 'started' });
    this.checkpointManager.markCheckpointCommitting(syncId);

    // Create sync session for tracking updates
    this.createSyncSession(syncId);

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
            // Don't emit sync-conflicts event - conflicts now go to Updates page
            for (const conflict of conflicts) {
              const conflictData = { ...localCourse, id: existing?.id };
              this.pendingConflictData.set(conflict.id, {
                tableName: 'courses',
                data: conflictData,
              });
              this.persistConflictData(conflict.id, 'courses', conflictData);

              // Record conflict to sync_updates for notification system
              const courseId = (existing?.id as number) || 0;
              this.recordSyncUpdate({
                syncSessionId: syncId,
                courseId: courseId,
                entityType: 'conflict',
                entityId: courseId,
                externalId: conflict.id,
                changeType: 'conflict',
                title: conflict.entityName,
                subtitle: `${conflict.fieldLabel}: local vs Canvas`,
                oldValue: JSON.stringify(conflict.localValue),
                newValue: JSON.stringify(conflict.canvasValue),
                conflictField: conflict.field,
                isActionRequired: true,
              });
              updateCounts.conflicts = (updateCounts.conflicts || 0) + 1;
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
          errors.push(
            `Course ${course.id}: ${error instanceof Error ? error.message : String(error)}`
          );
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

      // Commit assignment groups BEFORE tasks (so we can link tasks to groups)
      // Build canvas-to-local group ID lookup
      const groupIdLookup = new Map<number, Map<number, number>>(); // courseId -> (canvasGroupId -> localGroupId)
      for (const [canvasCourseId, groups] of fetched.assignmentGroups) {
        const localCourseId = courseLookup.get(canvasCourseId);
        if (!localCourseId) continue;

        const courseGroupLookup = new Map<number, number>();
        groupIdLookup.set(localCourseId, courseGroupLookup);

        for (const group of groups) {
          try {
            const groupData = {
              course_id: localCourseId,
              canvas_group_id: group.id,
              name: group.name,
              position: group.position || 0,
              group_weight: group.group_weight ?? null,
              drop_lowest: group.rules?.drop_lowest ?? 0,
              drop_highest: group.rules?.drop_highest ?? 0,
              never_drop: group.rules?.never_drop
                ? JSON.stringify(group.rules.never_drop)
                : null,
              synced_at: new Date().toISOString(),
            };

            // Pass updateTimestamp=false since canvas_assignment_groups uses synced_at instead of updated_at
            this.db.upsert(
              'canvas_assignment_groups',
              groupData,
              ['course_id', 'canvas_group_id'],
              false
            );

            // Get local ID for the group
            const localGroup = this.db.executeReadOne<{ id: number }>(
              'SELECT id FROM canvas_assignment_groups WHERE course_id = ? AND canvas_group_id = ?',
              [localCourseId, group.id]
            );
            if (localGroup) {
              courseGroupLookup.set(group.id, localGroup.id);
            }

            counts.assignmentGroups++;
          } catch (error) {
            errors.push(
              `Assignment group ${group.name}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      }

      // Commit tasks with queue-aware logic
      // New Canvas tasks go to queue for user review; accepted tasks get grade updates
      let queuedTaskCount = 0;
      for (const [canvasCourseId, tasks] of fetched.tasks) {
        const localCourseId = courseLookup.get(canvasCourseId);
        if (!localCourseId) continue;

        // Get course name for conflict context
        const courseRow = this.db.executeReadOne<{ name: string }>(
          'SELECT name FROM courses WHERE id = ?',
          [localCourseId]
        );
        const courseName = courseRow?.name;

        for (const assignment of tasks) {
          try {
            const externalId = String(assignment.id);
            const localTask = mapAssignment(assignment, localCourseId);

            // === DECISION 1: Already accepted task? ===
            // Check if this Canvas assignment has an accepted task (acceptance_method IS NOT NULL)
            const acceptedTask = this.db.executeReadOne<{
              id: number;
              acceptance_method: string | null;
            }>(
              `SELECT id, acceptance_method FROM tasks
               WHERE external_id = ? AND acceptance_method IS NOT NULL`,
              [externalId]
            );

            if (acceptedTask) {
              // Already accepted - update grades/status with conflict detection
              // Fetch full task data for conflict detection
              const existingAccepted = this.db.executeReadOne<Record<string, unknown>>(
                'SELECT * FROM tasks WHERE id = ?',
                [acceptedTask.id]
              );

              if (existingAccepted) {
                // Use conflict detection for is_completed, title, due_at
                const { autoResolved, conflicts, preservedFields } =
                  this.conflictResolver.detectConflicts(
                    'task',
                    'tasks',
                    acceptedTask.id,
                    localTask.external_id,
                    localTask.title,
                    existingAccepted,
                    localTask,
                    { courseName, courseId: localCourseId }
                  );

                if (conflicts.length > 0) {
                  // Don't emit sync-conflicts event - conflicts now go to Updates page
                  for (const conflict of conflicts) {
                    const conflictData = { ...localTask, id: acceptedTask.id };
                    this.pendingConflictData.set(conflict.id, {
                      tableName: 'tasks',
                      data: conflictData,
                    });
                    this.persistConflictData(conflict.id, 'tasks', conflictData);

                    // Record conflict to sync_updates for notification system
                    // Store conflict.id in externalId so resolution can find the right conflict
                    this.recordSyncUpdate({
                      syncSessionId: syncId,
                      courseId: localCourseId,
                      entityType: 'conflict',
                      entityId: acceptedTask.id,
                      externalId: conflict.id, // Use conflict ID for resolution lookup
                      changeType: 'conflict',
                      title: conflict.entityName,
                      subtitle: `${conflict.fieldLabel}: local vs Canvas`,
                      oldValue: JSON.stringify(conflict.localValue),
                      newValue: JSON.stringify(conflict.canvasValue),
                      conflictField: conflict.field,
                      isActionRequired: true,
                    });
                    updateCounts.conflicts = (updateCounts.conflicts || 0) + 1;
                  }
                }

                // Build final data respecting conflicts and preserved fields
                const finalGrade = autoResolved.grade ?? localTask.grade;
                const finalSubmissionStatus =
                  autoResolved.submission_status ?? localTask.submission_status;

                // Check if grade changed for recording sync update
                const oldGrade = existingAccepted.grade as string | null;
                const gradeChanged =
                  oldGrade !== finalGrade &&
                  finalGrade !== null &&
                  finalGrade !== undefined;

                // For is_completed: use preserved value if in conflict, otherwise use auto-resolved or Canvas value
                let finalIsCompleted = existingAccepted.is_completed;
                if (
                  preservedFields.includes('is_completed') ||
                  conflicts.some((c) => c.field === 'is_completed')
                ) {
                  // Keep local value - user modified it or it's in conflict
                  finalIsCompleted = existingAccepted.is_completed;
                } else if (autoResolved.is_completed !== undefined) {
                  finalIsCompleted = autoResolved.is_completed;
                } else {
                  // Fall back to original logic: keep completed if already completed
                  finalIsCompleted =
                    existingAccepted.is_completed === 1 ? 1 : localTask.is_completed;
                }

                this.db.executeWrite(
                  `UPDATE tasks SET
                    grade = ?,
                    submission_status = ?,
                    is_completed = ?,
                    completed_at = CASE WHEN ? = 1 AND completed_at IS NULL THEN CURRENT_TIMESTAMP ELSE completed_at END,
                    updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?`,
                  [
                    finalGrade,
                    finalSubmissionStatus,
                    finalIsCompleted,
                    finalIsCompleted,
                    acceptedTask.id,
                  ],
                  'tasks'
                );

                // Record grade change as sync update
                if (gradeChanged) {
                  const taskTitle =
                    (existingAccepted.title as string) || localTask.title || 'Task';
                  this.recordSyncUpdate({
                    syncSessionId: syncId,
                    courseId: localCourseId,
                    entityType: 'grade',
                    entityId: acceptedTask.id,
                    externalId: externalId,
                    changeType: 'grade_changed',
                    title: taskTitle,
                    subtitle: `Grade: ${finalGrade}`,
                    oldValue: oldGrade != null ? String(oldGrade) : undefined,
                    newValue: finalGrade != null ? String(finalGrade) : undefined,
                    changedField: 'grade',
                  });
                  updateCounts.gradeChanges++;
                }

                // Record field changes (Canvas updated but not a conflict)
                // These are informational - local values are preserved
                const fieldsToTrack: Array<{
                  field: string;
                  localKey: string;
                  canvasKey: string;
                  label: string;
                  isDate?: boolean;
                }> = [
                  {
                    field: 'title',
                    localKey: 'title',
                    canvasKey: 'title',
                    label: 'Title',
                  },
                  {
                    field: 'due_at',
                    localKey: 'due_at',
                    canvasKey: 'due_at',
                    label: 'Due date',
                    isDate: true,
                  },
                  {
                    field: 'points_possible',
                    localKey: 'points_possible',
                    canvasKey: 'points_possible',
                    label: 'Points',
                  },
                  {
                    field: 'weight',
                    localKey: 'weight',
                    canvasKey: 'weight',
                    label: 'Weight',
                  },
                ];

                const conflictFields = new Set(conflicts.map((c) => c.field));
                const preservedSet = new Set(preservedFields);
                const taskTitleForUpdate =
                  (existingAccepted.title as string) || localTask.title || 'Task';

                // Get existing field updates for this task (seen or unseen) to avoid duplicates
                // We track (field, old_value, new_value) to only create new update if values changed
                const existingFieldUpdates = this.db.executeRead<{
                  changed_field: string;
                  old_value: string | null;
                  new_value: string | null;
                }>(
                  `SELECT changed_field, old_value, new_value FROM sync_updates
                   WHERE entity_id = ? AND entity_type = 'task'
                   AND change_type = 'updated'`,
                  [acceptedTask.id]
                );
                // Map: field -> {oldValue, newValue} of most recent update
                const existingFieldMap = new Map<
                  string,
                  { oldValue: string | null; newValue: string | null }
                >();
                for (const r of existingFieldUpdates) {
                  existingFieldMap.set(r.changed_field, {
                    oldValue: r.old_value,
                    newValue: r.new_value,
                  });
                }

                for (const {
                  field,
                  localKey,
                  canvasKey,
                  label,
                  isDate,
                } of fieldsToTrack) {
                  // Skip if this field is already a conflict or was preserved (user edited)
                  if (conflictFields.has(field) || preservedSet.has(field)) continue;

                  const localValue = existingAccepted[localKey];
                  const canvasValue = localTask[canvasKey as keyof typeof localTask];

                  // Compare values (handle null/undefined)
                  const localStr = localValue != null ? String(localValue) : null;
                  const canvasStr = canvasValue != null ? String(canvasValue) : null;

                  // For date fields, compare as timestamps to avoid false positives
                  // from format differences (e.g. "...T23:59:00Z" vs "...T23:59:00.000Z")
                  const valuesMatch =
                    isDate && localStr && canvasStr
                      ? this.datesEqual(localStr, canvasStr)
                      : localStr === canvasStr;

                  if (!valuesMatch) {
                    // Skip if we already have an update with the same old/new values
                    const existing = existingFieldMap.get(field);
                    if (
                      existing &&
                      existing.oldValue === localStr &&
                      existing.newValue === canvasStr
                    ) {
                      continue; // Same difference already recorded
                    }

                    this.recordSyncUpdate({
                      syncSessionId: syncId,
                      courseId: localCourseId,
                      entityType: 'task',
                      entityId: acceptedTask.id,
                      externalId: externalId,
                      changeType: 'updated',
                      title: taskTitleForUpdate,
                      subtitle: `${label} changed`,
                      oldValue: localStr ?? undefined,
                      newValue: canvasStr ?? undefined,
                      changedField: field,
                    });
                    updateCounts.fieldUpdates = (updateCounts.fieldUpdates || 0) + 1;
                  }
                }
              } else {
                // Fallback if somehow we can't fetch the task (shouldn't happen)
                this.db.executeWrite(
                  `UPDATE tasks SET
                    grade = ?,
                    submission_status = ?,
                    is_completed = CASE WHEN is_completed = 1 THEN 1 ELSE ? END,
                    completed_at = COALESCE(completed_at, ?),
                    updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?`,
                  [
                    localTask.grade,
                    localTask.submission_status,
                    localTask.is_completed,
                    localTask.completed_at,
                    acceptedTask.id,
                  ],
                  'tasks'
                );
              }
              counts.tasks++;
              continue;
            }

            // === DECISION 2: Rejected in queue? ===
            const queueEntry = this.db.executeReadOne<{
              id: number;
              status: string;
            }>('SELECT id, status FROM canvas_task_queue WHERE external_id = ?', [
              externalId,
            ]);

            if (queueEntry?.status === 'rejected') {
              // Rejected - update queue metadata but don't create task
              this.db.executeWrite(
                `UPDATE canvas_task_queue SET
                  canvas_data = ?,
                  title = ?,
                  description = ?,
                  due_at = ?,
                  points_possible = ?,
                  last_synced_at = CURRENT_TIMESTAMP,
                  updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
                [
                  JSON.stringify(assignment),
                  assignment.name,
                  assignment.description,
                  assignment.due_at,
                  assignment.points_possible,
                  queueEntry.id,
                ],
                'canvas_task_queue'
              );
              counts.tasks++;
              continue;
            }

            // === DECISION 3: Existing task (legacy, pre-queue)? ===
            const existing = this.db.executeReadOne<Record<string, unknown>>(
              'SELECT * FROM tasks WHERE external_id = ?',
              [externalId]
            );

            if (existing) {
              // Legacy task - sync with conflict detection, mark as legacy
              const { autoResolved, conflicts, preservedFields } =
                this.conflictResolver.detectConflicts(
                  'task',
                  'tasks',
                  existing.id as number,
                  localTask.external_id,
                  localTask.title,
                  existing,
                  localTask,
                  { courseName, courseId: localCourseId }
                );

              if (conflicts.length > 0) {
                // Don't emit sync-conflicts event - conflicts now go to Updates page
                for (const conflict of conflicts) {
                  const conflictData = { ...localTask, id: existing.id };
                  this.pendingConflictData.set(conflict.id, {
                    tableName: 'tasks',
                    data: conflictData,
                  });
                  this.persistConflictData(conflict.id, 'tasks', conflictData);

                  // Record conflict to sync_updates for notification system
                  this.recordSyncUpdate({
                    syncSessionId: syncId,
                    courseId: localCourseId,
                    entityType: 'conflict',
                    entityId: existing.id as number,
                    externalId: conflict.id,
                    changeType: 'conflict',
                    title: conflict.entityName,
                    subtitle: `${conflict.fieldLabel}: local vs Canvas`,
                    oldValue: JSON.stringify(conflict.localValue),
                    newValue: JSON.stringify(conflict.canvasValue),
                    conflictField: conflict.field,
                    isActionRequired: true,
                  });
                  updateCounts.conflicts = (updateCounts.conflicts || 0) + 1;
                }
              }

              const finalData: Record<string, unknown> = { ...localTask };
              for (const [field, value] of Object.entries(autoResolved)) {
                finalData[field] = value;
              }
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

              // Link task to its assignment group
              if (assignment.assignment_group_id && groupIdLookup.has(localCourseId)) {
                const courseGroups = groupIdLookup.get(localCourseId)!;
                const localGroupId = courseGroups.get(assignment.assignment_group_id);
                if (localGroupId) {
                  finalData.assignment_group_id = localGroupId;
                }
              }

              // Mark as legacy if not already accepted
              if (!existing.acceptance_method) {
                finalData.acceptance_method = 'legacy';
              }

              this.db.upsert('tasks', finalData, 'external_id', true, preservedFields);
              counts.tasks++;

              // Auto-link check for legacy tasks
              const canvasTaskId = this.db.executeReadOne<{ id: number }>(
                'SELECT id FROM tasks WHERE external_id = ?',
                [localTask.external_id]
              )?.id;

              if (canvasTaskId) {
                this.checkForUserTaskLinks(
                  canvasTaskId,
                  localTask.title,
                  localTask.due_at as string | null,
                  localCourseId
                );
              }
              continue;
            }

            // === DECISION 4: New task - add to queue for user review ===
            const queueData = mapAssignmentToQueueEntry(
              assignment,
              localCourseId,
              null, // matchedUserTaskId - could add fuzzy matching later
              null // matchConfidence
            );

            if (queueEntry) {
              // Update existing pending queue entry
              this.db.executeWrite(
                `UPDATE canvas_task_queue SET
                  canvas_data = ?,
                  title = ?,
                  description = ?,
                  due_at = ?,
                  points_possible = ?,
                  task_type = ?,
                  last_synced_at = CURRENT_TIMESTAMP,
                  updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
                [
                  queueData.canvas_data,
                  queueData.title,
                  queueData.description,
                  queueData.due_at,
                  queueData.points_possible,
                  queueData.task_type,
                  queueEntry.id,
                ],
                'canvas_task_queue'
              );
            } else {
              // Insert new queue entry
              this.db.upsert('canvas_task_queue', queueData, 'external_id', true);
              queuedTaskCount++;

              // Get the queue entry ID for recording sync update
              const newQueueEntry = this.db.executeReadOne<{ id: number }>(
                'SELECT id FROM canvas_task_queue WHERE external_id = ?',
                [externalId]
              );
              if (newQueueEntry) {
                // Record sync update for new queued task (action required - needs accept/dismiss)
                this.recordSyncUpdate({
                  syncSessionId: syncId,
                  courseId: localCourseId,
                  entityType: 'task',
                  entityId: newQueueEntry.id,
                  externalId: externalId,
                  changeType: 'new',
                  title: queueData.title || 'New Task',
                  subtitle: queueData.due_at
                    ? `Due: ${new Date(queueData.due_at).toLocaleDateString()}`
                    : 'Needs review',
                  isActionRequired: true, // Queued tasks need accept/dismiss
                });
                updateCounts.newTasks++;
              }
            }

            counts.tasks++;
          } catch (error) {
            errors.push(
              `Task ${assignment.id}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      }

      // Log queued task count for debugging
      if (queuedTaskCount > 0) {
        this.log?.info(`Queued ${queuedTaskCount} new Canvas tasks for user review`);
      }

      // Commit announcements
      for (const [canvasCourseId, announcements] of fetched.announcements) {
        const localCourseId = courseLookup.get(canvasCourseId);
        if (!localCourseId) continue;

        for (const announcement of announcements) {
          try {
            // Check if announcement already exists
            const existingAnn = this.db.executeReadOne<{ id: number }>(
              `SELECT id FROM notifications WHERE source_type = 'announcement' AND source_id = ?`,
              [String(announcement.id)]
            );

            const mapped = mapAnnouncement(
              announcement,
              localCourseId,
              baseUrl,
              String(canvasCourseId)
            );
            this.db.upsert(
              'notifications',
              mapped.notification,
              ['source_type', 'source_id'],
              false
            );

            // Record sync update for new announcements only
            if (!existingAnn) {
              const insertedAnn = this.db.executeReadOne<{ id: number }>(
                `SELECT id FROM notifications WHERE source_type = 'announcement' AND source_id = ?`,
                [String(announcement.id)]
              );
              if (insertedAnn) {
                this.recordSyncUpdate({
                  syncSessionId: syncId,
                  courseId: localCourseId,
                  entityType: 'announcement',
                  entityId: insertedAnn.id,
                  externalId: String(announcement.id),
                  changeType: 'new',
                  title: announcement.title || 'New Announcement',
                  subtitle: announcement.posted_at
                    ? `Posted: ${new Date(announcement.posted_at).toLocaleDateString()}`
                    : undefined,
                });
                updateCounts.newAnnouncements++;
              }
            }

            counts.announcements++;
          } catch (error) {
            errors.push(
              `Announcement ${announcement.id}: ${error instanceof Error ? error.message : String(error)}`
            );
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
            errors.push(
              `Module ${module.id}: ${error instanceof Error ? error.message : String(error)}`
            );
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
            errors.push(
              `Page ${page.url}: ${error instanceof Error ? error.message : String(error)}`
            );
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
            errors.push(
              `Folder ${folder.name}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      }

      // Commit files (sync_updates for files recorded later via recordFileUpdates)
      for (const [canvasCourseId, files] of fetched.files) {
        const localCourseId = courseLookup.get(canvasCourseId);
        if (!localCourseId) continue;

        // Build folder path map
        const folderPathMap = new Map<number, string>();
        const dbFolders = this.db.executeRead<{
          external_id: string;
          folder_path: string | null;
        }>(
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
            this.db.upsert(
              'resources',
              localFile as Record<string, unknown>,
              'external_id',
              true
            );
            counts.files++;
          } catch (error) {
            errors.push(
              `File ${file.display_name}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      }
    });

    // Complete sync session with counts
    this.completeSyncSession(syncId, updateCounts);

    // Emit sync-updates event for the renderer to refresh
    // NOTE: File updates are tracked separately via recordFileUpdates() after all file processing
    const totalUpdates =
      updateCounts.newTasks +
      updateCounts.updatedTasks +
      updateCounts.newAnnouncements +
      updateCounts.gradeChanges;

    // Debug logging
    this.log?.info(
      `[SyncOrchestrator] Sync update counts: newTasks=${updateCounts.newTasks}, newAnnouncements=${updateCounts.newAnnouncements}, gradeChanges=${updateCounts.gradeChanges}, total=${totalUpdates} (files tracked separately)`
    );

    if (totalUpdates > 0) {
      this.log?.info(
        `[SyncOrchestrator] Emitting sync-updates event with total: ${totalUpdates}`
      );
      this.emitter.emit('sync-updates', {
        total: totalUpdates,
        ...updateCounts,
      });
    } else {
      this.log?.info('[SyncOrchestrator] No sync updates to emit (total=0)');
    }

    this.emitter.emit('sync-phase', { phase: 'commit', status: 'complete' });

    return { counts, errors };
  }

  private async commitEarlyMetadata(courses: CanvasCourse[]): Promise<void> {
    const baseUrl = this.client.getBaseUrl();
    const defaultTargetGrade = this.getDefaultTargetGrade();

    // Extract and write enrollment terms
    const termsMap = new Map<
      number,
      { id: number; name: string; start_at: string | null; end_at: string | null }
    >();
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
    const preservedFields = [
      'target_grade',
      'target_grade_source',
      'is_hidden',
      'archived_at',
      'color',
      'nickname',
      'credits',
    ];
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
          if (
            course.term &&
            course.term.end_at &&
            course.term.name !== 'Default Term' &&
            course.term.id !== 1
          ) {
            const endDate = new Date(course.term.end_at);
            const adjustedEndDate = new Date(
              endDate.getTime() - DAYS_BUFFER * 24 * 60 * 60 * 1000
            );
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

    // Assignment Groups (fetch BEFORE tasks so we can link them)
    fetchPromises.push(
      this.rateLimiter
        .enqueue(
          () =>
            this.client.getAll<CanvasAssignmentGroup>(
              `/courses/${canvasCourseId}/assignment_groups`
            ),
          4
        )
        .then((data) => {
          fetched.assignmentGroups.set(canvasCourseId, data);
        })
    );

    // Tasks
    fetchPromises.push(
      this.rateLimiter
        .enqueue(
          () =>
            this.client.getAll<CanvasAssignment>(
              `/courses/${canvasCourseId}/assignments`,
              {
                order_by: 'due_at',
                'include[]': 'submission',
              }
            ),
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
        const result = await this.backoffManager.fetchWithBackoff(
          endpoint,
          canvasCourseId,
          () =>
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
        const result = await this.backoffManager.fetchWithBackoff(
          endpoint,
          canvasCourseId,
          () =>
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
            fetched.pages.set(
              canvasCourseId,
              frontPageResponse.data ? [frontPageResponse.data] : []
            );
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
              this.client.getAll<CanvasAnnouncement>(
                `/courses/${canvasCourseId}/discussion_topics`,
                {
                  only_announcements: true,
                }
              ),
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
          const result = await this.backoffManager.fetchWithBackoff(
            endpoint,
            canvasCourseId,
            () =>
              this.rateLimiter.enqueue(
                () => this.client.getAll<CanvasFolder>(endpoint),
                2
              )
          );
          fetched.folders.set(canvasCourseId, result.data || []);
        })()
      );

      fetchPromises.push(
        (async () => {
          const endpoint = `/courses/${canvasCourseId}/files`;
          const result = await this.backoffManager.fetchWithBackoff(
            endpoint,
            canvasCourseId,
            () =>
              this.rateLimiter.enqueue(() => this.client.getAll<CanvasFile>(endpoint), 2)
          );
          const fileCount = result.data?.length ?? 0;
          this.log?.info(
            `[SyncOrchestrator] Fetch files for course ${canvasCourseId}: ${fileCount} files, skipped=${result.skipped}, error=${result.error || 'none'}`
          );
          fetched.files.set(canvasCourseId, result.data || []);
        })()
      );
    }

    const results = await Promise.allSettled(fetchPromises);

    for (const result of results) {
      if (result.status === 'rejected') {
        const reason =
          result.reason instanceof Error ? result.reason.message : String(result.reason);
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

  /**
   * Check for user tasks that might match this Canvas task
   * Auto-links high confidence matches, queues medium confidence for review
   */
  private checkForUserTaskLinks(
    canvasTaskId: number,
    canvasTitle: string,
    canvasDueAt: string | null,
    courseId: number
  ): void {
    // Get user tasks in same course that haven't been linked or graded yet
    const userTasks = this.db.executeRead<{
      id: number;
      title: string;
      external_id: string;
      due_at: string | null;
      weight: number | null;
      notes: string | null;
      user_expected_grade: number | null;
    }>(
      `SELECT id, title, external_id, due_at, weight, notes, user_expected_grade
       FROM tasks
       WHERE course_id = ?
         AND source_type = 'user'
         AND deleted_at IS NULL
         AND merged_into_task_id IS NULL
         AND (grade IS NULL OR grade = 0)`,
      [courseId]
    );

    if (userTasks.length === 0) return;

    const canvasTask = {
      id: canvasTaskId,
      title: canvasTitle,
      courseId,
      dueAt: canvasDueAt,
      sourceType: 'canvas' as const,
    };

    for (const userTaskRow of userTasks) {
      const userTask = {
        id: userTaskRow.id,
        title: userTaskRow.title,
        courseId,
        dueAt: userTaskRow.due_at,
        sourceType: 'user' as const,
      };

      const match = findMatchingCanvasTask(userTask, [canvasTask]);

      if (match.confidence >= LINK_THRESHOLDS.autoLink) {
        // High confidence: auto-link
        this.autoLinkTasks(userTaskRow, canvasTaskId, match.confidence);
        this.log?.info(
          `Auto-linked user task "${userTask.title}" to Canvas task "${canvasTitle}" (confidence: ${match.confidence.toFixed(2)})`
        );
      } else if (match.confidence >= LINK_THRESHOLDS.suggestLink) {
        // Medium confidence: queue for user review
        this.queueLinkSuggestion(userTaskRow.id, canvasTaskId, match.confidence);
        this.log?.info(
          `Queued link suggestion: "${userTask.title}" → "${canvasTitle}" (confidence: ${match.confidence.toFixed(2)})`
        );
      }
    }
  }

  /**
   * Auto-link a user task to a Canvas task
   */
  private autoLinkTasks(
    userTask: {
      id: number;
      external_id: string;
      weight: number | null;
      notes: string | null;
      user_expected_grade: number | null;
    },
    canvasTaskId: number,
    confidence: number
  ): void {
    const now = new Date().toISOString();

    // Update Canvas task to record the link and preserve user's custom fields
    this.db.executeWrite(
      `UPDATE tasks SET
        linked_from_user_task = ?,
        link_confidence = ?,
        link_method = 'auto',
        weight = COALESCE(?, weight),
        notes = COALESCE(?, notes),
        user_expected_grade = COALESCE(?, user_expected_grade)
      WHERE id = ?`,
      [
        userTask.external_id,
        confidence,
        userTask.weight,
        userTask.notes,
        userTask.user_expected_grade,
        canvasTaskId,
      ],
      'tasks'
    );

    // Soft-delete the user task and record merge target
    this.db.executeWrite(
      `UPDATE tasks SET deleted_at = ?, merged_into_task_id = ? WHERE id = ?`,
      [now, canvasTaskId, userTask.id],
      'tasks'
    );
  }

  /**
   * Queue a link suggestion for user review
   */
  private queueLinkSuggestion(
    userTaskId: number,
    canvasTaskId: number,
    confidence: number
  ): void {
    // Check if suggestion already exists
    const existing = this.db.executeReadOne<{ id: number }>(
      'SELECT id FROM link_suggestions WHERE user_task_id = ? AND canvas_task_id = ?',
      [userTaskId, canvasTaskId]
    );

    if (existing) {
      // Update confidence if higher
      this.db.executeWrite(
        'UPDATE link_suggestions SET confidence = MAX(confidence, ?) WHERE user_task_id = ? AND canvas_task_id = ?',
        [confidence, userTaskId, canvasTaskId],
        'link_suggestions'
      );
    } else {
      // Create new suggestion
      this.db.executeWrite(
        `INSERT INTO link_suggestions (user_task_id, canvas_task_id, confidence, status, created_at)
         VALUES (?, ?, ?, 'pending', datetime('now'))`,
        [userTaskId, canvasTaskId, confidence],
        'link_suggestions'
      );
    }
  }

  // ============ Sync Update Recording ============

  /**
   * Create a sync session for tracking updates
   */
  createSyncSession(syncId: string): void {
    try {
      this.db.executeWrite(
        `INSERT OR IGNORE INTO sync_sessions (id, started_at, created_at)
         VALUES (?, datetime('now'), datetime('now'))`,
        [syncId],
        'sync_sessions'
      );
    } catch (error) {
      this.log?.debug('Failed to create sync session', { error });
    }
  }

  /**
   * Complete a sync session with counts
   */
  completeSyncSession(
    syncId: string,
    counts: {
      newTasks: number;
      updatedTasks: number;
      newAnnouncements: number;
      gradeChanges: number;
      newFiles: number;
    }
  ): void {
    try {
      this.db.executeWrite(
        `UPDATE sync_sessions SET
           completed_at = datetime('now'),
           total_new_tasks = ?,
           total_updated_tasks = ?,
           total_new_announcements = ?,
           total_grade_changes = ?,
           total_new_files = ?
         WHERE id = ?`,
        [
          counts.newTasks,
          counts.updatedTasks,
          counts.newAnnouncements,
          counts.gradeChanges,
          counts.newFiles,
          syncId,
        ],
        'sync_sessions'
      );
    } catch (error) {
      this.log?.debug('Failed to complete sync session', { error });
    }
  }

  /**
   * Compare two ISO date strings as timestamps (1-minute tolerance)
   * to avoid false positives from format differences like milliseconds.
   */
  private datesEqual(a: string, b: string): boolean {
    try {
      const dateA = new Date(a);
      const dateB = new Date(b);
      if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
        return a.trim() === b.trim();
      }
      return Math.abs(dateA.getTime() - dateB.getTime()) < 60000;
    } catch {
      return a.trim() === b.trim();
    }
  }

  /**
   * Record a sync update (new item, update, grade change, etc.)
   */
  recordSyncUpdate(params: {
    syncSessionId: string;
    courseId: number;
    entityType: 'task' | 'announcement' | 'grade' | 'file' | 'page' | 'conflict';
    entityId: number;
    externalId?: string;
    changeType: 'new' | 'updated' | 'grade_changed' | 'conflict';
    title: string;
    subtitle?: string;
    oldValue?: string;
    newValue?: string;
    conflictField?: string;
    changedField?: string;
    isActionRequired?: boolean;
  }): void {
    try {
      // For conflicts, check if an unresolved conflict for same entity/field already exists
      if (params.entityType === 'conflict' && params.conflictField) {
        const existing = this.db.executeReadOne<{ id: number; new_value: string | null }>(
          `SELECT id, new_value FROM sync_updates
           WHERE entity_type = 'conflict'
           AND entity_id = ?
           AND conflict_field = ?
           AND resolved_at IS NULL`,
          [params.entityId, params.conflictField]
        );
        if (existing) {
          // Update existing conflict instead of creating duplicate
          // Set updated_at if the Canvas value (new_value) actually changed
          const canvasValueChanged = existing.new_value !== (params.newValue ?? null);
          this.db.executeWrite(
            `UPDATE sync_updates SET
               old_value = ?,
               new_value = ?,
               sync_session_id = ?${canvasValueChanged ? ", updated_at = datetime('now')" : ''}
             WHERE id = ?`,
            [
              params.oldValue ?? null,
              params.newValue ?? null,
              params.syncSessionId,
              existing.id,
            ],
            'sync_updates'
          );
          return;
        }
      }

      this.db.executeWrite(
        `INSERT INTO sync_updates (
           sync_session_id, course_id, entity_type, entity_id, external_id,
           change_type, title, subtitle, old_value, new_value, conflict_field,
           changed_field, is_action_required, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          params.syncSessionId,
          params.courseId,
          params.entityType,
          params.entityId,
          params.externalId ?? null,
          params.changeType,
          params.title,
          params.subtitle ?? null,
          params.oldValue ?? null,
          params.newValue ?? null,
          params.conflictField ?? null,
          params.changedField ?? null,
          params.isActionRequired ? 1 : 0,
        ],
        'sync_updates'
      );
    } catch (error) {
      this.log?.debug('Failed to record sync update', { error, params });
    }
  }

  /**
   * Snapshot current file and page state before sync for comparison later
   * Returns a map of external_id -> { id, remote_updated_at, course_id, title, type }
   */
  snapshotFileState(): Map<
    string,
    {
      id: number;
      remote_updated_at: string | null;
      course_id: number;
      title: string;
      type: 'file' | 'page';
    }
  > {
    const resources = this.db.executeRead<{
      id: number;
      external_id: string;
      remote_updated_at: string | null;
      course_id: number;
      title: string;
      type: string;
    }>(
      `SELECT id, external_id, remote_updated_at, course_id, title, type
       FROM resources WHERE type IN ('file', 'page')`
    );

    const snapshot = new Map<
      string,
      {
        id: number;
        remote_updated_at: string | null;
        course_id: number;
        title: string;
        type: 'file' | 'page';
      }
    >();
    for (const resource of resources) {
      snapshot.set(resource.external_id, {
        id: resource.id,
        remote_updated_at: resource.remote_updated_at,
        course_id: resource.course_id,
        title: resource.title,
        type: resource.type as 'file' | 'page',
      });
    }

    const fileCount = [...snapshot.values()].filter((r) => r.type === 'file').length;
    const pageCount = [...snapshot.values()].filter((r) => r.type === 'page').length;
    this.log?.info(
      `[SyncOrchestrator] Resource snapshot: ${fileCount} files, ${pageCount} pages`
    );
    return snapshot;
  }

  /**
   * Record file and page sync_updates by comparing current state with snapshot
   * Call this AFTER all file processing (commit, file refs, HTML sync) is complete
   */
  recordFileUpdates(
    syncSessionId: string,
    snapshot: Map<
      string,
      {
        id: number;
        remote_updated_at: string | null;
        course_id: number;
        title: string;
        type: 'file' | 'page';
      }
    >
  ): { newFiles: number; updatedFiles: number; newPages: number; updatedPages: number } {
    const counts = { newFiles: 0, updatedFiles: 0, newPages: 0, updatedPages: 0 };

    // Get current file and page state
    const currentResources = this.db.executeRead<{
      id: number;
      external_id: string;
      remote_updated_at: string | null;
      course_id: number;
      title: string;
      size_bytes: number | null;
      type: string;
    }>(
      `SELECT id, external_id, remote_updated_at, course_id, title, size_bytes, type
       FROM resources WHERE type IN ('file', 'page')`
    );

    for (const resource of currentResources) {
      const previous = snapshot.get(resource.external_id);
      const isFile = resource.type === 'file';
      const entityType = isFile ? 'file' : 'page';

      // Format size for subtitle (files only)
      const sizeStr =
        isFile && resource.size_bytes
          ? resource.size_bytes >= 1024 * 1024
            ? `${(resource.size_bytes / (1024 * 1024)).toFixed(1)} MB`
            : `${Math.round(resource.size_bytes / 1024)} KB`
          : undefined;

      if (!previous) {
        // New resource - didn't exist before sync
        this.recordSyncUpdate({
          syncSessionId,
          courseId: resource.course_id,
          entityType,
          entityId: resource.id,
          externalId: resource.external_id,
          changeType: 'new',
          title: resource.title || (isFile ? 'New File' : 'New Page'),
          subtitle: sizeStr,
        });
        if (isFile) {
          counts.newFiles++;
        } else {
          counts.newPages++;
        }
      } else if (
        resource.remote_updated_at &&
        previous.remote_updated_at &&
        resource.remote_updated_at !== previous.remote_updated_at
      ) {
        // Updated resource - remote_updated_at changed
        this.recordSyncUpdate({
          syncSessionId,
          courseId: resource.course_id,
          entityType,
          entityId: resource.id,
          externalId: resource.external_id,
          changeType: 'updated',
          title: resource.title || (isFile ? 'Updated File' : 'Updated Page'),
          subtitle: sizeStr,
          oldValue: previous.remote_updated_at,
          newValue: resource.remote_updated_at,
        });
        if (isFile) {
          counts.updatedFiles++;
        } else {
          counts.updatedPages++;
        }
      }
    }

    this.log?.info(
      `[SyncOrchestrator] Resource updates recorded: ${counts.newFiles} new files, ${counts.updatedFiles} updated files, ${counts.newPages} new pages, ${counts.updatedPages} updated pages`
    );
    return counts;
  }
}
