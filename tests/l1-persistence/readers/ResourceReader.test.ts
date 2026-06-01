/**
 * ResourceReader tests (ADR-0007 — resourceHandlers migration).
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { ResourceReader } from '../../../src/layers/l1-persistence/readers/ResourceReader';

describe('ResourceReader', () => {
  let db: Database;
  let reader: ResourceReader;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    reader = new ResourceReader(db);

    db.executeWrite(
      `INSERT INTO courses (id, external_id, code, name) VALUES (1, '4242', 'CS101', 'Intro')`,
      [],
      'courses'
    );
    // A Canvas file resource with everything populated.
    db.executeWrite(
      `INSERT INTO resources
         (id, external_id, course_id, type, title, url, local_path, size_bytes, mime_type, folder_path, synced_at)
       VALUES
         (10, 'file-555', 1, 'file', 'lecture.pdf', 'https://canvas/files/555/download',
          '/disk/lecture.pdf', 2048, 'application/pdf', 'Week 1', '2026-01-01T00:00:00Z')`,
      [],
      'resources'
    );
  });

  afterEach(() => {
    db.close();
  });

  describe('getDownloadInfoById', () => {
    test('returns the download projection when found', () => {
      expect(reader.getDownloadInfoById(10)).toEqual({
        id: 10,
        course_id: 1,
        external_id: 'file-555',
        title: 'lecture.pdf',
        url: 'https://canvas/files/555/download',
        folder_path: 'Week 1',
      });
    });

    test('returns null when not found', () => {
      expect(reader.getDownloadInfoById(999)).toBeNull();
    });
  });

  describe('getDownloadInfoByExternalId', () => {
    test('returns the download projection when found', () => {
      const row = reader.getDownloadInfoByExternalId('file-555');
      expect(row?.id).toBe(10);
      expect(row?.url).toBe('https://canvas/files/555/download');
    });

    test('returns null when not found', () => {
      expect(reader.getDownloadInfoByExternalId('nope')).toBeNull();
    });
  });

  describe('getOpenInfoByExternalId', () => {
    test('returns id + local_path + title', () => {
      expect(reader.getOpenInfoByExternalId('file-555')).toEqual({
        id: 10,
        local_path: '/disk/lecture.pdf',
        title: 'lecture.pdf',
      });
    });

    test('returns null when not found', () => {
      expect(reader.getOpenInfoByExternalId('nope')).toBeNull();
    });
  });

  describe('getOpenInfoById', () => {
    test('returns the open-by-id projection', () => {
      expect(reader.getOpenInfoById(10)).toEqual({
        local_path: '/disk/lecture.pdf',
        external_id: 'file-555',
        course_id: 1,
        title: 'lecture.pdf',
        mime_type: 'application/pdf',
      });
    });

    test('returns null when not found', () => {
      expect(reader.getOpenInfoById(999)).toBeNull();
    });
  });

  describe('getDependencyFileByExternalId', () => {
    test('returns id + local_path + title + size_bytes + url', () => {
      expect(reader.getDependencyFileByExternalId('file-555')).toEqual({
        id: 10,
        local_path: '/disk/lecture.pdf',
        title: 'lecture.pdf',
        size_bytes: 2048,
        url: 'https://canvas/files/555/download',
      });
    });

    test('returns null when not found', () => {
      expect(reader.getDependencyFileByExternalId('nope')).toBeNull();
    });
  });

  describe('getLocalPathByExternalId', () => {
    test('returns just the local_path', () => {
      expect(reader.getLocalPathByExternalId('file-555')).toEqual({
        local_path: '/disk/lecture.pdf',
      });
    });

    test('returns null when not found', () => {
      expect(reader.getLocalPathByExternalId('nope')).toBeNull();
    });
  });
});
