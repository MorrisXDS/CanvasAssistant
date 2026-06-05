/**
 * Shared helpers for the deterministic schema template (ADR-0011).
 *
 * The template is a schema-correct, EMPTY `canvas.db` produced once per
 * `test:e2e` run by `globalSetup.ts` (it launches the built app against an empty
 * cwd and lets the app's own migration machinery build the schema), then copied
 * per-test by `seed.ts` and INSERT-only-seeded. Kept here so globalSetup and the
 * fixture agree on the path + the Electron-as-Node binary.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

/** Stable per-run template location (regenerated each run; never committed). */
export function schemaTemplatePath(): string {
  return path.join(os.tmpdir(), 'cid-e2e-schema', 'canvas.db');
}

/**
 * Resolve the electron binary path, used as an Electron-as-Node runtime
 * (ELECTRON_RUN_AS_NODE=1) so the on-disk Electron-ABI `better-sqlite3` addon
 * loads in seed/inspection subprocesses.
 */
export function electronBin(projectRoot: string): string {
  const win = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
  if (fs.existsSync(win)) return win;
  return path.join(projectRoot, 'node_modules', '.bin', 'electron');
}
