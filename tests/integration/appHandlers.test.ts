/**
 * appHandlers — IPC handler behavior tests.
 *
 * Focus (ADR-0014): the `app:launchUninstaller` candidate list. After the npm
 * `name` rename, `app.getName()` returns "canvas-assistant" (the npm name), but
 * NSIS names the uninstaller from the electron-builder `productName`
 * ("Uninstall Canvas Assistant.exe"). Candidate[0] must therefore use the brand
 * product name, NOT app.getName(), so the real uninstaller is found first.
 *
 * `electron` is mocked BEFORE importing the handler (known IPC-handler train
 * gotcha — the handler imports ipcMain/app/shell from 'electron' at module load).
 * child_process.spawn is mocked so no process is actually launched.
 */

jest.mock('electron', () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    ipcMain: {
      handle: jest.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
        handlers.set(channel, fn);
      }),
      __getHandler: (channel: string) => handlers.get(channel),
      __reset: () => handlers.clear(),
    },
    app: {
      getName: jest.fn(() => 'canvas-assistant'), // the NEW npm name
      getPath: jest.fn((name: string) => {
        if (name === 'exe')
          return 'C:\\Program Files\\Canvas Assistant\\Canvas Assistant.exe';
        return 'C:\\fake';
      }),
      quit: jest.fn(),
    },
    shell: { showItemInFolder: jest.fn(), openExternal: jest.fn() },
  };
});

const spawnMock = jest.fn(
  (..._args: unknown[]) => ({ unref: jest.fn() }) as { unref: () => void }
);
// execFileSync drives the Linux uninstall PM-ownership probes. Default: throw for
// every call (no PM owns the file) — individual tests override via mockImplementation.
const execFileSyncMock = jest.fn((..._args: unknown[]): Buffer => {
  throw new Error('default: no PM owns this file');
});
jest.mock('child_process', () => ({
  spawn: spawnMock,
  execFileSync: execFileSyncMock,
}));

import path from 'path';
import fs from 'fs';
import { ipcMain, app } from 'electron';
import { registerAppHandlers } from '../../src/lifecycle/ipc-handlers/appHandlers';
import {
  resolveLinuxUninstall,
  type LinuxUninstallProbeDeps,
} from '../../src/lifecycle/ipc-handlers/linuxUninstall';
import type { IpcContext } from '../../src/lifecycle/ipc-handlers/IpcContext';

interface IpcMainMock {
  __getHandler: (channel: string) => ((...args: unknown[]) => unknown) | undefined;
  __reset: () => void;
}

const mockIpc = ipcMain as unknown as IpcMainMock;
// Mirror the exact exe path the electron mock's getPath('exe') returns, then derive
// INSTALL_DIR with the SAME path.dirname the handler uses. Keeps expected paths
// consistent with the handler's candidates on BOTH win32 (dev) and POSIX (CI): a
// hardcoded backslash literal makes POSIX path.dirname return '.', so candidate[0]
// would not match a hardcoded brandPath and the test would fail only on Linux CI.
const EXE_PATH = 'C:\\Program Files\\Canvas Assistant\\Canvas Assistant.exe';
const INSTALL_DIR = path.dirname(EXE_PATH);

/** Minimal IpcContext stub — app:launchUninstaller only needs logger getters. */
function buildCtx(): IpcContext {
  const noopLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  return {
    getDatabase: () => ({}) as never,
    getLogger: () => noopLogger as never,
    getMetricsCollector: () => ({}) as never,
    getCrashProtectionManager: () => ({}) as never,
    getAppDataDir: () => 'C:\\fake',
    getDbPath: () => 'C:\\fake\\canvas.db',
    startAutoSync: jest.fn(),
    setDatabaseCorruptionDetected: jest.fn(),
  } as unknown as IpcContext;
}

