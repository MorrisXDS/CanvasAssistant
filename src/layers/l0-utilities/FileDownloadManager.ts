/**
 * FileDownloadManager - Handles downloading and storing files locally
 *
 * Features:
 * - Downloads files from Canvas to local storage
 * - Organizes files by course code
 * - Tracks download progress and status
 * - Supports concurrent downloads with limits
 * - Resume support for interrupted downloads
 */

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { Logger } from './Logger';
import { sanitizeCourseCode, sanitizeFolderPath } from './PathBuilder';
import { ensureDirectory as ensureDirectoryBase } from './DefaultPaths';

export interface FileDownloadManagerConfig {
  /** Base directory for file storage */
  baseDir: string;
  /** Maximum concurrent downloads */
  maxConcurrent?: number;
  /** Logger instance */
  logger?: Logger;
}

export interface DownloadRequest {
  /** Unique identifier for tracking */
  id: string;
  /** URL to download from */
  url: string;
  /** Course code for folder organization */
  courseCode: string;
  /** Target filename */
  filename: string;
  /** Expected file size in bytes (optional) */
  expectedSize?: number;
  /** Authorization token for Canvas API */
  authToken?: string;
  /** Context folder for organizing files by source (e.g., 'Home_Page', 'Modules/Week_1', 'Assignments', 'Syllabus') */
  contextFolder?: string;
  /** Original folder path from Canvas (used for files from /files endpoint) */
  folderPath?: string;
  /**
   * Parent HTML file path (for HTML dependency downloads).
   * When set, file will be downloaded to {parentHtmlBaseName}_files/ folder.
   * E.g., parentHtml="CSC108/Assignment1.html" -> "CSC108/Assignment1_files/filename.ext"
   */
  parentHtml?: string;
}

export interface DownloadResult {
  id: string;
  success: boolean;
  localPath?: string;
  error?: string;
  bytesDownloaded: number;
  duration: number;
}

export interface DownloadProgress {
  id: string;
  bytesDownloaded: number;
  totalBytes: number | null;
  percent: number | null;
}

/**
 * Manages file downloads with queue and progress tracking
 */
export class FileDownloadManager extends EventEmitter {
  private baseDir: string;
  private maxConcurrent: number;
  private logger?: Logger;
  private activeDownloads: Map<string, AbortController> = new Map();
  private queue: DownloadRequest[] = [];
  private processingPromise: Promise<void> | null = null;
  private baseDirEnsured: boolean = false;

  constructor(config: FileDownloadManagerConfig) {
    super();
    this.baseDir = config.baseDir;
    this.maxConcurrent = config.maxConcurrent ?? 2;
    this.logger = config.logger;
    this.ensureBaseDirExists();
  }

  /**
   * Update the base directory for file storage
   * Used when user changes download location in settings
   */
  updateBaseDir(newBaseDir: string): void {
    this.baseDir = newBaseDir;
    this.baseDirEnsured = false;
    this.ensureBaseDirExists();
    this.logger?.info(`Updated download base directory to: ${newBaseDir}`);
  }

  /**
   * Get the current base directory
   */
  getBaseDir(): string {
    return this.baseDir;
  }

  /**
   * Ensure a directory exists, creating it if necessary.
   * Wraps the shared ensureDirectory with permission-error guidance.
   */
  private ensureDirectory(dirPath: string): void {
    try {
      ensureDirectoryBase(dirPath);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isPermissionError =
        errorMessage.includes('EPERM') ||
        errorMessage.includes('EACCES') ||
        errorMessage.includes('operation not permitted') ||
        errorMessage.includes('permission denied');

      if (isPermissionError) {
        throw new Error(
          `Permission denied creating directory: ${dirPath}. Please run the application as Administrator (Windows) or with sudo (Mac/Linux).`
        );
      }
      throw error;
    }
  }

  /**
   * Get the local path for a course's files
   */
  getCourseFilesPath(courseCode: string): string {
    // Use centralized sanitization from PathBuilder
    const sanitized = sanitizeCourseCode(courseCode);
    return path.join(this.baseDir, sanitized);
  }

