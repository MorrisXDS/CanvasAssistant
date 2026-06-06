/**
 * UpdateChecker — L2 daemon that polls the GitHub Releases "latest" endpoint
 * on a configurable interval and emits an `update:available` push event to
 * the renderer when a newer, non-skipped version is found.
 *
 * Design:
 * - Network is never touched unless the user has explicitly opted in
 *   (`updatePreferences.enabled === true`).
 * - Offline / non-200 / rate-limited (429) responses → silent no-op; the
 *   error is logged at `debug` level only so the user is not alarmed.
 * - Uses axios `timeout: 8000` instead of `Promise.race` + raw `setTimeout`
 *   to avoid the dangling-timer leak present in AutoSyncManager (ADR-0012).
 * - All I/O injection points (httpClient, clock functions, prefs reader/writer)
 *   accept overrides for unit testing so no real network or real timers are
 *   needed in tests.
 */

import type { BrowserWindow } from 'electron';
import type { AxiosInstance } from 'axios';
import axios from 'axios';
import type { ComponentLogger } from '../../l0-utilities/Logger';
import type { UserPreferencesReader } from '../../l1-persistence/readers/UserPreferencesReader';
import type { SetUserPreferenceCommand } from '../../l4-controller/commands/settings/SetUserPreferenceCommand';
import {
  DEFAULT_UPDATE_PREFERENCES,
  UpdatePreferencesSchema,
  type UpdatePreferences,
  type UpdateAvailablePayload,
} from '../../../shared/ipc-contract';
import { assessUpdate } from './assessUpdate';
import { createSimulationContext } from '../../l4-controller/types';
import type { Database } from '../../l1-persistence';

/** Minimum gap between consecutive HTTP calls (debounce for "Check Now" spam). */
const MIN_CHECK_GAP_MS = 5 * 60 * 1000; // 5 minutes

const GITHUB_API_URL =
  'https://api.github.com/repos/MorrisXDS/CanvasAssistant/releases/latest';

export interface UpdateCheckerConfig {
  /** Getter for the renderer BrowserWindow — may return null before window is ready. */
  getMainWindow: () => BrowserWindow | null;
  /** L1 reader for `user_preferences` — injected for testability. */
  userPreferencesReader: UserPreferencesReader;
  /** L4 command for writing `user_preferences` — injected for testability. */
  setUserPreferenceCommand: SetUserPreferenceCommand;
  /** Database reference — needed to build the CommandContext for the write command. */
  database: Database;
  /** Installed version string (from `app.getVersion()`). */
  currentVersion: string;
  logger: ComponentLogger;
  // ---- Injection seams for unit tests ----
  /** Default: `axios.create({ timeout: 8000, ... })`. */
  httpClient?: AxiosInstance;
  /** Default: global `setInterval`. */
  setIntervalFn?: typeof setInterval;
  /** Default: global `clearInterval`. */
  clearIntervalFn?: typeof clearInterval;
  /** Returns the current timestamp as an ISO string. Default: `() => new Date().toISOString()`. */
  nowFn?: () => string;
}

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  body?: string | null;
}

