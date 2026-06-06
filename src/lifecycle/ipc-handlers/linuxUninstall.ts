/**
 * Linux uninstall-command detection.
 *
 * The exe path is the same `/opt/Canvas Assistant/...` for deb, rpm, and pacman
 * installs, so the path alone can't tell us how the app was installed. The robust
 * discriminator is **which package manager's database records the running binary as
 * owned**. We probe each PM against the exe path, first hit wins, and return the
 * canonical removal command for that package format.
 *
 * Probe order (first match wins): AppImage short-circuit → deb → rpm → pacman →
 * safe fallback. AppImage is checked first because no package manager is involved
 * (it's a self-contained file the user runs in place). The deb-first order among
 * the PM probes means a dual-managed box (rare, e.g. some Debian derivatives that
 * also have rpm installed) reports `deb`, matching the historical default.
 *
 * Per-format removal command rationale:
 *   - deb    → `sudo apt remove canvas-assistant` (user-facing tool on Debian/Ubuntu)
 *   - rpm    → `sudo dnf remove canvas-assistant`. dnf is the dominant user-facing
 *              RPM-family tool (Fedora/RHEL) and resolves reverse-deps. openSUSE uses
 *              zypper, but we keep ONE command per type for UI simplicity; dnf covers
 *              the mainstream RPM case. (`rpm -e canvas-assistant` would be fully
 *              distro-agnostic but is the lower-level tool — dnf chosen deliberately.)
 *   - pacman → `sudo pacman -R canvas-assistant` (the only Arch package tool)
 *   - unknown→ deb command as a safe default (never regresses the common Debian case),
 *              but tagged `unknown` so the UI/tests can tell it was a guess.
 *
 * The package name `canvas-assistant` is the post-#146 npm `name`, which is what
 * fpm derives the deb/rpm/pacman package name from — keep it consistent here.
 *
 * The runtime keychain dependency declared per format in electron-builder.yml is
 * `libsecret` (the shared library); a missing dep is a soft failure (the app falls
 * back to the encrypted credential file), not a hard break.
 */

import { execFileSync } from 'child_process';
import { app } from 'electron';

export type LinuxUninstallType = 'appimage' | 'deb' | 'rpm' | 'pacman' | 'unknown';

export interface LinuxUninstallResult {
  type: LinuxUninstallType;
  command: string;
  path: string;
}

export interface LinuxUninstallProbeDeps {
  /** The running executable path — `app.getPath('exe')` in production. */
  exePath: string;
  /** `process.env.APPIMAGE` — set when running from an AppImage. */
  appImageEnv: string | undefined;
  /**
   * Returns true if `cmd args` exits 0 (PM present AND owns the file); false on a
   * non-zero exit (file not owned) or ENOENT (PM not installed). Injected so tests
   * simulate each PM's ownership without a real OS.
   */
  runOwns: (cmd: string, args: string[]) => boolean;
  /** which-style probe for the fallback: is `tool` on PATH? */
  hasTool?: (tool: string) => boolean;
}

const PACKAGE_NAME = 'canvas-assistant';

const COMMANDS = {
  deb: `sudo apt remove ${PACKAGE_NAME}`,
  rpm: `sudo dnf remove ${PACKAGE_NAME}`,
  pacman: `sudo pacman -R ${PACKAGE_NAME}`,
} as const;

/**
 * Pure, injectable detection of how the app was installed on Linux and the matching
 * removal command. No I/O of its own — all OS interaction goes through `runOwns` /
 * `hasTool`, which the real wrapper supplies via `execFileSync`.
 */
export function resolveLinuxUninstall(
  deps: LinuxUninstallProbeDeps
): LinuxUninstallResult {
  const { exePath, appImageEnv, runOwns, hasTool } = deps;

  // 1. AppImage — no package manager involved. Prefer the APPIMAGE env path (the
  //    real mount-point file) over exePath, falling back to exePath.
  if (exePath.endsWith('.AppImage') || appImageEnv) {
    const appImagePath = appImageEnv || exePath;
    return { type: 'appimage', command: `rm "${appImagePath}"`, path: appImagePath };
  }

  // 2. Ask each package manager whether it owns the running binary; first hit wins.
  if (runOwns('dpkg-query', ['-S', exePath])) {
    return { type: 'deb', command: COMMANDS.deb, path: exePath };
  }
  if (runOwns('rpm', ['-qf', exePath])) {
    return { type: 'rpm', command: COMMANDS.rpm, path: exePath };
  }
  if (runOwns('pacman', ['-Qo', exePath])) {
    return { type: 'pacman', command: COMMANDS.pacman, path: exePath };
  }

  // 3. No PM claims the file. Best-effort: if a known remover is on PATH, show its
  //    command (still tagged `unknown` — it's a guess, not a confirmed owner).
  if (hasTool) {
    if (hasTool('dnf')) return { type: 'unknown', command: COMMANDS.rpm, path: exePath };
    if (hasTool('pacman')) {
      return { type: 'unknown', command: COMMANDS.pacman, path: exePath };
    }
    if (hasTool('apt')) return { type: 'unknown', command: COMMANDS.deb, path: exePath };
  }

  // 4. Nothing detected — safe default to the deb command (matches the historical
  //    fall-through), tagged `unknown` so callers know it's a guess.
  return { type: 'unknown', command: COMMANDS.deb, path: exePath };
}

/** Real-deps wrapper: runs `cmd args`, returns true on exit 0, false on any throw. */
function execOwns(cmd: string, args: string[]): boolean {
  try {
    execFileSync(cmd, args, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/** Real-deps wrapper: returns true if `tool` resolves via `which`. */
function execHasTool(tool: string): boolean {
  try {
    execFileSync('which', [tool], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Production entry point: supplies the real exe path + env + subprocess probes to
 * `resolveLinuxUninstall`. Synchronous (execFileSync is sync); only runs when the
 * user opens the uninstall modal on Linux, so the subprocess cost is irrelevant.
 */
export function getLinuxUninstall(): LinuxUninstallResult {
  return resolveLinuxUninstall({
    exePath: app.getPath('exe'),
    appImageEnv: process.env.APPIMAGE,
    runOwns: execOwns,
    hasTool: execHasTool,
  });
}
