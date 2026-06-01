/**
 * courseContentHandlers — IPC handler behavior tests (ADR-0007).
 *
 * Electron is mocked so the handler file loads in Node. Covers the migrated
 * read delegations across the syllabus / grade-history / pages channels.
 */

jest.mock('electron', () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    ipcMain: {
      handle: jest.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
        handlers.set(channel, fn);
      }),
      __getHandler: (channel: string) => handlers.get(channel),
      __reset: () => handlers.clear(),
    },
  };
});

import { ipcMain } from 'electron';
import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';
import { registerCourseContentHandlers } from '../../src/lifecycle/ipc-handlers/data/courseContentHandlers';
import type { IpcContext } from '../../src/lifecycle/ipc-handlers/IpcContext';

interface IpcMainMock {
  __getHandler: (channel: string) => ((...args: unknown[]) => unknown) | undefined;
  __reset: () => void;
}
const mockIpc = ipcMain as unknown as IpcMainMock;

describe('courseContentHandlers (ADR-0007)', () => {
  let db: Database;
  let canvasClient: { getBaseUrl: () => string } | null;

  beforeEach(() => {
    mockIpc.__reset();
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    db.executeWrite(
      `INSERT INTO courses (id, external_id, code, name, syllabus_body) VALUES (1, '4242', 'CS101', 'Intro', '<p>Syllabus body</p>')`,
      [],
      'courses'
    );
    canvasClient = { getBaseUrl: () => 'https://canvas.example.com' };
    registerCourseContentHandlers(buildCtx());
  });

  afterEach(() => db.close());

  function buildCtx(): IpcContext {
    const noopLogger = {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      child: () => noopLogger,
    };
    return {
      getDatabase: () => db,
      getLogger: () => noopLogger as unknown as ReturnType<IpcContext['getLogger']>,
      getCanvasClient: (() => canvasClient) as unknown as IpcContext['getCanvasClient'],
    } as unknown as IpcContext;
  }

  describe('data:getCourseSyllabus', () => {
    test('returns a designated resource syllabus', async () => {
      db.executeWrite(
        `INSERT INTO resources (id, external_id, course_id, type, title, local_path, synced_at)
         VALUES (10, 'r1', 1, 'file', 'syl.pdf', '/d/syl.pdf', '2026-01-03')`,
        [],
        'resources'
      );
      db.executeWrite(
        `INSERT INTO course_syllabuses (course_id, resource_id, source_type, last_reviewed_at, marked_at)
         VALUES (1, 10, 'resource', '2026-01-01', '2026-01-02')`,
        [],
        'course_syllabuses'
      );
      const res = (await invoke('data:getCourseSyllabus', 1)) as {
        type: string;
        resourceId: number;
        downloadStatus: string;
      };
      expect(res).toMatchObject({
        type: 'resource',
        resourceId: 10,
        downloadStatus: 'completed',
      });
    });

    test('falls back to a syllabus-typed page', async () => {
      db.executeWrite(
        `INSERT INTO course_pages (id, external_id, course_id, page_type, title, url_slug)
         VALUES (50, 'p-syl', 1, 'syllabus', 'Syllabus', 'syllabus')`,
        [],
        'course_pages'
      );
      const res = (await invoke('data:getCourseSyllabus', 1)) as {
        type: string;
        pageId: number;
      };
      expect(res).toMatchObject({ type: 'page', pageId: 50 });
    });

    test('returns null when neither exists', async () => {
      expect(await invoke('data:getCourseSyllabus', 1)).toBeNull();
    });
  });

  test('data:getGradeHistory returns mapped rows oldest-first', async () => {
    db.executeWrite(
      `INSERT INTO grade_history (course_id, grade, recorded_at) VALUES (1, 88, '2026-03-01'), (1, 91, '2026-01-01')`,
      [],
      'grade_history'
    );
    const res = (await invoke('data:getGradeHistory', 1)) as Array<{
      recordedAt: string;
      grade: number;
    }>;
    expect(res.map((r) => r.grade)).toEqual([91, 88]);
  });

  describe('pages:getByCourse', () => {
    test('lists pages and prepends the virtual syllabus page', async () => {
      db.executeWrite(
        `INSERT INTO course_pages (id, external_id, course_id, page_type, title, url_slug, body_html)
         VALUES (50, 'p1', 1, 'content', 'Week 1', 'week-1', '<p>w</p>')`,
        [],
        'course_pages'
      );
      const res = (await invoke('pages:getByCourse', 1)) as Array<{
        id: number;
        pageType: string;
      }>;
      // syllabus virtual page (id -1) is unshifted to the front
      expect(res[0]).toMatchObject({ id: -1, pageType: 'syllabus' });
      expect(res.some((p) => p.id === 50)).toBe(true);
    });
  });

  describe('pages:get', () => {
    test('returns a page with a constructed Canvas URL', async () => {
      db.executeWrite(
        `INSERT INTO course_pages (id, external_id, course_id, page_type, title, url_slug)
         VALUES (50, 'p1', 1, 'content', 'Week 1', 'week-1')`,
        [],
        'course_pages'
      );
      const res = (await invoke('pages:get', 50)) as {
        success: boolean;
        data: { canvasUrl: string };
      };
      expect(res.success).toBe(true);
      expect(res.data.canvasUrl).toBe(
        'https://canvas.example.com/courses/1/pages/week-1'
      );
    });

    test('rejects the syllabus virtual id', async () => {
      expect(await invoke('pages:get', -1)).toMatchObject({ success: false });
    });

    test('not found', async () => {
      expect(await invoke('pages:get', 999)).toMatchObject({ success: false });
    });
  });

  describe('pages:getByTitle', () => {
    test('returns the matching page', async () => {
      db.executeWrite(
        `INSERT INTO course_pages (id, external_id, course_id, page_type, title, url_slug)
         VALUES (50, 'p1', 1, 'content', 'Week 1', 'week-1')`,
        [],
        'course_pages'
      );
      const res = (await invoke('pages:getByTitle', 'Week 1', 1)) as {
        success: boolean;
        data: { id: number };
      };
      expect(res.success).toBe(true);
      expect(res.data.id).toBe(50);
    });

    test('not found', async () => {
      expect(await invoke('pages:getByTitle', 'Nope', 1)).toMatchObject({
        success: false,
      });
    });
  });
});

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = mockIpc.__getHandler(channel);
  if (!handler) throw new Error(`No handler registered for ${channel}`);
  return Promise.resolve(handler({} as unknown, ...args));
}
