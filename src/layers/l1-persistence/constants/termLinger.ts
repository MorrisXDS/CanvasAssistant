/**
 * termLinger — the single source of truth for the term-end linger buffer.
 *
 * A finished course should be *either* visible *or* archived, never both/neither.
 * Two code paths key off the same threshold:
 *
 *  1. `VisibilityOracle` ('auto' term filter) hides courses whose term ended
 *     more than `TERM_END_BUFFER_DAYS` ago.
 *  2. `SyncCourseOperations.autoArchiveExpiredCourses()` auto-archives courses
 *     once their term has been over for `TERM_END_BUFFER_DAYS`.
 *
 * Before this constant the filter used 30 days while auto-archive used 0 days,
 * so a just-finished course was yanked out of the dashboard average before its
 * final grades posted (a ~30-day limbo gap). Sharing ONE number closes the gap.
 *
 * L1 is the lowest layer both consumers can import without violating the
 * unidirectional layer flow (L2 → L1 is legal; the reverse is not).
 *
 * See ADR-0015.
 */
export const TERM_END_BUFFER_DAYS = 30;
