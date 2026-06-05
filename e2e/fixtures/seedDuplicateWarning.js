/**
 * seedDuplicateWarning.js — shared duplicate-warning seed matrix (plain CJS).
 *
 * Single source of truth for the deterministic DuplicateWarningModal scenario,
 * consumed by BOTH:
 *   1. scripts/manual-test-duplicate-warning.js (the manual-test CLI), and
 *   2. e2e/fixtures/seed.ts (the opt-in `seedDuplicates` Playwright fixture).
 *
 * It can be used two ways:
 *   - require()'d:  const { seedDuplicateWarning } = require('./seedDuplicateWarning');
 *                   seedDuplicateWarning(dbPath) -> { courseA, courseB }
 *   - spawned:      <runner> seedDuplicateWarning.js <dbPath>
 *                   -> seeds + prints COURSE_A=id:code / COURSE_B=id:code to stdout.
 *
 * ── NATIVE ABI REQUIREMENT (the load-bearing gotcha) ─────────────────────────
 * This module `require('better-sqlite3')`, whose compiled `.node` addon is built
 * for ONE ABI at a time:
 *   - `npm test` (Jest pretest -> ensure-native-modules) leaves it on the NODE ABI.
 *   - `npm run dev` / `npm run rebuild` leaves it on the ELECTRON ABI.
 *
 * The e2e fixture LAUNCHES the built Electron app, which needs the ELECTRON ABI on
 * disk. So when the fixture seeds, the seed subprocess must ALSO run under the
 * Electron ABI — otherwise the on-disk addon won't load. The proven resolution
 * (verified empirically on this machine, 2026-06-04) is to spawn this script under
 * **Electron-as-Node**:
 *
 *     spawnSync(ELECTRON_BIN, [__filename, dbPath],
 *               { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } })
 *
 * With ELECTRON_RUN_AS_NODE=1 the electron binary behaves like a plain Node runtime
 * but exposes the Electron ABI (process.versions.modules === 143 here), so
 * better-sqlite3's Electron build loads cleanly. Seed + launched app then share ONE
 * ABI and nothing ever gets flipped. (The manual-test CLI uses the same runner — see
 * its `--seed` step, which historically split seed/launch into two phases precisely
 * to dodge this trap; routing through Electron-as-Node lets a single ABI serve both.)
 *
 * NOTE: `require('better-sqlite3')` succeeds lazily even under the wrong ABI — the
 * mismatch only surfaces when the native addon is actually instantiated
 * (`new Database(...)`). So a successful `require` is NOT proof of the right ABI;
 * the instantiation below is.
 */

const Database = require('better-sqlite3');

const TEST_TAG = 'DUP_WARN_TEST';

/**
 * canvas_data blob builder.
 *
 * MergeQueuedTaskCommand parses canvas_data via mapAssignment(), which reads
 * description / due_at / unlock_at / lock_at / points_possible / submission_types
 * out of the blob. If the blob omits a field, the merged task gets null — even if
 * the queue's *column* has a real value (the column is for modal display only; the
 * merge reads the blob). The blob must mirror a real Canvas Assignment payload, not
 * a stub. `submission` is omitted: queue entries are pre-acceptance, so no submission
 * state exists yet (mapAssignment handles absent). Commit 3dd29e8 deliberately tuned
 * this shape — preserve it verbatim.
 */
function buildCanvasBlob(o) {
  return JSON.stringify({
    id: o.id,
    name: o.name,
    description: o.description ?? null,
    due_at: o.due_at ?? null,
    unlock_at: o.unlock_at ?? null,
    lock_at: o.lock_at ?? null,
    points_possible: o.points_possible ?? 100,
    submission_types: o.submission_types ?? ['online_text_entry'],
  });
}

/**
 * Seed the deterministic duplicate-warning matrix into the SQLite DB at `dbPath`.
 *
 * Course A: comprehensive matrix — 6 duplicate pairs + 1 no-match control. Each
 *           pair exercises a distinct branch of detection / conflict logic; the
 *           whole set is also bulk-testable via "Accept all".
 * Course B: one clean single-mode fuzzy case, separate from the noise in Course A.
 *
 * Idempotent: every insert is `INSERT OR IGNORE` keyed on the `DUP_WARN_TEST_*` tag,
 * so re-running against the same copy is a no-op.
 *
 * @param {string} dbPath absolute path to the (copied/disposable) canvas.db
 * @returns {{ courseA: {id:number, code:string}, courseB: {id:number, code:string} }}
 * @throws if the DB has no visible courses (caller should treat as skip)
 */
