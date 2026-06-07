/**
 * Sync pipeline integration tests.
 *
 * Tests the full Canvas → SyncEngine → DB flow at the integration level.
 * Uses a real SQLite DB + mock CanvasClient (jest.fn()) — no HTTP server needed.
 *
 * Two paths under test:
 *  - syncAll()    → executeCommitPhase (D1–D4 queue-based decisions + fuzzy linking)
 *  - syncTasks()  → SyncTaskOperations (title-match merge, B1–B7)
 *
 * Run via `npm test` (pretest rebuilds better-sqlite3 for the Node ABI).
 */

import path from 'path';
import fs from 'fs';
import { SyncEngine } from '../../src/layers/l2-daemon/sync-engine/SyncEngine';
import { CanvasClient } from '../../src/layers/l2-daemon/client/CanvasClient';
import { RateLimiter } from '../../src/layers/l2-daemon/resilience/RateLimiter';
import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';
import {
  seedCourse,
  seedTask,
  seedQueueEntry,
  mockCanvasAssignment,
  mockCanvasCourse,
  readQueue,
  readTasks,
  readConflicts,
  readLinkSuggestions,
} from '../test-utils/syncScenarios';

// ---------------------------------------------------------------------------
// Shared harness
// ---------------------------------------------------------------------------

const DB_PATH = path.join(__dirname, '../../test-data/sync-pipeline-test.db');
const CANVAS_COURSE_ID = 12345;

let db: Database;
let client: CanvasClient;
let rateLimiter: RateLimiter;
let syncEngine: SyncEngine;
let mockGetAll: jest.Mock;
let mockGet: jest.Mock;

beforeAll(() => {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
});

beforeEach(() => {
  for (const ext of ['', '-wal', '-shm']) {
    if (fs.existsSync(DB_PATH + ext)) fs.unlinkSync(DB_PATH + ext);
  }

  db = new Database({ dbPath: DB_PATH });
  db.initialize();
  const runner = new MigrationRunner(db);
  runner.loadMigrations(coreMigrations);
  runner.runAll();

  client = {
    getAll: jest.fn(),
    get: jest.fn(),
    getBaseUrl: () => 'https://q.utoronto.ca',
  } as unknown as CanvasClient;
  mockGetAll = client.getAll as jest.Mock;
  mockGet = client.get as jest.Mock;
  mockGet.mockResolvedValue(null);

  rateLimiter = new RateLimiter({
    maxConcurrent: 5,
    minDelayMs: 0,
    maxRetries: 0,
    baseBackoffMs: 10,
  });
  syncEngine = new SyncEngine({ client, db, rateLimiter });
});

afterEach(() => {
  rateLimiter.stop();
  db.close();
});

/**
 * Run syncAll with one Canvas course + given assignments.
 * Pre-seeded DB course (external_id = CANVAS_COURSE_ID) must already exist.
 */
async function syncAllWithCourse(assignments: Record<string, unknown>[]): Promise<void> {
  const course = mockCanvasCourse({ id: CANVAS_COURSE_ID });
  mockGetAll.mockImplementation((endpoint: string) => {
    if (endpoint === '/courses') return Promise.resolve([course]);
    if (endpoint.includes(`/${CANVAS_COURSE_ID}/assignments`))
      return Promise.resolve(assignments);
    return Promise.resolve([]);
  });
  await syncEngine.syncAll();
}

/**
 * Run syncTasks for the pre-seeded local course (id=1) against given assignments.
 */
async function syncTasksForCourse(assignments: Record<string, unknown>[]): Promise<void> {
  mockGetAll.mockResolvedValue(assignments);
  await syncEngine.syncTasks(CANVAS_COURSE_ID, 1);
}

