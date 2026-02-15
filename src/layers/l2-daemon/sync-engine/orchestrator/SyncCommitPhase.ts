/**
 * Sync Commit Phase
 * Writes all fetched Canvas data to the local database in a single transaction.
 */

import fs from 'fs';
import {
  mapCourse,
  mapAssignment,
  mapAnnouncement,
  mapModule,
  mapModuleItem,
  mapPage,
  mapFile,
  mapFolder,
  mapAssignmentToQueueEntry,
} from '../../data/DataMappers';
import type { OrchestratorContext, FetchedData } from './OrchestratorTypes';
import {
  createSyncSession,
  completeSyncSession,
  recordSyncUpdate,
} from './SyncUpdateRecorder';
import { checkForUserTaskLinks } from './SyncTaskLinker';

/**
 * Compare two ISO date strings as timestamps (1-minute tolerance)
 * to avoid false positives from format differences like milliseconds.
 */
function datesEqual(a: string, b: string): boolean {
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
 * Execute the commit phase - write all fetched data to database.
 */
export function executeCommitPhase(
  ctx: OrchestratorContext,
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

  ctx.emitter.emit('sync-phase', { phase: 'commit', status: 'started' });
  ctx.checkpointManager.markCheckpointCommitting(syncId);

  // Create sync session for tracking updates
  createSyncSession(ctx, syncId);

  const baseUrl = ctx.client.getBaseUrl();

  ctx.db.transaction(() => {
    // Commit courses
    const defaultTargetGrade = ctx.getDefaultTargetGrade();
    for (const course of fetched.courses) {
      try {
        const localCourse = mapCourse(course, baseUrl, defaultTargetGrade);
        const existing = ctx.db.executeReadOne<Record<string, unknown>>(
          'SELECT * FROM courses WHERE external_id = ?',
          [localCourse.external_id]
        );

        const { autoResolved, conflicts, preservedFields } =
          ctx.conflictResolver.detectConflicts(
            'course',
            'courses',
            (existing?.id as number) || 0,
            localCourse.external_id,
            localCourse.name,
            existing,
            localCourse
          );

        if (conflicts.length > 0) {
          for (const conflict of conflicts) {
            const conflictData = { ...localCourse, id: existing?.id };
            ctx.pendingConflictData.set(conflict.id, {
              tableName: 'courses',
              data: conflictData,
            });
            ctx.persistConflictData(conflict.id, 'courses', conflictData);

            const courseId = (existing?.id as number) || 0;
            recordSyncUpdate(ctx, {
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

        ctx.db.upsert('courses', finalData, 'external_id', true, preservedFields);
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
      const row = ctx.db.executeReadOne<{ id: number }>(
        'SELECT id FROM courses WHERE external_id = ?',
        [String(course.id)]
      );
      if (row) {
        courseLookup.set(course.id, row.id);
      }
    }

    // Commit assignment groups BEFORE tasks (so we can link tasks to groups)
    const groupIdLookup = new Map<number, Map<number, number>>();
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

          ctx.db.upsert(
            'canvas_assignment_groups',
            groupData,
            ['course_id', 'canvas_group_id'],
            false
          );

          const localGroup = ctx.db.executeReadOne<{ id: number }>(
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
    let queuedTaskCount = 0;
    for (const [canvasCourseId, tasks] of fetched.tasks) {
      const localCourseId = courseLookup.get(canvasCourseId);
      if (!localCourseId) continue;

      const courseRow = ctx.db.executeReadOne<{ name: string }>(
        'SELECT name FROM courses WHERE id = ?',
        [localCourseId]
      );
      const courseName = courseRow?.name;

      for (const assignment of tasks) {
        try {
          const externalId = String(assignment.id);
          const localTask = mapAssignment(assignment, localCourseId);

          // === DECISION 1: Already accepted task? ===
          const acceptedTask = ctx.db.executeReadOne<{
            id: number;
            acceptance_method: string | null;
          }>(
            `SELECT id, acceptance_method FROM tasks
             WHERE external_id = ? AND acceptance_method IS NOT NULL`,
            [externalId]
          );

          if (acceptedTask) {
            commitAcceptedTask(
              ctx,
              syncId,
              acceptedTask,
              localTask,
              externalId,
              localCourseId,
              updateCounts
            );
            counts.tasks++;
            continue;
          }

          // === DECISION 2: Rejected in queue? ===
          const queueEntry = ctx.db.executeReadOne<{
            id: number;
            status: string;
          }>('SELECT id, status FROM canvas_task_queue WHERE external_id = ?', [
            externalId,
          ]);

          if (queueEntry?.status === 'rejected') {
            ctx.db.executeWrite(
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
          const existing = ctx.db.executeReadOne<Record<string, unknown>>(
            'SELECT * FROM tasks WHERE external_id = ?',
            [externalId]
          );

          if (existing) {
            commitLegacyTask(
              ctx,
              syncId,
              existing,
              localTask,
              assignment,
              localCourseId,
              courseName,
              groupIdLookup,
              updateCounts
            );
            counts.tasks++;
            continue;
          }

          // === DECISION 4: New task - add to queue for user review ===
          const queueData = mapAssignmentToQueueEntry(
            assignment,
            localCourseId,
            null,
            null
          );

          if (queueEntry) {
            ctx.db.executeWrite(
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
            ctx.db.upsert('canvas_task_queue', queueData, 'external_id', true);
            queuedTaskCount++;

            const newQueueEntry = ctx.db.executeReadOne<{ id: number }>(
              'SELECT id FROM canvas_task_queue WHERE external_id = ?',
              [externalId]
            );
            if (newQueueEntry) {
              recordSyncUpdate(ctx, {
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
                isActionRequired: true,
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

    if (queuedTaskCount > 0) {
      ctx.log?.info(`Queued ${queuedTaskCount} new Canvas tasks for user review`);
    }

    // Commit announcements
    for (const [canvasCourseId, announcements] of fetched.announcements) {
      const localCourseId = courseLookup.get(canvasCourseId);
      if (!localCourseId) continue;

      for (const announcement of announcements) {
        try {
          const existingAnn = ctx.db.executeReadOne<{ id: number }>(
            `SELECT id FROM notifications WHERE source_type = 'announcement' AND source_id = ?`,
            [String(announcement.id)]
          );

          const mapped = mapAnnouncement(
            announcement,
            localCourseId,
            baseUrl,
            String(canvasCourseId)
          );
          ctx.db.upsert(
            'notifications',
            mapped.notification,
            ['source_type', 'source_id'],
            false
          );

          if (!existingAnn) {
            const insertedAnn = ctx.db.executeReadOne<{ id: number }>(
              `SELECT id FROM notifications WHERE source_type = 'announcement' AND source_id = ?`,
              [String(announcement.id)]
            );
            if (insertedAnn) {
              recordSyncUpdate(ctx, {
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
          ctx.db.upsert('modules', localModule);
          counts.modules++;

          const insertedModule = ctx.db.executeReadOne<{ id: number }>(
            'SELECT id FROM modules WHERE external_id = ?',
            [String(module.id)]
          );

          if (insertedModule && module.items) {
            for (const item of module.items) {
              const localItem = mapModuleItem(item, insertedModule.id);
              ctx.db.upsert('module_items', localItem);
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

          // Read existing hash before upsert for change detection
          const existingPage = ctx.db.executeReadOne<{
            content_hash: string | null;
          }>('SELECT content_hash FROM course_pages WHERE external_id = ?', [
            localPage.external_id,
          ]);

          ctx.db.upsert('course_pages', localPage);

          // Hash-based change detection for page content
          const newHash = ctx.computeContentHash(localPage.body_html as string | null);
          if (newHash) {
            const oldHash = existingPage?.content_hash ?? null;
            if (oldHash !== newHash) {
              // Content changed (or first sync) - update hash and dependencies
              ctx.updateContentHashAndDependencies(
                'page',
                localPage.external_id as string,
                localPage.body_html as string | null,
                localCourseId
              );

              // If content changed (not first sync), invalidate local HTML file
              if (oldHash !== null) {
                const slug = localPage.url_slug || localPage.external_id;
                ctx.db.executeWrite(
                  `UPDATE resources SET local_path = NULL
                   WHERE external_id = ? AND type = 'page'`,
                  [`html-page-${slug}`],
                  'resources'
                );
              }
            }
          }

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
          ctx.db.upsert('resources', localFolder as Record<string, unknown>);
          counts.folders++;
        } catch (error) {
          errors.push(
            `Folder ${folder.name}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }

    // Commit files
    for (const [canvasCourseId, files] of fetched.files) {
      const localCourseId = courseLookup.get(canvasCourseId);
      if (!localCourseId) continue;

      const folderPathMap = new Map<number, string>();
      const dbFolders = ctx.db.executeRead<{
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

          // Check if file was updated and has a local copy
          const existingFile = ctx.db.executeReadOne<{
            id: number;
            local_path: string | null;
            remote_updated_at: string | null;
          }>(
            'SELECT id, local_path, remote_updated_at FROM resources WHERE external_id = ?',
            [String(file.id)]
          );

          const newTimestamp = file.modified_at || file.updated_at;
          if (
            existingFile?.local_path &&
            existingFile.remote_updated_at &&
            newTimestamp &&
            existingFile.remote_updated_at !== newTimestamp
          ) {
            // File updated on Canvas - clear local_path and delete stale file
            ctx.db.executeWrite(
              'UPDATE resources SET local_path = NULL WHERE id = ?',
              [existingFile.id],
              'resources'
            );
            try {
              if (fs.existsSync(existingFile.local_path)) {
                fs.unlinkSync(existingFile.local_path);
              }
            } catch {
              // Best-effort deletion
            }
          }

          ctx.db.upsert(
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
  completeSyncSession(ctx, syncId, updateCounts);

  // Emit sync-updates event for the renderer to refresh
  const totalUpdates =
    updateCounts.newTasks +
    updateCounts.updatedTasks +
    updateCounts.newAnnouncements +
    updateCounts.gradeChanges;

  ctx.log?.info(
    `[SyncOrchestrator] Sync update counts: newTasks=${updateCounts.newTasks}, newAnnouncements=${updateCounts.newAnnouncements}, gradeChanges=${updateCounts.gradeChanges}, total=${totalUpdates} (files tracked separately)`
  );

  if (totalUpdates > 0) {
    ctx.log?.info(
      `[SyncOrchestrator] Emitting sync-updates event with total: ${totalUpdates}`
    );
    ctx.emitter.emit('sync-updates', {
      total: totalUpdates,
      ...updateCounts,
    });
  } else {
    ctx.log?.info('[SyncOrchestrator] No sync updates to emit (total=0)');
  }

  ctx.emitter.emit('sync-phase', { phase: 'commit', status: 'complete' });

  return { counts, errors };
}

// ============ Internal helpers for commit phase ============

/**
 * Handle committing an already-accepted task (update grades/status with conflict detection).
 */
function commitAcceptedTask(
  ctx: OrchestratorContext,
  syncId: string,
  acceptedTask: { id: number; acceptance_method: string | null },
  localTask: Record<string, unknown>,
  externalId: string,
  localCourseId: number,
  updateCounts: Record<string, number>
): void {
  const existingAccepted = ctx.db.executeReadOne<Record<string, unknown>>(
    'SELECT * FROM tasks WHERE id = ?',
    [acceptedTask.id]
  );

  if (existingAccepted) {
    const { autoResolved, conflicts, preservedFields } =
      ctx.conflictResolver.detectConflicts(
        'task',
        'tasks',
        acceptedTask.id,
        localTask.external_id as string,
        localTask.title as string,
        existingAccepted,
        localTask,
        { courseName: undefined, courseId: localCourseId }
      );

    if (conflicts.length > 0) {
      for (const conflict of conflicts) {
        const conflictData = { ...localTask, id: acceptedTask.id };
        ctx.pendingConflictData.set(conflict.id, {
          tableName: 'tasks',
          data: conflictData,
        });
        ctx.persistConflictData(conflict.id, 'tasks', conflictData);

        recordSyncUpdate(ctx, {
          syncSessionId: syncId,
          courseId: localCourseId,
          entityType: 'conflict',
          entityId: acceptedTask.id,
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

    const finalGrade = autoResolved.grade ?? localTask.grade;
    const finalSubmissionStatus =
      autoResolved.submission_status ?? localTask.submission_status;

    const oldGrade = existingAccepted.grade as string | null;
    const gradeChanged =
      oldGrade !== finalGrade && finalGrade !== null && finalGrade !== undefined;

    let finalIsCompleted = existingAccepted.is_completed;
    if (
      preservedFields.includes('is_completed') ||
      conflicts.some((c) => c.field === 'is_completed')
    ) {
      finalIsCompleted = existingAccepted.is_completed;
    } else if (autoResolved.is_completed !== undefined) {
      finalIsCompleted = autoResolved.is_completed;
    } else {
      finalIsCompleted = existingAccepted.is_completed === 1 ? 1 : localTask.is_completed;
    }

    ctx.db.executeWrite(
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

    if (gradeChanged) {
      const taskTitle =
        (existingAccepted.title as string) || (localTask.title as string) || 'Task';
      recordSyncUpdate(ctx, {
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

    // Record field changes
    recordFieldChanges(
      ctx,
      syncId,
      acceptedTask.id,
      externalId,
      localCourseId,
      existingAccepted,
      localTask,
      conflicts,
      preservedFields,
      updateCounts
    );
  } else {
    // Fallback if somehow we can't fetch the task
    ctx.db.executeWrite(
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
}

/**
 * Record informational field changes for tracked fields on an accepted task.
 */
function recordFieldChanges(
  ctx: OrchestratorContext,
  syncId: string,
  taskId: number,
  externalId: string,
  localCourseId: number,
  existingAccepted: Record<string, unknown>,
  localTask: Record<string, unknown>,
  conflicts: Array<{ field: string }>,
  preservedFields: string[],
  updateCounts: Record<string, number>
): void {
  const fieldsToTrack: Array<{
    field: string;
    localKey: string;
    canvasKey: string;
    label: string;
    isDate?: boolean;
  }> = [
    { field: 'title', localKey: 'title', canvasKey: 'title', label: 'Title' },
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
    { field: 'weight', localKey: 'weight', canvasKey: 'weight', label: 'Weight' },
  ];

  const conflictFields = new Set(conflicts.map((c) => c.field));
  const preservedSet = new Set(preservedFields);
  const taskTitleForUpdate =
    (existingAccepted.title as string) || (localTask.title as string) || 'Task';

  const existingFieldUpdates = ctx.db.executeRead<{
    changed_field: string;
    old_value: string | null;
    new_value: string | null;
  }>(
    `SELECT changed_field, old_value, new_value FROM sync_updates
     WHERE entity_id = ? AND entity_type = 'task'
     AND change_type = 'updated'`,
    [taskId]
  );
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

  for (const { field, localKey, canvasKey, label, isDate } of fieldsToTrack) {
    if (conflictFields.has(field) || preservedSet.has(field)) continue;

    const localValue = existingAccepted[localKey];
    const canvasValue = localTask[canvasKey as keyof typeof localTask];

    const localStr = localValue != null ? String(localValue) : null;
    const canvasStr = canvasValue != null ? String(canvasValue) : null;

    const valuesMatch =
      isDate && localStr && canvasStr
        ? datesEqual(localStr, canvasStr)
        : localStr === canvasStr;

    if (!valuesMatch) {
      const existing = existingFieldMap.get(field);
      if (existing && existing.oldValue === localStr && existing.newValue === canvasStr) {
        continue;
      }

      recordSyncUpdate(ctx, {
        syncSessionId: syncId,
        courseId: localCourseId,
        entityType: 'task',
        entityId: taskId,
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
}

/**
 * Handle committing a legacy (pre-queue) task with conflict detection.
 */
function commitLegacyTask(
  ctx: OrchestratorContext,
  syncId: string,
  existing: Record<string, unknown>,
  localTask: Record<string, unknown>,
  assignment: { id: number; assignment_group_id?: number },
  localCourseId: number,
  courseName: string | undefined,
  groupIdLookup: Map<number, Map<number, number>>,
  updateCounts: Record<string, number>
): void {
  const { autoResolved, conflicts, preservedFields } =
    ctx.conflictResolver.detectConflicts(
      'task',
      'tasks',
      existing.id as number,
      localTask.external_id as string,
      localTask.title as string,
      existing,
      localTask,
      { courseName, courseId: localCourseId }
    );

  if (conflicts.length > 0) {
    for (const conflict of conflicts) {
      const conflictData = { ...localTask, id: existing.id };
      ctx.pendingConflictData.set(conflict.id, {
        tableName: 'tasks',
        data: conflictData,
      });
      ctx.persistConflictData(conflict.id, 'tasks', conflictData);

      recordSyncUpdate(ctx, {
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

  ctx.db.upsert('tasks', finalData, 'external_id', true, preservedFields);

  // Auto-link check for legacy tasks
  const canvasTaskId = ctx.db.executeReadOne<{ id: number }>(
    'SELECT id FROM tasks WHERE external_id = ?',
    [localTask.external_id]
  )?.id;

  if (canvasTaskId) {
    checkForUserTaskLinks(
      ctx,
      canvasTaskId,
      localTask.title as string,
      localTask.due_at as string | null,
      localCourseId
    );
  }
}
