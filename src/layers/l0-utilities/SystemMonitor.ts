import { EventEmitter } from 'events';
import { powerMonitor } from 'electron';
import { SystemMonitorConfig } from './AppConfig';

export interface SystemMonitorOptions {
  pollIntervalMs?: number;
}

export interface SystemState {
  powerSource: 'battery' | 'ac' | 'unknown';
  batteryLevel: number; // 0-100
  isCharging: boolean;
  windowFocused: boolean;
  isFullscreen: boolean;
  canSync: boolean; // Derived from power/focus state
}

// Default values
const DEFAULT_POLL_INTERVAL_MS = 5000;

export class SystemMonitor extends EventEmitter {
  private state: SystemState;
  private pollInterval: NodeJS.Timeout | null = null;
  private lastEmittedState: string = '';
  private readonly pollIntervalMs: number;
  private focusDebounceTimer: NodeJS.Timeout | null = null;
  private readonly focusDebounceMs = 200; // Debounce focus changes by 200ms

  /**
   * Create a new SystemMonitor instance
   * @param config - SystemMonitorConfig from AppConfig, or SystemMonitorOptions
   */
  constructor(config?: SystemMonitorConfig | SystemMonitorOptions) {
    super();

    this.pollIntervalMs = config?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

    // Initialize with default state
    this.state = {
      powerSource: 'unknown',
      batteryLevel: 100,
      isCharging: false,
      windowFocused: true,
      isFullscreen: false,
      canSync: true,
    };
  }

  /**
   * Start monitoring system state
   * Polls at configured interval, emits events only on state changes
   */
  start(): void {
    if (this.pollInterval) {
      return; // Already running
    }

    // Initial state check
    this.updateState();

    // Poll at configured interval
    this.pollInterval = setInterval(() => {
      this.updateState();
    }, this.pollIntervalMs);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.focusDebounceTimer) {
      clearTimeout(this.focusDebounceTimer);
      this.focusDebounceTimer = null;
    }
  }

  /**
   * Get current system state
   */
  getState(): SystemState {
    return { ...this.state };
  }

  /**
   * Update window focus state (called from main process)
   * Debounced to prevent thrashing when external apps open/close
   */
  setWindowFocused(focused: boolean): void {
    // Clear any pending focus change
    if (this.focusDebounceTimer) {
      clearTimeout(this.focusDebounceTimer);
      this.focusDebounceTimer = null;
    }

    // Debounce focus changes to prevent rapid oscillation
    this.focusDebounceTimer = setTimeout(() => {
      this.focusDebounceTimer = null;
      if (this.state.windowFocused !== focused) {
        this.state.windowFocused = focused;
        this.emitStateChange();
      }
    }, this.focusDebounceMs);
  }

  /**
   * Update fullscreen state (called from main process)
   */
  setFullscreen(fullscreen: boolean): void {
    if (this.state.isFullscreen !== fullscreen) {
      this.state.isFullscreen = fullscreen;
      this.emitStateChange();
    }
  }

  /**
   * Update system state by querying Electron APIs
   */
  private updateState(): void {
    try {
      // Check power source
      const onBattery = powerMonitor.isOnBatteryPower();
      this.state.powerSource = onBattery ? 'battery' : 'ac';

      // Battery charging status
      // Note: Electron's powerMonitor doesn't provide direct battery level
      // This would need platform-specific implementation or a library
      // For now, we'll estimate based on charging state
      this.state.isCharging = !onBattery;

      // Determine if we can sync based on power and focus
      this.state.canSync = this.shouldAllowSync();

      // Emit event only if state changed
      this.emitStateChange();
    } catch {
      // powerMonitor may not be available in all environments (tests, etc.)
      // Silently ignore - this is expected in test environments
    }
  }

  /**
   * Determine if sync should be allowed based on current state
   * Strategy:
   * - Always sync on AC power
   * - Only sync on battery if window is focused (user is actively using app)
   */
  private shouldAllowSync(): boolean {
    // Always allow sync on AC power
    if (this.state.powerSource === 'ac') {
      return true;
    }

    // On battery: only sync if window is focused
    // This saves battery when app is minimized
    return this.state.windowFocused;
  }

  /**
   * Emit state change event only if state actually changed
   * Prevents redundant events
   */
  private emitStateChange(): void {
    const currentStateHash = JSON.stringify(this.state);

    if (currentStateHash !== this.lastEmittedState) {
      this.lastEmittedState = currentStateHash;
      this.emit('state-change', this.getState());
    }
  }

  /**
   * Get human-readable description of current state
   */
  getStateDescription(): string {
    const parts: string[] = [];

    parts.push(`Power: ${this.state.powerSource.toUpperCase()}`);

    if (this.state.isCharging) {
      parts.push('Charging');
    }

    if (this.state.windowFocused) {
      parts.push('Focused');
    } else {
      parts.push('Unfocused');
    }

    if (this.state.isFullscreen) {
      parts.push('Fullscreen');
    }

    parts.push(this.state.canSync ? 'Sync: ✓' : 'Sync: ✗');

    return parts.join(' | ');
  }
}