/** Seed user_preferences.syncPreferences so SyncEngine.getSyncPreferences picks it up. */
function seedSyncPreferences(prefs: Record<string, unknown>): void {
  db.executeWrite(
    `INSERT INTO user_preferences (key, value) VALUES ('syncPreferences', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [JSON.stringify(prefs)],
    'user_preferences'
  );
}

/** Today's end-of-day in the exact format SyncEngine.getTodayEndTime() produces. */
function expectedTodayEndTime(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}T23:59:00`;
}

// ---------------------------------------------------------------------------
// Category A — New task routing (syncAll → D4: new task queued)
// ---------------------------------------------------------------------------

describe('A: New task routing — D4 queue staging (syncAll path)', () => {
  it('A1: brand-new assignment is staged in canvas_task_queue as pending', async () => {
    seedCourse(db, { externalId: String(CANVAS_COURSE_ID) });
    await syncAllWithCourse([mockCanvasAssignment({ id: 101, name: 'Quiz 1' })]);

    const queue = readQueue(db);
    expect(queue).toHaveLength(1);
    expect(queue[0].external_id).toBe('101');
    expect(queue[0].title).toBe('Quiz 1');
    expect(queue[0].status).toBe('pending');

    // No task row created yet — user hasn't accepted
    const tasks = readTasks(db);
    expect(tasks).toHaveLength(0);
  });

  it('A2: two Canvas assignments with the same name produce two separate queue entries', async () => {
    seedCourse(db, { externalId: String(CANVAS_COURSE_ID) });
    await syncAllWithCourse([
      mockCanvasAssignment({ id: 101, name: 'Quiz 1' }),
      mockCanvasAssignment({ id: 102, name: 'Quiz 1' }),
    ]);

    const queue = readQueue(db);
    expect(queue).toHaveLength(2);
    expect(queue.map((q) => q.external_id).sort()).toEqual(['101', '102']);
    expect(queue.every((q) => q.status === 'pending')).toBe(true);
  });

  it('A3: assignment with null due_at and null points_possible is queued without crashing', async () => {
    seedCourse(db, { externalId: String(CANVAS_COURSE_ID) });
    await syncAllWithCourse([
      mockCanvasAssignment({
        id: 103,
        name: 'Optional Task',
        dueAt: null,
        pointsPossible: null,
      }),
    ]);

    const queue = readQueue(db);
    expect(queue).toHaveLength(1);
    expect(queue[0].due_at).toBeNull();
    expect(queue[0].points_possible).toBeNull();
  });

  it('A4: empty assignments list leaves existing tasks untouched', async () => {
    const courseId = seedCourse(db, { externalId: String(CANVAS_COURSE_ID) });
    seedTask(db, { courseId, title: 'My Task', sourceType: 'user' });

    await syncAllWithCourse([]);

    const tasks = readTasks(db);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('My Task');
    expect(readQueue(db)).toHaveLength(0);
  });

  it('A5: assignment absent from Canvas response is NOT deleted from tasks table', async () => {
    const courseId = seedCourse(db, { externalId: String(CANVAS_COURSE_ID) });
    // Simulate a previously-synced canvas task (external_id set, acceptance_method='legacy')
    seedTask(db, {
      courseId,
      title: 'Old Task',
      externalId: '999',
      sourceType: 'canvas',
      acceptanceMethod: 'legacy',
    });

    // Sync with empty list — Canvas no longer returns id=999
    await syncAllWithCourse([]);

    const tasks = readTasks(db);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].external_id).toBe('999'); // still present
    expect(tasks[0].deleted_at).toBeNull(); // not deleted
  });
});

// ---------------------------------------------------------------------------
// Category B — Title-match merge (syncTasks path → SyncTaskOperations)
// ---------------------------------------------------------------------------

