/**
 * migrateUserDataDir — first-run user-data-directory migration.
 *
 * Exercises the PURE `migrateUserDataDir(opts)` core against REAL temp dirs
 * (os.tmpdir()), plus the thin Electron wrapper `migrateUserDataDirIfNeeded`
 * (test 10) with a stubbed `app`. No better-sqlite3, no Electron runtime — the
 * core is pure fs/path. Covers fail-safe invariants: never clobber/merge,
 * never delete old until verified, leave old intact on failure.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  migrateUserDataDir,
  migrateUserDataDirIfNeeded,
} from '../../src/lifecycle/migrateUserDataDir';

const OLD_NAME = 'canvas-integration-dashboard';

let tmpRoot: string;
let oldDir: string;
let newDir: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-userdata-'));
  oldDir = path.join(tmpRoot, OLD_NAME);
  newDir = path.join(tmpRoot, 'canvas-assistant');
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

/** Seed a directory tree mirroring a real populated userData dir. */
function seedFullOldDir(dir: string, dbContents = 'CANVAS-DB-CONTENT'): void {
  fs.mkdirSync(path.join(dir, 'database'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'database', 'canvas.db'), dbContents);
  fs.writeFileSync(path.join(dir, 'database', 'canvas.db-wal'), 'WAL-DATA');
  fs.writeFileSync(path.join(dir, 'database', 'canvas.db-shm'), 'SHM-DATA');
  fs.mkdirSync(path.join(dir, '.config'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.config', 'x'), 'config-x');
  fs.mkdirSync(path.join(dir, 'CanvasAssistant'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'CanvasAssistant', '.credentials'), 'secret-token');
}

describe('migrateUserDataDir (pure core)', () => {
  it('1. dev-mode no-op — neither dir touched', () => {
    seedFullOldDir(oldDir);
    const result = migrateUserDataDir({ oldDir, newDir, isPackaged: false });

    expect(result).toEqual({ migrated: false, reason: 'dev-mode' });
    expect(fs.existsSync(oldDir)).toBe(true);
    expect(fs.existsSync(newDir)).toBe(false);
  });

  it('2. no-op when newDir exists — newDir contents UNCHANGED, oldDir intact', () => {
    seedFullOldDir(oldDir);
    fs.mkdirSync(newDir, { recursive: true });
    fs.writeFileSync(path.join(newDir, 'sentinel.txt'), 'NEW-DATA');

    const result = migrateUserDataDir({ oldDir, newDir, isPackaged: true });

    expect(result).toEqual({ migrated: false, reason: 'new-exists' });
    // newDir untouched (no merge of old data)
    expect(fs.readFileSync(path.join(newDir, 'sentinel.txt'), 'utf8')).toBe('NEW-DATA');
    expect(fs.existsSync(path.join(newDir, 'database', 'canvas.db'))).toBe(false);
    // oldDir not deleted/clobbered
    expect(fs.existsSync(path.join(oldDir, 'database', 'canvas.db'))).toBe(true);
  });

  it('3. no-op when neither exists — nothing created', () => {
    const result = migrateUserDataDir({ oldDir, newDir, isPackaged: true });

    expect(result).toEqual({ migrated: false, reason: 'old-missing' });
    expect(fs.existsSync(oldDir)).toBe(false);
    expect(fs.existsSync(newDir)).toBe(false);
  });

  it('4. move when only oldDir exists (fast path) — full tree + sidecars + nested, oldDir gone', () => {
    seedFullOldDir(oldDir);

    const result = migrateUserDataDir({ oldDir, newDir, isPackaged: true });

    expect(result).toEqual({ migrated: true, reason: 'done' });
    // newDir contains everything
    expect(fs.readFileSync(path.join(newDir, 'database', 'canvas.db'), 'utf8')).toBe(
      'CANVAS-DB-CONTENT'
    );
    expect(fs.existsSync(path.join(newDir, 'database', 'canvas.db-wal'))).toBe(true);
    expect(fs.existsSync(path.join(newDir, 'database', 'canvas.db-shm'))).toBe(true);
    expect(fs.readFileSync(path.join(newDir, '.config', 'x'), 'utf8')).toBe('config-x');
    expect(
      fs.readFileSync(path.join(newDir, 'CanvasAssistant', '.credentials'), 'utf8')
    ).toBe('secret-token');
    // oldDir gone
    expect(fs.existsSync(oldDir)).toBe(false);
  });

  it('5. idempotent re-run — 2nd run hits new-exists, newDir unchanged', () => {
    seedFullOldDir(oldDir);

    const first = migrateUserDataDir({ oldDir, newDir, isPackaged: true });
    expect(first).toEqual({ migrated: true, reason: 'done' });

    const second = migrateUserDataDir({ oldDir, newDir, isPackaged: true });
    expect(second).toEqual({ migrated: false, reason: 'new-exists' });
    // newDir contents from the first run survive untouched
    expect(fs.readFileSync(path.join(newDir, 'database', 'canvas.db'), 'utf8')).toBe(
      'CANVAS-DB-CONTENT'
    );
  });

  it('6. sidecar files (.db-wal / .db-shm) explicitly present in newDir/database', () => {
    seedFullOldDir(oldDir);

    migrateUserDataDir({ oldDir, newDir, isPackaged: true });

    expect(fs.readFileSync(path.join(newDir, 'database', 'canvas.db-wal'), 'utf8')).toBe(
      'WAL-DATA'
    );
    expect(fs.readFileSync(path.join(newDir, 'database', 'canvas.db-shm'), 'utf8')).toBe(
      'SHM-DATA'
    );
  });

  it('7. interrupted/partial newDir — treated as new-exists, no merge, oldDir intact', () => {
    seedFullOldDir(oldDir);
    // simulate a prior partial copy: newDir exists with only .config/
    fs.mkdirSync(path.join(newDir, '.config'), { recursive: true });
    fs.writeFileSync(path.join(newDir, '.config', 'partial'), 'PARTIAL');

    const result = migrateUserDataDir({ oldDir, newDir, isPackaged: true });

    expect(result).toEqual({ migrated: false, reason: 'new-exists' });
    // no merge — old database never copied into the partial newDir
    expect(fs.existsSync(path.join(newDir, 'database', 'canvas.db'))).toBe(false);
    // oldDir fully intact
    expect(fs.existsSync(path.join(oldDir, 'database', 'canvas.db'))).toBe(true);
  });

  it('8. failure path (rename + cpSync throw) leaves old intact, cleans partial newDir, error populated', () => {
    seedFullOldDir(oldDir);

    const exdev = Object.assign(new Error('cross-device'), { code: 'EXDEV' });
    const fsImpl = {
      ...fs,
      renameSync: jest.fn(() => {
        throw exdev;
      }),
      cpSync: jest.fn(() => {
        throw new Error('copy blew up');
      }),
    } as unknown as typeof fs;

    const result = migrateUserDataDir({ oldDir, newDir, isPackaged: true, fsImpl });

    expect(result.migrated).toBe(false);
    expect(result.reason).toBe('failed');
    expect(result.error).toBeInstanceOf(Error);
    // oldDir fully intact — never claimed success, never deleted old
    expect(fs.existsSync(path.join(oldDir, 'database', 'canvas.db'))).toBe(true);
    // no partial newDir left (cpSync threw before creating anything; cleanup is a no-op)
    expect(fs.existsSync(newDir)).toBe(false);
  });

  it('8b. failure path (verify fails after copy) leaves old intact + cleans partial newDir', () => {
    seedFullOldDir(oldDir);

    // renameSync throws EXDEV; cpSync produces a partial copy missing canvas.db
    // so the size/presence verify fails.
    const fsImpl = {
      ...fs,
      renameSync: jest.fn(() => {
        throw Object.assign(new Error('xdev'), { code: 'EXDEV' });
      }),
      cpSync: jest.fn((_src: string, dest: string) => {
        // copy only an unrelated file — canvas.db NOT present in dest
        fs.mkdirSync(path.join(dest, '.config'), { recursive: true });
        fs.writeFileSync(path.join(dest, '.config', 'x'), 'partial');
      }),
    } as unknown as typeof fs;

    const result = migrateUserDataDir({ oldDir, newDir, isPackaged: true, fsImpl });

    expect(result.reason).toBe('failed');
    expect(result.error).toBeInstanceOf(Error);
    // partial newDir cleaned up
    expect(fs.existsSync(newDir)).toBe(false);
    // old data safe
    expect(fs.existsSync(path.join(oldDir, 'database', 'canvas.db'))).toBe(true);
  });

  it('9. cross-device fallback success (EXDEV -> cpSync) — newDir populated, oldDir deleted', () => {
    seedFullOldDir(oldDir);

    // renameSync throws EXDEV; cpSync delegates to the real recursive copy.
    const fsImpl = {
      ...fs,
      renameSync: jest.fn(() => {
        throw Object.assign(new Error('xdev'), { code: 'EXDEV' });
      }),
      cpSync: jest.fn((src: string, dest: string, options?: fs.CopySyncOptions) =>
        fs.cpSync(src, dest, options)
      ),
    } as unknown as typeof fs;

    const result = migrateUserDataDir({ oldDir, newDir, isPackaged: true, fsImpl });

    expect(result).toEqual({ migrated: true, reason: 'done' });
    expect(fs.readFileSync(path.join(newDir, 'database', 'canvas.db'), 'utf8')).toBe(
      'CANVAS-DB-CONTENT'
    );
    expect(fs.existsSync(path.join(newDir, 'database', 'canvas.db-wal'))).toBe(true);
    // verified copy -> old deleted
    expect(fs.existsSync(oldDir)).toBe(false);
  });

  it('9b. cross-device success tolerates a non-fatal old-dir delete failure', () => {
    seedFullOldDir(oldDir);

    const fsImpl = {
      ...fs,
      renameSync: jest.fn(() => {
        throw Object.assign(new Error('xdev'), { code: 'EXDEV' });
      }),
      cpSync: jest.fn((src: string, dest: string, options?: fs.CopySyncOptions) =>
        fs.cpSync(src, dest, options)
      ),
      rmSync: jest.fn(() => {
        throw new Error('cannot remove old dir');
      }),
    } as unknown as typeof fs;

    const result = migrateUserDataDir({ oldDir, newDir, isPackaged: true, fsImpl });

    // delete failure is non-fatal — copy verified, data safe in newDir.
    expect(result).toEqual({ migrated: true, reason: 'done' });
    expect(fs.readFileSync(path.join(newDir, 'database', 'canvas.db'), 'utf8')).toBe(
      'CANVAS-DB-CONTENT'
    );
  });
});

describe('migrateUserDataDirIfNeeded (Electron wrapper)', () => {
  it('10. composes oldDir from appData + old name regardless of getName(); migrates via userData', () => {
    seedFullOldDir(oldDir);

    const app = {
      isPackaged: true,
      getPath: jest.fn((name: string) => {
        if (name === 'appData') return tmpRoot; // parent of oldDir
        if (name === 'userData') return newDir; // already renamed, name-independent
        throw new Error(`unexpected getPath(${name})`);
      }),
      // deliberately NO getName — proves old path does not depend on it.
    } as unknown as Parameters<typeof migrateUserDataDirIfNeeded>[0];

    const result = migrateUserDataDirIfNeeded(app);

    expect(result).toEqual({ migrated: true, reason: 'done' });
    expect(fs.readFileSync(path.join(newDir, 'database', 'canvas.db'), 'utf8')).toBe(
      'CANVAS-DB-CONTENT'
    );
    expect(fs.existsSync(oldDir)).toBe(false);
  });

  it('10b. wrapper dev-mode short-circuits to dev-mode no-op', () => {
    const app = {
      isPackaged: false,
      getPath: jest.fn((name: string) => {
        if (name === 'appData') return tmpRoot;
        if (name === 'userData') return newDir;
        return tmpRoot;
      }),
    } as unknown as Parameters<typeof migrateUserDataDirIfNeeded>[0];

    expect(migrateUserDataDirIfNeeded(app)).toEqual({
      migrated: false,
      reason: 'dev-mode',
    });
  });
});