describe('appHandlers — app:launchUninstaller candidate list (ADR-0014)', () => {
  const realPlatform = process.platform;

  beforeEach(() => {
    mockIpc.__reset();
    spawnMock.mockClear();
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    registerAppHandlers(buildCtx());
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(process, 'platform', {
      value: realPlatform,
      configurable: true,
    });
  });

  async function invoke(channel: string): Promise<unknown> {
    const fn = mockIpc.__getHandler(channel);
    if (!fn) throw new Error(`No handler for ${channel}`);
    return fn({} as unknown);
  }

  test('candidate[0] is "Uninstall Canvas Assistant.exe" (brand), not the npm name', async () => {
    // The success path schedules a deferred app.quit() via setTimeout; use fake
    // timers so the test doesn't leak a pending timer into Jest's worker.
    jest.useFakeTimers();
    try {
      // existsSync returns true ONLY for the brand-named uninstaller. If candidate[0]
      // used app.getName() ("canvas-assistant"), candidate[0] would be the WRONG path
      // and spawn would receive a different file (or fail to find it).
      const brandPath = path.join(INSTALL_DIR, 'Uninstall Canvas Assistant.exe');
      jest.spyOn(fs, 'existsSync').mockImplementation((p) => p === brandPath);

      const res = (await invoke('app:launchUninstaller')) as { success: boolean };

      expect(res.success).toBe(true);
      expect(spawnMock).toHaveBeenCalledTimes(1);
      // The launched uninstaller is the brand-named one (== candidate[0]).
      expect(spawnMock.mock.calls[0][0]).toBe(brandPath);
      jest.runOnlyPendingTimers();
    } finally {
      jest.useRealTimers();
    }
  });

  test('does NOT look for "Uninstall canvas-assistant.exe" (the npm-name regression)', async () => {
    const wrongPath = path.join(INSTALL_DIR, 'Uninstall canvas-assistant.exe');
    // Only the (wrong) npm-name path exists; the brand path does not.
    jest.spyOn(fs, 'existsSync').mockImplementation((p) => p === wrongPath);

    const res = (await invoke('app:launchUninstaller')) as {
      success: boolean;
      error?: string;
    };

    // Because no candidate matches the brand/unins000 names, the uninstaller is
    // reported as not found — proving candidate[0] is NOT the npm-name path.
    expect(res.success).toBe(false);
    expect(spawnMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// resolveLinuxUninstall — the pure, injectable detector. No real OS / process
// state involved: deps are fully stubbed, so these run identically on win32 and
// POSIX. The exe path is a Linux-install-style literal because that's the only
// platform this code runs on; `resolveLinuxUninstall` does pure string ops on it
// (no path-separator logic), so the backslash/forward-slash CI hazard doesn't apply.
// ---------------------------------------------------------------------------
describe('resolveLinuxUninstall — PM-ownership detection (pure fn)', () => {
  const EXE = '/opt/Canvas Assistant/canvas-assistant';

  /** Build a runOwns stub that returns true only for the named command. */
  function ownsOnly(cmd: string): LinuxUninstallProbeDeps['runOwns'] {
    return (c: string) => c === cmd;
  }
  const ownsNone: LinuxUninstallProbeDeps['runOwns'] = () => false;
  const noTool: LinuxUninstallProbeDeps['hasTool'] = () => false;

  test('1. exePath ending .AppImage → appimage, rm "<path>"', () => {
    const appImage = '/home/me/Apps/Canvas Assistant.AppImage';
    const res = resolveLinuxUninstall({
      exePath: appImage,
      appImageEnv: undefined,
      runOwns: ownsNone,
    });
    expect(res).toEqual({
      type: 'appimage',
      command: `rm "${appImage}"`,
      path: appImage,
    });
  });

  test('2. APPIMAGE env set (exePath not .AppImage) → uses env path, not exePath', () => {
    const envPath = '/mnt/appimage/Canvas Assistant.AppImage';
    const res = resolveLinuxUninstall({
      exePath: EXE,
      appImageEnv: envPath,
      runOwns: ownsNone,
    });
    expect(res.type).toBe('appimage');
    expect(res.command).toBe(`rm "${envPath}"`);
    expect(res.path).toBe(envPath);
  });

  test('3. dpkg-query owns the file → deb / apt remove', () => {
    const res = resolveLinuxUninstall({
      exePath: EXE,
      appImageEnv: undefined,
      runOwns: ownsOnly('dpkg-query'),
    });
    expect(res).toEqual({
      type: 'deb',
      command: 'sudo apt remove canvas-assistant',
      path: EXE,
    });
  });

  test('4. rpm owns the file → rpm / dnf remove', () => {
    const res = resolveLinuxUninstall({
      exePath: EXE,
      appImageEnv: undefined,
      runOwns: ownsOnly('rpm'),
    });
    expect(res).toEqual({
      type: 'rpm',
      command: 'sudo dnf remove canvas-assistant',
      path: EXE,
    });
  });

  test('5. pacman owns the file → pacman / pacman -R', () => {
    const res = resolveLinuxUninstall({
      exePath: EXE,
      appImageEnv: undefined,
      runOwns: ownsOnly('pacman'),
    });
    expect(res).toEqual({
      type: 'pacman',
      command: 'sudo pacman -R canvas-assistant',
      path: EXE,
    });
  });

  test('6. no owner but hasTool(dnf) → unknown + dnf command (best-effort)', () => {
    const res = resolveLinuxUninstall({
      exePath: EXE,
      appImageEnv: undefined,
      runOwns: ownsNone,
      hasTool: (t: string) => t === 'dnf',
    });
    expect(res.type).toBe('unknown');
    expect(res.command).toBe('sudo dnf remove canvas-assistant');
  });

  test('6b. no owner but hasTool(pacman) → unknown + pacman command', () => {
    const res = resolveLinuxUninstall({
      exePath: EXE,
      appImageEnv: undefined,
      runOwns: ownsNone,
      hasTool: (t: string) => t === 'pacman',
    });
    expect(res.type).toBe('unknown');
    expect(res.command).toBe('sudo pacman -R canvas-assistant');
  });

  test('6c. no owner but hasTool(apt) → unknown + apt command', () => {
    const res = resolveLinuxUninstall({
      exePath: EXE,
      appImageEnv: undefined,
      runOwns: ownsNone,
      hasTool: (t: string) => t === 'apt',
    });
    expect(res.type).toBe('unknown');
    expect(res.command).toBe('sudo apt remove canvas-assistant');
  });

  test('7. nothing detected (no owner, no tool) → unknown + safe deb default', () => {
    const res = resolveLinuxUninstall({
      exePath: EXE,
      appImageEnv: undefined,
      runOwns: ownsNone,
      hasTool: noTool,
    });
    expect(res).toEqual({
      type: 'unknown',
      command: 'sudo apt remove canvas-assistant',
      path: EXE,
    });
  });

  test('7b. nothing detected, hasTool omitted entirely → unknown + safe deb default', () => {
    const res = resolveLinuxUninstall({
      exePath: EXE,
      appImageEnv: undefined,
      runOwns: ownsNone,
    });
    expect(res.type).toBe('unknown');
    expect(res.command).toBe('sudo apt remove canvas-assistant');
  });

  test('8. probe order: both dpkg-query AND rpm own → deb wins (first-match)', () => {
    const res = resolveLinuxUninstall({
      exePath: EXE,
      appImageEnv: undefined,
      runOwns: (c: string) => c === 'dpkg-query' || c === 'rpm',
    });
    expect(res.type).toBe('deb');
  });
});

// ---------------------------------------------------------------------------
// app:getLinuxUninstallCommand handler wiring — proves the real wrapper
// (execFileSync → runOwns) is plumbed correctly, not just the pure fn.
// ---------------------------------------------------------------------------
describe('appHandlers — app:getLinuxUninstallCommand wiring', () => {
  const realPlatform = process.platform;
  const LINUX_EXE = '/opt/Canvas Assistant/canvas-assistant';
  const getPathMock = app.getPath as unknown as jest.Mock;

  beforeEach(() => {
    mockIpc.__reset();
    execFileSyncMock.mockReset();
    // Default probe: nothing owns the file (every execFileSync throws).
    execFileSyncMock.mockImplementation((): Buffer => {
      throw new Error('not owned');
    });
    delete process.env.APPIMAGE;
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    getPathMock.mockImplementation((name: string) =>
      name === 'exe' ? LINUX_EXE : '/fake'
    );
    registerAppHandlers(buildCtx());
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(process, 'platform', {
      value: realPlatform,
      configurable: true,
    });
    // Restore the suite-wide Windows exe path the other describe relies on.
    getPathMock.mockImplementation((name: string) =>
      name === 'exe'
        ? 'C:\\Program Files\\Canvas Assistant\\Canvas Assistant.exe'
        : 'C:\\fake'
    );
  });

  function invokeSync(channel: string): unknown {
    const fn = mockIpc.__getHandler(channel);
    if (!fn) throw new Error(`No handler for ${channel}`);
    return fn({} as unknown);
  }

  /** Make execFileSync "succeed" (exit 0) only when called with `cmd`. */
  function ownCmd(cmd: string): void {
    execFileSyncMock.mockImplementation((c: unknown): Buffer => {
      if (c === cmd) return Buffer.from('');
      throw new Error('not owned');
    });
  }

  test('deb-owned exe → { type: deb, apt remove }', () => {
    ownCmd('dpkg-query');
    expect(invokeSync('app:getLinuxUninstallCommand')).toEqual({
      type: 'deb',
      command: 'sudo apt remove canvas-assistant',
      path: LINUX_EXE,
    });
  });

  test('rpm-owned exe → { type: rpm, dnf remove }', () => {
    ownCmd('rpm');
    expect(invokeSync('app:getLinuxUninstallCommand')).toEqual({
      type: 'rpm',
      command: 'sudo dnf remove canvas-assistant',
      path: LINUX_EXE,
    });
  });

  test('pacman-owned exe → { type: pacman, pacman -R }', () => {
    ownCmd('pacman');
    expect(invokeSync('app:getLinuxUninstallCommand')).toEqual({
      type: 'pacman',
      command: 'sudo pacman -R canvas-assistant',
      path: LINUX_EXE,
    });
  });

  test('APPIMAGE env set → { type: appimage, rm } (no subprocess probe needed)', () => {
    const appImage = '/home/me/Canvas Assistant.AppImage';
    process.env.APPIMAGE = appImage;
    const res = invokeSync('app:getLinuxUninstallCommand');
    expect(res).toEqual({
      type: 'appimage',
      command: `rm "${appImage}"`,
      path: appImage,
    });
    delete process.env.APPIMAGE;
  });

  test('no PM owns + no tool (ENOENT everywhere) → unknown safe default, no crash', () => {
    // execFileSyncMock already throws for every call (including `which`).
    const res = invokeSync('app:getLinuxUninstallCommand');
    expect(res).toEqual({
      type: 'unknown',
      command: 'sudo apt remove canvas-assistant',
      path: LINUX_EXE,
    });
  });
});
