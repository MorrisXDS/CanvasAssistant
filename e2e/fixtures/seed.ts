/**
 * Builds an isolated, offline app-state directory for one e2e run.
 *
 * Why copy the local DB instead of seeding programmatically: `better-sqlite3` is
 * rebuilt for Electron's ABI, so it can't be opened from Playwright's plain-Node
 * runner. A file copy needs no native module and is guaranteed schema-correct.
 *
 * Layout produced (used as the launched app's cwd, so APP_ROOT resolves here):
 *   <tmp>/database/canvas.db(+-wal/-shm)   — snapshot of the real local DB
 *   <tmp>/.config/canvas-connection.json   — points Canvas baseUrl at the mock
 *   <tmp>/userData/                         — isolated Electron profile (own lock)
 *
 * ── OPT-IN duplicate-warning seeding (the ABI trap, resolved) ─────────────────
 * When `seedDuplicates: true`, after copying the DB we run the SHARED seed lib
 * (`e2e/fixtures/seedDuplicateWarning.js`) against the *copy* to attach the
 * deterministic DuplicateWarningModal matrix (used only by
 * `modal-stack-duplicate.spec.ts`). The runner itself does NOT load
 * `better-sqlite3` (Playwright's plain-Node runner must never load a native
 * module — that's the whole reason this fixture copies a file). The seed runs in a
 * SUBPROCESS instead.
 *
 * The subprocess is spawned under **Electron-as-Node** (the electron binary with
 * `ELECTRON_RUN_AS_NODE=1`), NOT plain Node. Why: `npm run test:e2e` launches the
 * built Electron app, so the on-disk `better-sqlite3` addon is on the ELECTRON ABI
 * (process.versions.modules === 143 here; the Node ABI is 137). A plain-Node
 * `process.execPath` subprocess would fail to instantiate that addon
 * (`NODE_MODULE_VERSION` mismatch — verified empirically: `require` succeeds
 * lazily, but `new Database()` throws). Running the seed under Electron-as-Node
 * gives it the Electron ABI, so seed + launched app share ONE ABI and nothing is
 * ever flipped. This mirrors the manual-test CLI's two-phase dance, collapsed into
 * a single ABI for the automated fixture.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

export interface SeededCourse {
  id: number;
  code: string;
}

export interface Fixture {
  /** Use as the launched app's cwd. */
  dir: string;
  /** Pass as --user-data-dir so the e2e instance gets its own single-instance lock. */
  userDataDir: string;
  /** Present only when `seedDuplicates` was requested; null when seeding was skipped. */
  duplicateSeed: { courseA: SeededCourse; courseB: SeededCourse } | null;
  cleanup: () => void;
}

export interface CreateFixtureOptions {
  /**
   * Opt-in: after copying canvas.db, seed the deterministic duplicate-warning
   * matrix into the copy via the shared seed lib (Electron-as-Node subprocess).
   * Default false — existing specs are byte-for-byte unaffected. Only
   * `modal-stack-duplicate.spec.ts` sets this.
   */
  seedDuplicates?: boolean;
}

/** Resolve the electron binary path (used as an Electron-as-Node runtime). */
function electronBin(projectRoot: string): string {
  const win = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
  if (fs.existsSync(win)) return win;
  return path.join(projectRoot, 'node_modules', '.bin', 'electron');
}

export function createFixture(
  mockUrl: string,
  options: CreateFixtureOptions = {}
): Fixture {
  const projectRoot = process.cwd();
  const srcDb = path.join(projectRoot, 'database', 'canvas.db');

  if (!fs.existsSync(srcDb)) {
    throw new Error(
      `e2e requires a populated local DB at ${srcDb}.\n` +
        `Run the app once, sync at least one course, then close it before running e2e.`
    );
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cid-e2e-'));
  const dbDir = path.join(dir, 'database');
  const configDir = path.join(dir, '.config');
  const userDataDir = path.join(dir, 'userData');
  for (const d of [dbDir, configDir, userDataDir]) {
    fs.mkdirSync(d, { recursive: true });
  }

  // Copy DB + WAL/SHM so the snapshot is internally consistent even if a reader
  // had uncheckpointed pages.
  for (const suffix of ['', '-wal', '-shm']) {
    const src = srcDb + suffix;
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

  let duplicateSeed: Fixture['duplicateSeed'] = null;
  if (options.seedDuplicates) {
    duplicateSeed = runDuplicateSeed(projectRoot, path.join(dbDir, 'canvas.db'));
  }

  return {
    dir,
    userDataDir,
    duplicateSeed,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

/**
 * Spawn the shared seed lib under Electron-as-Node against the copied DB.
 * Returns the seeded course markers, or null if the copy had no visible courses
 * (the caller should `test.skip` — mirrors the existing data-tolerant posture).
 * Throws on an unexpected subprocess failure (e.g. ABI mismatch) so the trap is
 * loud rather than silent.
 */
function runDuplicateSeed(
  projectRoot: string,
  dbPath: string
): { courseA: SeededCourse; courseB: SeededCourse } | null {
  const seedScript = path.join(projectRoot, 'e2e', 'fixtures', 'seedDuplicateWarning.js');
  const r = spawnSync(electronBin(projectRoot), [seedScript, dbPath], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });

  // Exit 1 = "No visible courses" → treat as a skip signal (return null).
  if (r.status === 1 && /No visible courses/.test(r.stderr ?? '')) {
    return null;
  }
  if (r.status !== 0) {
    throw new Error(
      `Duplicate-warning seed subprocess failed (status ${r.status}).\n` +
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
