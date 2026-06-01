/**
 * ADR-0007 enforcement (hard-zero, 2026-06-01).
 *
 * Architectural fitness function: NO file under `src/lifecycle/ipc-handlers/**`
 * may call `database.executeRead* / executeWrite / upsert` directly. SQL belongs
 * in L1 readers / L4 commands.
 *
 * History: the migration train ran as a *ratchet* (a per-file ceiling in
 * `.adr-0007-handler-sql-ceiling.json`) while handlers were migrated one by one.
 * Every handler is now migrated AND every generic-typed read has been moved out,
 * so this is a plain "zero violations" assertion and the ceiling file is retired.
 *
 * The pattern matches both the call form `db.executeRead(` and the generic form
 * `db.executeRead<T>(` — the old ratchet regex (`…\s*\(`) could not see the
 * generic form, which is how ~30 reads stayed invisible until the closeout.
 * `database.transaction(` and `database.checkpoint(` are control-flow / pragma
 * helpers, not raw SQL, and are intentionally NOT matched.
 */

import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HANDLER_DIR = path.join(REPO_ROOT, 'src', 'lifecycle', 'ipc-handlers');
// Matches `.executeRead(` and `.executeRead<…>(` (and the other methods).
const FORBIDDEN_CALL_PATTERN =
  /\b(database|db|this\.database)\.(executeRead|executeReadOne|executeWrite|upsert)\s*[<(]/g;

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

function toPosixRelative(absPath: string): string {
  return path.relative(REPO_ROOT, absPath).split(path.sep).join('/');
}

describe('ADR-0007 enforcement: IPC handlers contain no raw database SQL', () => {
  test('no database.execute* / upsert calls anywhere under ipc-handlers/**', () => {
    const offenders: Array<{ file: string; count: number }> = [];
    for (const abs of walk(HANDLER_DIR)) {
      const text = fs.readFileSync(abs, 'utf8');
      const matches = text.match(FORBIDDEN_CALL_PATTERN);
      if (matches && matches.length > 0) {
        offenders.push({ file: toPosixRelative(abs), count: matches.length });
      }
    }

    if (offenders.length > 0) {
      const report = offenders.map((o) => `  ${o.file}: ${o.count} call(s)`).join('\n');
      throw new Error(
        `ADR-0007: raw \`database.execute*\` / \`database.upsert\` calls found in IPC handlers.\n${report}\n\n` +
          `IPC handlers under src/lifecycle/ipc-handlers/** must not call database.execute* / upsert ` +
          `directly (the generic-typed \`executeRead<T>(\` form counts too).\n` +
          `Move the SQL into an L1 reader or an L4 command — see docs/adr/0007.`
      );
    }
  });
});
