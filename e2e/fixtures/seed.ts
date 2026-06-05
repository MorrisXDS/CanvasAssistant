/**
 * Builds an isolated, offline app-state directory for one e2e run.
 *
 * ── DETERMINISTIC SEED (ADR-0011) ────────────────────────────────────────────
 * No longer copies the dev machine's real `database/canvas.db`. Instead it copies
 * the SCHEMA TEMPLATE produced once per run by `globalSetup.ts` (the built app
 * self-heals an empty DB to the current schema), then seeds a FIXED, KNOWN dataset
 * into the copy via the unified seed lib (`e2e/fixtures/seedDatabase.js`). This
 * makes the suite portable (a fresh clone / another machine runs green) and
 * skip-free (every entity is guaranteed present). See ADR-0011.
 *
 * Layout produced (used as the launched app's cwd, so APP_ROOT resolves here):
 *   <tmp>/database/canvas.db(+-wal/-shm)   — copy of the schema template, seeded
 *   <tmp>/.config/canvas-connection.json   — points Canvas baseUrl at the mock
 *   <tmp>/userData/                         — isolated Electron profile (own lock)
 *
 * ── NATIVE ABI (the load-bearing gotcha, unchanged) ──────────────────────────
 * The Playwright runner is plain Node and must NEVER load `better-sqlite3` (the
 * on-disk addon is built for the Electron ABI by `npm run rebuild`). So the seed
 * runs in a SUBPROCESS spawned under Electron-as-Node (the electron binary with
 * ELECTRON_RUN_AS_NODE=1): with that flag the electron binary behaves like Node
 * but exposes the Electron ABI (process.versions.modules === 143 here), so the
 * Electron build of better-sqlite3 loads cleanly. Seed + launched app share ONE
 * ABI and nothing is ever flipped. A plain-Node spawn would throw on
 * `new Database()` (NODE_MODULE_VERSION mismatch).
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { schemaTemplatePath, electronBin } from './schemaTemplate';

export interface SeededCourse {
  id: number;
  code: string;
}

export interface Fixture {
  /** Use as the launched app's cwd. */
  dir: string;
  /** Pass as --user-data-dir so the e2e instance gets its own single-instance lock. */
  userDataDir: string;
  /**
   * The deterministic course markers. ALWAYS present now (the unified seed always
   * inserts courses A/B + the duplicate-warning matrix) — never null.
   */
  duplicateSeed: { courseA: SeededCourse; courseB: SeededCourse };
  cleanup: () => void;
}

export function createFixture(mockUrl: string): Fixture {
  const projectRoot = process.cwd();
  const templateDb = schemaTemplatePath();

  if (!fs.existsSync(templateDb)) {
    throw new Error(
      `e2e schema template missing at ${templateDb}.\n` +
        `It is built by globalSetup.ts at the start of the run — ensure ` +
        `playwright.config.ts wires \`globalSetup\` and that the app reached the ` +
        `final schema version on an empty DB (ADR-0011 approach A).`
    );
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cid-e2e-'));
  const dbDir = path.join(dir, 'database');
  const configDir = path.join(dir, '.config');
  const userDataDir = path.join(dir, 'userData');
  for (const d of [dbDir, configDir, userDataDir]) {
    fs.mkdirSync(d, { recursive: true });
  }

  // Copy the schema template (DB + WAL/SHM) — cheap, no native module here.
  for (const suffix of ['', '-wal', '-shm']) {
    const src = templateDb + suffix;
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(dbDir, 'canvas.db' + suffix));
    }
  }

  // Saved connection makes the main process initialize the Canvas client against
  // the local mock (shape: { baseUrl } — see credentialHandlers.ts).
  fs.writeFileSync(
    path.join(configDir, 'canvas-connection.json'),
    JSON.stringify({ baseUrl: mockUrl }, null, 2)
  );

  // Seed the deterministic dataset into the copy (Electron-as-Node subprocess).
  const duplicateSeed = runSeed(projectRoot, path.join(dbDir, 'canvas.db'));

  return {
    dir,
    userDataDir,
    duplicateSeed,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

/**
 * Spawn the unified seed lib under Electron-as-Node against the copied DB and
 * parse the deterministic course markers. Throws loudly on any failure (a wrong
 * ABI, a schema mismatch, or a parse failure) so the trap is never silent.
 */
function runSeed(
  projectRoot: string,
  dbPath: string
): { courseA: SeededCourse; courseB: SeededCourse } {
  const seedScript =
    process.env.CID_E2E_SEED === 'current-term'
      ? path.join(projectRoot, 'e2e', 'fixtures', 'seedDatabaseCurrentTerm.js')
      : path.join(projectRoot, 'e2e', 'fixtures', 'seedDatabase.js');
  const r = spawnSync(electronBin(projectRoot), [seedScript, dbPath], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });

  if (r.status !== 0) {
    throw new Error(
      `Deterministic seed subprocess failed (status ${r.status}).\n` +
        `If this is a NODE_MODULE_VERSION mismatch, ensure better-sqlite3 is on the ` +
        `Electron ABI (run \`npm run rebuild\`) — the seed runs under Electron-as-Node.\n` +
        `stderr: ${r.stderr}\nstdout: ${r.stdout}`
    );
  }

  const out = r.stdout ?? '';
  const parse = (prefix: string): SeededCourse | null => {
    const line = out.split('\n').find((l) => l.startsWith(prefix));
    if (!line) return null;
    const rest = line.slice(prefix.length); // "id:code"
    const idx = rest.indexOf(':');
    if (idx === -1) return null;
    return { id: Number(rest.slice(0, idx)), code: rest.slice(idx + 1) };
  };
  const courseA = parse('COURSE_A=');
  const courseB = parse('COURSE_B=');
  if (!courseA || !courseB) {
    throw new Error(`Could not parse seed markers from subprocess stdout:\n${out}`);
  }
  return { courseA, courseB };
}
