/**
 * seedDatabase.js — the UNIFIED deterministic e2e seed (plain CJS).
 *
 * Single seed path for the whole Playwright suite. Given an empty-but-
 * schema-correct `canvas.db` (produced by the app's own migration machinery —
 * see e2e/fixtures/seed.ts + the globalSetup schema template), it inserts a
 * FIXED, KNOWN dataset that makes every spec pass WITHOUT skipping:
 *
 *   - 2 visible courses A (90001) / B (90002), non-archived, non-hidden.
 *   - Course A tasks across ALL 5 CourseDetail filter buckets
 *     (Pending / Submitted / Graded / Non-Graded), so the digit-filter
 *     chip-count spec exercises every chip with a nonzero, deterministic count.
 *   - The duplicate-warning matrix (imported from seedDuplicateWarning.js — ONE
 *     source) applied to courses A/B: 6 matched pairs + 1 no-match on A, 1 fuzzy
 *     on B → Queue section + bulk DuplicateWarningModal specs.
 *   - >=2 announcements (notifications) on Course A → Announcements section,
 *     announcement-detail route, page-keyboard Announcements, >=2-section bar.
 *   - >=1 files row (resources, type='file') on Course A → Files route hard
 *     assertion (files-present branch).
 *   - >=1 future calendar event on Course A → non-empty calendar.
 *
 * ── DATE DETERMINISM ─────────────────────────────────────────────────────────
 * The status-deriving `tasks` rows use dates RELATIVE to seed-time `now` (computed
 * once below). A FIXED absolute date set would drift: a future run would push a
 * "Pending" task into the past, silently flipping its bucket and breaking the
 * chip-count assertion. The dup matrix keeps its FIXED dates (safe — its specs
 * don't assert on dates or buckets; see seedDuplicateWarning.js).
 *
 * ── NATIVE ABI REQUIREMENT ───────────────────────────────────────────────────
 * Like seedDuplicateWarning.js, this module `require('better-sqlite3')` and must
 * run under Electron-as-Node (ELECTRON_RUN_AS_NODE=1 on the electron binary) so
 * the on-disk addon (built for the Electron ABI by `npm run rebuild`) loads. The
 * fixture spawns it that way; see e2e/fixtures/seed.ts.
 *
 * ── NAMED-COLUMN INSERTS ─────────────────────────────────────────────────────
 * Every INSERT names ONLY the columns it sets; all others fall to their schema
 * defaults. This keeps the seed schema-version-agnostic — a future migration that
 * adds a column never breaks the seed. (Never SELECT *-shaped inserts.)
 */

const Database = require('better-sqlite3');
const { seedDuplicateMatrix } = require('./seedDuplicateWarning');

// Fixed, high, non-colliding ids (the dup matrix already uses 88xxx queue ids).
const COURSE_A = { id: 90001, external_id: 'E2E_COURSE_A', code: 'E2E101', name: 'E2E Course A' };
const COURSE_B = { id: 90002, external_id: 'E2E_COURSE_B', code: 'E2E202', name: 'E2E Course B' };
// Course C exists ONLY to give the Courses-page grid >=3 rows. The grid's
// first directional press lands on index 1 (moveFocus treats an unset focus as
// index 0 and adds the delta), so a 2-course grid cannot then advance to a
// distinct second index; a 3rd row lets the "walk forward then back" assertion
// hold. It carries no other seeded entities (no tasks/announcements/queue), so
// it never interferes with the A/B-scoped specs.
const COURSE_C = { id: 90003, external_id: 'E2E_COURSE_C', code: 'E2E303', name: 'E2E Course C' };

// ── Visibility-invariant courses (consumed by visibility.spec.ts) ────────────
// D is HIDDEN (is_hidden=1) and E is ARCHIVED (archived_at set). Both are
// non-visible by the VisibilityOracle predicate, so they are absent from
// getCourses()/visible tasks AND from every existing spec's view (those specs
// count visible entities with `>0`/`toContain`, never an exact total — see the
// architect plan's seed-isolation analysis). E (archived, not hidden, not
// deleted) is the one that appears in getArchivedCourses(); D (hidden) appears
// in NEITHER set. Each carries one task to prove visibility filters TASKS too.
const COURSE_D = { id: 90004, external_id: 'E2E_COURSE_D', code: 'E2E404', name: 'E2E Hidden Course' };
const COURSE_E = { id: 90005, external_id: 'E2E_COURSE_E', code: 'E2E505', name: 'E2E Archived Course' };

