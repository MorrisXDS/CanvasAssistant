/**
 * seedDatabaseDemo.js — realistic SYNTHETIC data for portfolio screenshots.
 *
 * NOT used by the test suite (the deterministic suite uses seedDatabase.js). This
 * seed exists only to populate the app with believable, fully-fake data so the
 * README screenshots show no real Canvas information. Run via the `screenshots`
 * Playwright project (see e2e/capture-screenshots.spec.ts), which sets
 * CID_E2E_SEED=demo so e2e/fixtures/seed.ts spawns this module (Electron-as-Node)
 * against a schema-correct template DB.
 *
 * All courses/grades/tasks/announcements/files/events below are invented. Colors
 * are left null so the app assigns them from its own palette (matches production).
 * Named-column inserts only (schema-version-agnostic).
 */

const Database = require('better-sqlite3');

function iso(now, days) {
  return new Date(now.getTime() + days * 86400000).toISOString();
}

// Invented, UofT-flavoured courses. current_grade drives the Dashboard average.
const COURSES = [
  { id: 70001, code: 'CSC373H1', name: 'Algorithm Design & Analysis', grade: 88, target: 85 },
  { id: 70002, code: 'CSC369H1', name: 'Operating Systems', grade: 91, target: 85 },
  { id: 70003, code: 'CSC384H1', name: 'Introduction to Artificial Intelligence', grade: 93, target: 90 },
  { id: 70004, code: 'MAT237Y1', name: 'Multivariable Calculus', grade: 79, target: 80 },
  { id: 70005, code: 'STA247H1', name: 'Probability with Computer Applications', grade: 84, target: 85 },
];

