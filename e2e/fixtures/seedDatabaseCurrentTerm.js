/**
 * seedDatabaseCurrentTerm.js - test-only variant of the deterministic e2e seed.
 *
 * The default seedDatabase.js intentionally sets term_selection='all' so the
 * suite is independent of term dates. This copy is for manual/sync tests that
 * need the app to classify seeded courses as "current" through the real
 * auto-term predicate instead:
 *
 *   visibility_settings.term_selection = 'auto'
 *   courses.enrollment_term_id         = CURRENT_TERM_ID
 *   enrollment_terms.end_at            = now + EXTENDED_TERM_DAYS
 *
 * Keep this out of production paths. It is a fixture convenience for testing
 * the current-course sync/visibility path when a real Canvas account has no
 * enrollments.
 */

const Database = require('better-sqlite3');
const {
  seedDatabase,
  COURSE_A,
  COURSE_B,
  COURSE_C,
  COURSE_D,
  COURSE_E,
} = require('./seedDatabase');

const CURRENT_TERM_ID = 990001;
const EXTENDED_TERM_DAYS = 180;

function isoOffsetDays(now, days) {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Seed the normal deterministic dataset, then make its term classification use
 * the "auto/current term" path with an extended future end date.
 *
 * @param {string} dbPath absolute path to the schema-ready canvas.db
 * @returns {{ courseA: {id:number, code:string}, courseB: {id:number, code:string}, term: {id:number, endAt:string} }}
 */
function seedDatabaseCurrentTerm(dbPath) {
  const markers = seedDatabase(dbPath);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const now = new Date();
  const startAt = isoOffsetDays(now, -90);
  const endAt = isoOffsetDays(now, EXTENDED_TERM_DAYS);

  try {
    db.transaction(() => {
      db.prepare(
        `INSERT INTO enrollment_terms (external_id, name, start_at, end_at)
         VALUES (@external_id, @name, @start_at, @end_at)
         ON CONFLICT(external_id) DO UPDATE SET
           name = excluded.name,
           start_at = excluded.start_at,
           end_at = excluded.end_at`
      ).run({
        external_id: String(CURRENT_TERM_ID),
        name: 'E2E Extended Current Term',
        start_at: startAt,
        end_at: endAt,
      });

      db.prepare(
        `UPDATE courses
         SET enrollment_term_id = @term_id
         WHERE id IN (@course_a, @course_b, @course_c, @course_d, @course_e)`
      ).run({
        term_id: CURRENT_TERM_ID,
        course_a: COURSE_A.id,
        course_b: COURSE_B.id,
        course_c: COURSE_C.id,
        course_d: COURSE_D.id,
        course_e: COURSE_E.id,
      });

      db.prepare(
        `INSERT OR REPLACE INTO visibility_settings (key, value, updated_at)
         VALUES ('term_selection', 'auto', CURRENT_TIMESTAMP)`
      ).run();
    })();

    return {
      ...markers,
      term: { id: CURRENT_TERM_ID, endAt },
    };
  } finally {
    db.close();
  }
}

module.exports = {
  seedDatabaseCurrentTerm,
  CURRENT_TERM_ID,
  EXTENDED_TERM_DAYS,
  COURSE_A,
  COURSE_B,
  COURSE_C,
  COURSE_D,
  COURSE_E,
};

if (require.main === module) {
  const dbPath = process.argv[2];
  if (!dbPath) {
    process.stderr.write('usage: seedDatabaseCurrentTerm.js <dbPath>\n');
    process.exit(2);
  }
  try {
    const { courseA, courseB, term } = seedDatabaseCurrentTerm(dbPath);
    process.stdout.write(`COURSE_A=${courseA.id}:${courseA.code}\n`);
    process.stdout.write(`COURSE_B=${courseB.id}:${courseB.code}\n`);
    process.stdout.write(`CURRENT_TERM=${term.id}:${term.endAt}\n`);
    process.exit(0);
  } catch (e) {
    process.stderr.write(String((e && e.message) || e) + '\n');
    process.exit(1);
  }
}
