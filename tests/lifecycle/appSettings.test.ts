/**
 * appSettings — pure read/default function tests (Batch 2 of the settings sweep).
 *
 * Covers the settings-read helpers in `src/lifecycle/appSettings.ts`:
 *  - getWindowBehavior / setWindowBehavior — config-file (window-behavior.json)
 *    round-trip + default merge + corrupt-file → defaults.
 *  - getSyncPreferences / getLocalHtmlPathsSettings — user_preferences (SQL) reads
 *    with default fallback and partial-override merge.
 *
 * These are pure functions over a config dir / Database — no Electron, no native
 * ABI beyond better-sqlite3 (Node ABI via npm test pretest). Paths derived via
 * os.tmpdir() + path.join (never hardcoded separators — Windows-dev/Linux-CI).
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  getWindowBehavior,
  setWindowBehavior,
  getSyncPreferences,
  getLocalHtmlPathsSettings,
  type WindowBehaviorSettings,
} from '../../src/lifecycle/appSettings';
import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';
import type { Logger } from '../../src/layers/l0-utilities/Logger';

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as Logger;

describe('appSettings.getWindowBehavior / setWindowBehavior', () => {
  let configDir: string;
  let dirCounter = 0;

  beforeEach(() => {
    dirCounter += 1;
    configDir = path.join(os.tmpdir(), `cid-appsettings-${process.pid}-${dirCounter}`);
    fs.mkdirSync(configDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(configDir)) fs.rmSync(configDir, { recursive: true, force: true });
  });

  it('returns defaults when no config file exists', () => {
    expect(getWindowBehavior(configDir)).toEqual({
      closeAction: null,
      showTrayIcon: true,
    });
  });

  it('round-trips a written value (setWindowBehavior → getWindowBehavior)', () => {
    const settings: WindowBehaviorSettings = {
      closeAction: 'minimize-to-tray',
      showTrayIcon: false,
    };
    setWindowBehavior(configDir, settings, noopLogger);
    expect(getWindowBehavior(configDir)).toEqual(settings);
  });

  it('merges defaults for a partially-written file (missing key falls back)', () => {
    // Write only closeAction; showTrayIcon must come from the default.
    const settingsPath = path.join(configDir, 'window-behavior.json');
    fs.writeFileSync(settingsPath, JSON.stringify({ closeAction: 'quit' }));
    expect(getWindowBehavior(configDir)).toEqual({
      closeAction: 'quit',
      showTrayIcon: true, // default
    });
  });

  it('returns defaults when the config file is corrupt (invalid JSON)', () => {
    const settingsPath = path.join(configDir, 'window-behavior.json');
    fs.writeFileSync(settingsPath, '{ this is not valid json');
    expect(getWindowBehavior(configDir)).toEqual({
      closeAction: null,
      showTrayIcon: true,
    });
  });

  it('setWindowBehavior creates the config dir if it does not yet exist', () => {
    const nested = path.join(configDir, 'nested', 'deeper');
    setWindowBehavior(nested, { closeAction: 'quit', showTrayIcon: true }, noopLogger);
    expect(fs.existsSync(path.join(nested, 'window-behavior.json'))).toBe(true);
    expect(getWindowBehavior(nested).closeAction).toBe('quit');
  });
});

describe('appSettings.getSyncPreferences / getLocalHtmlPathsSettings (SQL)', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
  });

  afterEach(() => {
    db.close();
  });

  function setPref(key: string, value: Record<string, unknown>): void {
    db.executeWrite(
      `INSERT INTO user_preferences (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, JSON.stringify(value)],
      'user_preferences'
    );
  }

  it('getSyncPreferences returns defaults when the row is absent', () => {
    expect(getSyncPreferences(db)).toEqual({
      autoSyncEnabled: true,
      autoSyncInterval: 30,
      syncFiles: true,
      syncAnnouncements: true,
      autoAssignDueDate: false,
      saveHtmlContent: true,
      htmlUrlRewriting: 'original',
      downloadImages: true,
      downloadLinkedFiles: false,
    });
  });

  it('getSyncPreferences merges a partial stored value over defaults', () => {
    setPref('syncPreferences', {
      autoAssignDueDate: true,
      htmlUrlRewriting: 'local',
    });
    const prefs = getSyncPreferences(db);
    expect(prefs.autoAssignDueDate).toBe(true); // stored override
    expect(prefs.htmlUrlRewriting).toBe('local'); // stored override
    expect(prefs.autoSyncInterval).toBe(30); // default preserved
    expect(prefs.saveHtmlContent).toBe(true); // default preserved
  });

  it('getLocalHtmlPathsSettings returns defaults when the row is absent', () => {
    expect(getLocalHtmlPathsSettings(db)).toEqual({
      enabled: false,
      autoRegenerate: true,
      promptForMissing: true,
    });
  });

  it('getLocalHtmlPathsSettings merges a partial stored value over defaults', () => {
    setPref('localHtmlPathsSettings', { enabled: true, promptForMissing: false });
    const settings = getLocalHtmlPathsSettings(db);
    expect(settings.enabled).toBe(true); // stored override
    expect(settings.promptForMissing).toBe(false); // stored override
    expect(settings.autoRegenerate).toBe(true); // default preserved
  });
});
