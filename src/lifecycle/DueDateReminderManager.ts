/**
 * DueDateReminderManager — lifecycle scheduler for due-date reminders (ADR-0016).
 *
 * Modeled on AutoSyncManager: an hourly interval that, when
 * `notificationSettings.enabled && .dueDateReminders` is on, scans the user's
 * VISIBLE-course incomplete tasks for ones due within a fixed 24h lead time and
 * emits a desktop notification through the single show seam
 * (`CanvasClientManager.showDesktopNotification`).
 *
 * Course visibility (MANDATORY): tasks are pulled only for
 * `VisibilityOracle.getVisibleCourseIds()`; an empty visible set yields zero
 * reminders, never all tasks (course-visibility invariant).
 *
 * Dedup is in-memory, keyed on `${taskId}|${due_at}` so a task is notified once
 * per (task, due-date) pair within an app run and a due-date change re-arms it
 * (v1 — no cross-restart persistence; see ADR-0016 consequences).
 *
 * The selection logic lives in the pure `selectDueReminders` fn; this class is
 * the schedule + visibility + dedup + show glue, kept thin for testability.
 */

import type { Database } from '../layers/l1-persistence';
import type { VisibilityOracle } from '../layers/l1-persistence';
import { TaskReader } from '../layers/l1-persistence/readers/TaskReader';
import { NotifiedReminderReader } from '../layers/l1-persistence/readers/NotifiedReminderReader';
import { RecordNotifiedReminderCommand } from '../layers/l4-controller/commands/notifiedReminder/RecordNotifiedReminderCommand';
import {
  selectDueReminders,
  type ReminderCandidate,
  type ReminderTaskInput,
} from './notifications/selectDueReminders';

/** Minimal logger surface this manager needs (Logger or ComponentLogger). */
interface ReminderLogger {
  info(message: string): void;
}

/** Fixed lead time: notify when a task is due within 24h (ADR-0016, F1). */
export const REMINDER_LEAD_TIME_MS = 24 * 60 * 60 * 1000;

/** Hourly scan cadence (ADR-0016, F2). Dedup makes the re-scan idempotent. */
export const REMINDER_SCAN_INTERVAL_MS = 60 * 60 * 1000;

/**
 * How far in the past a `due_at` must be before its dedup row is eligible to
 * be pruned. 7 days >> the 24h notification window, so a key whose due_at is
 * < (now - 7d) can never guard a future reminder — pruning it is safe.
 * Exported so the test can assert the exact boundary.
 */
export const PRUNE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export interface DueDateReminderManagerConfig {
  database: Database;
  logger: ReminderLogger;
  getVisibilityOracle: () => VisibilityOracle | null;
  /** Funnel to the single show seam; returns true if it was actually shown. */
  showNotification: (title: string, body: string) => boolean;
  /** Override the scan cadence (tests). Defaults to hourly. */
  scanIntervalMs?: number;
  /** Override the lead time (tests). Defaults to 24h. */
  leadTimeMs?: number;
  /** Injectable clock (tests). Defaults to Date.now. */
  now?: () => number;
  /**
   * Reader for seeding the in-memory dedup Set from the `notified_reminders`
   * table on startup (durable dedup across restarts). Optional: if omitted
   * the Set starts empty (v1 in-memory-only behavior).
   */
  notifiedReminderReader?: NotifiedReminderReader;
  /**
   * Command for persisting each notified dedup key and for pruning stale rows
   * on startup. Optional: if omitted, dedup is in-memory only.
   */
  recordNotifiedReminderCommand?: RecordNotifiedReminderCommand;
}

export class DueDateReminderManager {
  private readonly database: Database;
  private readonly logger: ReminderLogger;
  private readonly getVisibilityOracle: () => VisibilityOracle | null;
  private readonly showNotification: (title: string, body: string) => boolean;
  private readonly taskReader: TaskReader;
  private readonly scanIntervalMs: number;
  private readonly leadTimeMs: number;
  private readonly now: () => number;
  private readonly notifiedReminderReader: NotifiedReminderReader | undefined;
  private readonly recordNotifiedReminderCommand:
    | RecordNotifiedReminderCommand
    | undefined;