  /**
   * Get the full directory path for a download request
   * Handles context folders, folder paths, and parentHtml (for HTML dependencies)
   *
   * Structure: {baseDir}/{courseCode}/{contextFolder|folderPath}/{filename}
   *
   * Examples:
   * - Files tab: TEP327/Lectures/slides.pdf
   * - Home page: TEP327/Home_Page/intro.pdf
   * - Syllabus: TEP327/Syllabus/outline.pdf
   * - Module: TEP327/Modules/Week_1/homework.pdf
   * - Assignment: TEP327/Assignments/Project_1/rubric.pdf
   * - HTML dependency: TEP327/Assignment1_files/image.png (when parentHtml="TEP327/Assignment1.html")
   */
  getDownloadDirectory(request: DownloadRequest): string {
    // Special case: downloading as a dependency of an HTML file
    if (request.parentHtml) {
      return this.getHtmlFilesFolderPath(request.parentHtml);
    }

    const courseDir = this.getCourseFilesPath(request.courseCode);

    // Determine subfolder: contextFolder takes priority, then folderPath
    // Use centralized sanitization from PathBuilder
    if (request.contextFolder) {
      // Normalize backslashes to forward slashes before sanitizing
      // eslint-disable-next-line cross-platform/no-hardcoded-path-separator -- Intentional: normalizing any incoming separator to POSIX before sanitization
      const normalized = request.contextFolder.replace(/\\/g, '/');
      const subfolder = sanitizeFolderPath(normalized);
      return path.join(courseDir, subfolder);
    } else if (request.folderPath) {
      // Normalize backslashes to forward slashes before sanitizing
      // eslint-disable-next-line cross-platform/no-hardcoded-path-separator -- Intentional: normalizing any incoming separator to POSIX before sanitization
      const normalized = request.folderPath.replace(/\\/g, '/');
      const subfolder = sanitizeFolderPath(normalized);
      return path.join(courseDir, subfolder);
    }

    return courseDir;
  }

  /**
   * Get the _files folder path for an HTML file
   * E.g., "CSC108/Assignment1.html" -> "CSC108/Assignment1_files"
   *
   * Used for HTML dependency downloads following the convention:
   * - Assignment1.html has dependencies in Assignment1_files/
   * - instructions.html (nested) has dependencies in instructions_files/
   */
  getHtmlFilesFolderPath(htmlPath: string): string {
    const parsed = path.parse(htmlPath);
    const filesFolder = `${parsed.name}_files`;
    return path.join(parsed.dir, filesFolder);
  }

  /**
   * Queue a file for download.
   * Skips if the same download ID is already active or queued (deduplication).
   */
  queueDownload(request: DownloadRequest): void {
    // Deduplicate: skip if already downloading or already in queue
    if (this.activeDownloads.has(request.id)) {
      this.logger?.debug(`Skipping duplicate download (active): ${request.id}`);
      return;
    }
    if (this.queue.some((r) => r.id === request.id)) {
      this.logger?.debug(`Skipping duplicate download (queued): ${request.id}`);
      return;
    }

    this.ensureBaseDirExists();
    this.queue.push(request);
    this.logger?.debug(
      `Queued download: ${request.filename} for course ${request.courseCode}`
    );
    this.processQueue();
  }

  /**
   * Queue multiple files for download.
   * Deduplicates: skips requests whose ID is already active or queued.
   */
  queueDownloads(requests: DownloadRequest[]): void {
    this.ensureBaseDirExists();
    const deduplicated = requests.filter((r) => {
      if (this.activeDownloads.has(r.id) || this.queue.some((q) => q.id === r.id)) {
        this.logger?.debug(`Skipping duplicate download: ${r.id}`);
        return false;
      }
      return true;
    });
    this.queue.push(...deduplicated);
    this.logger?.debug(`Queued ${deduplicated.length}/${requests.length} downloads`);
    this.processQueue();
  }

  /**
   * Ensure base directory exists (lazy — only on first download)
   */
  private ensureBaseDirExists(): void {
    if (this.baseDirEnsured) return;
    this.ensureDirectory(this.baseDir);
    this.baseDirEnsured = true;
  }

