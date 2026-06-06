/**
 * First-run user-data-directory migration.
 *
 * When the npm `name` was renamed `canvas-integration-dashboard` -> `canvas-assistant`,
 * `app.getName()` changed, which changes `app.getPath('userData')`. Electron then looks
 * in a NEW, empty data dir — every existing packaged install would appear blank. This
 * module relocates the OLD per-user data dir to the NEW one ONCE, on first launch after
 * the rename, before any path-dependent initialization runs.
 *
 * INVARIANTS (fail-safe — data loss is the worst outcome):
 *  - NEVER clobber/merge into a populated newDir (a fresh install or a prior partial run).
 *  - NEVER delete the old dir until a copy is verified.
 *  - On ANY failure, leave the old dir fully intact and clean up any partial newDir.
 *
 * ORDERING: this MUST run before `appPaths.ts` is module-eval'd (it freezes the paths from
 * `app.getPath('userData')` at import time). It therefore imports ONLY `fs`/`path` (+ the
 * `app` param) and must NOT import `appPaths` or anything that does. See main.ts + ADR-0014.
 * Logs via `console` because the Logger is not constructed this early in boot.
 */

import type { App } from 'electron';
import fs from 'fs';
import path from 'path';

const OLD_NAME = 'canvas-integration-dashboard';

export interface MigrateResult {
  migrated: boolean;
  reason: 'done' | 'dev-mode' | 'new-exists' | 'old-missing' | 'failed';
  error?: Error;
}

/**
 * Electron entry: resolve old/new paths from `app`, then delegate to the pure core.
 *
 * OLD path is name-INDEPENDENT — derived from `app.getPath('appData')` (the parent dir on
 * all 3 OSes: ~/.config, %APPDATA%, ~/Library/Application Support) + the fixed literal old
 * name — precisely because `getName()` no longer returns the old name.
 *
 * NEW path is `app.getPath('userData')` so the migration tracks whatever Electron actually
 * uses (which is now `.../canvas-assistant`).
 */
export function migrateUserDataDirIfNeeded(
  app: Pick<App, 'isPackaged' | 'getPath'>
): MigrateResult {
  const appData = app.getPath('appData');
  const oldDir = path.join(appData, OLD_NAME);
  const newDir = app.getPath('userData');

  return migrateUserDataDir({
    oldDir,
    newDir,
    isPackaged: app.isPackaged,
    log: (msg) => console.log(`[migrateUserDataDir] ${msg}`),
  });
}

/**
 * Pure core — fully unit-testable with temp dirs and an injectable fs surface.
 */
export function migrateUserDataDir(opts: {
  oldDir: string;
  newDir: string;
  isPackaged: boolean;
  log?: (msg: string) => void;
  fsImpl?: typeof fs;
}): MigrateResult {
  const { oldDir, newDir, isPackaged } = opts;
  const fsImpl = opts.fsImpl ?? fs;
  const log = opts.log ?? (() => {});

  // 1. Dev mode uses process.cwd() for APP_ROOT (appPaths.ts) — userData is irrelevant.
  if (!isPackaged) {
    log('dev mode — skipping userData migration');
    return { migrated: false, reason: 'dev-mode' };
  }

  // 2. newDir already exists -> already migrated, fresh install, or partial prior run.
  //    NEVER clobber/merge. Fail-safe no-op; old dir (if any) left intact.
  if (fsImpl.existsSync(newDir)) {
    log(`newDir already exists (${newDir}) — no-op`);
    return { migrated: false, reason: 'new-exists' };
  }

  // 3. Nothing to move (fresh install).
  if (!fsImpl.existsSync(oldDir)) {
    log(`oldDir does not exist (${oldDir}) — nothing to migrate`);
    return { migrated: false, reason: 'old-missing' };
  }

  // 4. oldDir exists, newDir does not -> migrate.
  log(`migrating user data: ${oldDir} -> ${newDir}`);
  try {
    // a. ensure parent of newDir exists.
    const parent = path.dirname(newDir);
    if (!fsImpl.existsSync(parent)) {
      fsImpl.mkdirSync(parent, { recursive: true });
    }

    // b. FAST PATH: atomic rename (same volume). Moves the WHOLE tree incl. WAL/-shm
    //    sidecars + database/ + .config/ + .logs/ + CanvasAssistant/ credential subfolder.
    try {
      fsImpl.renameSync(oldDir, newDir);
      log('migration complete (fast-path rename)');
      return { migrated: true, reason: 'done' };
    } catch (renameErr) {
      log(
        `fast-path rename failed (${(renameErr as NodeJS.ErrnoException)?.code ?? 'unknown'}) — falling back to copy-then-verify`
      );

      // c. COPY-THEN-VERIFY fallback (cross-device EXDEV or any rename error).
      fsImpl.cpSync(oldDir, newDir, { recursive: true });

      // Verify via the canvas.db sentinel: it must exist in newDir with the same size
      // as in oldDir (guards against a partial/aborted copy).
      const oldDbPath = path.join(oldDir, 'database', 'canvas.db');
      const newDbPath = path.join(newDir, 'database', 'canvas.db');
      const oldDbExists = fsImpl.existsSync(oldDbPath);
      const newDbExists = fsImpl.existsSync(newDbPath);

      if (oldDbExists !== newDbExists) {
        throw new Error(
          `verify failed: canvas.db presence mismatch (old=${oldDbExists}, new=${newDbExists})`
        );
      }
      if (oldDbExists && newDbExists) {
        const oldSize = fsImpl.statSync(oldDbPath).size;
        const newSize = fsImpl.statSync(newDbPath).size;
        if (oldSize !== newSize) {
          throw new Error(
            `verify failed: canvas.db size mismatch (old=${oldSize}, new=${newSize})`
          );
        }
      }

      // Verified success -> delete old dir. A delete failure is NON-fatal (data is safe
      // in newDir); log a warning and still return success.
      try {
        fsImpl.rmSync(oldDir, { recursive: true, force: true });
      } catch (rmErr) {
        log(
          `WARNING: failed to delete old dir after verified copy — data is safe in newDir. ${String(rmErr)}`
        );
      }
      log('migration complete (copy-then-verify fallback)');
      return { migrated: true, reason: 'done' };
    }
  } catch (err) {
    // d. ANY failure -> leave old intact, clean up any partial newDir, report failure.
    console.error(
      `[migrateUserDataDir] FAILED to migrate user data. Your old data is safe at: ${oldDir}`,
      err
    );
    try {
      if (fsImpl.existsSync(newDir)) {
        fsImpl.rmSync(newDir, { recursive: true, force: true });
      }
    } catch (cleanupErr) {
      log(`failed to clean up partial newDir: ${String(cleanupErr)}`);
    }
    return {
      migrated: false,
      reason: 'failed',
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}
