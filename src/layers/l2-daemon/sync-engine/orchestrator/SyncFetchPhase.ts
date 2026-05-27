/**
 * Sync Fetch Phase
 * Fetches all data from Canvas API during the fetch phase of sync.
 */

import type {
  CanvasCourse,
  CanvasAssignment,
  CanvasAnnouncement,
  CanvasModule,
  CanvasPage,
  CanvasFile,
  CanvasFolder,
} from '../../data/DataMappers';
import { mapCourse } from '../../data/DataMappers';
import type { SyncOptions, SyncCheckpoint } from '../SyncEngineTypes';
import type {
  OrchestratorContext,
  FetchedData,
  CanvasAssignmentGroup,
} from './OrchestratorTypes';
import { checkAborted } from './OrchestratorTypes';

/**
 * Execute the fetch phase - get all data from Canvas API.
 */
export async function executeFetchPhase(
  ctx: OrchestratorContext,
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

  ctx.emitter.emit('sync-phase', { phase: 'fetch', status: 'started' });

  // Fetch courses
  if (!checkpoint || fetched.courses.length === 0) {
    fetched.courses = await ctx.rateLimiter.enqueue(
      () =>
        ctx.client.getAll<CanvasCourse>('/courses', {
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
  await commitEarlyMetadata(ctx, fetched.courses);

  // Filter courses
  const visibleCoursesToSync = filterCourses(ctx, fetched.courses, termSelection);

  // Create checkpoint if needed
  if (!checkpoint) {
    ctx.checkpointManager.createCheckpoint(
      syncId,
      options || {},
      visibleCoursesToSync.length
    );
    ctx.checkpointManager.updateCheckpointCourses(syncId, fetched.courses);
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
        fetchCourseData(ctx, course, fetched, syncId, syncCanvasFiles, syncAnnouncements)
      )
    );

    for (const courseErrors of batchResults) {
      errors.push(...courseErrors);
    }

    completedCount += batch.length;
    ctx.emitter.emit('sync-progress', {
      syncId,
      phase: 'fetch',
      totalCourses: visibleCoursesToSync.length,
      completedCourses: completedCount,
    });
  }

  ctx.emitter.emit('sync-phase', { phase: 'fetch', status: 'complete' });
  checkAborted(ctx);

  return { fetched, visibleCoursesToSync, errors };
}

/**
 * Commit early metadata (enrollment terms + course rows) so that
 * VisibilityOracle can filter correctly before the full commit.
 */
async function commitEarlyMetadata(
  ctx: OrchestratorContext,
  courses: CanvasCourse[]
): Promise<void> {
  const baseUrl = ctx.client.getBaseUrl();
  const defaultTargetGrade = ctx.getDefaultTargetGrade();

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
    ctx.db.executeWrite(
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
    const existing = ctx.db.executeReadOne<Record<string, unknown>>(
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
      finalData.syllabus_hash = ctx.computeContentHash(finalData.syllabus_body);
    }

    ctx.db.upsert('courses', finalData, 'external_id', true, preservedFields);
  }

  // Invalidate cache
  if (ctx.visibilityOracle) {
    ctx.visibilityOracle.invalidateCache();
  }
}

/**
 * Filter courses by term selection and visibility.
 */
export function filterCourses(
  ctx: OrchestratorContext,
  courses: CanvasCourse[],
  termSelection: string
): CanvasCourse[] {
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
  if (ctx.visibilityOracle) {
    const visibleLocalIds = new Set(ctx.visibilityOracle.getVisibleCourseIds());
    const canvasToLocalId = new Map<number, number>();

    for (const course of coursesToSync) {
      const local = ctx.db.executeReadOne<{ id: number }>(
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

/**
 * Fetch all data for a single course from Canvas API.
 */
async function fetchCourseData(
  ctx: OrchestratorContext,
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
    ctx.rateLimiter
      .enqueue(
        () =>
          ctx.client.getAll<CanvasAssignmentGroup>(
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
    ctx.rateLimiter
      .enqueue(
        () =>
          ctx.client.getAll<CanvasAssignment>(`/courses/${canvasCourseId}/assignments`, {
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
      const result = await ctx.backoffManager.fetchWithBackoff(
        endpoint,
        canvasCourseId,
        () =>
          ctx.rateLimiter.enqueue(
            () => ctx.client.getAll<CanvasModule>(endpoint, { include: ['items'] }),
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
      const result = await ctx.backoffManager.fetchWithBackoff(
        endpoint,
        canvasCourseId,
        () =>
          ctx.rateLimiter.enqueue(
            () => ctx.client.getAll<CanvasPage>(endpoint, { 'include[]': 'body' }),
            2
          )
      );
      if (result.data && result.data.length > 0) {
        fetched.pages.set(canvasCourseId, result.data);
      } else {
        try {
          const frontPageResponse = await ctx.rateLimiter.enqueue(
            () => ctx.client.get<CanvasPage>(`/courses/${canvasCourseId}/front_page`),
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
      ctx.rateLimiter
        .enqueue(
          () =>
            ctx.client.getAll<CanvasAnnouncement>(
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
        const result = await ctx.backoffManager.fetchWithBackoff(
          endpoint,
          canvasCourseId,
          () =>
            ctx.rateLimiter.enqueue(() => ctx.client.getAll<CanvasFolder>(endpoint), 2)
        );
        fetched.folders.set(canvasCourseId, result.data || []);
      })()
    );

    fetchPromises.push(
      (async () => {
        const endpoint = `/courses/${canvasCourseId}/files`;
        const result = await ctx.backoffManager.fetchWithBackoff(
          endpoint,
          canvasCourseId,
          () => ctx.rateLimiter.enqueue(() => ctx.client.getAll<CanvasFile>(endpoint), 2)
        );
        const fileCount = result.data?.length ?? 0;
        ctx.log?.info(
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
  ctx.checkpointManager.updateCheckpointProgress(syncId, canvasCourseId, {
    tasks: fetched.tasks.get(canvasCourseId),
    announcements: fetched.announcements.get(canvasCourseId),
    modules: fetched.modules.get(canvasCourseId),
    pages: fetched.pages.get(canvasCourseId),
    folders: fetched.folders.get(canvasCourseId),
    files: fetched.files.get(canvasCourseId),
  });

  return errors;
}
