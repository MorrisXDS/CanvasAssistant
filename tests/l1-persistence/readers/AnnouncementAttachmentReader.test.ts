/**
 * AnnouncementAttachmentReader tests (ADR-0008 PR-F.2).
 *
 * Key asymmetry vs CanvasFileReader: a single external_id can match
 * many rows (one per announcement attaching the same blob).
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { AnnouncementAttachmentReader } from '../../../src/layers/l1-persistence/readers/AnnouncementAttachmentReader';

describe('AnnouncementAttachmentReader', () => {
  let db: Database;
  let reader: AnnouncementAttachmentReader;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const migrationRunner = new MigrationRunner(db);
    migrationRunner.loadMigrations(coreMigrations);
    migrationRunner.runAll();

    seedCourse(db, 1, 'CS101');
    reader = new AnnouncementAttachmentReader(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('getByExternalId', () => {
    test('returns rows when the blob is attached to one announcement', () => {
      const notifId = seedAnnouncement(db, 1);
      seedAttachment(db, { notifId, courseId: 1, externalId: '111', filename: 'a.pdf' });

      const rows = reader.getByExternalId('111');

      expect(rows).toHaveLength(1);
      expect(rows[0].external_id).toBe('111');
      expect(rows[0].filename).toBe('a.pdf');
    });

    test('returns all rows when the same blob is attached to multiple announcements', () => {
      const a1 = seedAnnouncement(db, 1);
      const a2 = seedAnnouncement(db, 1);
      const a3 = seedAnnouncement(db, 1);
      seedAttachment(db, { notifId: a1, courseId: 1, externalId: '111' });
      seedAttachment(db, { notifId: a2, courseId: 1, externalId: '111' });
      seedAttachment(db, { notifId: a3, courseId: 1, externalId: '111' });

      const rows = reader.getByExternalId('111');

      expect(rows).toHaveLength(3);
      expect(new Set(rows.map((r) => r.notification_id))).toEqual(new Set([a1, a2, a3]));
    });

    test('returns empty array when no row matches', () => {
      expect(reader.getByExternalId('nope')).toEqual([]);
    });
  });

  describe('getByExternalIds', () => {
    test('returns a Map of external_id to row array', () => {
      const a1 = seedAnnouncement(db, 1);
      const a2 = seedAnnouncement(db, 1);
      seedAttachment(db, { notifId: a1, courseId: 1, externalId: '111' });
      seedAttachment(db, { notifId: a2, courseId: 1, externalId: '111' });
      seedAttachment(db, { notifId: a1, courseId: 1, externalId: '222' });

      const map = reader.getByExternalIds(['111', '222']);

      expect(map.get('111')).toHaveLength(2);
      expect(map.get('222')).toHaveLength(1);
    });

    test('omits ids with no matching rows', () => {
      const a1 = seedAnnouncement(db, 1);
      seedAttachment(db, { notifId: a1, courseId: 1, externalId: '111' });

      const map = reader.getByExternalIds(['111', '999']);

      expect(map.has('111')).toBe(true);
      expect(map.has('999')).toBe(false);
    });

    test('returns empty Map for empty input', () => {
      expect(reader.getByExternalIds([]).size).toBe(0);
    });
  });

  describe('getByCourseIds', () => {
    test('returns attachments only in the given courses', () => {
      seedCourse(db, 2, 'MAT201');
      const a1 = seedAnnouncement(db, 1);
      const a2 = seedAnnouncement(db, 2);
      seedAttachment(db, { notifId: a1, courseId: 1, externalId: '111' });
      seedAttachment(db, { notifId: a2, courseId: 2, externalId: '222' });

      const rows = reader.getByCourseIds([1]);

      expect(rows).toHaveLength(1);
      expect(rows[0].external_id).toBe('111');
    });

    test('returns empty for empty input', () => {
      expect(reader.getByCourseIds([])).toEqual([]);
    });
  });
});

function seedCourse(db: Database, id: number, code: string): void {
  db.executeWrite(
    `INSERT INTO courses (id, external_id, code, name, is_hidden, target_grade)
     VALUES (?, ?, ?, ?, 0, 85)`,
    [id, `ext_${id}`, code, `Course ${code}`]
  );
}

function seedAnnouncement(db: Database, courseId: number): number {
  const result = db.executeWrite(
    `INSERT INTO notifications
       (source_type, source_id, course_id, title, message, published_at)
     VALUES ('canvas', ?, ?, 'a', 'm', '2026-01-01T00:00:00Z')`,
    [`ann_${Date.now()}_${Math.random()}`, courseId]
  );
  return Number(result.lastInsertRowid);
}

function seedAttachment(
  db: Database,
  data: {
    notifId: number;
    courseId: number;
    externalId: string;
    filename?: string;
  }
): void {
  db.executeWrite(
    `INSERT INTO notification_attachments
       (notification_id, course_id, external_id, display_name, filename, url, download_status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
    [
      data.notifId,
      data.courseId,
      data.externalId,
      data.filename ?? `file_${data.externalId}.pdf`,
      data.filename ?? `file_${data.externalId}.pdf`,
      `https://canvas.example.com/files/${data.externalId}`,
    ]
  );
}
