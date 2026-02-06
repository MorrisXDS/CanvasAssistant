/**
 * Window Manager
 * Handles BrowserWindow and system tray management
 */

import {
  app,
  BrowserWindow,
  Menu,
  nativeImage,
  nativeTheme,
  screen,
  Tray,
} from 'electron';
import fs from 'fs';
import path from 'path';
import type { Logger } from './layers/l0-utilities/Logger';
import type { MetricsCollector } from './layers/l0-utilities/MetricsCollector';
import type { SystemMonitor } from './layers/l0-utilities/SystemMonitor';
import type { CrashProtectionManager } from './CrashProtectionManager';
import type { AutoSyncManager } from './AutoSyncManager';

export interface WindowBehaviorSettings {
  closeAction: 'quit' | 'minimize-to-tray' | null;
  showTrayIcon: boolean;
}

export interface WindowManagerConfig {
  logger: Logger;
  metricsCollector: MetricsCollector;
  systemMonitor: SystemMonitor;
  crashProtectionManager: CrashProtectionManager;
  preloadPath: string;
  configDir: string;
  getAutoSyncManager: () => AutoSyncManager | null;
  getWindowBehavior: () => WindowBehaviorSettings;
  getDatabaseCorruptionDetected: () => { errors: string[]; canContinue: boolean } | null;
  isQuitting: () => boolean;
  setIsQuitting: (value: boolean) => void;
}

interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

const MIN_WIDTH = 864;
const MIN_HEIGHT = 720;
const TARGET_WIDTH_RATIO = 0.55;
const TARGET_HEIGHT_RATIO = 0.85;
const MAX_INITIAL_WIDTH = 1920;
const MAX_INITIAL_HEIGHT = 1200;
const STATE_SAVE_DEBOUNCE_MS = 500;
const WINDOW_STATE_FILENAME = 'window-state.json';
const OVERLAP_THRESHOLD = 100; // px required for bounds to count as visible

// Focus restore sync threshold (5 minutes)
const FOCUS_RESTORE_SYNC_THRESHOLD_MS = 5 * 60 * 1000;

export class WindowManager {
  private logger: Logger;
  private metricsCollector: MetricsCollector;
  private systemMonitor: SystemMonitor;
  private crashProtectionManager: CrashProtectionManager;
  private preloadPath: string;
  private getAutoSyncManager: () => AutoSyncManager | null;
  private getWindowBehavior: () => WindowBehaviorSettings;
  private getDatabaseCorruptionDetected: () => {
    errors: string[];
    canContinue: boolean;
  } | null;
  private isQuitting: () => boolean;
  private setIsQuitting: (value: boolean) => void;

  private mainWindow: BrowserWindow | null = null;
  private tray: Tray | null = null;
  private lastFocusLostAt: number | null = null;
  private configDir: string;
  private windowStatePath: string;
  private saveStateTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(config: WindowManagerConfig) {
    this.logger = config.logger;
    this.metricsCollector = config.metricsCollector;
    this.systemMonitor = config.systemMonitor;
    this.crashProtectionManager = config.crashProtectionManager;
    this.preloadPath = config.preloadPath;
    this.configDir = config.configDir;
    this.windowStatePath = path.join(config.configDir, WINDOW_STATE_FILENAME);
    this.getAutoSyncManager = config.getAutoSyncManager;
    this.getWindowBehavior = config.getWindowBehavior;
    this.getDatabaseCorruptionDetected = config.getDatabaseCorruptionDetected;
    this.isQuitting = config.isQuitting;
    this.setIsQuitting = config.setIsQuitting;
  }

  /**
   * Get the main window instance
   */
  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  /**
   * Load saved window state from disk.
   * Returns null if the file is missing, corrupt, or has invalid values.
   */
  private loadWindowState(): WindowState | null {
    try {
      if (!fs.existsSync(this.windowStatePath)) return null;
      const data = fs.readFileSync(this.windowStatePath, 'utf-8');
      const state = JSON.parse(data) as WindowState;

      // Validate structure
      if (
        typeof state.x !== 'number' ||
        typeof state.y !== 'number' ||
        typeof state.width !== 'number' ||
        typeof state.height !== 'number' ||
        typeof state.isMaximized !== 'boolean'
      ) {
        this.logger.warn('Window state file has invalid structure, ignoring');
        return null;
      }

      // Enforce minimum dimensions
      state.width = Math.max(state.width, MIN_WIDTH);
      state.height = Math.max(state.height, MIN_HEIGHT);

      return state;
    } catch {
      this.logger.warn('Failed to load window state, using defaults');
      return null;
    }
  }

