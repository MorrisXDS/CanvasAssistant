/**
 * UpdateChecker — unit tests
 *
 * All I/O is injected (httpClient, setIntervalFn, clearIntervalFn, nowFn,
 * userPreferencesReader, setUserPreferenceCommand). No real network or real
 * timers are used.
 */

import { UpdateChecker } from '../../src/layers/l2-daemon/update/UpdateChecker';
import type { UpdateCheckerConfig } from '../../src/layers/l2-daemon/update/UpdateChecker';
import type { ComponentLogger } from '../../src/layers/l0-utilities/Logger';
import type { UserPreferencesReader } from '../../src/layers/l1-persistence/readers/UserPreferencesReader';
import type { SetUserPreferenceCommand } from '../../src/layers/l4-controller/commands/settings/SetUserPreferenceCommand';
import type { Database } from '../../src/layers/l1-persistence';
import type { BrowserWindow } from 'electron';
import type { AxiosInstance } from 'axios';

// ---- Helpers ----

function makeLogger(): jest.Mocked<ComponentLogger> {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as jest.Mocked<ComponentLogger>;
}

function makePrefsReader(
  rawValue: string | null = null
): jest.Mocked<UserPreferencesReader> {
  return {
    get: jest.fn().mockReturnValue(rawValue),
  } as unknown as jest.Mocked<UserPreferencesReader>;
}

function makeSetPrefCommand(): jest.Mocked<SetUserPreferenceCommand> {
  return {
    execute: jest.fn().mockResolvedValue({ success: true }),
    validate: jest.fn().mockReturnValue({ valid: true }),
    name: 'SetUserPreference',
  } as unknown as jest.Mocked<SetUserPreferenceCommand>;
}

function makeDatabase(): jest.Mocked<Database> {
  return {} as unknown as jest.Mocked<Database>;
}

function makeMainWindow(destroyed = false): jest.Mocked<BrowserWindow> {
  return {
    isDestroyed: jest.fn().mockReturnValue(destroyed),
    webContents: { send: jest.fn() },
  } as unknown as jest.Mocked<BrowserWindow>;
}

function makeAxios(
  status: number,
  data: object | null = null
): jest.Mocked<AxiosInstance> {
  const get = jest.fn();
  if (status >= 200 && status < 300 && data) {
    get.mockResolvedValue({ status, data });
  } else if (status >= 400) {
    // Axios throws on 4xx when validateStatus is default — simulate this.
    get.mockRejectedValue(
      Object.assign(new Error(`Request failed with status ${status}`), {
        response: { status },
      })
    );
  } else {
    get.mockResolvedValue({ status, data: null });
  }
  return { get } as unknown as jest.Mocked<AxiosInstance>;
}

/** Build a minimal valid release response body. */
function githubRelease(
  tagName: string,
  htmlUrl = 'https://github.com/MorrisXDS/CanvasAssistant/releases/tag/' + tagName
) {
  return { tag_name: tagName, html_url: htmlUrl };
}

/** Prefs JSON for a fully-enabled config. */
function enabledPrefs(overrides: object = {}) {
  return JSON.stringify({
    enabled: true,
    intervalHours: 24,
    lastCheckedAt: null,
    skippedVersion: null,
    ...overrides,
  });
}

/** Base config with all injection seams. */
function makeConfig(overrides: Partial<UpdateCheckerConfig> = {}): UpdateCheckerConfig {
  return {
    getMainWindow: jest.fn().mockReturnValue(makeMainWindow()),
    userPreferencesReader: makePrefsReader(null),
    setUserPreferenceCommand: makeSetPrefCommand(),
    database: makeDatabase(),
    currentVersion: '1.1.2',
    logger: makeLogger(),
    httpClient: makeAxios(200, null),
    setIntervalFn: jest
      .fn()
      .mockReturnValue(99 as unknown as ReturnType<typeof setInterval>),
    clearIntervalFn: jest.fn(),
    nowFn: jest.fn().mockReturnValue('2026-06-05T12:00:00.000Z'),
    ...overrides,
  };
}