function seedDuplicateWarning(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  try {
    const courses = db
      .prepare(
        'SELECT id, code FROM courses WHERE archived_at IS NULL AND deleted_at IS NULL AND is_hidden=0 LIMIT 2'
      )
      .all();
    if (!courses.length) {
      throw new Error('No visible courses');
    }
    const cA = courses[0];
    const cB = courses[1] || courses[0];

    const insertUser = db.prepare(
      "INSERT OR IGNORE INTO tasks (course_id, title, source_type, weight, due_at, task_type) VALUES (?, ?, 'user', ?, ?, ?)"
    );
    const insertQueue = db.prepare(
      "INSERT OR IGNORE INTO canvas_task_queue (external_id, canvas_data, course_id, title, description, due_at, points_possible, task_type, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')"
    );

    function insertScenario(tag, courseId, o) {
      insertQueue.run(
        tag,
        buildCanvasBlob(o),
        courseId,
        o.name,
        o.description ?? null,
        o.due_at ?? null,
        o.points_possible ?? 100,
        o.queue_task_type ?? 'assignment'
      );
    }

    // ── Course A — comprehensive matrix ────────────────────────────────────
    // Case 1 — EXACT match, NO field conflicts (identical title + dueAt; both task_type=assignment)
    insertUser.run(cA.id, 'Problem Set 1', 15, '2026-06-15T23:59:00Z', 'assignment');
    insertScenario(`${TEST_TAG}_EXACT_CLEAN`, cA.id, {
      id: 88001,
      name: 'Problem Set 1',
      description: '<p>Standard PSet.</p>',
      due_at: '2026-06-15T23:59:00Z',
      points_possible: 100,
      submission_types: ['online_upload'],
      queue_task_type: 'assignment',
    });

    // Case 2 — EXACT title, due-date CONFLICT (Jun 10 user vs Jun 12 canvas; same task_type)
    insertUser.run(cA.id, 'Quiz 1', 5, '2026-06-10T23:59:00Z', 'quiz');
    insertScenario(`${TEST_TAG}_EXACT_DUE_CONFLICT`, cA.id, {
      id: 88002,
      name: 'Quiz 1',
      description: '<p>In-class quiz, rescheduled.</p>',
      due_at: '2026-06-12T23:59:00Z',
      points_possible: 20,
      submission_types: ['none'],
      queue_task_type: 'quiz',
    });

    // Case 3 — EXACT title, MULTI-field conflict (dueAt + taskType BOTH differ)
    insertUser.run(cA.id, 'Midterm', 25, '2026-06-05T23:59:00Z', 'quiz');
    insertScenario(`${TEST_TAG}_EXACT_MULTI_CONFLICT`, cA.id, {
      id: 88003,
      name: 'Midterm',
      description: '<p>Closed-book midterm.</p>',
      due_at: '2026-06-07T23:59:00Z',
      points_possible: 100,
      submission_types: ['on_paper'],
      queue_task_type: 'exam',
    });

    // Case 4 — FUZZY: abbreviation expansion (hw → homework). User has no dueAt.
    insertUser.run(cA.id, 'Homework 3', 8, null, 'assignment');
    insertScenario(`${TEST_TAG}_FUZZY_ABBREV`, cA.id, {
      id: 88004,
      name: 'HW 3',
      description: '<p>Weekly assignment #3.</p>',
      due_at: '2026-06-18T23:59:00Z',
      points_possible: 30,
      submission_types: ['online_upload'],
      queue_task_type: 'assignment',
    });

    // Case 5 — FUZZY: punctuation difference only ("Lab #2" vs "Lab 2", same dueAt)
    insertUser.run(cA.id, 'Lab 2', 5, '2026-06-20T23:59:00Z', 'assignment');
    insertScenario(`${TEST_TAG}_FUZZY_PUNCT`, cA.id, {
      id: 88005,
      name: 'Lab #2',
      description: '<p>Hands-on lab.</p>',
      due_at: '2026-06-20T23:59:00Z',
      points_possible: 40,
      submission_types: ['online_upload'],
      queue_task_type: 'assignment',
    });

    // Case 6 — FUZZY: combined abbreviation + punctuation ("PS #4" vs "Problem Set 4")
    insertUser.run(cA.id, 'Problem Set 4', 12, '2026-06-25T23:59:00Z', 'assignment');
    insertScenario(`${TEST_TAG}_FUZZY_COMBO`, cA.id, {
      id: 88006,
      name: 'PS #4',
      description: '<p>Final problem set.</p>',
      due_at: '2026-06-25T23:59:00Z',
      points_possible: 100,
      submission_types: ['online_upload'],
      queue_task_type: 'assignment',
    });

    // Case 7 — NO match control: queued task with no similar user task.
    // Should auto-accept (no modal) when individually accepted.
    insertScenario(`${TEST_TAG}_NO_MATCH`, cA.id, {
      id: 88007,
      name: 'Lecture Reflection 1',
      description: '<p>One-page reflection.</p>',
      due_at: '2026-06-30T23:59:00Z',
      points_possible: 10,
      submission_types: ['online_text_entry'],
      queue_task_type: 'assignment',
    });

    // ── Course B — clean single-mode fuzzy demo ───────────────────────────
    insertUser.run(cB.id, 'Homework Assignment', 10, null, 'assignment');
    insertScenario(`${TEST_TAG}_FUZZY`, cB.id, {
      id: 88008,
      name: 'HW Assignment',
      description: '<p>Weekly submission.</p>',
      due_at: '2026-06-20T23:59:00Z',
      points_possible: 50,
      submission_types: ['online_upload'],
      queue_task_type: 'assignment',
    });

    return {
      courseA: { id: cA.id, code: cA.code },
      courseB: { id: cB.id, code: cB.code },
    };
  } finally {
    db.close();
  }
}

module.exports = { seedDuplicateWarning, TEST_TAG };

// ── Subprocess entrypoint ───────────────────────────────────────────────────
// `<runner> seedDuplicateWarning.js <dbPath>` — seeds + prints the course markers.
// See the ABI note above: the runner should be Electron-as-Node for e2e.
if (require.main === module) {
  const dbPath = process.argv[2];
  if (!dbPath) {
    process.stderr.write('usage: seedDuplicateWarning.js <dbPath>\n');
    process.exit(2);
  }
  try {
    const { courseA, courseB } = seedDuplicateWarning(dbPath);
    process.stdout.write(`COURSE_A=${courseA.id}:${courseA.code}\n`);
    process.stdout.write(`COURSE_B=${courseB.id}:${courseB.code}\n`);
    process.exit(0);
  } catch (e) {
    process.stderr.write(String((e && e.message) || e) + '\n');
    process.exit(1);
  }
}
