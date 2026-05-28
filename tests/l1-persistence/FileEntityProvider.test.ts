/**
 * FileEntityProvider tests (ADR-0008 PR-F.2).
 *
 * Covers the unification logic: canvasFile-only, attachment-only, both,
 * multi-attachment, list-scope grouping, and the divergence logging path.
 */

import { Logger } from '../../src/layers/l0-utilities/Logger';
import { Database } from '../../src/layers/l1-persistence/Database';
import { FileEntityProvider } from '../../src/layers/l1-persistence/FileEntityProvider';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';
import { AnnouncementAttachmentReader } from '../../src/layers/l1-persistence/readers/AnnouncementAttachmentReader';
import { CanvasFileReader } from '../../src/layers/l1-persistence/readers/CanvasFileReader';

describe('FileEntityProvider', () => {
  let db: Database;
  let provider: FileEntityProvider;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const migrationRunner = new MigrationRunner(db);
    migrationRunner.loadMigrations(coreMigrations);
    migrationRunner.runAll();

    seedCourse(db, 1, 'CS101');
    const logger = new Logger({ enableConsole: false }).child('FileEntityProvider.test');
    warnSpy = jest.spyOn(logger, 'warn');
    provider = new FileEntityProvider(
      new CanvasFileReader(db),
      new AnnouncementAttachmentReader(db),
      logger
    );
  });

  afterEach(() => {
    warnSpy.mockRestore();
    db.close();
  });

  describe('findByCanvasId', () => {
    test('returns null when neither source has a row', () => {
      expect(provider.findByCanvasId('nope')).toBeNull();
    });

    test('returns an entity with canvasFile-only presence', () => {
      seedFile(db, {
        externalId: '111',
        courseId: 1,
        title: 'lab1.pdf',
        sizeBytes: 1024,
        mimeType: 'application/pdf',
      });

      const entity = provider.findByCanvasId('111');

      expect(entity).not.toBeNull();
      expect(entity?.canvasId).toBe('111');
      expect(entity?.filename).toBe('lab1.pdf');
      expect(entity?.sizeBytes).toBe(1024);
      expect(entity?.contentType).toBe('application/pdf');
      expect(entity?.presences.canvasFile).not.toBeNull();
      expect(entity?.presences.attachments).toEqual([]);
    });

    test('returns an entity with attachment-only presence', () => {
      const a1 = seedAnnouncement(db, 1);
      seedAttachment(db, {
        notifId: a1,
        courseId: 1,
        externalId: '222',
        filename: 'attached.pdf',
        sizeBytes: 512,
      });

      const entity = provider.findByCanvasId('222');

      expect(entity).not.toBeNull();
      expect(entity?.canvasId).toBe('222');
      expect(entity?.filename).toBe('attached.pdf');
      expect(entity?.sizeBytes).toBe(512);
      expect(entity?.presences.canvasFile).toBeNull();
      expect(entity?.presences.attachments).toHaveLength(1);
      expect(entity?.presences.attachments[0].notificationId).toBe(a1);
    });

    test('returns an entity with both presences when they agree', () => {
      seedFile(db, {
        externalId: '333',
        courseId: 1,
        title: 'shared.pdf',
        sizeBytes: 2048,
        mimeType: 'application/pdf',
      });
      const a1 = seedAnnouncement(db, 1);
      seedAttachment(db, {
        notifId: a1,
        courseId: 1,
        externalId: '333',
        filename: 'shared.pdf',
        sizeBytes: 2048,
      });

      const entity = provider.findByCanvasId('333');

      expect(entity?.presences.canvasFile).not.toBeNull();
      expect(entity?.presences.attachments).toHaveLength(1);
      // No divergence logged when sources agree.
      expect(warnSpy).not.toHaveBeenCalled();
    });

    test('returns multiple attachment presences when the blob is on many announcements', () => {
      const a1 = seedAnnouncement(db, 1);
      const a2 = seedAnnouncement(db, 1);
      const a3 = seedAnnouncement(db, 1);
      seedAttachment(db, { notifId: a1, courseId: 1, externalId: '444' });
      seedAttachment(db, { notifId: a2, courseId: 1, externalId: '444' });
      seedAttachment(db, { notifId: a3, courseId: 1, externalId: '444' });

      const entity = provider.findByCanvasId('444');

      expect(entity?.presences.canvasFile).toBeNull();
      expect(entity?.presences.attachments).toHaveLength(3);
    });

    test('canonical-field sourcing: canvasFile wins on filename/size disagreement', () => {
      seedFile(db, {
        externalId: '555',
        courseId: 1,
        title: 'canonical.pdf',
        sizeBytes: 1000,
        mimeType: 'application/pdf',
      });
      const a1 = seedAnnouncement(db, 1);
      seedAttachment(db, {
        notifId: a1,
        courseId: 1,
        externalId: '555',
        filename: 'attachment-name.pdf',
        sizeBytes: 9999,
      });

      const entity = provider.findByCanvasId('555');

      expect(entity?.filename).toBe('canonical.pdf');
      expect(entity?.sizeBytes).toBe(1000);
      expect(warnSpy).toHaveBeenCalled();
      const call = warnSpy.mock.calls[0];
      expect(call[0]).toMatch(/diverge/i);
      expect(call[1].canvasId).toBe('555');
    });

    test('does not log divergence when only one source is present', () => {
      seedFile(db, { externalId: '666', courseId: 1, title: 'lone.pdf' });

      provider.findByCanvasId('666');

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('findByCanvasIds', () => {
    test('returns a Map covering matched ids and omits misses', () => {
      seedFile(db, { externalId: '111', courseId: 1, title: 'a.pdf' });
      const a1 = seedAnnouncement(db, 1);
      seedAttachment(db, { notifId: a1, courseId: 1, externalId: '222' });

      const map = provider.findByCanvasIds(['111', '222', '999']);

      expect(map.size).toBe(2);
      expect(map.has('111')).toBe(true);
      expect(map.has('222')).toBe(true);
      expect(map.has('999')).toBe(false);
    });

    test('returns empty Map for empty input', () => {
      expect(provider.findByCanvasIds([]).size).toBe(0);
    });
  });

  describe('findByCourseIds', () => {
    test('returns entities sorted by displayName', () => {
      seedFile(db, { externalId: '111', courseId: 1, title: 'cherry.pdf' });
      seedFile(db, { externalId: '222', courseId: 1, title: 'apple.pdf' });
      const a1 = seedAnnouncement(db, 1);
      seedAttachment(db, {
        notifId: a1,
        courseId: 1,
        externalId: '333',
        filename: 'banana.pdf',
      });

      const entities = provider.findByCourseIds([1]);

      expect(entities.map((e) => e.displayName)).toEqual([
        'apple.pdf',
        'banana.pdf',
        'cherry.pdf',
      ]);
    });

    test('groups multi-announcement attachment-only blob into one entity', () => {
      const a1 = seedAnnouncement(db, 1);
      const a2 = seedAnnouncement(db, 1);
      seedAttachment(db, {
        notifId: a1,
        courseId: 1,
        externalId: '111',
        filename: 'shared.pdf',
      });
      seedAttachment(db, {
        notifId: a2,
        courseId: 1,
        externalId: '111',
        filename: 'shared.pdf',
      });

      const entities = provider.findByCourseIds([1]);

      expect(entities).toHaveLength(1);
      expect(entities[0].presences.attachments).toHaveLength(2);
    });

    test('pairs canvasFile with its attachments under one entity (no duplicate)', () => {
      seedFile(db, { externalId: '111', courseId: 1, title: 'both.pdf' });
      const a1 = seedAnnouncement(db, 1);
      seedAttachment(db, {
        notifId: a1,
        courseId: 1,
        externalId: '111',
        filename: 'both.pdf',
      });

      const entities = provider.findByCourseIds([1]);

      expect(entities).toHaveLength(1);
      expect(entities[0].presences.canvasFile).not.toBeNull();
      expect(entities[0].presences.attachments).toHaveLength(1);
    });

    test('returns empty for empty input', () => {
      expect(provider.findByCourseIds([])).toEqual([]);
    });

    test('limits to the given courses', () => {
      seedCourse(db, 2, 'MAT201');
      seedFile(db, { externalId: '111', courseId: 1, title: 'in-cs.pdf' });
      seedFile(db, { externalId: '222', courseId: 2, title: 'in-mat.pdf' });

      const entities = provider.findByCourseIds([1]);

      expect(entities.map((e) => e.canvasId)).toEqual(['111']);
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

function seedFile(
  db: Database,
  data: {
    externalId: string;
    courseId: number;
    title?: string;
    sizeBytes?: number | null;
    mimeType?: string | null;
  }
): void {
  db.executeWrite(
    `INSERT INTO resources (external_id, course_id, type, title, size_bytes, mime_type)
     VALUES (?, ?, 'file', ?, ?, ?)`,
    [
      data.externalId,
      data.courseId,
      data.title ?? `file_${data.externalId}.pdf`,
      data.sizeBytes ?? null,
      data.mimeType ?? null,
    ]
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
    sizeBytes?: number | null;
  }
): void {
  db.executeWrite(
    `INSERT INTO notification_attachments
       (notification_id, course_id, external_id, display_name, filename, url, size_bytes, download_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [
      data.notifId,
      data.courseId,
      data.externalId,
      data.filename ?? `file_${data.externalId}.pdf`,
      data.filename ?? `file_${data.externalId}.pdf`,
      `https://canvas.example.com/files/${data.externalId}`,
      data.sizeBytes ?? null,
    ]
  );
}
