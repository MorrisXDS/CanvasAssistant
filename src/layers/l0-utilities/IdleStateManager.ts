/**
 * IdleStateManager - Handles system suspend/resume and idle protection
 *
 * Prevents crashes and data corruption when the system goes to sleep
 * by pausing sync operations and checkpointing the WAL database.
 */

import { EventEmitter } from 'events';
import { powerMonitor } from 'electron';
import { Logger } from './Logger';

export interface IdleStateManagerConfig {
  /** Logger instance */
  logger?: Logger;
  /** Callback when system is suspending */
  onSuspend?: () => Promise<void>;
  /** Callback when system resumes */
  onResume?: () => Promise<void>;
  /** Callback to checkpoint WAL */
  onCheckpoint?: () => void;
}

export type SystemPowerState = 'active' | 'suspending' | 'suspended' | 'resuming';

/**
 * Manages system idle state and protects against sleep/wake issues
 */
export class IdleStateManager extends EventEmitter {
  private logger?: Logger;
  private powerState: SystemPowerState = 'active';
  private onSuspend?: () => Promise<void>;
  private onResume?: () => Promise<void>;
  private onCheckpoint?: () => void;
  private isInitialized: boolean = false;

  constructor(config: IdleStateManagerConfig = {}) {
    super();
    this.logger = config.logger;
    this.onSuspend = config.onSuspend;
    this.onResume = config.onResume;
    this.onCheckpoint = config.onCheckpoint;
  }

  /**
   * Start monitoring power state
   * Must be called after app is ready
   */
  start(): void {
    if (this.isInitialized) {
      this.logger?.warn('[IdleStateManager] Already initialized');
      return;
    }

    this.logger?.info('[IdleStateManager] Starting power monitor');

    // Listen for suspend event (before sleep)
    powerMonitor.on('suspend', () => {
      this.handleSuspend();
    });

    // Listen for resume event (after wake)
    powerMonitor.on('resume', () => {
      this.handleResume();
    });

    // Listen for lock screen (optional - could pause sync too)
    powerMonitor.on('lock-screen', () => {
      this.logger?.debug('[IdleStateManager] Screen locked');
      this.emit('screen-locked');
    });

    powerMonitor.on('unlock-screen', () => {
      this.logger?.debug('[IdleStateManager] Screen unlocked');
      this.emit('screen-unlocked');
    });

    // Listen for shutdown
    powerMonitor.on('shutdown', () => {
      this.logger?.info('[IdleStateManager] System shutdown detected');
      this.handleSuspend(); // Same handling as suspend
      this.emit('shutdown');
    });

    this.isInitialized = true;
  }

  /**
   * Handle system suspend (going to sleep)
   */
  private async handleSuspend(): Promise<void> {
    if (this.powerState === 'suspending' || this.powerState === 'suspended') {
      return;
    }

    this.logger?.info('[IdleStateManager] System suspending - pausing operations');
    this.powerState = 'suspending';
    this.emit('suspending');

    try {
      // Call the suspend callback (cancels sync, pauses watchers)
      if (this.onSuspend) {
        await this.onSuspend();
      }

      // Checkpoint WAL to ensure data is on disk
      if (this.onCheckpoint) {
        this.onCheckpoint();
        this.logger?.debug('[IdleStateManager] WAL checkpoint completed');
      }

      this.powerState = 'suspended';
      this.emit('suspended');
      this.logger?.info('[IdleStateManager] System suspended safely');
    } catch (error) {
      this.logger?.error(`[IdleStateManager] Error during suspend: ${error}`);
      this.powerState = 'suspended'; // Still mark as suspended
    }
  }

  /**
   * Handle system resume (waking from sleep)
   */
  private async handleResume(): Promise<void> {
    // Accept 'suspending' as well as 'suspended': on macOS the process can be
    // frozen mid-onSuspend await, leaving powerState stuck at 'suspending'.
    // If resume fires before onSuspend completed, we must still run onResume.
    if (this.powerState === 'active' || this.powerState === 'resuming') {
      return;
    }

    this.logger?.info('[IdleStateManager] System resuming - restarting operations');
    this.powerState = 'resuming';
    this.emit('resuming');

    try {
      // Call the resume callback (resumes watchers, scans for changes)
      if (this.onResume) {
        await this.onResume();
      }

      this.powerState = 'active';
      this.emit('resumed');
      this.logger?.info('[IdleStateManager] System resumed successfully');
    } catch (error) {
      this.logger?.error(`[IdleStateManager] Error during resume: ${error}`);
      this.powerState = 'active'; // Still mark as active
    }
  }

  /**
   * Get current power state
   */
  getState(): SystemPowerState {
    return this.powerState;
  }

  /**
   * Check if system is in a safe state for operations
   */
  isActive(): boolean {
    return this.powerState === 'active';
  }

  /**
   * Check if system is suspended or about to suspend
   */
  isSuspended(): boolean {
    return this.powerState === 'suspended' || this.powerState === 'suspending';
  }

  /**
   * Stop monitoring (for cleanup)
   */
  stop(): void {
    this.logger?.info('[IdleStateManager] Stopping');
    powerMonitor.removeAllListeners('suspend');
    powerMonitor.removeAllListeners('resume');
    powerMonitor.removeAllListeners('lock-screen');
    powerMonitor.removeAllListeners('unlock-screen');
    powerMonitor.removeAllListeners('shutdown');
    this.isInitialized = false;
  }
}

export default IdleStateManager;
