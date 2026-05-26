/**
 * seed-duplicate-test.js
 *
 * Seeds canvas.db with three test scenarios for the duplicate-warning gate:
 *   Scenario A — Exact match (single mode):
 *     Course: ECE311H1 (id 27764)
 *     User task "Problem Set 1" + queue entry "Problem Set 1"
 *     Expected: DuplicateWarningModal appears with "Duplicate found" on Accept
 *
 *   Scenario B — Fuzzy match ("may match", single mode):
 *     Course: ECE342H1 (id 27765)
 *     User task "Homework Assignment" + queue entry "HW Assignment"
 *     Expected: DuplicateWarningModal appears with "May match" on Accept
 *
 *   Scenario C — Bulk mode (multiple duplicates in ONE course):
 *     Course: ECE311H1 (id 27764)
 *     Two extra pairs in addition to Scenario A, so ECE311 has 3 queued tasks
 *     that all duplicate existing user tasks:
 *       • "Problem Set 1"  ↔ "Problem Set 1"       (exact, from Scenario A)
 *       • "Problem Set 2"  ↔ "Problem Set 2"       (exact)
 *       • "Lab Report"     ↔ "Lab Report 1"        (fuzzy)
 *     Expected: in ECE311 CourseDetail → CanvasUpdatesSection → "Accept all"
 *     fires the modal in bulk mode with 3 items.
 *
 * Usage:
 *   node scripts/ensure-native-modules.js   # rebuild better-sqlite3 for Node
 *   node scripts/seed-duplicate-test.js     # seed the data
 *   npm run rebuild                          # rebuild for Electron before opening app
 *   npm run dev                              # open app
 *
 * To undo: node scripts/seed-duplicate-test.js --cleanup
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'database', 'canvas.db');
const cleanup = process.argv.includes('--cleanup');

const EXACT_COURSE_ID = 27764;   // ECE311H1
const FUZZY_COURSE_ID = 27765;   // ECE342H1
const TEST_TAG = 'DUPLICATE_TEST'; // tag embedded in external_id so cleanup is safe

// ── canvas_data blob builder ───────────────────────────────────────────────
// MergeQueuedTaskCommand parses canvas_data via mapAssignment(), which reads
// description / due_at / unlock_at / lock_at / points_possible /
// submission_types out of the blob. If the blob omits a field, the merged
// task gets null — even if the queue's *column* has a real value (the column
// is for modal display only; the merge reads the blob). The blob must mirror
// a real Canvas Assignment payload, not a stub. `submission` is omitted:
// queue entries are pre-acceptance, so no submission state exists yet
// (mapAssignment handles it absent).
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

function seed(db) {
  // ── Scenario A: Exact match ─────────────────────────────────────────────
  // User task — source_type='user', no external_id (simulates manually created)
  const existingExact = db.prepare(
    "SELECT id FROM tasks WHERE course_id=? AND title=? AND source_type='user' AND external_id IS NULL"
  ).get(EXACT_COURSE_ID, 'Problem Set 1');

  let exactTaskId;
  if (existingExact) {
    exactTaskId = existingExact.id;
    console.log(`  ✓ User task "Problem Set 1" already exists (id=${exactTaskId})`);
  } else {
    const result = db.prepare(
      `INSERT INTO tasks (course_id, title, source_type, weight, priority_score)
       VALUES (?, ?, 'user', 15.0, 70.0)`
    ).run(EXACT_COURSE_ID, 'Problem Set 1');
    exactTaskId = result.lastInsertRowid;
    console.log(`  ✓ Created user task "Problem Set 1" (id=${exactTaskId})`);
  }

  // Queue entry — same title, same course → exact match
  const existingExactQ = db.prepare(
    `SELECT id FROM canvas_task_queue WHERE external_id=?`
  ).get(`${TEST_TAG}_EXACT`);

  if (existingExactQ) {
    console.log(`  ✓ Queue entry "Problem Set 1" already exists (id=${existingExactQ.id})`);
  } else {
    const qResult = db.prepare(
      `INSERT INTO canvas_task_queue
         (external_id, canvas_data, course_id, title, description, due_at, points_possible, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`
    ).run(
      `${TEST_TAG}_EXACT`,
      buildCanvasBlob({
        id: 88001,
        name: 'Problem Set 1',
        description: '<p>Submit your work to the online portal.</p>',
        due_at: '2026-06-15T23:59:00Z',
        points_possible: 100,
        submission_types: ['online_upload'],
      }),
      EXACT_COURSE_ID,
      'Problem Set 1',
      '<p>Submit your work to the online portal.</p>',
      '2026-06-15T23:59:00Z',
      100
    );
    console.log(`  ✓ Created queue entry "Problem Set 1" (id=${qResult.lastInsertRowid})`);
  }

  // ── Scenario C (part 1): Extra exact match in ECE311 for bulk testing ──
  const existingPS2 = db.prepare(
    "SELECT id FROM tasks WHERE course_id=? AND title=? AND source_type='user' AND external_id IS NULL"
  ).get(EXACT_COURSE_ID, 'Problem Set 2');

  let ps2TaskId;
  if (existingPS2) {
    ps2TaskId = existingPS2.id;
    console.log(`  ✓ User task "Problem Set 2" already exists (id=${ps2TaskId})`);
  } else {
    const result = db.prepare(
      `INSERT INTO tasks (course_id, title, source_type, weight, priority_score)
       VALUES (?, ?, 'user', 10.0, 65.0)`
    ).run(EXACT_COURSE_ID, 'Problem Set 2');
    ps2TaskId = result.lastInsertRowid;
    console.log(`  ✓ Created user task "Problem Set 2" (id=${ps2TaskId})`);
  }

  const existingPS2Q = db.prepare(
    `SELECT id FROM canvas_task_queue WHERE external_id=?`
  ).get(`${TEST_TAG}_BULK_EXACT`);

  if (existingPS2Q) {
    console.log(`  ✓ Queue entry "Problem Set 2" already exists (id=${existingPS2Q.id})`);
  } else {
    const qResult = db.prepare(
      `INSERT INTO canvas_task_queue
         (external_id, canvas_data, course_id, title, description, due_at, points_possible, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`
    ).run(
      `${TEST_TAG}_BULK_EXACT`,
      buildCanvasBlob({
        id: 88003,
        name: 'Problem Set 2',
        description: '<p>Second problem set — same drill.</p>',
        due_at: '2026-06-22T23:59:00Z',
        points_possible: 100,
        submission_types: ['online_upload'],
      }),
      EXACT_COURSE_ID,
      'Problem Set 2',
      '<p>Second problem set — same drill.</p>',
      '2026-06-22T23:59:00Z',
      100
    );
    console.log(`  ✓ Created queue entry "Problem Set 2" (id=${qResult.lastInsertRowid})`);
  }

  // ── Scenario C (part 2): Fuzzy match in ECE311 for bulk testing ─────────
  const existingLab = db.prepare(
    "SELECT id FROM tasks WHERE course_id=? AND title=? AND source_type='user' AND external_id IS NULL"
  ).get(EXACT_COURSE_ID, 'Lab Report');

  let labTaskId;
  if (existingLab) {
    labTaskId = existingLab.id;
    console.log(`  ✓ User task "Lab Report" already exists (id=${labTaskId})`);
  } else {
    const result = db.prepare(
      `INSERT INTO tasks (course_id, title, source_type, weight, priority_score)
       VALUES (?, ?, 'user', 5.0, 50.0)`
    ).run(EXACT_COURSE_ID, 'Lab Report');
    labTaskId = result.lastInsertRowid;
    console.log(`  ✓ Created user task "Lab Report" (id=${labTaskId})`);
  }

  const existingLabQ = db.prepare(
    `SELECT id FROM canvas_task_queue WHERE external_id=?`
  ).get(`${TEST_TAG}_BULK_FUZZY`);

  if (existingLabQ) {
    console.log(`  ✓ Queue entry "Lab Report 1" already exists (id=${existingLabQ.id})`);
  } else {
    const qResult = db.prepare(
      `INSERT INTO canvas_task_queue
         (external_id, canvas_data, course_id, title, description, due_at, points_possible, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`
    ).run(
      `${TEST_TAG}_BULK_FUZZY`,
      buildCanvasBlob({
        id: 88004,
        name: 'Lab Report 1',
        description: '<p>First lab writeup.</p>',
        due_at: '2026-06-28T23:59:00Z',
        points_possible: 50,
        submission_types: ['online_upload'],
      }),
      EXACT_COURSE_ID,
      'Lab Report 1',
      '<p>First lab writeup.</p>',
      '2026-06-28T23:59:00Z',
      50
    );
    console.log(`  ✓ Created queue entry "Lab Report 1" (id=${qResult.lastInsertRowid})`);
  }

  // ── Scenario B: Fuzzy match ─────────────────────────────────────────────
  // User task "Homework Assignment" — will fuzzy-match "HW Assignment" via
  // abbreviation expansion: hw→homework, so normalised titles both → "homework assignment"
  const existingFuzzy = db.prepare(
    "SELECT id FROM tasks WHERE course_id=? AND title=? AND source_type='user' AND external_id IS NULL"
  ).get(FUZZY_COURSE_ID, 'Homework Assignment');

  let fuzzyTaskId;
  if (existingFuzzy) {
    fuzzyTaskId = existingFuzzy.id;
    console.log(`  ✓ User task "Homework Assignment" already exists (id=${fuzzyTaskId})`);
  } else {
    const result = db.prepare(
      `INSERT INTO tasks (course_id, title, source_type, weight, priority_score)
       VALUES (?, ?, 'user', 10.0, 60.0)`
    ).run(FUZZY_COURSE_ID, 'Homework Assignment');
    fuzzyTaskId = result.lastInsertRowid;
    console.log(`  ✓ Created user task "Homework Assignment" (id=${fuzzyTaskId})`);
  }

  // Queue entry — "HW Assignment" fuzzy-matches "Homework Assignment" after
  // abbreviation expansion (hw → homework)
  const existingFuzzyQ = db.prepare(
    `SELECT id FROM canvas_task_queue WHERE external_id=?`
  ).get(`${TEST_TAG}_FUZZY`);

  if (existingFuzzyQ) {
    console.log(`  ✓ Queue entry "HW Assignment" already exists (id=${existingFuzzyQ.id})`);
  } else {
    const qResult = db.prepare(
      `INSERT INTO canvas_task_queue
         (external_id, canvas_data, course_id, title, description, due_at, points_possible, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`
    ).run(
      `${TEST_TAG}_FUZZY`,
      buildCanvasBlob({
        id: 88002,
        name: 'HW Assignment',
        description: '<p>Weekly homework submission.</p>',
        due_at: '2026-06-20T23:59:00Z',
        points_possible: 50,
        submission_types: ['online_upload'],
      }),
      FUZZY_COURSE_ID,
      'HW Assignment',
      '<p>Weekly homework submission.</p>',
      '2026-06-20T23:59:00Z',
      50
    );
    console.log(`  ✓ Created queue entry "HW Assignment" (id=${qResult.lastInsertRowid})`);
  }
}

function cleanupData(db) {
  const r1 = db.prepare(
    "DELETE FROM tasks WHERE title IN ('Problem Set 1','Problem Set 2','Lab Report','Homework Assignment') AND source_type='user' AND external_id IS NULL"
  ).run();
  const r2 = db.prepare(
    `DELETE FROM canvas_task_queue WHERE external_id IN ('${TEST_TAG}_EXACT','${TEST_TAG}_FUZZY','${TEST_TAG}_BULK_EXACT','${TEST_TAG}_BULK_FUZZY')`
  ).run();
  console.log(`  ✓ Removed ${r1.changes} user task(s) and ${r2.changes} queue entry(s)`);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

if (cleanup) {
  console.log('\n🗑  Cleaning up duplicate-test data...');
  cleanupData(db);
  console.log('Done.\n');
} else {
  console.log('\n🌱 Seeding duplicate-test data...');
  seed(db);
  console.log('\n✅ Done! Now:');
  console.log('   1. Run: npm run rebuild       (rebuild better-sqlite3 for Electron)');
  console.log('   2. Run: npm run dev            (open the app)');
  console.log('\n🧪 Test Scenario A — Exact match (single mode):');
  console.log('   • Open Course Detail for ECE311H1 Introduction to Control Systems');
  console.log('   • Q/E to the Queue section — "Problem Set 1" should appear');
  console.log('   • Press A or click ✓ to Accept');
  console.log('   • ⚠ DuplicateWarningModal should appear: "Duplicate found — Problem Set 1"');
  console.log('   • Canvas (incoming) column shows REAL title/due/type — not placeholders');
  console.log('\n🧪 Test Scenario B — Fuzzy "may match" (single mode):');
  console.log('   • Open Course Detail for ECE342H1 Computer Hardware');
  console.log('   • Queue section shows "HW Assignment"');
  console.log('   • Press A to Accept');
  console.log('   • ~ DuplicateWarningModal should appear: "May match — Homework Assignment"');
  console.log('\n🧪 Test Scenario C — BULK mode:');
  console.log('   • Open Course Detail for ECE311H1 — Queue section has 3 items:');
  console.log('       1. Problem Set 1  (exact)');
  console.log('       2. Problem Set 2  (exact)');
  console.log('       3. Lab Report 1   (fuzzy → Lab Report)');
  console.log('   • Click "Accept all" in the section header');
  console.log('   • DuplicateWarningModal should appear in BULK mode with 3 items');
  console.log('   • Keys: ↑↓ navigate · Space toggle · A select-all · L/S set link/separate · Enter confirm · Esc cancel');
  console.log('\n🔍 Also test from Updates page:');
  console.log('   • All 4 queued tasks appear under "Action Required"');
  console.log('   • Accept any → single-mode modal fires with real Canvas data populated');
  console.log('\n🗑  To clean up: node scripts/seed-duplicate-test.js --cleanup\n');
}

db.close();
