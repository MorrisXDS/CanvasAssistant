/**
 * Window Manager
 * Handles BrowserWindow and system tray management
 */

import { app, BrowserWindow, Menu, nativeImage, nativeTheme, Tray } from 'electron';
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
  getAutoSyncManager: () => AutoSyncManager | null;
  getWindowBehavior: () => WindowBehaviorSettings;
  getDatabaseCorruptionDetected: () => { errors: string[]; canContinue: boolean } | null;
  isQuitting: () => boolean;
  setIsQuitting: (value: boolean) => void;
}

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

  constructor(config: WindowManagerConfig) {
    this.logger = config.logger;
    this.metricsCollector = config.metricsCollector;
    this.systemMonitor = config.systemMonitor;
    this.crashProtectionManager = config.crashProtectionManager;
    this.preloadPath = config.preloadPath;
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
   * Create the main application window
   */
  createWindow(): void {
    this.logger.info('Creating main window...');

    this.mainWindow = new BrowserWindow({
      width: 1382,
      height: 864,
      minWidth: 1080,
      minHeight: 720,
      frame: false,
      thickFrame: false, // Remove Windows window shadow/border completely
      show: false, // Don't show until ready to prevent white flash
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f172a' : '#F5F7FA',
      accentColor: false, // Disable Windows accent color border on frameless window
      webPreferences: {
        preload: this.preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    // Show window when content is ready to prevent white flash
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();
    });

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
            this.mainWindow.loadURL(
              process.env.NODE_ENV === 'development'
                ? 'http://localhost:5173'
                : `file://${path.join(path.dirname(this.preloadPath), 'renderer/index.html')}`
            );
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
    // - Linux: use 22x22 or 24x24, falling back to 32x32
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

    // Double-click shows window (Windows)
    this.tray.on('double-click', () => {
      if (this.mainWindow) {
        this.mainWindow.show();
        this.mainWindow.focus();
      }
    });

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
      this.mainWindow.focus();
      this.logger.info('Focused existing window from second instance launch attempt');
    }
  }
}
