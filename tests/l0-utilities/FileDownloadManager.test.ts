/**
 * Tests for FileDownloadManager
 */

import os from 'os';
import fs from 'fs';
import path from 'path';
import {
  FileDownloadManager,
  DownloadRequest,
} from '../../src/layers/l0-utilities/FileDownloadManager';

describe('FileDownloadManager', () => {
  let tmpDir: string;
  let manager: FileDownloadManager;

  beforeEach(() => {
    // Create a temporary directory for each test
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fdm-test-'));
    manager = new FileDownloadManager({ baseDir: tmpDir });
  });

  afterEach(() => {
    // Clean up
    if (manager) {
      manager.stop();
    }
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    it('creates base directory', () => {
      const testDir = path.join(os.tmpdir(), 'fdm-constructor-test');

      // Ensure directory doesn't exist
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }

      const testManager = new FileDownloadManager({ baseDir: testDir });

      expect(fs.existsSync(testDir)).toBe(true);
      expect(fs.statSync(testDir).isDirectory()).toBe(true);

      // Cleanup
      testManager.stop();
      fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('accepts maxConcurrent parameter', () => {
      const testManager = new FileDownloadManager({
        baseDir: tmpDir,
        maxConcurrent: 5,
      });

      expect(testManager).toBeDefined();
      testManager.stop();
    });
  });

  describe('getCourseFilesPath', () => {
    it('returns correct path with sanitized course code', () => {
      const result = manager.getCourseFilesPath('CSC108');
      expect(result).toBe(path.join(tmpDir, 'CSC108'));
    });

    it('sanitizes course code with special characters', () => {
      const result = manager.getCourseFilesPath('CSC 108: Intro');
      // Course codes are sanitized by sanitizeCourseCode
      expect(result).toContain(tmpDir);
      // Check that the course-code portion (after base dir) has no colons
      const courseCodePortion = result.slice(tmpDir.length);
      expect(courseCodePortion).not.toContain(':');
    });

    it('handles empty course code', () => {
      const result = manager.getCourseFilesPath('');
      expect(result).toContain(tmpDir);
    });
  });

  describe('getDownloadDirectory', () => {
    it('returns course directory for basic request', () => {
      const request: DownloadRequest = {
        id: '1',
        url: 'https://example.com/file.pdf',
        courseCode: 'CSC108',
        filename: 'file.pdf',
      };

      const result = manager.getDownloadDirectory(request);
      expect(result).toBe(path.join(tmpDir, 'CSC108'));
    });

    it('returns nested path with contextFolder', () => {
      const request: DownloadRequest = {
        id: '2',
        url: 'https://example.com/file.pdf',
        courseCode: 'CSC108',
        filename: 'file.pdf',
        contextFolder: 'Assignments/Project_1',
      };

      const result = manager.getDownloadDirectory(request);
      expect(result).toBe(path.join(tmpDir, 'CSC108', 'Assignments', 'Project_1'));
    });

    it('returns nested path with folderPath', () => {
      const request: DownloadRequest = {
        id: '3',
        url: 'https://example.com/file.pdf',
        courseCode: 'TEP327',
        filename: 'file.pdf',
        folderPath: 'Lectures/Week 1',
      };

      const result = manager.getDownloadDirectory(request);
      expect(result).toContain('TEP327');
      expect(result).toContain('Lectures');
    });

    it('prioritizes contextFolder over folderPath', () => {
      const request: DownloadRequest = {
        id: '4',
        url: 'https://example.com/file.pdf',
        courseCode: 'CSC108',
        filename: 'file.pdf',
        contextFolder: 'Assignments',
        folderPath: 'Lectures',
      };

      const result = manager.getDownloadDirectory(request);
      expect(result).toContain('Assignments');
      expect(result).not.toContain('Lectures');
    });

    it('returns _files folder with parentHtml', () => {
      const request: DownloadRequest = {
        id: '5',
        url: 'https://example.com/image.png',
        courseCode: 'CSC108',
        filename: 'image.png',
        parentHtml: path.join('CSC108', 'Assignment1.html'),
      };

      const result = manager.getDownloadDirectory(request);
      expect(result).toBe(path.join('CSC108', 'Assignment1_files'));
    });

    it('handles backslashes in contextFolder', () => {
      const request: DownloadRequest = {
        id: '6',
        url: 'https://example.com/file.pdf',
        courseCode: 'CSC108',
        filename: 'file.pdf',
        contextFolder: 'Modules\\Week_1',
      };

      const result = manager.getDownloadDirectory(request);
      // Backslashes should be normalized
      expect(result).toContain('Modules');
      expect(result).toContain('Week_1');
    });
  });

  describe('getHtmlFilesFolderPath', () => {
    it('returns correct _files suffix for simple path', () => {
      const htmlPath = path.join('CSC108', 'Assignment1.html');
      const result = manager.getHtmlFilesFolderPath(htmlPath);

      expect(result).toBe(path.join('CSC108', 'Assignment1_files'));
    });

    it('returns correct _files suffix for nested path', () => {
      const htmlPath = path.join('CSC108', 'Assignments', 'instructions.html');
      const result = manager.getHtmlFilesFolderPath(htmlPath);

      expect(result).toBe(path.join('CSC108', 'Assignments', 'instructions_files'));
    });

    it('handles path without extension', () => {
      const htmlPath = path.join('CSC108', 'document');
      const result = manager.getHtmlFilesFolderPath(htmlPath);

      expect(result).toBe(path.join('CSC108', 'document_files'));
    });
  });

  describe('queue management', () => {
    it('starts with queue length of 0', () => {
      expect(manager.getQueueLength()).toBe(0);
    });

    it('starts with active count of 0', () => {
      expect(manager.getActiveCount()).toBe(0);
    });

    it('cancelAll clears queue and active downloads', () => {
      // Queue more items than maxConcurrent (default 2) so some stay in queue
      const requests: DownloadRequest[] = Array.from({ length: 5 }, (_, i) => ({
        id: `cancel-${i}`,
        url: 'https://example.com/file.pdf',
        courseCode: 'CSC108',
        filename: `file${i}.pdf`,
      }));

      manager.queueDownloads(requests);

      // Some items are active, some in queue
      const totalBefore = manager.getQueueLength() + manager.getActiveCount();
      expect(totalBefore).toBeGreaterThan(0);

      manager.cancelAll();

      expect(manager.getQueueLength()).toBe(0);
      expect(manager.getActiveCount()).toBe(0);
    });

    it('stop clears queue and active downloads', () => {
      const requests: DownloadRequest[] = Array.from({ length: 5 }, (_, i) => ({
        id: `stop-${i}`,
        url: 'https://example.com/file.pdf',
        courseCode: 'CSC108',
        filename: `file${i}.pdf`,
      }));

      manager.queueDownloads(requests);

      manager.stop();

      expect(manager.getQueueLength()).toBe(0);
      expect(manager.getActiveCount()).toBe(0);
    });

    it('getPendingDownloads returns items still in queue', () => {
      // Queue more than maxConcurrent so some stay pending
      const requests: DownloadRequest[] = Array.from({ length: 5 }, (_, i) => ({
        id: `pending-${i}`,
        url: 'https://example.com/file.pdf',
        courseCode: 'CSC108',
        filename: `file${i}.pdf`,
      }));

      manager.queueDownloads(requests);
      const pending = manager.getPendingDownloads();

      // With maxConcurrent=2, first 2 move to active, 3 stay in queue
      expect(pending).toHaveLength(3);

      // Verify it's a copy by modifying it
      pending.pop();
      expect(manager.getQueueLength()).toBe(3); // Original queue unchanged
    });

    it('restoreDownloads adds items (some become active)', () => {
      const requests: DownloadRequest[] = Array.from({ length: 5 }, (_, i) => ({
        id: `restore-${i}`,
        url: 'https://example.com/file.pdf',
        courseCode: 'CSC108',
        filename: `file${i}.pdf`,
      }));

      manager.restoreDownloads(requests);

      // Total items = active + queued should equal original count
      const total = manager.getQueueLength() + manager.getActiveCount();
      expect(total).toBe(5);
    });

    it('restoreDownloads handles empty array', () => {
      manager.restoreDownloads([]);
      expect(manager.getQueueLength()).toBe(0);
    });

    it('queueDownload processes items immediately when under maxConcurrent', () => {
      const request: DownloadRequest = {
        id: 'immediate-1',
        url: 'https://example.com/file.pdf',
        courseCode: 'CSC108',
        filename: 'file.pdf',
      };

      manager.queueDownload(request);
      // With maxConcurrent=2, single item moves to active immediately
      expect(manager.getActiveCount()).toBe(1);
      expect(manager.getQueueLength()).toBe(0);
    });

    it('cancelDownload removes from queue or cancels active', () => {
      // Queue enough items that some stay in queue
      const requests: DownloadRequest[] = Array.from({ length: 5 }, (_, i) => ({
        id: `cd-${i}`,
        url: 'https://example.com/file.pdf',
        courseCode: 'CSC108',
        filename: `file${i}.pdf`,
      }));
      manager.queueDownloads(requests);

      // cd-0 and cd-1 are active, cd-2/3/4 are in queue
      expect(manager.getQueueLength()).toBe(3);

      // Cancel from queue
      const cancelled = manager.cancelDownload('cd-3');
      expect(cancelled).toBe(true);
      expect(manager.getQueueLength()).toBe(2);
    });

    it('cancelDownload can cancel active download', () => {
      const request: DownloadRequest = {
        id: 'test-cancel-active',
        url: 'https://example.com/file.pdf',
        courseCode: 'CSC108',
        filename: 'file.pdf',
      };

      manager.queueDownload(request);
      // Item moves to active immediately
      expect(manager.getActiveCount()).toBe(1);

      const cancelled = manager.cancelDownload('test-cancel-active');
      expect(cancelled).toBe(true);
    });

    it('cancelDownload returns false for non-existent download', () => {
      const cancelled = manager.cancelDownload('non-existent');
      expect(cancelled).toBe(false);
    });
  });

  describe('file operations', () => {
    it('fileExists returns false for non-existent file', () => {
      const exists = manager.fileExists('CSC108', 'nonexistent.pdf');
      expect(exists).toBe(false);
    });

    it('fileExists returns true for existing file', () => {
      // Create a test file
      const courseDir = path.join(tmpDir, 'CSC108');
      fs.mkdirSync(courseDir, { recursive: true });
      const testFile = path.join(courseDir, 'test.pdf');
      fs.writeFileSync(testFile, 'test content');

      const exists = manager.fileExists('CSC108', 'test.pdf');
      expect(exists).toBe(true);
    });

    it('deleteFile returns false for non-existent file', () => {
      const deleted = manager.deleteFile('CSC108', 'nonexistent.pdf');
      expect(deleted).toBe(false);
    });

    it('deleteFile removes existing file', () => {
      // Create a test file
      const courseDir = path.join(tmpDir, 'CSC108');
      fs.mkdirSync(courseDir, { recursive: true });
      const testFile = path.join(courseDir, 'test.pdf');
      fs.writeFileSync(testFile, 'test content');

      expect(fs.existsSync(testFile)).toBe(true);

      const deleted = manager.deleteFile('CSC108', 'test.pdf');
      expect(deleted).toBe(true);
      expect(fs.existsSync(testFile)).toBe(false);
    });

    it('getLocalPath returns correct path', () => {
      const localPath = manager.getLocalPath('CSC108', 'test.pdf');
      expect(localPath).toBe(path.join(tmpDir, 'CSC108', 'test.pdf'));
    });

    it('getCourseFilesSize returns 0 for non-existent course directory', () => {
      const size = manager.getCourseFilesSize('NONEXISTENT');
      expect(size).toBe(0);
    });

    it('getCourseFilesSize returns correct size for course with files', () => {
      // Create test files
      const courseDir = path.join(tmpDir, 'CSC108');
      fs.mkdirSync(courseDir, { recursive: true });

      fs.writeFileSync(path.join(courseDir, 'file1.pdf'), 'a'.repeat(100));
      fs.writeFileSync(path.join(courseDir, 'file2.pdf'), 'b'.repeat(200));

      const size = manager.getCourseFilesSize('CSC108');
      expect(size).toBe(300);
    });

    it('getCourseFilesSize ignores subdirectories', () => {
      // Create test structure
      const courseDir = path.join(tmpDir, 'CSC108');
      fs.mkdirSync(courseDir, { recursive: true });

      fs.writeFileSync(path.join(courseDir, 'file1.pdf'), 'a'.repeat(100));

      const subDir = path.join(courseDir, 'subdir');
      fs.mkdirSync(subDir);
      fs.writeFileSync(path.join(subDir, 'file2.pdf'), 'b'.repeat(200));

      const size = manager.getCourseFilesSize('CSC108');
      // Should only count file1.pdf in root, not file2.pdf in subdirectory
      expect(size).toBe(100);
    });
  });

  describe('base directory management', () => {
    it('updateBaseDir updates the base directory', () => {
      const newDir = path.join(os.tmpdir(), 'fdm-new-base');

      // Clean up if exists
      if (fs.existsSync(newDir)) {
        fs.rmSync(newDir, { recursive: true, force: true });
      }

      manager.updateBaseDir(newDir);

      expect(manager.getBaseDir()).toBe(newDir);
      expect(fs.existsSync(newDir)).toBe(true);

      // Cleanup
      fs.rmSync(newDir, { recursive: true, force: true });
    });

    it('updateBaseDir creates new directory if it does not exist', () => {
      const newDir = path.join(os.tmpdir(), 'fdm-new-base-2');

      // Ensure it doesn't exist
      if (fs.existsSync(newDir)) {
        fs.rmSync(newDir, { recursive: true, force: true });
      }

      expect(fs.existsSync(newDir)).toBe(false);

      manager.updateBaseDir(newDir);

      expect(fs.existsSync(newDir)).toBe(true);

      // Cleanup
      fs.rmSync(newDir, { recursive: true, force: true });
    });

    it('getBaseDir returns current base directory', () => {
      expect(manager.getBaseDir()).toBe(tmpDir);
    });
  });

  describe('event emitter', () => {
    it('extends EventEmitter', () => {
      expect(manager.on).toBeDefined();
      expect(manager.emit).toBeDefined();
      expect(manager.removeListener).toBeDefined();
    });

    it('can register event listeners', () => {
      const listener = jest.fn();
      manager.on('test-event', listener);
      manager.emit('test-event', { data: 'test' });

      expect(listener).toHaveBeenCalledWith({ data: 'test' });
    });
  });

  describe('getActiveDownloadRequests', () => {
    it('returns empty array when no active downloads', () => {
      const active = manager.getActiveDownloadRequests();
      expect(active).toEqual([]);
    });
  });
});
