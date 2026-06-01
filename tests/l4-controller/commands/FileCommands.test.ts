/**
 * Command tests for the ADR-0007 fileHandlers migration.
 *
 * Covers UpdateAttachmentDownloadCommand (notification_attachments status
 * writes) and ClearSyncedFilesCommand (the transactional multi-table wipe).
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { UpdateAttachmentDownloadCommand } from '../../../src/layers/l4-controller/commands/file/UpdateAttachmentDownloadCommand';
import { ClearSyncedFilesCommand } from '../../../src/layers/l4-controller/commands/file/ClearSyncedFilesCommand';

describe('fileHandlers migration commands', () => {
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

  function seedAttachment(id: number): void {
    db.executeWrite('PRAGMA foreign_keys = OFF', []);
    db.executeWrite(
      `INSERT INTO notification_attachments
         (id, notification_id, course_id, external_id, display_name, filename, url, download_status)
       VALUES (?, 99, 1, ?, 'D', 'f.pdf', 'https://x/a', 'pending')`,
      [id, `att-${id}`],
      'notification_attachments'
    );
    db.executeWrite('PRAGMA foreign_keys = ON', []);
  }

  describe('UpdateAttachmentDownloadCommand', () => {
    test('setStatus updates download_status', () => {
      seedAttachment(10);
      new UpdateAttachmentDownloadCommand(db).setStatus(10, 'downloading');
      const row = db.executeReadOne<{ download_status: string }>(
        'SELECT download_status FROM notification_attachments WHERE id = 10'
      );
      expect(row?.download_status).toBe('downloading');
    });

    test('markDownloaded sets completed + local_path + downloaded_at', () => {
      seedAttachment(11);
      new UpdateAttachmentDownloadCommand(db).markDownloaded(
        11,
        '/d/a.pdf',
        '2026-02-02T00:00:00Z'
      );
      const row = db.executeReadOne<{
        download_status: string;
        local_path: string | null;
        downloaded_at: string | null;
      }>(
        'SELECT download_status, local_path, downloaded_at FROM notification_attachments WHERE id = 11'
      );
      expect(row).toEqual({
        download_status: 'completed',
        local_path: '/d/a.pdf',
        downloaded_at: '2026-02-02T00:00:00Z',
      });
    });
  });

  describe('ClearSyncedFilesCommand', () => {
    test('deletes resources + attachments + files/folders sync_metadata, leaves others', () => {
      db.executeWrite(
        `INSERT INTO resources (id, external_id, course_id, type, title) VALUES (20, 'r1', 1, 'file', 'a')`,
        [],
        'resources'
      );
      seedAttachment(10);
      db.executeWrite(
        `INSERT INTO sync_metadata (endpoint, etag) VALUES ('/courses/1/files', 'e1')`,
        [],
        'sync_metadata'
      );
      db.executeWrite(
        `INSERT INTO sync_metadata (endpoint, etag) VALUES ('/courses/1/assignments', 'e2')`,
        [],
        'sync_metadata'
      );

      new ClearSyncedFilesCommand(db).execute();

      expect(db.executeReadOne('SELECT 1 FROM resources')).toBeUndefined();
      expect(db.executeReadOne('SELECT 1 FROM notification_attachments')).toBeUndefined();
      // files cursor gone, the unrelated assignments cursor survives
      expect(
        db.executeReadOne(
          "SELECT 1 FROM sync_metadata WHERE endpoint = '/courses/1/files'"
        )
      ).toBeUndefined();
      expect(
        db.executeReadOne(
          "SELECT 1 FROM sync_metadata WHERE endpoint = '/courses/1/assignments'"
        )
      ).toBeDefined();
    });
  });
});