  /**
   * Debounced save of window state to disk.
   * When maximized, persists prior normal bounds with isMaximized: true.
   */
  private saveWindowState(): void {
    if (this.saveStateTimeout) {
      clearTimeout(this.saveStateTimeout);
    }
    this.saveStateTimeout = setTimeout(() => {
      this.saveStateTimeout = null;
      this.writeWindowState();
    }, STATE_SAVE_DEBOUNCE_MS);
  }

  /**
   * Immediately write window state to disk (no debounce).
   */
  private writeWindowState(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    try {
      const isMaximized = this.mainWindow.isMaximized();
      const bounds = this.mainWindow.getNormalBounds();

      const state: WindowState = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        isMaximized,
      };

      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }
      fs.writeFileSync(this.windowStatePath, JSON.stringify(state, null, 2));
    } catch (error) {
      this.logger.error('Failed to save window state', error as Error);
    }
  }

  /**
   * Check if saved bounds overlap with any connected display by at least OVERLAP_THRESHOLD px.
   */
  private validateBoundsOnDisplay(state: WindowState): boolean {
    const displays = screen.getAllDisplays();
    for (const display of displays) {
      const wa = display.workArea;
      const overlapX =
        Math.min(state.x + state.width, wa.x + wa.width) - Math.max(state.x, wa.x);
      const overlapY =
        Math.min(state.y + state.height, wa.y + wa.height) - Math.max(state.y, wa.y);
      if (overlapX >= OVERLAP_THRESHOLD && overlapY >= OVERLAP_THRESHOLD) {
        return true;
      }
    }
    return false;
  }

  /**
   * Calculate adaptive window size based on primary display work area.
   * Targets 85% of work area, clamped to min/max bounds, centered on screen.
   */
  private calculateAdaptiveSize(): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    const { workArea } = screen.getPrimaryDisplay();

    let width = Math.round(workArea.width * TARGET_WIDTH_RATIO);
    let height = Math.round(workArea.height * TARGET_HEIGHT_RATIO);

    // Clamp to min/max
    width = Math.max(MIN_WIDTH, Math.min(width, MAX_INITIAL_WIDTH));
    height = Math.max(MIN_HEIGHT, Math.min(height, MAX_INITIAL_HEIGHT));

    // Center on work area
    const x = Math.round(workArea.x + (workArea.width - width) / 2);
    const y = Math.round(workArea.y + (workArea.height - height) / 2);

    return { x, y, width, height };
  }

  /**
   * Reset window size to adaptive defaults.
   * Deletes saved state, unmaximizes if needed, and repositions the window.
   */
  resetWindowSize(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    // Delete saved state file
    try {
      if (fs.existsSync(this.windowStatePath)) {
        fs.unlinkSync(this.windowStatePath);
      }
    } catch (error) {
      this.logger.error('Failed to delete window state file', error as Error);
    }

    // Unmaximize if maximized
    if (this.mainWindow.isMaximized()) {
      this.mainWindow.unmaximize();
    }

    // Apply adaptive size
    const bounds = this.calculateAdaptiveSize();
    this.mainWindow.setBounds(bounds);

    // Save the new state
    this.writeWindowState();

    this.logger.info(
      `Window size reset to adaptive defaults: ${bounds.width}x${bounds.height} at (${bounds.x}, ${bounds.y})`
    );
  }

  /**
   * Flush pending window state to disk immediately.
   * Call this on app quit to ensure the latest state is persisted.
   */
  flushWindowState(): void {
    if (this.saveStateTimeout) {
      clearTimeout(this.saveStateTimeout);
      this.saveStateTimeout = null;
    }
    this.writeWindowState();
  }

  /**
   * Create the main application window
   */
  createWindow(): void {
    this.logger.info('Creating main window...');

    // Determine initial bounds: try saved state, then adaptive sizing
    const savedState = this.loadWindowState();
    const useSavedState = savedState && this.validateBoundsOnDisplay(savedState);
    const bounds = useSavedState ? savedState : this.calculateAdaptiveSize();

    if (useSavedState) {
      this.logger.info(
        `Restoring window state: ${bounds.width}x${bounds.height} at (${bounds.x}, ${bounds.y})` +
          (savedState!.isMaximized ? ' [maximized]' : '')
      );
    } else {
      this.logger.info(
        `Using adaptive window size: ${bounds.width}x${bounds.height} at (${bounds.x}, ${bounds.y})`
      );
    }

    this.mainWindow = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      minWidth: MIN_WIDTH,
      minHeight: MIN_HEIGHT,
      frame: false,
      show: false, // Don't show until ready to prevent white flash
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f172a' : '#F5F7FA',
      accentColor: false, // Disable Windows accent color border on frameless window
      webPreferences: {
        preload: this.preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    // Restore maximized state after window creation
    if (useSavedState && savedState!.isMaximized) {
      this.mainWindow.maximize();
    }

    // Show window when content is ready to prevent white flash
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();
    });

    // Persist window state on resize, move, maximize, and unmaximize
    this.mainWindow.on('resize', () => this.saveWindowState());
    this.mainWindow.on('move', () => this.saveWindowState());
    this.mainWindow.on('maximize', () => this.saveWindowState());
    this.mainWindow.on('unmaximize', () => this.saveWindowState());

    // Monitor window focus and fullscreen states
    this.mainWindow.on('focus', () => {
      this.systemMonitor.setWindowFocused(true);
      this.logger.debug('Window focused');

      // Trigger sync if away for more than threshold
      if (
        this.lastFocusLostAt &&
        Date.now() - this.lastFocusLostAt > FOCUS_RESTORE_SYNC_THRESHOLD_MS
      ) {
        // Debounce: wait 500ms before syncing
        setTimeout(() => {
          this.getAutoSyncManager()?.triggerFocusRestoreSync();
        }, 500);
      }
      this.lastFocusLostAt = null;
    });

    this.mainWindow.on('blur', () => {
      this.systemMonitor.setWindowFocused(false);
      this.lastFocusLostAt = Date.now();
      this.logger.debug('Window unfocused');
    });

    this.mainWindow.on('enter-full-screen', () => {
      this.systemMonitor.setFullscreen(true);
      this.logger.debug('Entered fullscreen');
    });

    this.mainWindow.on('leave-full-screen', () => {
      this.systemMonitor.setFullscreen(false);
      this.logger.debug('Left fullscreen');
    });

    // Load renderer
    if (process.env.NODE_ENV === 'development') {
      this.logger.info('Loading development server at http://localhost:5173');
      this.mainWindow.loadURL('http://localhost:5173');
      this.mainWindow.webContents.openDevTools();
    } else {
      this.logger.info('Loading production build');
      this.mainWindow.loadFile(
        path.join(path.dirname(this.preloadPath), 'renderer/index.html')
      );
    }

    // Send recovery status once window is ready
    this.mainWindow.webContents.on('did-finish-load', () => {
      const recoveryStatus = this.crashProtectionManager.getRecoveryStatus();
      if (recoveryStatus.safeMode || recoveryStatus.lastCrash) {
        this.mainWindow?.webContents.send('app:recovery-status', recoveryStatus);
      }

      // Send database corruption notification if detected during startup
      const corruptionInfo = this.getDatabaseCorruptionDetected();
      if (corruptionInfo) {
        this.mainWindow?.webContents.send('app:database-corruption', corruptionInfo);
      }
    });

    // Handle renderer process crash
    this.mainWindow.webContents.on('render-process-gone', (_event, details) => {
      this.logger.error(
        `Renderer process crashed: reason=${details.reason}, exitCode=${details.exitCode}`
      );
      this.metricsCollector.increment('renderer.crash');

      // Write crash info for recovery
      this.crashProtectionManager.writeCrashFlag(`renderer_crash: ${details.reason}`);

      // Attempt to reload the window after a short delay
      if (details.reason !== 'killed' && details.reason !== 'clean-exit') {
        setTimeout(() => {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.logger.info('Attempting to reload renderer after crash...');
            if (process.env.NODE_ENV === 'development') {
              this.mainWindow.loadURL('http://localhost:5173');
            } else {
              this.mainWindow.loadFile(
                path.join(path.dirname(this.preloadPath), 'renderer/index.html')
              );
            }
          }
        }, 1000);
      }
    });

    // Handle renderer unresponsive
    this.mainWindow.webContents.on('unresponsive', () => {
      this.logger.warn('Renderer process is unresponsive');
      this.metricsCollector.increment('renderer.unresponsive');
    });

    // Handle renderer becomes responsive again
    this.mainWindow.webContents.on('responsive', () => {
      this.logger.info('Renderer process became responsive again');
      this.metricsCollector.increment('renderer.recovered');
    });

    this.mainWindow.on('closed', () => {
      this.logger.info('Main window closed');
      if (this.saveStateTimeout) {
        clearTimeout(this.saveStateTimeout);
        this.saveStateTimeout = null;
      }
      this.mainWindow = null;
    });

    // Handle window close with minimize-to-tray option
    this.mainWindow.on('close', (event) => {
      // If we're quitting, allow the close
      if (this.isQuitting()) {
        return;
      }

      const settings = this.getWindowBehavior();

      // If closeAction is null (not yet chosen), prompt the user via renderer UI
      if (settings.closeAction === null) {
        event.preventDefault();
        // Send event to renderer to show the close behavior dialog
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('window:promptCloseBehavior');
        }
        return;
      }

      // If minimize-to-tray is set, hide window instead of closing
      if (settings.closeAction === 'minimize-to-tray') {
        event.preventDefault();
        this.mainWindow?.hide();
        return;
      }

      // Otherwise (closeAction === 'quit'), allow the close to proceed
    });
  }

  /**
   * Create system tray icon and menu
   */
  createTray(): void {
    // Skip if tray already exists
    if (this.tray) return;

    // Create tray icon - use the app icon
    // Platform-specific icon sizes are required for proper display on each OS
    let iconPath: string;
    // Platform-specific icon sizes for optimal display:
    // - macOS: requires 16x16 template images for menu bar icons
    // - Windows: system tray works best with 32x32 icons
    // - Linux: 32x32 (universal fallback)
    if (process.platform === 'darwin') {
      iconPath = path.join(
        path.dirname(this.preloadPath),
        '../assets/app.iconset/icon_16x16.png'
      );
      // eslint-disable-next-line cross-platform/require-platform-check -- Windows requires 32x32 icons for system tray display
    } else if (process.platform === 'win32') {
      iconPath = path.join(
        path.dirname(this.preloadPath),
        '../assets/app.iconset/icon_32x32.png'
      );
    } else {
      iconPath = path.join(
        path.dirname(this.preloadPath),
        '../assets/app.iconset/icon_32x32.png'
      );
    }

    // Fallback to a simpler path structure for packaged app
    if (!fs.existsSync(iconPath)) {
      iconPath = path.join(
        process.resourcesPath || '',
        'assets/app.iconset/icon_32x32.png'
      );
    }

    // If still not found, create a default icon
    let icon: Electron.NativeImage;
    if (fs.existsSync(iconPath)) {
      icon = nativeImage.createFromPath(iconPath);
      // On macOS, set as template image for proper menu bar appearance
      if (process.platform === 'darwin') {
        icon.setTemplateImage(true);
      }
    } else {
      // Create a simple default icon (small colored square)
      this.logger.warn(`Tray icon not found at ${iconPath}, using default`);
      icon = nativeImage.createEmpty();
    }

    this.tray = new Tray(icon);
    this.tray.setToolTip('Canvas Assistant');

    // Build context menu
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show Window',
        click: () => {
          if (this.mainWindow) {
            this.mainWindow.show();
            this.mainWindow.focus();
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          this.setIsQuitting(true);
          app.quit();
        },
      },
    ]);

    this.tray.setContextMenu(contextMenu);

    // Click behavior - show window on single click (Windows/Linux)
    // On macOS, the menu is shown on click by default
    if (process.platform !== 'darwin') {
      this.tray.on('click', () => {
        if (this.mainWindow) {
          if (this.mainWindow.isVisible()) {
            this.mainWindow.focus();
          } else {
            this.mainWindow.show();
            this.mainWindow.focus();
          }
        }
      });
    }

    // Double-click shows window (Windows only)
    if (process.platform === 'win32') {
      this.tray.on('double-click', () => {
        if (this.mainWindow) {
          this.mainWindow.show();
          this.mainWindow.focus();
        }
      });
    }

    this.logger.info('System tray created');
  }

  /**
   * Destroy system tray
   */
  destroyTray(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
      this.logger.info('System tray destroyed');
    }
  }

  /**
   * Handle second instance launch (focus existing window)
   */
  handleSecondInstance(): void {
    if (this.mainWindow) {
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
      }
      if (!this.mainWindow.isVisible()) {
        this.mainWindow.show();
      }
      this.mainWindow.focus();
      this.logger.info('Focused existing window from second instance launch attempt');
    }
  }
}