export class UpdateChecker {
  private readonly getMainWindow: () => BrowserWindow | null;
  private readonly userPreferencesReader: UserPreferencesReader;
  private readonly setUserPreferenceCommand: SetUserPreferenceCommand;
  private readonly database: Database;
  private readonly currentVersion: string;
  private readonly logger: ComponentLogger;
  private readonly httpClient: AxiosInstance;
  private readonly setIntervalFn: typeof setInterval;
  private readonly clearIntervalFn: typeof clearInterval;
  private readonly nowFn: () => string;

  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(config: UpdateCheckerConfig) {
    this.getMainWindow = config.getMainWindow;
    this.userPreferencesReader = config.userPreferencesReader;
    this.setUserPreferenceCommand = config.setUserPreferenceCommand;
    this.database = config.database;
    this.currentVersion = config.currentVersion;
    this.logger = config.logger;
    this.httpClient =
      config.httpClient ??
      axios.create({
        timeout: 8000,
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
    this.setIntervalFn = config.setIntervalFn ?? setInterval;
    this.clearIntervalFn = config.clearIntervalFn ?? clearInterval;
    this.nowFn = config.nowFn ?? (() => new Date().toISOString());
  }

  /**
   * Load current preferences from `user_preferences`, returning the defaults
   * when the key is absent or unparseable.
   */
  private loadPrefs(): UpdatePreferences {
    try {
      const raw = this.userPreferencesReader.get('updatePreferences');
      if (!raw) return { ...DEFAULT_UPDATE_PREFERENCES };
      const parsed = UpdatePreferencesSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) return { ...DEFAULT_UPDATE_PREFERENCES };
      return parsed.data;
    } catch {
      return { ...DEFAULT_UPDATE_PREFERENCES };
    }
  }

  /**
   * Persist updated preferences back to `user_preferences`.
   * Errors are logged and swallowed — a failed write must never break the caller.
   */
  private async savePrefs(prefs: UpdatePreferences): Promise<void> {
    try {
      const runContext = {
        db: this.database,
        simulationContext: createSimulationContext(),
      };
      await this.setUserPreferenceCommand.execute(runContext, {
        key: 'updatePreferences',
        value: JSON.stringify(prefs),
      });
    } catch (error) {
      this.logger.error('UpdateChecker: failed to persist preferences', error as Error);
    }
  }

  /**
   * Start the periodic check timer.
   *
   * Behaviour:
   * - Stops any existing interval first (safe to call repeatedly).
   * - Reads prefs fresh each time `start()` is called.
   * - If `enabled` is false, returns immediately without setting a timer.
   * - Otherwise sets the interval at `intervalHours * 3_600_000 ms` and calls
   *   `checkNow()` once immediately so the user sees a result at launch.
   */
  start(): void {
    this.stop(); // Clear any pre-existing interval.

    const prefs = this.loadPrefs();
    if (!prefs.enabled) {
      this.logger.debug('UpdateChecker: disabled, skipping start');
      return;
    }

    // intervalHours === 0 means "on launch only" — check once, no periodic timer.
    // Guard is mandatory: setInterval(fn, 0) is a continuous hot-loop (GitHub hammered,
    // throttled only by the 5-min debounce) and must never be created.
    if (prefs.intervalHours > 0) {
      const intervalMs = prefs.intervalHours * 3_600_000;
      this.logger.debug(
        `UpdateChecker: starting with interval ${prefs.intervalHours}h (${intervalMs}ms)`
      );
      this.interval = this.setIntervalFn(() => {
        this.checkNow().catch((err) => {
          // checkNow is designed never to throw, but guard at the boundary.
          this.logger.debug('UpdateChecker: unexpected error in scheduled check', err);
        });
      }, intervalMs);
    } else {
      this.logger.debug(
        'UpdateChecker: intervalHours=0 — launch-only check, no periodic timer'
      );
    }

    // Always run one immediate check on start (regardless of interval setting).
    this.checkNow().catch((err) => {
      this.logger.debug('UpdateChecker: unexpected error in startup check', err);
    });
  }

  /**
   * Stop and clear the periodic timer.
   */
  stop(): void {
    if (this.interval !== null) {
      this.clearIntervalFn(this.interval);
      this.interval = null;
    }
  }

  /**
   * Fetch the latest GitHub release and emit `update:available` if a newer,
   * non-skipped version is found. Always updates `lastCheckedAt` after an
   * attempt (even on error) so subsequent checks can honour the debounce.
   *
   * This method intentionally never throws — any error path is logged at
   * `debug` level and returns silently.
   */
  async checkNow(): Promise<void> {
    const prefs = this.loadPrefs();

    if (!prefs.enabled) {
      this.logger.debug('UpdateChecker: check skipped (disabled)');
      return;
    }

    // Debounce: skip if last check was fewer than MIN_CHECK_GAP_MS ago.
    if (prefs.lastCheckedAt) {
      const gap = Date.now() - new Date(prefs.lastCheckedAt).getTime();
      if (gap < MIN_CHECK_GAP_MS) {
        this.logger.debug(
          `UpdateChecker: check debounced (last check ${Math.round(gap / 1000)}s ago)`
        );
        return;
      }
    }

    let release: { version: string; htmlUrl: string } | null = null;
    try {
      release = await this.fetchLatestRelease();
    } catch {
      // fetchLatestRelease already logs; swallow here.
    }

    // Always stamp lastCheckedAt, even on failure, so we don't hammer the API.
    const updatedPrefs: UpdatePreferences = {
      ...prefs,
      lastCheckedAt: this.nowFn(),
    };
    await this.savePrefs(updatedPrefs);

    if (!release) return;

    // Skip if the user has already skipped this version.
    if (prefs.skippedVersion && prefs.skippedVersion === release.version) {
      this.logger.debug(
        `UpdateChecker: v${release.version} is skipped by user preference`
      );
      return;
    }

    const verdict = assessUpdate(this.currentVersion, release.version);

    // Only emit if the target is actually newer (safe == already latest).
    if (verdict.level === 'safe') {
      this.logger.debug('UpdateChecker: already on latest version');
      return;
    }

    const payload: UpdateAvailablePayload = {
      version: release.version,
      htmlUrl: release.htmlUrl,
      level: verdict.level,
      reason: verdict.reason,
    };

    this.sendUpdateAvailable(payload);
  }

  /**
   * Fetch the latest release from the GitHub Releases API.
   * Returns the parsed version + html_url, or null on any error (network,
   * non-200, rate-limit, parse failure).
   *
   * Notes:
   * - The `html_url` is taken verbatim from GitHub's response. Validation
   *   that it starts with `https://github.com/` is a Batch B concern (the
   *   modal calls `openExternal` and should validate there).
   * - No authentication header is sent; the 60 req/hr unauthenticated limit
   *   is non-issue at the default 24 h interval.
   */
  private async fetchLatestRelease(): Promise<{
    version: string;
    htmlUrl: string;
  } | null> {
    try {
      const response = await this.httpClient.get<GitHubRelease>(GITHUB_API_URL);

      if (response.status < 200 || response.status >= 300) {
        this.logger.debug(
          `UpdateChecker: non-2xx response from GitHub API: ${response.status}`
        );
        return null;
      }

      const data = response.data;
      if (!data?.tag_name || !data?.html_url) {
        this.logger.debug('UpdateChecker: unexpected GitHub API response shape');
        return null;
      }

      // Strip leading 'v' from tag_name to get a bare version string.
      const version = data.tag_name.replace(/^v/, '');

      return { version, htmlUrl: data.html_url };
    } catch (error) {
      // Network error, timeout, 429, etc. — all treated as silent no-ops.
      this.logger.debug(`UpdateChecker: fetch failed (silent): ${error}`);
      return null;
    }
  }

  /**
   * Send the `update:available` push event to the renderer via the main
   * window's webContents. Silently skips if the window is not available or
   * is destroyed.
   */
  private sendUpdateAvailable(payload: UpdateAvailablePayload): void {
    const mainWindow = this.getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      this.logger.debug('UpdateChecker: main window not available, skipping push event');
      return;
    }
    this.logger.debug(
      `UpdateChecker: emitting update:available for v${payload.version} (${payload.level})`
    );
    mainWindow.webContents.send('update:available', payload);
  }
}