  /**
   * Process the download queue
   * Uses promise-based lock to prevent race condition where multiple
   * processQueue calls could start before the first sets the processing flag.
   */
  private processQueue(): void {
    // If already processing, don't start another loop
    if (this.processingPromise) return;

    this.processingPromise = this.processQueueInternal().finally(() => {
      this.processingPromise = null;
    });
  }

  /**
   * Internal queue processing - called by processQueue wrapper
   */
  private async processQueueInternal(): Promise<void> {
    while (this.queue.length > 0 && this.activeDownloads.size < this.maxConcurrent) {
      const request = this.queue.shift();
      if (request) {
        this.startDownload(request);
      }
    }
  }

  /**
   * Start downloading a file
   */
  private async startDownload(request: DownloadRequest): Promise<void> {
    const controller = new AbortController();
    this.activeDownloads.set(request.id, controller);

    const startTime = Date.now();
    let bytesDownloaded = 0;

    try {
      // Get target directory (handles context folders and folder paths)
      const targetDir = this.getDownloadDirectory(request);
      this.ensureDirectory(targetDir);

      // Generate unique filename to avoid collisions
      const localPath = this.getUniqueFilePath(targetDir, request.filename);

      this.logger?.info(`Starting download: ${request.filename} -> ${localPath}`);
      this.emit('download-start', { id: request.id, filename: request.filename });

      // Download the file
      bytesDownloaded = await this.downloadFile(
        request.url,
        localPath,
        request.authToken,
        (progress) => {
          this.emit('download-progress', {
            id: request.id,
            bytesDownloaded: progress.bytesDownloaded,
            totalBytes: progress.totalBytes,
            percent: progress.totalBytes
              ? Math.round((progress.bytesDownloaded / progress.totalBytes) * 100)
              : null,
          } as DownloadProgress);
        },
        controller.signal
      );

      const result: DownloadResult = {
        id: request.id,
        success: true,
        localPath,
        bytesDownloaded,
        duration: Date.now() - startTime,
      };

      this.logger?.info(
        `Download complete: ${request.filename} (${bytesDownloaded} bytes)`
      );
      this.emit('download-complete', result);
    } catch (error) {
      let errorMessage = error instanceof Error ? error.message : String(error);

      // Detect permission errors and provide helpful guidance
      const isPermissionError =
        errorMessage.includes('EPERM') ||
        errorMessage.includes('EACCES') ||
        errorMessage.includes('operation not permitted') ||
        errorMessage.includes('permission denied');

      if (isPermissionError) {
        errorMessage = `Permission denied. Please run the application as Administrator (Windows) or with sudo (Mac/Linux). Original error: ${errorMessage}`;
      }

      const result: DownloadResult = {
        id: request.id,
        success: false,
        error: errorMessage,
        bytesDownloaded,
        duration: Date.now() - startTime,
      };

      this.logger?.error(`Download failed: ${request.filename} - ${errorMessage}`);
      this.emit('download-error', result);
    } finally {
      this.activeDownloads.delete(request.id);
      this.processQueue();
    }
  }

  /**
   * Download a file from URL to local path
   */
  private downloadFile(
    url: string,
    localPath: string,
    authToken?: string,
    onProgress?: (progress: {
      bytesDownloaded: number;
      totalBytes: number | null;
    }) => void,
    signal?: AbortSignal
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;

      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const request = protocol.get(url, { headers, signal }, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            this.downloadFile(redirectUrl, localPath, authToken, onProgress, signal)
              .then(resolve)
              .catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        const totalBytes = response.headers['content-length']
          ? parseInt(response.headers['content-length'], 10)
          : null;

        const fileStream = fs.createWriteStream(localPath);
        let bytesDownloaded = 0;

        response.on('data', (chunk: Buffer) => {
          bytesDownloaded += chunk.length;
          onProgress?.({ bytesDownloaded, totalBytes });
        });

        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve(bytesDownloaded);
        });

