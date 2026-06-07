# 0016 — Notification generation + a single suppression seam

Status: Accepted

## Context

The Notifications settings section persisted seven fields, but only two —
`enabled` and `syncStatus` — did anything: they gated the desktop sync-complete /
sync-error toast in `CanvasClientManager`. The other five were dead toggles:

- `dueDateReminders` — no scheduler ever produced a reminder.
- `gradeAlerts` — grade changes were detected on the sync path
  (`SyncCommitPhase` writes a `sync_updates` row with `entityType:'grade'` and the
  `sync-updates` event already carries a `gradeChanges` count) but nothing turned
  that into a desktop notification.
- `quietWhenUnplugged` — no power state was ever consulted.
- `quietWhenFullscreen` — Electron can only reliably detect _our own_ window's
  fullscreen, not a foreign foreground fullscreen app, which is what the label
  ("presentations or focus sessions") promised.
- `quietWhenBusy` — system Do-Not-Disturb / Focus Assist has no portable Electron
  API; it never even had a UI control.

Separately, `aiConfig` was a vestige of the removed L3 AI layer (ADR-0003):
schema-only, no UI, no consumer.

## Decision

### 1 — One show seam

All desktop notifications (sync status, due-date reminders, grade alerts) funnel
through a single `CanvasClientManager.showDesktopNotification(title, body, kind)`
private method. It (a) reads `notificationSettings` from `user_preferences`
(lifecycle raw read, allowed — not under `src/lifecycle/ipc-handlers/`), (b)
applies the per-kind enable gate (`syncStatus` / `dueDateReminders` /
`gradeAlerts`), then (c) applies the pure suppression predicate. No other site
constructs `new Notification(...).show()`.

### 2 — A pure suppression predicate

`shouldSuppressNotification(settings, systemState)` is a pure, unit-tested
function with no Electron / platform reads — the live state (`onBatteryPower`) is
injected by the show seam. v1 policy: suppress when
`quietWhenUnplugged && onBatteryPower`. Power state comes from
`powerMonitor.isOnBatteryPower()` (cross-platform, reliable); a read failure is
treated as "plugged in" so a transient error never silently swallows
notifications.

### 3 — Due-date reminders (lifecycle scheduler)

A lifecycle scheduler scans on an hourly interval for visible-course incomplete
tasks due within a fixed 24h lead time, deduped so the same task is not
re-notified, and emits through the show seam. Task selection is a pure,
injectable function. Visibility is enforced via `VisibilityOracle` /
`VisibleDataProvider` (course-visibility invariant): an empty visible set yields
zero reminders, never all tasks.

### 4 — Grade alerts (sync-event hook)

The existing `sync-updates` event already carries a `gradeChanges` count. When
`gradeChanges > 0` and `gradeAlerts` is on, the seam fires a single batched
notification ("N new grades posted"). No new query, no new seam.

### 5 — Drop the un-implementable toggles + the vestige

`quietWhenFullscreen` and `quietWhenBusy` are removed from
`NotificationSettingsSchema`, its default, and the UI. `aiConfig` is removed
end-to-end (schema, type, defaults, re-export). Both are localStorage-only and
the schema is a non-strict `z.object`, so old persisted rows carrying the dropped
keys parse cleanly (keys stripped) — no migration.

## Consequences

- A new lifecycle scheduler service + in-memory reminder dedup (per app run). A
  future `notified_reminders` table could persist dedup across restarts — out of
  scope for v1.
- The notification policy is now testable in isolation (pure predicate + pure
  task selection); only the Electron wiring is platform-bound.
- Fewer settings, all of which now do something.

## Alternatives considered

- **Native fullscreen / DND detection** — rejected as fragile, per-OS, and
  version-sensitive. Honest scope beats a dead toggle.
- **Per-grade grade notifications** — possible by reading `sync_updates` grade
  rows by session, but batched off the existing count is zero-cost and avoids
  notification spam.
