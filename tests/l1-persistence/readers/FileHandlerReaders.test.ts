/**
 * Reader-method tests for the ADR-0007 fileHandlers migration.
 *
 * Covers the new by-id projections on AnnouncementAttachmentReader and
 * ResourceReader used by the file/attachment IPC handlers.
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { AnnouncementAttachmentReader } from '../../../src/layers/l1-persistence/readers/AnnouncementAttachmentReader';
import { ResourceReader } from '../../../src/layers/l1-persistence/readers/ResourceReader';

describe('fileHandlers migration reader methods', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    db.executeWrite(
      `INSERT INTO courses (id, external_id, code, name) VALUES (1, '4242', 'CS101', 'Intro')`,
      [],
      'courses'
    );
  });

  afterEach(() => {
    db.close();
  });

  /** Seed a notification_attachments row (FK off — no notifications table fixture needed). */
  function seedAttachment(opts: {
    id: number;
    localPath?: string | null;
    url?: string;
    status?: string;
  }): void {
    db.executeWrite('PRAGMA foreign_keys = OFF', []);
    db.executeWrite(
      `INSERT INTO notification_attachments
         (id, notification_id, course_id, external_id, display_name, filename, url, local_path, download_status)
       VALUES (?, 99, 1, ?, ?, ?, ?, ?, ?)`,
      [
        opts.id,
        `att-${opts.id}`,
        `Display ${opts.id}`,
        `file-${opts.id}.pdf`,
        opts.url ?? 'https://x/att',
        opts.localPath ?? null,
        opts.status ?? 'pending',
      ],
      'notification_attachments'
    );
    db.executeWrite('PRAGMA foreign_keys = ON', []);
  }

  describe('AnnouncementAttachmentReader', () => {
    test('getById returns the full row, or null', () => {
      seedAttachment({ id: 10, localPath: '/d/a.pdf', status: 'completed' });
      const r = new AnnouncementAttachmentReader(db);
      const row = r.getById(10);
      expect(row).toMatchObject({
        id: 10,
        course_id: 1,
        external_id: 'att-10',
        filename: 'file-10.pdf',
        download_status: 'completed',
      });
      expect(r.getById(999)).toBeNull();
    });

    test('getOpenInfoById returns local_path + url', () => {
      seedAttachment({ id: 11, localPath: '/d/b.pdf', url: 'https://x/b' });
      expect(new AnnouncementAttachmentReader(db).getOpenInfoById(11)).toEqual({
        local_path: '/d/b.pdf',
        url: 'https://x/b',
      });
      expect(new AnnouncementAttachmentReader(db).getOpenInfoById(999)).toBeNull();
    });

    test('getLocalPathById returns just local_path', () => {
      seedAttachment({ id: 12, localPath: '/d/c.pdf' });
      expect(new AnnouncementAttachmentReader(db).getLocalPathById(12)).toEqual({
        local_path: '/d/c.pdf',
      });
      expect(new AnnouncementAttachmentReader(db).getLocalPathById(999)).toBeNull();
    });
  });

  describe('ResourceReader by-id projections', () => {
    beforeEach(() => {
      db.executeWrite(
        `INSERT INTO resources (id, external_id, course_id, type, title, url, local_path, folder_path)
         VALUES (20, 'file-5', 1, 'file', 'a.pdf', 'https://x/5', '/d/a.pdf', 'Wk1')`,
        [],
        'resources'
      );
    });

    test('getLocalPathById', () => {
      expect(new ResourceReader(db).getLocalPathById(20)).toEqual({
        local_path: '/d/a.pdf',
      });
      expect(new ResourceReader(db).getLocalPathById(999)).toBeNull();
    });

    test('getLocalPathExternalById', () => {
      expect(new ResourceReader(db).getLocalPathExternalById(20)).toEqual({
        local_path: '/d/a.pdf',
        external_id: 'file-5',
      });
      expect(new ResourceReader(db).getLocalPathExternalById(999)).toBeNull();
    });

    test('getDownloadInfoWithLocalPathByExternalId', () => {
      expect(
        new ResourceReader(db).getDownloadInfoWithLocalPathByExternalId('file-5')
      ).toEqual({
        id: 20,
        course_id: 1,
        external_id: 'file-5',
        title: 'a.pdf',
        url: 'https://x/5',
        local_path: '/d/a.pdf',
        folder_path: 'Wk1',
      });
      expect(
        new ResourceReader(db).getDownloadInfoWithLocalPathByExternalId('nope')
      ).toBeNull();
    });
  });
});