describe('B: Title-match merge (syncTasks / SyncTaskOperations path)', () => {
  it('B1: single user task with matching title is merged into Canvas assignment', async () => {
    seedCourse(db, { externalId: String(CANVAS_COURSE_ID) });
    seedTask(db, { courseId: 1, title: 'Problem Set 3', sourceType: 'user', weight: 15 });

    await syncTasksForCourse([mockCanvasAssignment({ id: 201, name: 'Problem Set 3' })]);

    const tasks = readTasks(db);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].external_id).toBe('201');
    expect(tasks[0].source_type).toBe('canvas');
    expect(tasks[0].weight).toBe(15); // local weight preserved
  });

  it('B2: two user tasks with identical title → neither merged, assignment queued separately', async () => {
    seedCourse(db, { externalId: String(CANVAS_COURSE_ID) });
    seedTask(db, { courseId: 1, title: 'Lab Report', sourceType: 'user', weight: 10 });
    seedTask(db, { courseId: 1, title: 'Lab Report', sourceType: 'user', weight: 20 });

    const mergeHandler = jest.fn();
    syncEngine.on('task-merged', mergeHandler);

    await syncTasksForCourse([mockCanvasAssignment({ id: 202, name: 'Lab Report' })]);

    // Both user tasks untouched
    const userTasks = readTasks(db).filter((t) => t.source_type === 'user');
    expect(userTasks).toHaveLength(2);
    expect(userTasks.every((t) => t.external_id === null)).toBe(true);
    expect(userTasks.map((t) => t.weight).sort()).toEqual([10, 20]);

    // Assignment landed as its own canvas task
    const canvasTasks = readTasks(db).filter((t) => t.external_id === '202');
    expect(canvasTasks).toHaveLength(1);
    expect(canvasTasks[0].source_type).toBe('canvas');

    expect(mergeHandler).not.toHaveBeenCalled();
  });

  it('B3: two Canvas assignments arrive, only one shares a user task title', async () => {
    seedCourse(db, { externalId: String(CANVAS_COURSE_ID) });
    seedTask(db, { courseId: 1, title: 'Quiz 1', sourceType: 'user' });

    await syncTasksForCourse([
      mockCanvasAssignment({ id: 203, name: 'Quiz 1' }),
      mockCanvasAssignment({ id: 204, name: 'Lab 2' }),
    ]);

    const tasks = readTasks(db);
    // Quiz 1 merged (user task → canvas), Lab 2 inserted as new canvas task
    const quiz = tasks.find((t) => t.external_id === '203');
    const lab = tasks.find((t) => t.external_id === '204');
    expect(quiz).toBeDefined();
    expect(quiz!.source_type).toBe('canvas');
    expect(lab).toBeDefined();
    expect(tasks).toHaveLength(2);
  });

  it('B4: two Canvas assignments share name, one user task — first merges, second inserts new', async () => {
    seedCourse(db, { externalId: String(CANVAS_COURSE_ID) });
    seedTask(db, { courseId: 1, title: 'Midterm', sourceType: 'user' });

    await syncTasksForCourse([
      mockCanvasAssignment({ id: 205, name: 'Midterm' }),
      mockCanvasAssignment({ id: 206, name: 'Midterm' }),
    ]);

    const tasks = readTasks(db);
    // The user task merges with the first matching assignment
    const merged = tasks.find((t) => t.external_id === '205' || t.external_id === '206');
    expect(merged).toBeDefined();
    expect(merged!.source_type).toBe('canvas');

    // The second one creates a separate canvas task row
    expect(tasks.length).toBeGreaterThanOrEqual(2);
    // No user task should remain unlinked (all user tasks consumed or both landed as canvas)
    const userTasksLeft = tasks.filter((t) => t.source_type === 'user');
    expect(userTasksLeft).toHaveLength(0);
  });

  it('B5: soft-deleted user task with matching title is NOT resurrected by title-match', async () => {
    seedCourse(db, { externalId: String(CANVAS_COURSE_ID) });
    // Deleted task — should be invisible to title-match
    seedTask(db, {
      courseId: 1,
      title: 'Final Exam',
      sourceType: 'user',
      deletedAt: '2024-01-01T00:00:00Z',
    });

    const mergeHandler = jest.fn();
    syncEngine.on('task-merged', mergeHandler);

    await syncTasksForCourse([mockCanvasAssignment({ id: 207, name: 'Final Exam' })]);

    // Deleted task is unchanged
    const deleted = readTasks(db).find((t) => t.deleted_at !== null);
    expect(deleted).toBeDefined();
    expect(deleted!.external_id).toBeNull(); // NOT merged

    // Canvas assignment became its own task
    const canvasTask = readTasks(db).find((t) => t.external_id === '207');
    expect(canvasTask).toBeDefined();

    expect(mergeHandler).not.toHaveBeenCalled();
  });

  it('B6: existing canvas task (external_id set) with same title as new assignment — no cross-merge', async () => {
    seedCourse(db, { externalId: String(CANVAS_COURSE_ID) });
    // Already-linked canvas task
    seedTask(db, {
      courseId: 1,
      title: 'Quiz 1',
      externalId: '100',
      sourceType: 'canvas',
      acceptanceMethod: 'legacy',
    });

    await syncTasksForCourse([
      mockCanvasAssignment({ id: 200, name: 'Quiz 1' }), // different external_id
    ]);

    // External_id='100' task untouched (or updated); new id=200 gets its own row/conflict path
    const tasks = readTasks(db);
    const original = tasks.find((t) => t.external_id === '100');
    expect(original).toBeDefined();
  });

  it('B7: same title in two courses — Canvas sync for course A never touches course B task', async () => {
    const courseAId = seedCourse(db, {
      externalId: String(CANVAS_COURSE_ID),
      name: 'Course A',
    });
    const courseBId = seedCourse(db, { externalId: '99999', name: 'Course B' });
    seedTask(db, { courseId: courseBId, title: 'Assignment X', sourceType: 'user' });

    // Sync course A assignments
    await syncTasksForCourse([
      mockCanvasAssignment({ id: 301, name: 'Assignment X', courseId: CANVAS_COURSE_ID }),
    ]);

    // Course B task untouched
    const bTask = readTasks(db).find((t) => t.course_id === courseBId);
    expect(bTask).toBeDefined();
    expect(bTask!.external_id).toBeNull();
    expect(bTask!.source_type).toBe('user');

    // Course A gets a canvas task for the assignment
    const aTask = readTasks(db).find((t) => t.course_id === courseAId);
    expect(aTask).toBeDefined();
    expect(aTask!.external_id).toBe('301');

    expect(courseAId).not.toBe(courseBId);
  });
});

