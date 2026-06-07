/**
 * shouldSuppressNotification — pure, unit-testable suppression predicate.
 *
 * Every desktop notification (sync status, due-date reminders, grade alerts)
 * funnels through `CanvasClientManager.showDesktopNotification`, which applies
 * this predicate AFTER the per-kind enable gate. Keeping it pure (no Electron,
 * no platform reads) makes the suppression policy fully testable; the show seam
 * supplies the live system state.
 *
 * v1 policy (ADR-0016): suppress when the "quiet when unplugged" toggle is on
 * and the machine is on battery power. `quietWhenFullscreen` / `quietWhenBusy`
 * were dropped — fullscreen can only detect our own window (not foreign
 * fullscreen apps) and busy/DND has no portable Electron API.
 */

/** Live system state sampled at show-time by the show seam. */
export interface NotificationSystemState {
  /** From `powerMonitor.isOnBatteryPower()`. */
  onBatteryPower: boolean;
}

/** The notification-settings fields this predicate consumes. */
export interface SuppressionSettings {
  quietWhenUnplugged: boolean;
}

/**
 * Pure. Returns true when a desktop notification should be SUPPRESSED given the
 * user's quiet-mode settings and the current system state.
 */
export function shouldSuppressNotification(
  settings: SuppressionSettings,
  state: NotificationSystemState
): boolean {
  return settings.quietWhenUnplugged && state.onBatteryPower;
}