/** ISO string for `now + days` (days may be negative for the past). */
function isoOffsetDays(now, days) {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Seed the deterministic dataset into the SQLite DB at `dbPath`.
 *
 * @param {string} dbPath absolute path to the (template-copied, empty-schema) canvas.db
 * @returns {{ courseA: {id:number, code:string}, courseB: {id:number, code:string} }}
 */
function seedDatabase(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const now = new Date();
  const dueFuture = isoOffsetDays(now, 14); // clearly future
  const dueSoon = isoOffsetDays(now, 2);
  const duePast = isoOffsetDays(now, -7);

  try {
    db.transaction(() => {
      // ── Term selection = 'all' (deterministic visibility) ───────────────────
      // VisibilityOracle defaults term_selection to 'auto', which filters courses
      // to those whose enrollment_term_id matches an active enrollment_terms row
      // (end_at > now-30d, name != 'Default Term'). The deterministic courses
      // carry no term, so 'auto' would hide them. Force 'all' so visibility
      // reduces to (not hidden / not deleted / not archived) — exactly the
      // invariant the specs rely on, with zero dependence on term dates.
      db.prepare(
        `INSERT OR REPLACE INTO visibility_settings (key, value, updated_at)
         VALUES ('term_selection', 'all', CURRENT_TIMESTAMP)`
      ).run();

      // ── Courses (2 visible, non-archived, non-hidden) ───────────────────────
      const insertCourse = db.prepare(
        `INSERT OR IGNORE INTO courses (id, external_id, code, name, is_hidden)
         VALUES (?, ?, ?, ?, 0)`
      );
      for (const c of [COURSE_A, COURSE_B, COURSE_C]) {
        insertCourse.run(c.id, c.external_id, c.code, c.name);
      }

      // ── Non-visible courses D (hidden) + E (archived) ───────────────────────
      // A DISTINCT prepared insert that sets is_hidden / archived_at EXPLICITLY.
      // The insertCourse above hardcodes is_hidden=0 and omits archived_at, so a
      // hidden/archived course MUST go through this path or the flag silently
      // defaults and the visibility spec would false-pass (course stays visible).
      // visibility.spec.ts reads getCourses()/getArchivedCourses() back to PROVE
      // the flags actually landed.
      const insertCourseHiddenArchived = db.prepare(
        `INSERT OR IGNORE INTO courses (id, external_id, code, name, is_hidden, archived_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      // D: hidden (is_hidden=1), not archived.
      insertCourseHiddenArchived.run(
        COURSE_D.id,
        COURSE_D.external_id,
        COURSE_D.code,
        COURSE_D.name,
        1,
        null
      );
      // E: archived (archived_at set), not hidden.
      insertCourseHiddenArchived.run(
        COURSE_E.id,
        COURSE_E.external_id,
        COURSE_E.code,
        COURSE_E.name,
        0,
        isoOffsetDays(now, -1)
      );

      // ── Course A filter-status tasks (one per derived bucket) ───────────────
      // Derivation (CourseDetail.tsx, evaluated top-down per task):
      //   info (Non Graded): is_optional=1 OR task_type='info'
      //   graded:            grade IS NOT NULL
      //   submitted:         is_completed=1 OR submission_status='submitted'
      //   pending:           everything else
      // Each row sets exactly the fields that land it in its intended bucket, so
      // the chip count is deterministic. source_type='user' (local task), visible
      // (course A is visible), deleted_at NULL (default).
      const insertTask = db.prepare(
        `INSERT OR IGNORE INTO tasks
           (external_id, source_type, course_id, title, due_at, task_type,
            grade, is_completed, submission_status, is_optional)
         VALUES (@external_id, 'user', @course_id, @title, @due_at, @task_type,
            @grade, @is_completed, @submission_status, @is_optional)`
      );

      // Pending: future due, no grade, not completed, not submitted, not optional.
      insertTask.run({
        external_id: 'E2E_TASK_PENDING',
        course_id: COURSE_A.id,
        title: 'E2E Pending Task',
        due_at: dueFuture,
        task_type: 'assignment',
        grade: null,
        is_completed: 0,
        submission_status: null,
        is_optional: 0,
      });
      // Second pending (so the Tasks page / W-S walk has >=2 rows in a bucket too).
      insertTask.run({
        external_id: 'E2E_TASK_PENDING_2',
        course_id: COURSE_A.id,
        title: 'E2E Pending Task 2',
        due_at: dueSoon,
        task_type: 'assignment',
        grade: null,
        is_completed: 0,
        submission_status: null,
        is_optional: 0,
      });

      // Submitted: submission_status='submitted', no grade (else it'd be graded).
      insertTask.run({
        external_id: 'E2E_TASK_SUBMITTED',
        course_id: COURSE_A.id,
        title: 'E2E Submitted Task',
        due_at: duePast,
        task_type: 'assignment',
        grade: null,
        is_completed: 0,
        submission_status: 'submitted',
        is_optional: 0,
      });

      // Graded: grade set (checked before submitted/pending).
      insertTask.run({
        external_id: 'E2E_TASK_GRADED',
        course_id: COURSE_A.id,
        title: 'E2E Graded Task',
        due_at: duePast,
        task_type: 'assignment',
        grade: 85,
        is_completed: 1,
        submission_status: 'graded',
        is_optional: 0,
      });

      // Non Graded (info): task_type='info' (checked first, regardless of grade).
      insertTask.run({
        external_id: 'E2E_TASK_INFO',
        course_id: COURSE_A.id,
        title: 'E2E Non-Graded Task',
        due_at: dueFuture,
        task_type: 'info',
        grade: null,
        is_completed: 0,
        submission_status: null,
        is_optional: 0,
      });

      // ── Tasks on the non-visible courses D (hidden) + E (archived) ──────────
      // These prove the visibility filter excludes TASKS belonging to hidden /
      // archived courses, not just the course rows themselves. They must NOT
      // appear in getTasks({courseIds:'all'}) (which still filters to visible
      // courses). External ids are distinct so the spec can target them.
      insertTask.run({
        external_id: 'E2E_TASK_HIDDEN_D',
        course_id: COURSE_D.id,
        title: 'E2E Hidden-Course Task',
        due_at: dueFuture,
        task_type: 'assignment',
        grade: null,
        is_completed: 0,
        submission_status: null,
        is_optional: 0,
      });
      insertTask.run({
        external_id: 'E2E_TASK_ARCHIVED_E',
        course_id: COURSE_E.id,
        title: 'E2E Archived-Course Task',
        due_at: dueFuture,
        task_type: 'assignment',
        grade: null,
        is_completed: 0,
        submission_status: null,
        is_optional: 0,
      });

      // ── Announcements / notifications on Course A (>=2) ─────────────────────
      // NOT NULL: title, message, published_at. dismissed_at defaults NULL (active).
      const insertNotif = db.prepare(
        `INSERT OR IGNORE INTO notifications
           (source_type, source_id, course_id, title, message, published_at)
         VALUES ('canvas', @source_id, @course_id, @title, @message, @published_at)`
      );
      insertNotif.run({
        source_id: 'E2E_ANN_1',
        course_id: COURSE_A.id,
        title: 'E2E Announcement One',
        message: 'First seeded announcement for Course A.',
        published_at: isoOffsetDays(now, -1),
      });
      insertNotif.run({
        source_id: 'E2E_ANN_2',
        course_id: COURSE_A.id,
        title: 'E2E Announcement Two',
        message: 'Second seeded announcement for Course A.',
        published_at: isoOffsetDays(now, -2),
      });

      // ── Files on Course A (>=1) — resources of type 'file' ──────────────────
      // The Files route reads resources WHERE type IN ('file','page'). NOT NULL:
      // external_id, course_id, title.
      const insertResource = db.prepare(
        `INSERT OR IGNORE INTO resources
           (external_id, course_id, type, title, url, size_bytes, mime_type)
         VALUES (@external_id, @course_id, 'file', @title, @url, @size_bytes, @mime_type)`
      );
      insertResource.run({
        external_id: 'E2E_FILE_1',
        course_id: COURSE_A.id,
        title: 'E2E Syllabus.pdf',
        url: 'https://example.invalid/files/E2E_FILE_1',
        size_bytes: 12345,
        mime_type: 'application/pdf',
      });

      // ── Calendar event on Course A (>=1, future) ────────────────────────────
      // NOT NULL: title, start_at.
      const insertEvent = db.prepare(
        `INSERT OR IGNORE INTO calendar_events
           (external_id, source_type, course_id, title, start_at, end_at)
         VALUES (@external_id, 'canvas', @course_id, @title, @start_at, @end_at)`
      );
      insertEvent.run({
        external_id: 'E2E_EVENT_1',
        course_id: COURSE_A.id,
        title: 'E2E Lecture',
        start_at: dueFuture,
        end_at: isoOffsetDays(now, 14.05),
      });

      // ── Sync updates feed on Course A (>=2 action-required) ─────────────────
      // The Updates page renders focusable rows (data-focus-scope="updates-page")
      // from action-required, non-conflict updates with seen_at IS NULL. The feed
      // JOINs sync_updates → courses and requires a sync_session.
      // sync_sessions.id is a TEXT primary key (NOT an autoincrement int), and
      // sync_updates.sync_session_id is a TEXT FK → sync_sessions(id) — so we set
      // an EXPLICIT text session id and reference it verbatim (a numeric
      // lastInsertRowid would not match the TEXT id and would fail the FK).
      // NOT NULL on sync_updates: sync_session_id, course_id, entity_type,
      // entity_id, change_type, title. entity_type/change_type carry CHECKs
      // ('task' and 'new' are both allowed).
      const sessionId = 'E2E_SESSION_1';
      db.prepare(
        `INSERT OR IGNORE INTO sync_sessions (id, started_at, completed_at)
         VALUES (@id, @started, @completed)`
      ).run({
        id: sessionId,
        started: isoOffsetDays(now, -0.1),
        completed: isoOffsetDays(now, -0.09),
      });

      const insertUpdate = db.prepare(
        `INSERT OR IGNORE INTO sync_updates
           (sync_session_id, course_id, entity_type, entity_id, change_type,
            title, subtitle, is_action_required, seen_at)
         VALUES (@session, @course_id, 'task', @entity_id, 'new',
            @title, @subtitle, 1, NULL)`
      );
      insertUpdate.run({
        session: sessionId,
        course_id: COURSE_A.id,
        entity_id: 'E2E_UPDATE_1',
        title: 'E2E New Task Available',
        subtitle: 'A new Canvas task is ready to accept.',
      });
      insertUpdate.run({
        session: sessionId,
        course_id: COURSE_A.id,
        entity_id: 'E2E_UPDATE_2',
        title: 'E2E Another New Task',
        subtitle: 'A second new Canvas task is ready to accept.',
      });

      // ── ONE conflict update on Course A (consumed by updates-conflict.spec) ─
      // The Updates page groups conflicts (entity_type='conflict', resolved_at
      // IS NULL) into the "needs review" conflicts[] array and renders a
      // ConflictItem (local vs Canvas values + Keep Local / Use Canvas). This
      // is the ONLY observable conflict UI — SyncConflictModal is disabled
      // (Layout.tsx). Conflicts do NOT enter the `updates-page` keyboard focus
      // scope (that's built only from non-conflict action tasks — see
      // UpdatesPage.flatActionTasks), so this row does not change the focusable
      // row count page-keyboard.spec.ts relies on.
      //
      // Schema (migration v99): entity_type/change_type CHECKs both allow
      // 'conflict'; entity_id is INTEGER NOT NULL; conflict_field/old_value/
      // new_value/external_id feed ConflictItem (external_id = the resolve id).
      // Reuses E2E_SESSION_1 (the TEXT FK target inserted above).
      db.prepare(
        `INSERT OR IGNORE INTO sync_updates
           (sync_session_id, course_id, entity_type, entity_id, external_id,
            change_type, title, subtitle, conflict_field, old_value, new_value,
            is_action_required, seen_at, resolved_at)
         VALUES (@session, @course_id, 'conflict', @entity_id, @external_id,
            'conflict', @title, @subtitle, @conflict_field, @old_value,
            @new_value, 1, NULL, NULL)`
      ).run({
        session: sessionId,
        course_id: COURSE_A.id,
        entity_id: 77001,
        external_id: 'E2E_CONFLICT_1',
        title: 'E2E Conflicted Task',
        subtitle: 'Local and Canvas disagree on the due date.',
        conflict_field: 'dueAt',
        old_value: JSON.stringify('2026-06-10T23:59:00Z'),
        new_value: JSON.stringify('2026-06-12T23:59:00Z'),
      });

      // ── Past-term archived courses (ADR-0015 grade-history) ─────────────────
      // Archived courses across TWO enrollment terms, each with graded tasks +
      // credits, so the grade modal's "Past terms" section and the Courses-page
      // archived-by-term drawer have deterministic content (term groups +
      // per-term + credit-weighted cumulative). All are archived (excluded from
      // the visible set) so they don't perturb the visible-course specs;
      // visibility.spec uses toContain/not.toContain (never exact totals).
      // course.enrollment_term_id (INTEGER, Canvas id) matches
      // enrollment_terms.external_id (TEXT) via CAST — the join the feature uses.
      const insertTerm = db.prepare(
        `INSERT OR IGNORE INTO enrollment_terms (external_id, name, start_at, end_at)
         VALUES (@external_id, @name, @start_at, @end_at)`
      );
      insertTerm.run({
        external_id: '7001',
        name: 'E2E 2024 Fall',
        start_at: isoOffsetDays(now, -320),
        end_at: isoOffsetDays(now, -200),
      });
      insertTerm.run({
        external_id: '7002',
        name: 'E2E 2024 Winter',
        start_at: isoOffsetDays(now, -220),
        end_at: isoOffsetDays(now, -100),
      });

      const insertArchivedTermCourse = db.prepare(
        `INSERT OR IGNORE INTO courses
           (id, external_id, code, name, is_hidden, archived_at, enrollment_term_id, credits)
         VALUES (?, ?, ?, ?, 0, ?, ?, ?)`
      );
      // Term 7001 ("E2E 2024 Fall"): two courses → per-term average across >1 course.
      insertArchivedTermCourse.run(90006, 'E2E_COURSE_PA', 'E2E606', 'E2E Past Course A', isoOffsetDays(now, -195), 7001, 1.0);
      insertArchivedTermCourse.run(90007, 'E2E_COURSE_PB', 'E2E707', 'E2E Past Course B', isoOffsetDays(now, -195), 7001, 0.5);
      // Term 7002 ("E2E 2024 Winter"): one course → ensures >=2 term groups.
      insertArchivedTermCourse.run(90008, 'E2E_COURSE_PC', 'E2E808', 'E2E Past Course C', isoOffsetDays(now, -95), 7002, 1.0);

      // Graded tasks so each past course has a computable (non-null) average.
      const pastGraded = (extId, courseId, title, grade) =>
        insertTask.run({
          external_id: extId,
          course_id: courseId,
          title,
          due_at: duePast,
          task_type: 'assignment',
          grade,
          is_completed: 1,
          submission_status: 'graded',
          is_optional: 0,
        });
      pastGraded('E2E_PTASK_A1', 90006, 'PA Midterm', 80);
      pastGraded('E2E_PTASK_A2', 90006, 'PA Final', 90);
      pastGraded('E2E_PTASK_B1', 90007, 'PB Final', 70);
      pastGraded('E2E_PTASK_C1', 90008, 'PC Final', 95);

      // ── Duplicate-warning matrix (ONE source, on the deterministic courses) ──
      seedDuplicateMatrix(db, COURSE_A.id, COURSE_B.id);
    })();

    return {
      courseA: { id: COURSE_A.id, code: COURSE_A.code },
      courseB: { id: COURSE_B.id, code: COURSE_B.code },
    };
    // Note: D/E ids/codes are exported as module constants (COURSE_D/COURSE_E)
    // for the visibility spec; they are intentionally NOT in the runtime marker
    // contract (which the fixture parses) — the spec imports the constants
    // directly.
  } finally {
    db.close();
  }
}

module.exports = { seedDatabase, COURSE_A, COURSE_B, COURSE_C, COURSE_D, COURSE_E };

// ── Subprocess entrypoint ───────────────────────────────────────────────────
// `<runner> seedDatabase.js <dbPath>` — seeds + prints the deterministic course
// markers (same contract style as seedDuplicateWarning.js). Run under
// Electron-as-Node so the Electron-ABI better-sqlite3 addon loads (see seed.ts).
if (require.main === module) {
  const dbPath = process.argv[2];
  if (!dbPath) {
    process.stderr.write('usage: seedDatabase.js <dbPath>\n');
    process.exit(2);
  }
  try {
    const { courseA, courseB } = seedDatabase(dbPath);
    process.stdout.write(`COURSE_A=${courseA.id}:${courseA.code}\n`);
    process.stdout.write(`COURSE_B=${courseB.id}:${courseB.code}\n`);
    process.exit(0);
  } catch (e) {
    process.stderr.write(String((e && e.message) || e) + '\n');
    process.exit(1);
  }
}