// ---- Tests ----

describe('UpdateChecker', () => {
  // ---- start() ----

  describe('start()', () => {
    it('does not set an interval when enabled is false (default prefs)', () => {
      const config = makeConfig();
      // Prefs reader returns null → defaults → enabled: false
      const checker = new UpdateChecker(config);
      checker.start();
      expect(config.setIntervalFn).not.toHaveBeenCalled();
    });

    it('does not set an interval when prefs.enabled is explicitly false', () => {
      const config = makeConfig({
        userPreferencesReader: makePrefsReader(
          JSON.stringify({
            enabled: false,
            intervalHours: 24,
            lastCheckedAt: null,
            skippedVersion: null,
          })
        ),
      });
      const checker = new UpdateChecker(config);
      checker.start();
      expect(config.setIntervalFn).not.toHaveBeenCalled();
    });

    it('sets an interval at intervalHours * 3_600_000 ms when enabled is true', () => {
      const httpClient = makeAxios(200, githubRelease('v9.9.9'));
      const config = makeConfig({
        userPreferencesReader: makePrefsReader(enabledPrefs({ intervalHours: 12 })),
        httpClient,
      });
      const checker = new UpdateChecker(config);
      checker.start();
      expect(config.setIntervalFn).toHaveBeenCalledWith(
        expect.any(Function),
        12 * 3_600_000
      );
      checker.stop();
    });

    it('calls checkNow() once immediately on start when enabled', async () => {
      const httpClient = makeAxios(200, githubRelease('v1.1.2')); // same → no emit
      const config = makeConfig({
        userPreferencesReader: makePrefsReader(enabledPrefs()),
        httpClient,
      });
      const checker = new UpdateChecker(config);
      checker.start();
      // checkNow is async; wait a tick for it to complete
      await new Promise((r) => setImmediate(r));
      expect(httpClient.get).toHaveBeenCalled();
      checker.stop();
    });

    it('does NOT set an interval when intervalHours is 0 (launch-only mode)', async () => {
      // intervalHours: 0 means "check on launch only, no periodic timer".
      // setIntervalFn must NOT be called — calling it with 0 would be a hot-loop.
      const httpClient = makeAxios(200, githubRelease('v1.1.2'));
      const config = makeConfig({
        userPreferencesReader: makePrefsReader(
          JSON.stringify({
            enabled: true,
            intervalHours: 0,
            lastCheckedAt: null,
            skippedVersion: null,
          })
        ),
        httpClient,
      });
      const checker = new UpdateChecker(config);
      checker.start();
      expect(config.setIntervalFn).not.toHaveBeenCalled();
      // But the immediate launch check still fires.
      await new Promise((r) => setImmediate(r));
      expect(httpClient.get).toHaveBeenCalled();
      checker.stop();
    });

    it('DOES set an interval when intervalHours is 24 (periodic mode)', async () => {
      const httpClient = makeAxios(200, githubRelease('v1.1.2'));
      const config = makeConfig({
        userPreferencesReader: makePrefsReader(enabledPrefs({ intervalHours: 24 })),
        httpClient,
      });
      const checker = new UpdateChecker(config);
      checker.start();
      expect(config.setIntervalFn).toHaveBeenCalledWith(
        expect.any(Function),
        24 * 3_600_000
      );
      checker.stop();
    });

    it('stop()-then-start() does not leave a dangling interval', () => {
      const httpClient = makeAxios(200, githubRelease('v1.1.2'));
      const config = makeConfig({
        userPreferencesReader: makePrefsReader(enabledPrefs()),
        httpClient,
      });
      const checker = new UpdateChecker(config);
      checker.start();
      checker.start(); // second start() should stop first then re-start
      // clearIntervalFn must have been called (for the first interval)
      expect(config.clearIntervalFn).toHaveBeenCalled();
      checker.stop();
    });
  });

  // ---- stop() ----

  describe('stop()', () => {
    it('clears the interval and nulls it', () => {
      const httpClient = makeAxios(200, githubRelease('v9.9.9'));
      const config = makeConfig({
        userPreferencesReader: makePrefsReader(enabledPrefs()),
        httpClient,
      });
      const checker = new UpdateChecker(config);
      checker.start();
      checker.stop();
      expect(config.clearIntervalFn).toHaveBeenCalledWith(99);
    });

    it('is a no-op when not started', () => {
      const config = makeConfig();
      const checker = new UpdateChecker(config);
      expect(() => checker.stop()).not.toThrow();
      expect(config.clearIntervalFn).not.toHaveBeenCalled();
    });
  });

  // ---- checkNow() ----

  describe('checkNow()', () => {
    it('skips HTTP call when enabled is false', async () => {
      const httpClient = makeAxios(200, githubRelease('v9.9.9'));
      const config = makeConfig({ httpClient });
      // Default prefs → enabled: false
      const checker = new UpdateChecker(config);
      await checker.checkNow();
      expect(httpClient.get).not.toHaveBeenCalled();
    });

    it('sends update:available when a newer version is found', async () => {
      const mainWindow = makeMainWindow();
      const httpClient = makeAxios(200, githubRelease('v2.0.0'));
      const config = makeConfig({
        getMainWindow: jest.fn().mockReturnValue(mainWindow),
        userPreferencesReader: makePrefsReader(enabledPrefs()),
        httpClient,
        currentVersion: '1.1.2',
      });
      const checker = new UpdateChecker(config);
      await checker.checkNow();
      expect(mainWindow.webContents.send).toHaveBeenCalledWith(
        'update:available',
        expect.objectContaining({
          version: '2.0.0',
          level: 'breaking',
        })
      );
    });

    it('sends update:available with caution level for a minor/patch bump', async () => {
      const mainWindow = makeMainWindow();
      const httpClient = makeAxios(200, githubRelease('v1.2.0'));
      const config = makeConfig({
        getMainWindow: jest.fn().mockReturnValue(mainWindow),
        userPreferencesReader: makePrefsReader(enabledPrefs()),
        httpClient,
        currentVersion: '1.1.2',
      });
      const checker = new UpdateChecker(config);
      await checker.checkNow();
      expect(mainWindow.webContents.send).toHaveBeenCalledWith(
        'update:available',
        expect.objectContaining({ version: '1.2.0', level: 'caution' })
      );
    });

    it('does NOT send update:available when current === latest (safe)', async () => {
      const mainWindow = makeMainWindow();
      const httpClient = makeAxios(200, githubRelease('v1.1.2'));
      const config = makeConfig({
        getMainWindow: jest.fn().mockReturnValue(mainWindow),
        userPreferencesReader: makePrefsReader(enabledPrefs()),
        httpClient,
        currentVersion: '1.1.2',
      });
      const checker = new UpdateChecker(config);
      await checker.checkNow();
      expect(mainWindow.webContents.send).not.toHaveBeenCalled();
    });

    it('does NOT send update:available when latest equals the skippedVersion', async () => {
      const mainWindow = makeMainWindow();
      const httpClient = makeAxios(200, githubRelease('v1.2.0'));
      const config = makeConfig({
        getMainWindow: jest.fn().mockReturnValue(mainWindow),
        userPreferencesReader: makePrefsReader(enabledPrefs({ skippedVersion: '1.2.0' })),
        httpClient,
        currentVersion: '1.1.2',
      });
      const checker = new UpdateChecker(config);
      await checker.checkNow();
      expect(mainWindow.webContents.send).not.toHaveBeenCalled();
    });

    it('updates lastCheckedAt via SetUserPreferenceCommand after a successful check', async () => {
      const setPrefCmd = makeSetPrefCommand();
      const httpClient = makeAxios(200, githubRelease('v1.1.2'));
      const config = makeConfig({
        userPreferencesReader: makePrefsReader(enabledPrefs()),
        setUserPreferenceCommand: setPrefCmd,
        httpClient,
        nowFn: jest.fn().mockReturnValue('2026-06-05T13:00:00.000Z'),
      });
      const checker = new UpdateChecker(config);
      await checker.checkNow();
      expect(setPrefCmd.execute).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          key: 'updatePreferences',
          value: expect.stringContaining('2026-06-05T13:00:00.000Z'),
        })
      );
    });

    it('updates lastCheckedAt even when HTTP call fails (silent no-op)', async () => {
      const setPrefCmd = makeSetPrefCommand();
      // 429 → axios throws
      const httpClient = makeAxios(429);
      const config = makeConfig({
        userPreferencesReader: makePrefsReader(enabledPrefs()),
        setUserPreferenceCommand: setPrefCmd,
        httpClient,
      });
      const checker = new UpdateChecker(config);
      await expect(checker.checkNow()).resolves.toBeUndefined(); // never throws
      expect(setPrefCmd.execute).toHaveBeenCalled();
    });

    it('does not throw on network error (silent no-op)', async () => {
      const httpClient = {
        get: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      } as unknown as AxiosInstance;
      const config = makeConfig({
        userPreferencesReader: makePrefsReader(enabledPrefs()),
        httpClient,
      });
      const checker = new UpdateChecker(config);
      await expect(checker.checkNow()).resolves.toBeUndefined();
    });

    it('does not throw on non-200 response body (silent no-op)', async () => {
      // 200 but body is empty / wrong shape
      const httpClient = {
        get: jest.fn().mockResolvedValue({ status: 200, data: {} }),
      } as unknown as AxiosInstance;
      const config = makeConfig({
        userPreferencesReader: makePrefsReader(enabledPrefs()),
        httpClient,
      });
      const checker = new UpdateChecker(config);
      await expect(checker.checkNow()).resolves.toBeUndefined();
    });

    it('debounces when last check was fewer than 5 minutes ago', async () => {
      const httpClient = makeAxios(200, githubRelease('v1.2.0'));
      // lastCheckedAt is "now" — gap is 0 ms
      const now = new Date().toISOString();
      const config = makeConfig({
        userPreferencesReader: makePrefsReader(enabledPrefs({ lastCheckedAt: now })),
        httpClient,
      });
      const checker = new UpdateChecker(config);
      await checker.checkNow();
      expect(httpClient.get).not.toHaveBeenCalled();
    });

    it('does not debounce when last check was more than 5 minutes ago', async () => {
      const httpClient = makeAxios(200, githubRelease('v1.1.2'));
      // lastCheckedAt 10 minutes ago
      const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const config = makeConfig({
        userPreferencesReader: makePrefsReader(
          enabledPrefs({ lastCheckedAt: tenMinsAgo })
        ),
        httpClient,
      });
      const checker = new UpdateChecker(config);
      await checker.checkNow();
      expect(httpClient.get).toHaveBeenCalled();
    });

    it('silently skips send when mainWindow is null', async () => {
      const httpClient = makeAxios(200, githubRelease('v9.0.0'));
      const config = makeConfig({
        getMainWindow: jest.fn().mockReturnValue(null),
        userPreferencesReader: makePrefsReader(enabledPrefs()),
        httpClient,
        currentVersion: '1.0.0',
      });
      const checker = new UpdateChecker(config);
      await expect(checker.checkNow()).resolves.toBeUndefined();
    });

    it('silently skips send when mainWindow is destroyed', async () => {
      const mainWindow = makeMainWindow(true /* destroyed */);
      const httpClient = makeAxios(200, githubRelease('v9.0.0'));
      const config = makeConfig({
        getMainWindow: jest.fn().mockReturnValue(mainWindow),
        userPreferencesReader: makePrefsReader(enabledPrefs()),
        httpClient,
        currentVersion: '1.0.0',
      });
      const checker = new UpdateChecker(config);
      await checker.checkNow();
      expect(mainWindow.webContents.send).not.toHaveBeenCalled();
    });
  });
});
