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
jest.mock('child_process', () => ({ spawn: spawnMock }));

import path from 'path';
import fs from 'fs';
import { ipcMain } from 'electron';
import { registerAppHandlers } from '../../src/lifecycle/ipc-handlers/appHandlers';
import type { IpcContext } from '../../src/lifecycle/ipc-handlers/IpcContext';

interface IpcMainMock {
  __getHandler: (channel: string) => ((...args: unknown[]) => unknown) | undefined;
  __reset: () => void;
}

const mockIpc = ipcMain as unknown as IpcMainMock;
const INSTALL_DIR = 'C:\\Program Files\\Canvas Assistant';

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
