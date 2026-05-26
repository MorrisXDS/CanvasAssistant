/**
 * Tests for ensureDirectory utility function
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { ensureDirectory } from '../../src/layers/l0-utilities/DefaultPaths';

describe('ensureDirectory', () => {
  let tempBase: string;

  beforeEach(() => {
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'cid-test-ensuredir-'));
  });

  afterEach(() => {
    fs.rmSync(tempBase, { recursive: true, force: true });
  });

  test('should create a directory that does not exist', () => {
    const dir = path.join(tempBase, 'new-dir');
    expect(fs.existsSync(dir)).toBe(false);

    ensureDirectory(dir);

    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.statSync(dir).isDirectory()).toBe(true);
  });

  test('should create nested directories recursively', () => {
    const dir = path.join(tempBase, 'a', 'b', 'c', 'd');
    expect(fs.existsSync(dir)).toBe(false);

    ensureDirectory(dir);

    expect(fs.existsSync(dir)).toBe(true);
  });

  test('should not throw if directory already exists', () => {
    const dir = path.join(tempBase, 'existing');
    fs.mkdirSync(dir);

    expect(() => ensureDirectory(dir)).not.toThrow();
    expect(fs.existsSync(dir)).toBe(true);
  });

  test('should be idempotent - calling twice has same result', () => {
    const dir = path.join(tempBase, 'idempotent');

    ensureDirectory(dir);
    ensureDirectory(dir);

    expect(fs.existsSync(dir)).toBe(true);
  });
});