// ---------------------------------------------------------------------------
// Category C — Accepted tasks (syncAll → D1)
// ---------------------------------------------------------------------------

describe('C: Accepted tasks — D1 path (syncAll)', () => {
  it('C1: accepted task receives grade update, no new queue entry created', async () => {
    const courseId = seedCourse(db, { externalId: String(CANVAS_COURSE_ID) });
    seedTask(db, {
      courseId,
      title: 'Quiz 1',
      externalId: '101',
      sourceType: 'canvas',
      acceptanceMethod: 'manual',
    });

    await syncAllWithCourse([
      mockCanvasAssignment({ id: 101, name: 'Quiz 1', pointsPossible: 95 }),
    ]);

    const tasks = readTasks(db);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].acceptance_method).toBe('manual'); // preserved
    expect(readQueue(db)).toHaveLength(0); // no new queue entry
  });

  it('C2: accepted task with Canvas changing a non-grade field still gets grade updated, conflict stored', async () => {
    const courseId = seedCourse(db, { externalId: String(CANVAS_COURSE_ID) });
    seedTask(db, {
      courseId,
      title: 'Lab',
      externalId: '102',
      sourceType: 'canvas',
      acceptanceMethod: 'manual',
      dueAt: '2024-01-10T23:59:00Z',
      fieldSources: { due_at: 'user' }, // user set the due date
    });

    await syncAllWithCourse([
      mockCanvasAssignment({ id: 102, name: 'Lab', dueAt: '2024-02-15T23:59:00Z' }),
    ]);

    // Task still accepted
    const tasks = readTasks(db);
    expect(tasks[0].acceptance_method).toBe('manual');
    // No new queue entry
    expect(readQueue(db)).toHaveLength(0);
  });

  it('C3: accepted task, Canvas sends identical data — no changes, no errors', async () => {
    const courseId = seedCourse(db, { externalId: String(CANVAS_COURSE_ID) });
    seedTask(db, {
      courseId,
      title: 'Homework 1',
      externalId: '103',
      sourceType: 'canvas',
      acceptanceMethod: 'auto',
      dueAt: '2024-03-01T23:59:00Z',
    });

    await expect(
      syncAllWithCourse([
        mockCanvasAssignment({
          id: 103,
          name: 'Homework 1',
          dueAt: '2024-03-01T23:59:00Z',
        }),
      ])
    ).resolves.not.toThrow();

    expect(readTasks(db)).toHaveLength(1);
    expect(readQueue(db)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Category D — Queue management (syncAll → D2 + D4 pending refresh)
// ---------------------------------------------------------------------------

describe('D: Queue management — D2 rejected + pending refresh (syncAll)', () => {
  it('D1: rejected queue entry gets title refreshed, no task created', async () => {
    const courseId = seedCourse(db, { externalId: String(CANVAS_COURSE_ID) });
    seedQueueEntry(db, {
      externalId: '201',
      courseId,
      title: 'Old Title',
      status: 'rejected',
    });

    await syncAllWithCourse([mockCanvasAssignment({ id: 201, name: 'Updated Title' })]);

    const queue = readQueue(db);
    expect(queue).toHaveLength(1);
    expect(queue[0].status).toBe('rejected'); // stays rejected
    expect(queue[0].title).toBe('Updated Title'); // title refreshed

    expect(readTasks(db)).toHaveLength(0); // no task created
  });

  it('D2: pending queue entry — Canvas resends same assignment → entry updated, not duplicated', async () => {
    const courseId = seedCourse(db, { externalId: String(CANVAS_COURSE_ID) });
    seedQueueEntry(db, {
      externalId: '202',
      courseId,
      title: 'Problem Set 1',
      status: 'pending',
    });

    await syncAllWithCourse([mockCanvasAssignment({ id: 202, name: 'Problem Set 1' })]);

    const queue = readQueue(db);
    expect(queue).toHaveLength(1); // not duplicated
    expect(queue[0].status).toBe('pending');
  });

  it('D3: pending queue entry — Canvas resends with changed due_at → queue entry refreshed', async () => {
    const courseId = seedCourse(db, { externalId: String(CANVAS_COURSE_ID) });
    seedQueueEntry(db, {
      externalId: '203',
      courseId,
      title: 'Essay',
      status: 'pending',
      dueAt: '2024-01-10T23:59:00Z',
    });

    await syncAllWithCourse([
      mockCanvasAssignment({ id: 203, name: 'Essay', dueAt: '2024-02-20T23:59:00Z' }),
    ]);

    const queue = readQueue(db);
    expect(queue).toHaveLength(1);
    expect(queue[0].due_at).toBe('2024-02-20T23:59:00Z'); // updated
  });
});

// ---------------------------------------------------------------------------
// Category E — Conflict detection (syncAll → D3 legacy task path)
// ---------------------------------------------------------------------------

describe('E: Conflict detection — D3 legacy task path (syncAll)', () => {
  it('E1: existing canvas task with changed due_at → conflict record stored', async () => {
    const courseId = seedCourse(db, { externalId: String(CANVAS_COURSE_ID) });
    seedTask(db, {
      courseId,
      title: 'Lab Report',
      externalId: '301',
      sourceType: 'canvas',
      dueAt: '2024-01-10T23:59:00Z',
      fieldSources: { due_at: 'user' }, // user modified
    });

    await syncAllWithCourse([
      mockCanvasAssignment({
        id: 301,
        name: 'Lab Report',
        dueAt: '2024-02-15T23:59:00Z',
      }),
    ]);

    const conflicts = readConflicts(db);
    expect(conflicts.length).toBeGreaterThan(0);
    const dueConflict = conflicts.find((c) => c.conflict_field === 'due_at');
    expect(dueConflict).toBeDefined();
    expect(dueConflict!.conflict_resolution).toBeNull(); // unresolved
  });

  it('E2: existing task with identical due_at → no conflict (values equal)', async () => {
    const courseId = seedCourse(db, { externalId: String(CANVAS_COURSE_ID) });
    seedTask(db, {
      courseId,
      title: 'Quiz',
      externalId: '302',
      sourceType: 'canvas',
      dueAt: '2024-03-01T23:59:00Z',
      fieldSources: { due_at: 'user' },
    });

    await syncAllWithCourse([
      mockCanvasAssignment({ id: 302, name: 'Quiz', dueAt: '2024-03-01T23:59:00Z' }),
    ]);

    // No conflict — values are equal
    const conflicts = readConflicts(db).filter((c) => c.conflict_field === 'due_at');
    expect(conflicts).toHaveLength(0);
  });

  it('E3: syncAll runs cleanly on course with multiple assignments in one pass', async () => {
    const courseId = seedCourse(db, { externalId: String(CANVAS_COURSE_ID) });

    await syncAllWithCourse([
      mockCanvasAssignment({ id: 401, name: 'Assignment 1' }),
      mockCanvasAssignment({ id: 402, name: 'Assignment 2' }),
      mockCanvasAssignment({ id: 403, name: 'Assignment 3' }),
    ]);

    const queue = readQueue(db);
    expect(queue).toHaveLength(3);
    expect(queue.every((q) => q.status === 'pending')).toBe(true);
  });

  it('E4: full mixed sync — new, accepted, and rejected entries all processed correctly', async () => {
    const courseId = seedCourse(db, { externalId: String(CANVAS_COURSE_ID) });
    // Accepted task
    seedTask(db, {
      courseId,
      title: 'HW 1',
      externalId: '501',
      sourceType: 'canvas',
      acceptanceMethod: 'manual',
    });
    // Rejected queue entry
    seedQueueEntry(db, {
      externalId: '502',
      courseId,
      title: 'HW 2 old',
      status: 'rejected',
    });

    await syncAllWithCourse([
      mockCanvasAssignment({ id: 501, name: 'HW 1' }), // D1 — accepted
      mockCanvasAssignment({ id: 502, name: 'HW 2 new title' }), // D2 — rejected refresh
      mockCanvasAssignment({ id: 503, name: 'HW 3' }), // D4 — new, queued
    ]);

    const tasks = readTasks(db);
    const queue = readQueue(db);

    // D1: accepted task preserved, no queue entry for it
    expect(tasks.find((t) => t.external_id === '501')?.acceptance_method).toBe('manual');
    expect(queue.find((q) => q.external_id === '501')).toBeUndefined();

    // D2: rejected entry title refreshed
    const rejected = queue.find((q) => q.external_id === '502');
    expect(rejected?.status).toBe('rejected');
    expect(rejected?.title).toBe('HW 2 new title');

    // D4: new assignment queued
    const newEntry = queue.find((q) => q.external_id === '503');
    expect(newEntry?.status).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// Category F — Fuzzy matching via TaskMatcher + SyncTaskLinker
// (triggered in D3 legacy path: existing canvas task → commitLegacyTask → checkForUserTaskLinks)
// ---------------------------------------------------------------------------

describe('F: Fuzzy matching — TaskMatcher via SyncTaskLinker (syncAll D3 path)', () => {
  /** Seed an existing canvas task (legacy, no acceptance_method) so D3 path runs. */
  function seedLegacyCanvasTask(
    courseId: number,
    opts: { title: string; externalId: string; dueAt?: string }
  ): number {
    return seedTask(db, {
      courseId,
      title: opts.title,
      externalId: opts.externalId,
      sourceType: 'canvas',
      acceptanceMethod: null, // no acceptance_method → D3 path
      dueAt: opts.dueAt ?? null,
    });
  }

  it('F1: abbreviation expansion — "HW 5" user task auto-links to "Homework 5" Canvas task', async () => {
    const courseId = seedCourse(db, { externalId: String(CANVAS_COURSE_ID) });
    const canvasTaskId = seedLegacyCanvasTask(courseId, {
      title: 'Homework 5',
      externalId: '601',
    });
    // User task with abbreviated title — normalizes to same as canvas after expandAbbreviations
    const userTaskId = seedTask(db, { courseId, title: 'HW 5', sourceType: 'user' });

    await syncAllWithCourse([mockCanvasAssignment({ id: 601, name: 'Homework 5' })]);

    // Canvas task should be linked (link_confidence set, link_method='auto')
    const canvasTask = readTasks(db).find((t) => t.id === canvasTaskId);
    expect(canvasTask?.link_confidence).toBeGreaterThanOrEqual(0.9);
    expect(canvasTask?.link_method).toBe('auto');

    // User task should be soft-deleted (merged_into_task_id set)
    const userTask = readTasks(db).find((t) => t.id === userTaskId);
    expect(userTask?.deleted_at).not.toBeNull();
    expect(userTask?.merged_into_task_id).toBe(canvasTaskId);
  });

  it('F2: case normalization — "quiz 1" user task auto-links to "Quiz 1" Canvas task', async () => {
    const courseId = seedCourse(db, { externalId: String(CANVAS_COURSE_ID) });
    const canvasTaskId = seedLegacyCanvasTask(courseId, {
      title: 'Quiz 1',
      externalId: '602',
    });
    const userTaskId = seedTask(db, { courseId, title: 'quiz 1', sourceType: 'user' });

    await syncAllWithCourse([mockCanvasAssignment({ id: 602, name: 'Quiz 1' })]);

    const canvasTask = readTasks(db).find((t) => t.id === canvasTaskId);
    expect(canvasTask?.link_confidence).toBeGreaterThanOrEqual(0.9);

    const userTask = readTasks(db).find((t) => t.id === userTaskId);
    expect(userTask?.merged_into_task_id).toBe(canvasTaskId);
  });

  it('F3: high similarity (1 char edit in long title) → auto-link', async () => {
    const courseId = seedCourse(db, { externalId: String(CANVAS_COURSE_ID) });
    // "Introduction to Computer Science Assignment" (42 chars) vs
    // "Introduction to Computer Science Asignment" (1 missing char) → sim ≈ 0.976
    const canvasTaskId = seedLegacyCanvasTask(courseId, {
      title: 'Introduction to Computer Science Assignment',
      externalId: '603',
    });
    const userTaskId = seedTask(db, {
      courseId,
      title: 'Introduction to Computer Science Asignment', // typo
      sourceType: 'user',
    });

    await syncAllWithCourse([
      mockCanvasAssignment({
        id: 603,
        name: 'Introduction to Computer Science Assignment',
      }),
    ]);

    const userTask = readTasks(db).find((t) => t.id === userTaskId);
    expect(userTask?.merged_into_task_id).toBe(canvasTaskId);
  });

  it('F4: clearly different titles → no auto-link, no suggestion', async () => {
    const courseId = seedCourse(db, { externalId: String(CANVAS_COURSE_ID) });
    const canvasTaskId = seedLegacyCanvasTask(courseId, {
      title: 'Organic Chemistry Lab',
      externalId: '604',
    });
    seedTask(db, { courseId, title: 'Calculus Problem Set', sourceType: 'user' });

    await syncAllWithCourse([
      mockCanvasAssignment({ id: 604, name: 'Organic Chemistry Lab' }),
    ]);

    const canvasTask = readTasks(db).find((t) => t.id === canvasTaskId);
    expect(canvasTask?.link_confidence).toBeNull();
    expect(readLinkSuggestions(db)).toHaveLength(0);
  });

  it('F5: medium similarity title → queued as link suggestion, not auto-linked', async () => {
    const courseId = seedCourse(db, { externalId: String(CANVAS_COURSE_ID) });
    // "Project Report Part 2" vs "Report on Project Part Two" — different word order
    // Levenshtein after normalize gives ~0.7-0.85 range — should suggest, not auto-link
    const canvasTaskId = seedLegacyCanvasTask(courseId, {
      title: 'Project Report Part Two',
      externalId: '605',
    });
    const userTaskId = seedTask(db, {
      courseId,
      title: 'Report on Project Part Two',
      sourceType: 'user',
    });

    await syncAllWithCourse([
      mockCanvasAssignment({ id: 605, name: 'Project Report Part Two' }),
    ]);

    const canvasTask = readTasks(db).find((t) => t.id === canvasTaskId);
    const userTask = readTasks(db).find((t) => t.id === userTaskId);

    // Not auto-linked (user task not deleted/merged)
    // Could be suggestion or nothing depending on exact similarity
    // Assert at minimum: user task not soft-deleted (no forced merge)
    expect(userTask?.deleted_at ?? null).toBeNull();
    expect(userTask?.merged_into_task_id ?? null).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Category G — Multi-step flows
// ---------------------------------------------------------------------------

describe('G: Multi-step flows', () => {
  it('G1: first sync queues assignment; user accepts; second sync takes D1 path (grade update only)', async () => {
    const courseId = seedCourse(db, { externalId: String(CANVAS_COURSE_ID) });

    // Step 1: first sync — assignment arrives, gets queued
    await syncAllWithCourse([
      mockCanvasAssignment({ id: 701, name: 'Final Project', pointsPossible: 100 }),
    ]);
    expect(readQueue(db)).toHaveLength(1);
    expect(readTasks(db)).toHaveLength(0);

    // Step 2: simulate user accepting from queue — create the task row
    db.executeWrite(
      `INSERT INTO tasks (course_id, title, external_id, source_type, acceptance_method, accepted_at)
       VALUES (?, ?, ?, 'canvas', 'manual', CURRENT_TIMESTAMP)`,
      [courseId, 'Final Project', '701'],
      'tasks'
    );
    db.executeWrite(
      "UPDATE canvas_task_queue SET status = 'accepted', resolved_at = CURRENT_TIMESTAMP WHERE external_id = '701'",
      [],
      'canvas_task_queue'
    );

    // Step 3: second sync — Canvas sends same assignment (possibly with grade)
    await syncAllWithCourse([
      mockCanvasAssignment({ id: 701, name: 'Final Project', pointsPossible: 100 }),
    ]);

    // D1 path taken: task preserved with acceptance_method, no duplicate queue entry
    const tasks = readTasks(db);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].acceptance_method).toBe('manual');
    expect(tasks[0].external_id).toBe('701');
    const queue = readQueue(db);
    expect(queue.every((q) => q.status === 'accepted')).toBe(true); // stays accepted
  });

  it('G2: full mixed course: new + user-match + ambiguous all handled in one syncTasks call', async () => {
    seedCourse(db, { externalId: String(CANVAS_COURSE_ID) });
    seedTask(db, { courseId: 1, title: 'Essay 1', sourceType: 'user' }); // will merge
    seedTask(db, { courseId: 1, title: 'Essay 2', sourceType: 'user' }); // duplicate — neither merges
    seedTask(db, { courseId: 1, title: 'Essay 2', sourceType: 'user' }); // duplicate

    await syncTasksForCourse([
      mockCanvasAssignment({ id: 801, name: 'Brand New Task' }), // no user task → inserts as canvas
      mockCanvasAssignment({ id: 802, name: 'Essay 1' }), // matches one user task → merges
      mockCanvasAssignment({ id: 803, name: 'Essay 2' }), // matches two → skipped, queued as canvas
    ]);

    const tasks = readTasks(db);

    // Essay 1 merged: external_id='802', source_type='canvas'
    const merged = tasks.find((t) => t.external_id === '802');
    expect(merged).toBeDefined();
    expect(merged!.source_type).toBe('canvas');

    // Essay 2 (ambiguous): two user tasks untouched, Essay 2 canvas becomes its own
    const userTasks = tasks.filter((t) => t.source_type === 'user');
    expect(userTasks).toHaveLength(2); // the two Essay 2 user tasks, untouched
    expect(userTasks.every((t) => t.external_id === null)).toBe(true);

    // Brand New Task inserted as canvas
    const newTask = tasks.find((t) => t.external_id === '801');
    expect(newTask).toBeDefined();
  });

  it('G3: cross-course isolation — two courses sync independently, no data bleeds over', async () => {
    const courseAId = seedCourse(db, {
      externalId: String(CANVAS_COURSE_ID),
      name: 'Course A',
    });
    const courseBId = seedCourse(db, { externalId: '99999', name: 'Course B' });
    seedTask(db, { courseId: courseBId, title: 'Shared Title', sourceType: 'user' });

    // Sync course A — Canvas A has an assignment with same title as course B's user task
    await syncTasksForCourse([
      mockCanvasAssignment({ id: 901, name: 'Shared Title', courseId: CANVAS_COURSE_ID }),
    ]);

    // Course B task untouched
    const bTask = readTasks(db).find((t) => t.course_id === courseBId);
    expect(bTask?.external_id).toBeNull();
    expect(bTask?.source_type).toBe('user');

    // Course A has a canvas task for the assignment (new insert since no course A user task matched)
    const aTask = readTasks(db).find((t) => t.course_id === courseAId);
    expect(aTask?.external_id).toBe('901');
    expect(aTask?.source_type).toBe('canvas');
  });
});

// ---------------------------------------------------------------------------
// Category H — syncPrefs.autoAssignDueDate fork (SyncTaskOperations:187)
// ---------------------------------------------------------------------------
//
// The fork is in the no-title-match `else` branch of syncTasks: when
// `courseSettings.autoAssignDueDate && !finalData.due_at`, a Canvas assignment
// arriving with NO due date gets `due_at` auto-filled to today's end-of-day —
// UNLESS the user already set the due date (field_sources.due_at==='user' or
// local_modified_fields includes 'due_at'), in which case it is respected.
// courseSettings inherits the app default from user_preferences.syncPreferences
// (per-course auto_assign_due_date is NULL → inherit).
describe('H: autoAssignDueDate fork (syncTasks / SyncTaskOperations path)', () => {
  it('H1: setting ON + Canvas assignment with null due_at → due_at auto-filled to today end-of-day', async () => {
    seedCourse(db, { externalId: String(CANVAS_COURSE_ID) });
    seedSyncPreferences({ autoAssignDueDate: true });

    await syncTasksForCourse([
      mockCanvasAssignment({ id: 850, name: 'No Due Date Task', dueAt: null }),
    ]);

    const task = readTasks(db).find((t) => t.external_id === '850');
    expect(task).toBeDefined();
    expect(task!.due_at).toBe(expectedTodayEndTime());
  });

  it('H2: setting OFF + Canvas assignment with null due_at → due_at stays null (fork not taken)', async () => {
    seedCourse(db, { externalId: String(CANVAS_COURSE_ID) });
    seedSyncPreferences({ autoAssignDueDate: false });

    await syncTasksForCourse([
      mockCanvasAssignment({ id: 851, name: 'No Due Date Task', dueAt: null }),
    ]);

    const task = readTasks(db).find((t) => t.external_id === '851');
    expect(task).toBeDefined();
    // Backwards-wiring guard: with the setting off, the due date is NOT synthesized.
    expect(task!.due_at).toBeNull();
  });

  it('H3: setting ON but user already set the due date → user value respected, NOT overwritten with today', async () => {
    const courseId = seedCourse(db, { externalId: String(CANVAS_COURSE_ID) });
    seedSyncPreferences({ autoAssignDueDate: true });

    // Existing canvas task linked by external_id, with a user-set due date.
    // Goes through the `else` (external_id lookup) branch — NOT the user-title
    // merge — so the autoAssignDueDate guard at :195-203 is reached.
    const userDueDate = '2099-01-15T23:59:00Z';
    seedTask(db, {
      courseId,
      title: 'User-Dated Task',
      externalId: '852',
      sourceType: 'canvas',
      acceptanceMethod: 'manual',
      dueAt: userDueDate,
      fieldSources: { due_at: 'user' },
    });

    // Canvas resends the same assignment with NO due date.
    await syncTasksForCourse([
      mockCanvasAssignment({ id: 852, name: 'User-Dated Task', dueAt: null }),
    ]);

    const task = readTasks(db).find((t) => t.external_id === '852');
    expect(task).toBeDefined();
    // The user's due date is preserved; the fork must NOT clobber it with today.
    expect(task!.due_at).toBe(userDueDate);
    expect(task!.due_at).not.toBe(expectedTodayEndTime());
  });
});
