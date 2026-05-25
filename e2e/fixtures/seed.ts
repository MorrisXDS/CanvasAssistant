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
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

export interface Fixture {
  /** Use as the launched app's cwd. */
  dir: string;
  /** Pass as --user-data-dir so the e2e instance gets its own single-instance lock. */
  userDataDir: string;
  cleanup: () => void;
}

export function createFixture(mockUrl: string): Fixture {
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

  return {
    dir,
    userDataDir,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}
