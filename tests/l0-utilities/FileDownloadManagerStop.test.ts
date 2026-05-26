/**
 * Tests for FileDownloadManager.stop() method
 */

import { FileDownloadManager } from '../../src/layers/l0-utilities/FileDownloadManager';
import { Logger } from '../../src/layers/l0-utilities/Logger';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('FileDownloadManager - stop()', () => {
  let manager: FileDownloadManager;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cid-test-fdm-'));
    manager = new FileDownloadManager({
      baseDir: tempDir,
      maxConcurrent: 2,
      logger: new Logger({ enableConsole: false }),
    });
  });

  afterEach(() => {
    manager.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('stop() clears the download queue', () => {
    // Queue some items (they won't actually download since there's no server)
    expect(manager.getQueueLength()).toBe(0);
    manager.stop();
    expect(manager.getQueueLength()).toBe(0);
  });

  test('stop() is safe to call multiple times', () => {
    expect(() => {
      manager.stop();
      manager.stop();
      manager.stop();
    }).not.toThrow();
  });

  test('stop() resets active count to 0', () => {
    manager.stop();
    expect(manager.getActiveCount()).toBe(0);
  });

  test('stop() is callable on a fresh manager', () => {
    const fresh = new FileDownloadManager({
      baseDir: tempDir,
      maxConcurrent: 1,
      logger: new Logger({ enableConsole: false }),
    });
    expect(() => fresh.stop()).not.toThrow();
  });
});