        fileStream.on('error', (error) => {
          fs.unlink(localPath, () => {}); // Clean up partial file
          reject(error);
        });
      });

      request.on('error', (error) => {
        reject(error);
      });

      // Handle abort
      signal?.addEventListener('abort', () => {
        request.destroy();
        fs.unlink(localPath, () => {}); // Clean up partial file
        reject(new Error('Download cancelled'));
      });
    });
  }

  /**
   * Get a unique file path, adding suffix if file exists
   */
  private getUniqueFilePath(dir: string, filename: string): string {
    let filePath = path.join(dir, filename);

    if (!fs.existsSync(filePath)) {
      return filePath;
    }

    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    let counter = 1;

    while (fs.existsSync(filePath)) {
      filePath = path.join(dir, `${base}_${counter}${ext}`);
      counter++;
    }

    return filePath;
  }

  /**
   * Cancel a specific download
   */
  cancelDownload(id: string): boolean {
    const controller = this.activeDownloads.get(id);
    if (controller) {
      controller.abort();
      return true;
    }

    // Also remove from queue if not started
    const queueIndex = this.queue.findIndex((r) => r.id === id);
    if (queueIndex !== -1) {
      this.queue.splice(queueIndex, 1);
      return true;
    }

    return false;
  }

  /**
   * Stop the download manager: cancel all active/queued downloads.
   */
  stop(): void {
    this.cancelAll();
    this.logger?.info('FileDownloadManager stopped');
  }

  /**
   * Cancel all downloads
   */
  cancelAll(): void {
    // Cancel active downloads
    for (const [id, controller] of this.activeDownloads) {
      controller.abort();
      this.logger?.debug(`Cancelled download: ${id}`);
    }
    this.activeDownloads.clear();

    // Clear queue
    this.queue = [];
  }

  /**
   * Get current queue length
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Get number of active downloads
   */
  getActiveCount(): number {
    return this.activeDownloads.size;
  }

  /**
   * Check if a file exists locally
   */
  fileExists(courseCode: string, filename: string): boolean {
    const courseDir = this.getCourseFilesPath(courseCode);
    const filePath = path.join(courseDir, filename);
    return fs.existsSync(filePath);
  }

  /**
   * Get the full local path for a file
   */
  getLocalPath(courseCode: string, filename: string): string {
    const courseDir = this.getCourseFilesPath(courseCode);
    return path.join(courseDir, filename);
  }

  /**
   * Delete a local file
   */
  deleteFile(courseCode: string, filename: string): boolean {
    const filePath = this.getLocalPath(courseCode, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  }

  /**
   * Get total size of files for a course
   */
  getCourseFilesSize(courseCode: string): number {
    const courseDir = this.getCourseFilesPath(courseCode);
    if (!fs.existsSync(courseDir)) {
      return 0;
    }

    let totalSize = 0;
    const files = fs.readdirSync(courseDir);
    for (const file of files) {
      const filePath = path.join(courseDir, file);
      const stats = fs.statSync(filePath);
      if (stats.isFile()) {
        totalSize += stats.size;
      }
    }
    return totalSize;
  }

  /**
   * Get pending downloads for persistence
   * Returns the current queue as serializable objects
   * Used during app shutdown to save queue state
   */
  getPendingDownloads(): DownloadRequest[] {
    return [...this.queue];
  }

  /**
   * Get active downloads that should be requeued
   * Returns currently downloading items (will be requeued as pending on restart)
   */
  getActiveDownloadRequests(): string[] {
    return Array.from(this.activeDownloads.keys());
  }

  /**
   * Restore pending downloads from persisted state
   * Used during app startup to restore queue from previous session
   * @param requests Array of download requests to restore
   */
  restoreDownloads(requests: DownloadRequest[]): void {
    if (requests.length === 0) return;

    this.logger?.info(
      `Restoring ${requests.length} pending downloads from previous session`
    );

    // Add to queue (don't use queueDownloads to avoid duplicate processing)
    this.queue.push(...requests);

    // Start processing
    this.processQueue();
  }
}

export default FileDownloadManager;
