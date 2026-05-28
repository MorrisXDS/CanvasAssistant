/**
 * ADR-0007 enforcement (Final PR).
 *
 * Architectural fitness function: IPC handlers under
 * `src/lifecycle/ipc-handlers/**` must not call `database.execute*` or
 * `database.upsert` directly. SQL belongs in L1 readers / L4 commands.
 *
 * Strategy is **ratchet** not all-or-nothing — the migration train
 * (PR-B / PR-D / PR-E / PR-F.3 / PR-H) migrated 4 of 19 handler files
 * and ~105 violations remain across the other 15. A hard "zero
 * violations" assertion would fail today.
 *
 * Instead: a per-file ceiling lives in `.adr-0007-handler-sql-ceiling.json`.
 *   - **NEW file** with violations → fails (no ceiling entry exists yet
 *     for it, so the implicit ceiling is 0).
 *   - **Existing file** that adds a new violation → fails (count >
 *     ceiling).
 *   - **Existing file** with a removed violation → fails (count <
 *     ceiling → the developer should ratchet the ceiling DOWN in the
 *     same PR; the test is exact-match, not "less-than-or-equal").
 *   - **File deleted or fully migrated to zero** → its ceiling entry
 *     must be removed from the JSON or the test fails.
 *
 * The exact-match rule (not ≤) prevents the ceiling from drifting up
 * over time without anyone noticing. Removing a violation MUST be
 * paired with a ceiling decrement — that's the audit trail.
 */

import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HANDLER_DIR = path.join(REPO_ROOT, 'src', 'lifecycle', 'ipc-handlers');
const CEILING_FILE = path.join(REPO_ROOT, '.adr-0007-handler-sql-ceiling.json');
const FORBIDDEN_CALL_PATTERN =
  /\b(database|db|this\.database)\.(executeRead|executeReadOne|executeWrite|upsert)\s*\(/g;

interface CeilingFile {
  paths: Record<string, number>;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

function countViolations(absPath: string): number {
  const text = fs.readFileSync(absPath, 'utf8');
  const matches = text.match(FORBIDDEN_CALL_PATTERN);
  return matches ? matches.length : 0;
}

function toPosixRelative(absPath: string): string {
  return path.relative(REPO_ROOT, absPath).split(path.sep).join('/');
}

describe('ADR-0007 enforcement: IPC handlers do not call database.execute* / upsert directly', () => {
  const ceiling: CeilingFile = JSON.parse(fs.readFileSync(CEILING_FILE, 'utf8'));
  const ceilingPaths = ceiling.paths ?? {};

  // Snapshot the current state of every handler file.
  const actualCounts: Record<string, number> = {};
  for (const abs of walk(HANDLER_DIR)) {
    const count = countViolations(abs);
    if (count > 0) {
      actualCounts[toPosixRelative(abs)] = count;
    }
  }

  test('no new violations introduced (new file or new call in existing file)', () => {
    const offenders: Array<{ file: string; actual: number; ceiling: number }> = [];
    for (const [file, count] of Object.entries(actualCounts)) {
      const allowed = ceilingPaths[file] ?? 0;
      if (count > allowed) {
        offenders.push({ file, actual: count, ceiling: allowed });
      }
    }

    if (offenders.length > 0) {
      const report = offenders
        .map(
          (o) =>
            `  ${o.file}: ${o.actual} calls (ceiling ${o.ceiling}) — over by ${o.actual - o.ceiling}`
        )
        .join('\n');
      throw new Error(
        `ADR-0007: new raw \`database.execute*\` / \`database.upsert\` calls in IPC handlers.\n${report}\n\n` +
          `IPC handlers under src/lifecycle/ipc-handlers/** may not call database.execute* / upsert directly.\n` +
          `Move the SQL into an L1 reader (or use an L4 command) — see ADR-0007.\n` +
          `If you've actually intentionally added them, update .adr-0007-handler-sql-ceiling.json.`
      );
    }
  });

  test('ratchet stays tight (no stale ceilings above actual count)', () => {
    const drifts: Array<{ file: string; actual: number; ceiling: number }> = [];
    for (const [file, allowed] of Object.entries(ceilingPaths)) {
      const actual = actualCounts[file] ?? 0;
      if (actual < allowed) {
        drifts.push({ file, actual, ceiling: allowed });
      }
    }

    if (drifts.length > 0) {
      const report = drifts
        .map(
          (d) =>
            `  ${d.file}: ${d.actual} actual (ceiling ${d.ceiling}) — decrement ceiling to ${d.actual}` +
            (d.actual === 0 ? ' (or remove the entry to lock the file clean)' : '')
        )
        .join('\n');
      throw new Error(
        `ADR-0007: handler file(s) have fewer raw-SQL calls than the ceiling allows. ` +
          `Ratchet DOWN to lock in the improvement:\n${report}\n\n` +
          `Edit .adr-0007-handler-sql-ceiling.json to match the new count.`
      );
    }
  });

  test('ceiling does not list files that no longer exist or have zero violations', () => {
    const stale: string[] = [];
    for (const file of Object.keys(ceilingPaths)) {
      const abs = path.join(REPO_ROOT, ...file.split('/'));
      if (!fs.existsSync(abs)) {
        stale.push(`${file} — file does not exist (remove ceiling entry)`);
        continue;
      }
      const count = countViolations(abs);
      if (count === 0) {
        stale.push(`${file} — zero violations (remove ceiling entry to lock clean)`);
      }
    }

    if (stale.length > 0) {
      throw new Error(
        `ADR-0007: stale entries in .adr-0007-handler-sql-ceiling.json:\n  ${stale.join('\n  ')}`
      );
    }
  });
});
