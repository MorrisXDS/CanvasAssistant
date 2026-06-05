/**
 * Playwright globalSetup — build the deterministic schema TEMPLATE once per run.
 *
 * Strategy (ADR-0011, approach A → template):
 *   1. Launch the BUILT Electron app against a throwaway EMPTY cwd. The app's own
 *      AppLifecycle.initialize() runs database.initialize() →
 *      MigrationRunner.runAll(coreMigrations) (v1→v113) → verifyAndRepairSchema()
 *      → the runtime ensureTable/ALTER self-healing points. After launch the
 *      on-disk `<cwd>/database/canvas.db` carries the EXACT, current, complete
 *      schema — including non-migration runtime bits (pending_sync_conflicts,
 *      sync_preferences.prefer_canvas, visibility_settings, …).
 *   2. Wait until the schema has reached the final migration version, then close.
 *   3. Copy that DB to a stable template path
 *      (`<os.tmpdir()>/cid-e2e-schema/canvas.db`). Each test's createFixture()
 *      copies this template (cheap, no native module in the Playwright runner) and
 *      INSERT-only-seeds it via the Electron-as-Node subprocess.
 *
 * Why this self-heals: the template is produced by the app's own code path, so it
 * is definitionally current. When a migration lands (v114…) the template is
 * regenerated automatically on the next `test:e2e` run — nothing hand-maintained,
 * nothing checked into git that can go stale.
 *
 * Verified on the real Windows dev machine (2026-06-05): a launch against a truly
 * empty cwd reaches the final migration version cleanly; the onboarding/credential
 * UI gate does NOT block migrations (they run during main-process init, before the
 * renderer gate). If a future change ever blocked migrations on an empty DB, the
 * fallback is a two-phase same-run launch in createFixture (still approach A, no
 * template) — see ADR-0011.
 */
import { _electron as electron } from '@playwright/test';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { startMockCanvas } from './mockCanvas';
import { schemaTemplatePath, electronBin } from './fixtures/schemaTemplate';

/** The final migration version the template must reach before we trust it. */
const EXPECTED_MIN_SCHEMA_VERSION = 113;

export default async function globalSetup(): Promise<void> {
  const projectRoot = process.cwd();
  const templatePath = schemaTemplatePath();

  // Build the template in a throwaway empty cwd.
  const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cid-e2e-schema-build-'));
  const configDir = path.join(buildDir, '.config');
  const userDataDir = path.join(buildDir, 'userData');
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(userDataDir, { recursive: true });

  const mock = await startMockCanvas();
  // Point the saved connection at the mock so main-process init has a baseUrl.
  fs.writeFileSync(
    path.join(configDir, 'canvas-connection.json'),
    JSON.stringify({ baseUrl: mock.url }, null, 2)
  );

  const dbPath = path.join(buildDir, 'database', 'canvas.db');

  const app = await electron.launch({
    args: [path.join(projectRoot, 'dist', 'main.js'), `--user-data-dir=${userDataDir}`],
    cwd: buildDir,
    env: { ...process.env, NODE_ENV: 'production' },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  // Poll the on-disk schema_version until migrations have run to completion.
  // (We can't open the DB in this plain-Node runner — wrong native ABI — so we
  // inspect via an Electron-as-Node subprocess.)
  const deadline = Date.now() + 30_000;
  let reached = -1;
  while (Date.now() < deadline) {
    reached = readSchemaVersion(projectRoot, dbPath);
    if (reached >= EXPECTED_MIN_SCHEMA_VERSION) break;
    await page.waitForTimeout(500);
  }

  await app.close().catch(() => {});
  await mock.close();

  if (reached < EXPECTED_MIN_SCHEMA_VERSION) {
    fs.rmSync(buildDir, { recursive: true, force: true });
    throw new Error(
      `globalSetup: app did not reach schema_version ${EXPECTED_MIN_SCHEMA_VERSION} ` +
        `from an empty DB (got ${reached}). The empty-DB-first-launch assumption ` +
        `(ADR-0011 approach A) failed — fall back to the two-phase same-run launch.`
    );
  }

  // Publish the template (copy DB + WAL/SHM for an internally-consistent snapshot).
  fs.mkdirSync(path.dirname(templatePath), { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) {
    const src = dbPath + suffix;
    if (fs.existsSync(src)) fs.copyFileSync(src, templatePath + suffix);
  }
  // Clean stale template WAL/SHM if the fresh DB had none (avoid a mismatched pair).
  for (const suffix of ['-wal', '-shm']) {
    if (!fs.existsSync(dbPath + suffix) && fs.existsSync(templatePath + suffix)) {
      fs.rmSync(templatePath + suffix, { force: true });
    }
  }

  fs.rmSync(buildDir, { recursive: true, force: true });
}

/** Read schema_version's max via an Electron-as-Node subprocess; -1 on any failure. */
function readSchemaVersion(projectRoot: string, dbPath: string): number {
  if (!fs.existsSync(dbPath)) return -1;
  const better = path.join(projectRoot, 'node_modules', 'better-sqlite3');
  const script = `
    try {
      const Database = require(${JSON.stringify(better)});
      const db = new Database(${JSON.stringify(dbPath)}, { readonly: true });
      const row = db.prepare("SELECT MAX(version) v FROM schema_version").get();
      process.stdout.write('VERSION=' + (row && row.v != null ? row.v : -1));
      db.close();
    } catch (e) { process.stdout.write('VERSION=-1'); }
  `;
  const r = spawnSync(electronBin(projectRoot), ['-e', script], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  const m = (r.stdout ?? '').match(/VERSION=(-?\d+)/);
  return m ? parseInt(m[1], 10) : -1;
}
