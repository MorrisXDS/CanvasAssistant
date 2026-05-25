/**
 * FileWatcher - Monitors downloaded files for external changes
 *
 * Uses chokidar to watch the downloads directory for file deletions,
 * moves, and modifications. When changes are detected, it updates
 * the database to reflect the new file state.
 */

import { EventEmitter } from 'events';
import { FSWatcher, watch } from 'chokidar';
import path from 'path';
import { Logger } from './Logger';

export interface FileWatcherConfig {
  /** Base directory to watch */
  baseDir: string;
  /** Logger instance */
  logger?: Logger;
  /** Whether to start watching immediately */
  autoStart?: boolean;
  /** Debounce time for file changes (ms) */
  debounceMs?: number;
}

export interface FileChangeEvent {
  type: 'unlink' | 'add' | 'change';
  path: string;
  relativePath: string;
}

/**
 * Watches the downloads directory for external changes
 */
export class FileWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private baseDir: string;
  private logger?: Logger;
  private debounceMs: number;
  private isPaused: boolean = false;
  private pendingChanges: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: FileWatcherConfig) {
    super();
    this.baseDir = config.baseDir;
    this.logger = config.logger;
    this.debounceMs = config.debounceMs ?? 500;

    if (config.autoStart !== false) {
      this.start();
    }
  }

  /**
   * Start watching the directory
   */
  start(): void {
    if (this.watcher) {
      this.logger?.debug('[FileWatcher] Already watching, skipping start');
      return;
    }

    this.logger?.info(`[FileWatcher] Starting to watch: ${this.baseDir}`);

    this.watcher = watch(this.baseDir, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: this.debounceMs,
        pollInterval: 100,
      },
      usePolling: false,
      // Ignore permission errors (common on Windows with locked files)
      ignorePermissionErrors: true,
      // Ignore hidden files and temp files
      ignored: [
        /(^|[/\\])\../, // dotfiles
        /\.tmp$/,
        /\.part$/,
        /\.crdownload$/,
      ],
    });

    this.watcher.on('unlink', (filePath) => {
      if (this.isPaused) return;
      this.handleChange('unlink', filePath);
    });

    this.watcher.on('add', (filePath) => {
      if (this.isPaused) return;
      this.handleChange('add', filePath);
    });

    this.watcher.on('change', (filePath) => {
      if (this.isPaused) return;
      this.handleChange('change', filePath);
    });

    this.watcher.on('error', (error) => {
      this.logger?.error(`[FileWatcher] Error: ${error}`);
      this.emit('error', error);
    });

    this.watcher.on('ready', () => {
      this.logger?.info('[FileWatcher] Initial scan complete, ready for changes');
      this.emit('ready');
    });
  }

  /**
   * Handle a file change event with debouncing
   */
  private handleChange(type: 'unlink' | 'add' | 'change', filePath: string): void {
    // Clear any pending debounce for this file
    const existing = this.pendingChanges.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }

    // Debounce the change
    const timeout = setTimeout(() => {
      this.pendingChanges.delete(filePath);
      this.emitChange(type, filePath);
    }, this.debounceMs);

    this.pendingChanges.set(filePath, timeout);
  }

  /**
   * Emit the file change event
   */
  private emitChange(type: 'unlink' | 'add' | 'change', filePath: string): void {
    const relativePath = path.relative(this.baseDir, filePath);

    this.logger?.debug(`[FileWatcher] ${type}: ${relativePath}`);

    const event: FileChangeEvent = {
      type,
      path: filePath,
      relativePath,
    };

    this.emit('file-change', event);

    // Emit specific events for different change types
    if (type === 'unlink') {
      this.emit('file-deleted', event);
    } else if (type === 'add') {
      this.emit('file-added', event);
    } else if (type === 'change') {
      this.emit('file-modified', event);
    }
  }

  /**
   * Stop watching the directory
   */
  stop(): void {
    if (this.watcher) {
      this.logger?.info('[FileWatcher] Stopping');
      this.watcher.close();
      this.watcher = null;
    }

    // Clear any pending changes
    for (const timeout of this.pendingChanges.values()) {
      clearTimeout(timeout);
    }
    this.pendingChanges.clear();
  }

  /**
   * Pause watching (during system suspend)
   */
  pause(): void {
    this.isPaused = true;
    this.logger?.debug('[FileWatcher] Paused');
  }

  /**
   * Resume watching (after system resume)
   */
  resume(): void {
    this.isPaused = false;
    this.logger?.debug('[FileWatcher] Resumed');
  }

  /**
   * Check if currently watching
   */
  isWatching(): boolean {
    return this.watcher !== null && !this.isPaused;
  }

  /**
   * Update the base directory being watched
   */
  updateBaseDir(newBaseDir: string): void {
    const wasWatching = this.watcher !== null;
    this.stop();
    this.baseDir = newBaseDir;
    if (wasWatching) {
      this.start();
    }
  }

  /**
   * Get the current base directory
   */
  getBaseDir(): string {
    return this.baseDir;
  }

  /**
   * Perform a full scan to detect changes that occurred while paused
   * This should be called after system resume
   */
  async scanForChanges(): Promise<void> {
    this.logger?.info('[FileWatcher] Performing full scan for changes');
    this.emit('scan-requested');
  }
}

export default FileWatcher;