function seedDatabaseDemo(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const now = new Date();

  try {
    db.transaction(() => {
      db.prepare(
        `INSERT OR REPLACE INTO visibility_settings (key, value, updated_at)
         VALUES ('term_selection', 'all', CURRENT_TIMESTAMP)`
      ).run();

      const insCourse = db.prepare(
        `INSERT OR IGNORE INTO courses
           (id, external_id, code, name, current_grade, target_grade, credits,
            total_weight, is_hidden)
         VALUES (@id, @ext, @code, @name, @grade, @target, 0.5, 100, 0)`
      );
      for (const c of COURSES) {
        insCourse.run({ id: c.id, ext: `DEMO_C_${c.id}`, code: c.code, name: c.name, grade: c.grade, target: c.target });
      }

      const insTask = db.prepare(
        `INSERT OR IGNORE INTO tasks
           (external_id, source_type, course_id, title, due_at, task_type,
            points_possible, weight, grade, is_completed, submission_status, is_optional)
         VALUES (@ext, 'canvas', @course, @title, @due, @type,
            @points, @weight, @grade, @done, @sub, 0)`
      );
      // weight is a percentage (e.g. 15 = 15% of the course grade). The Dashboard
      // computes each course's grade as a weighted average of its GRADED tasks
      // (weight > 0), and "Important Works" lists incomplete tasks with weight > 5.
      const T = (ext, course, title, dueDays, type, points, weight, grade, done, sub) =>
        insTask.run({ ext, course, title, due: dueDays === null ? null : iso(now, dueDays), type, points, weight, grade, done, sub });

      // Pending (future, ungraded, incomplete) — weighted so they surface in Important Works
      T('DEMO_T1', 70001, 'Problem Set 4', 5, 'assignment', 100, 10, null, 0, null);
      T('DEMO_T2', 70002, 'Assignment 2: Thread Scheduler', 9, 'homework', 100, 15, null, 0, null);
      T('DEMO_T3', 70003, 'Project Milestone 1', 3, 'assignment', 50, 20, null, 0, null);
      T('DEMO_T4', 70004, 'Written Homework 7', 12, 'homework', 40, 8, null, 0, null);
      T('DEMO_T5', 70005, 'Tutorial Quiz 6', 1, 'quiz', 20, 5, null, 0, null);
      // Overdue (past, ungraded, incomplete)
      T('DEMO_T6', 70001, 'Problem Set 3', -3, 'assignment', 100, 10, null, 0, null);
      T('DEMO_T7', 70004, 'Written Homework 6', -1, 'homework', 40, 8, null, 0, null);
      // Submitted (awaiting grade)
      T('DEMO_T8', 70002, 'Lab 4: Synchronization', -2, 'assignment', 50, 10, null, 0, 'submitted');
      // Graded (weight > 0 so they drive each course's computed grade → Dashboard avg)
      T('DEMO_T9', 70001, 'Problem Set 2', -10, 'assignment', 100, 10, 92, 1, 'graded');
      T('DEMO_T10', 70002, 'Assignment 1: Shell', -14, 'homework', 100, 15, 88, 1, 'graded');
      T('DEMO_T11', 70003, 'Search & Heuristics', -8, 'assignment', 100, 15, 95, 1, 'graded');
      T('DEMO_T12', 70004, 'Term Test 1', -16, 'exam', 60, 25, 76, 1, 'graded');
      T('DEMO_T13', 70005, 'Quiz 5', -6, 'quiz', 20, 10, 90, 1, 'graded');

      const insNotif = db.prepare(
        `INSERT OR IGNORE INTO notifications
           (source_type, source_id, course_id, title, message, published_at)
         VALUES ('canvas', @sid, @course, @title, @msg, @pub)`
      );
      const N = (sid, course, title, msg, days) =>
        insNotif.run({ sid, course, title, msg, pub: iso(now, days) });
      N('DEMO_A1', 70001, 'Midterm grades posted', 'Midterm grades are now available under Grades. Regrade requests close Friday.', -1);
      N('DEMO_A2', 70002, 'Assignment 2 deadline extended', 'A2 is now due Friday at 11:59pm to accommodate the tutorial schedule.', -2);
      N('DEMO_A3', 70003, 'Guest lecture: Deep Learning', 'Thursday\'s lecture features a guest speaker on modern deep learning. Attendance recommended.', -3);
      N('DEMO_A4', 70004, 'Tutorial room change', 'Starting this week, Tutorial 0201 moves to MS 3153.', -4);

      const insRes = db.prepare(
        `INSERT OR IGNORE INTO resources
           (external_id, course_id, type, title, folder_path, url, size_bytes, mime_type)
         VALUES (@ext, @course, @type, @title, @folder, @url, @size, @mime)`
      );
      const F = (ext, course, title, folder, size) =>
        insRes.run({ ext, course, type: 'file', title, folder, url: `https://example.invalid/files/${ext}`, size, mime: 'application/pdf' });
      F('DEMO_F1', 70001, 'Lecture 12 — Dynamic Programming.pdf', 'Lectures', 2_400_000);
      F('DEMO_F2', 70001, 'PS4 Handout.pdf', 'Assignments', 180_000);
      F('DEMO_F3', 70001, 'Course Syllabus.pdf', null, 95_000);
      F('DEMO_F4', 70002, 'Lab 4 Manual.pdf', 'Labs', 320_000);
      F('DEMO_F5', 70002, 'Lecture 09 — Synchronization.pdf', 'Lectures', 1_900_000);
      F('DEMO_F6', 70003, 'Assignment 3 — Adversarial Search.pdf', 'Assignments', 210_000);
      F('DEMO_F7', 70004, 'Tutorial 5 Solutions.pdf', 'Tutorials', 140_000);
      F('DEMO_F8', 70005, 'Probability Formula Sheet.pdf', null, 60_000);

      const insEvent = db.prepare(
        `INSERT OR IGNORE INTO calendar_events
           (external_id, source_type, course_id, title, start_at, end_at)
         VALUES (@ext, 'canvas', @course, @title, @start, @end)`
      );
      const E = (ext, course, title, days, durHrs) =>
        insEvent.run({ ext, course, title, start: iso(now, days), end: iso(now, days + durHrs / 24) });
      E('DEMO_E1', 70001, 'CSC373 Lecture', 0, 1);
      E('DEMO_E2', 70002, 'CSC369 Tutorial', 1, 1);
      E('DEMO_E3', 70003, 'CSC384 Office Hours', 2, 2);
      E('DEMO_E4', 70004, 'MAT237 Lecture', -2, 1);
      E('DEMO_E5', 70003, 'CSC384 Midterm', 15, 2);
      E('DEMO_E6', 70005, 'STA247 Tutorial', 4, 1);
    })();
    return { count: COURSES.length };
  } finally {
    db.close();
  }
}

module.exports = { seedDatabaseDemo, COURSES };

if (require.main === module) {
  const dbPath = process.argv[2];
  if (!dbPath) {
    process.stderr.write('usage: seedDatabaseDemo.js <dbPath>\n');
    process.exit(2);
  }
  try {
    seedDatabaseDemo(dbPath);
    // Print COURSE_A/COURSE_B markers so the shared runSeed() parser in seed.ts
    // (which expects them) is satisfied even on the demo path.
    process.stdout.write(`COURSE_A=${COURSES[0].id}:${COURSES[0].code}\n`);
    process.stdout.write(`COURSE_B=${COURSES[1].id}:${COURSES[1].code}\n`);
    process.exit(0);
  } catch (e) {
    process.stderr.write(String((e && e.message) || e) + '\n');
    process.exit(1);
  }
}