  /** Dedup set of `${taskId}|${due_at}` keys already notified this app run. */
  private readonly notified = new Set<string>();
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(config: DueDateReminderManagerConfig) {
    this.database = config.database;
    this.logger = config.logger;
    this.getVisibilityOracle = config.getVisibilityOracle;
    this.showNotification = config.showNotification;
    this.taskReader = new TaskReader(this.database);
    this.scanIntervalMs = config.scanIntervalMs ?? REMINDER_SCAN_INTERVAL_MS;
    this.leadTimeMs = config.leadTimeMs ?? REMINDER_LEAD_TIME_MS;
    this.now = config.now ?? (() => Date.now());
    this.notifiedReminderReader = config.notifiedReminderReader;
    this.recordNotifiedReminderCommand = config.recordNotifiedReminderCommand;
  }

  /**
   * Start the hourly scan. Idempotent — clears any existing interval first.
   * The per-scan enable/visibility checks run inside `scan()`, so the timer is
   * always armed and responds to live settings/visibility changes.
   *
   * On each call, we also:
   *   1. Prune stale rows from `notified_reminders` (due_at older than 7 days).
   *      Cutoff is compared against `due_at` (not `notified_at`) so a key can
   *      never be pruned while it guards a within-window or future due date.
   *   2. Seed `this.notified` from the table so reminders already sent in a
   *      previous app run are not re-fired in this one.
   */
  start(): void {
    this.stop();

    // Prune stale dedup rows and seed the in-memory Set (durable dedup).
    // Cutoff: 7 days before now, compared against due_at (ISO-UTC lexical sort
    // == chronological sort for UTC strings — same guarantee selectDueReminders uses).
    if (this.recordNotifiedReminderCommand) {
      const cutoffIso = new Date(this.now() - PRUNE_RETENTION_MS).toISOString();
      this.recordNotifiedReminderCommand.pruneOlderThan(cutoffIso);
    }
    if (this.notifiedReminderReader) {
      const keys = this.notifiedReminderReader.getAllKeys();
      for (const k of keys) {
        this.notified.add(k);
      }
    }

    this.interval = setInterval(() => {
      void this.scan();
    }, this.scanIntervalMs);
    this.logger.info(
      `DueDateReminderManager started (interval ${this.scanIntervalMs / 60000}m, lead ${this.leadTimeMs / 3600000}h)`
    );
  }

  /** Stop the scheduler. */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Run a single scan: gate on settings, pull visible-course incomplete tasks,
   * select due-soon candidates, dedup, and show. Public so tests (and a future
   * "scan now" trigger) can drive it directly. Returns the candidates shown.
   */
  scan(): ReminderCandidate[] {
    // Gate on the dueDateReminders toggle (read fresh each scan).
    if (!this.areRemindersEnabled()) return [];

    // Course-visibility invariant: visible courses only; empty → no reminders.
    const oracle = this.getVisibilityOracle();
    if (!oracle) return [];
    const visibleCourseIds = oracle.getVisibleCourseIds();
    if (visibleCourseIds.length === 0) return [];

    const tasks: ReminderTaskInput[] = this.taskReader
      .getByCourseIds(visibleCourseIds)
      .map((t) => ({
        id: t.id,
        title: t.title,
        course_id: t.course_id,
        due_at: t.due_at,
        is_completed: t.is_completed,
      }));

    const candidates = selectDueReminders(
      tasks,
      this.now(),
      this.leadTimeMs,
      this.notified
    );

    for (const candidate of candidates) {
      this.showNotification('Assignment due soon', `${candidate.title} is due soon`);
      // Dedup and persist regardless of the show outcome: a suppressed reminder
      // (e.g. quiet on battery) must NOT re-fire every hour for the same due
      // date, nor re-fire after a restart — the suppression decision is made
      // once at the show seam.
      this.notified.add(candidate.dedupKey);
      if (this.recordNotifiedReminderCommand) {
        this.recordNotifiedReminderCommand.record(
          candidate.dedupKey,
          candidate.taskId,
          candidate.dueAt
        );
      }
    }

    return candidates;
  }

  /** Read `notificationSettings` fresh; true only when enabled + dueDateReminders. */
  private areRemindersEnabled(): boolean {
    try {
      const prefs = this.database.executeReadOne<{ value: string }>(
        "SELECT value FROM user_preferences WHERE key = 'notificationSettings'"
      );
      if (!prefs?.value) return false;
      const parsed = JSON.parse(prefs.value) as {
        enabled?: boolean;
        dueDateReminders?: boolean;
      };
      return parsed.enabled === true && parsed.dueDateReminders === true;
    } catch {
      return false;
    }
  }
}
