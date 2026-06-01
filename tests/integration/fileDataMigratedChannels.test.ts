/**
 * fileDataHandlers — migrated read channels (ADR-0007 literal-zero closeout).
 *
 * Covers the six channels whose generic-typed reads moved to L1 readers:
 * data:getCourseFiles, data:getFiles, data:getModuleItems,
 * data:getFileReferences, data:getResourceCanvasUrl, data:getTaskCanvasUrl.
 * (The FileEntity + getAttachments channels are covered by fileDataHandlers.test.ts.)
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
import { VisibilityOracle } from '../../src/layers/l1-persistence/VisibilityOracle';
import { registerFileDataHandlers } from '../../src/lifecycle/ipc-handlers/fileDataHandlers';
import type { IpcContext } from '../../src/lifecycle/ipc-handlers/IpcContext';

interface IpcMainMock {
  __getHandler: (channel: string) => ((...args: unknown[]) => unknown) | undefined;
  __reset: () => void;
}
const mockIpc = ipcMain as unknown as IpcMainMock;

describe('fileDataHandlers migrated channels (ADR-0007)', () => {
  let db: Database;
  let oracle: VisibilityOracle;
  let canvasClient: { getBaseUrl: () => string } | null;

  beforeEach(() => {
    mockIpc.__reset();
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    oracle = new VisibilityOracle(db);
    canvasClient = { getBaseUrl: () => 'https://canvas.example.com' };

    db.executeWrite(
      `INSERT INTO courses (id, external_id, code, name, is_hidden) VALUES (1, '4242', 'CS101', 'Intro', 0)`,
      [],
      'courses'
    );
    oracle.setTermSelection('all');

    registerFileDataHandlers(buildCtx());
  });

  afterEach(() => {
    oracle.stop();
    db.close();
  });

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
      getVisibilityOracle: () => oracle,
      getFileEntityProvider: () => null,
      getCanvasClient: (() => canvasClient) as unknown as IpcContext['getCanvasClient'],
    } as unknown as IpcContext;
  }

  function seedResource(opts: {
    id: number;
    externalId: string;
    type?: string;
    localPath?: string | null;
    folderPath?: string | null;
  }): void {
    db.executeWrite(
      `INSERT INTO resources (id, external_id, course_id, type, title, local_path, folder_path)
       VALUES (?, ?, 1, ?, ?, ?, ?)`,
      [
        opts.id,
        opts.externalId,
        opts.type ?? 'file',
        `title-${opts.id}`,
        opts.localPath ?? null,
        opts.folderPath ?? null,
      ],
      'resources'
    );
  }

  function seedAttachment(opts: { id: number; notifId: number }): void {
    db.executeWrite(
      `INSERT INTO notification_attachments
         (id, notification_id, course_id, external_id, display_name, filename, url, download_status)
       VALUES (?, ?, 1, ?, 'Disp', 'f.pdf', 'https://x/att', 'pending')`,
      [opts.id, opts.notifId, `att-${opts.id}`],
      'notification_attachments'
    );
  }

  function seedNotification(id: number): void {
    db.executeWrite(
      `INSERT INTO notifications (id, source_type, source_id, course_id, title, message, published_at)
       VALUES (?, 'canvas', ?, 1, 'Ann', 'msg', '2026-01-01')`,
      [id, `n-${id}`],
      'notifications'
    );
  }

  // --- data:getCourseFiles --------------------------------------------------

  test('data:getCourseFiles merges resources + attachments', async () => {
    seedResource({ id: 10, externalId: 'file-1' });
    seedNotification(100);
    seedAttachment({ id: 5, notifId: 100 });

    const res = (await invoke('data:getCourseFiles', 1)) as Array<{
      source: string;
      id: number;
    }>;
    expect(res.some((f) => f.source === 'resource')).toBe(true);
    expect(res.some((f) => f.source === 'attachment')).toBe(true);
  });

  // --- data:getFiles --------------------------------------------------------

  test('data:getFiles returns resources + attachments for visible courses', async () => {
    seedResource({ id: 10, externalId: 'file-1' });
    seedNotification(100);
    seedAttachment({ id: 5, notifId: 100 });

    const res = (await invoke('data:getFiles')) as {
      resources: unknown[];
      attachments: Array<{ notificationTitle: string }>;
      pages: unknown[];
    };
    expect(res.resources).toHaveLength(1);
    expect(res.attachments).toHaveLength(1);
    expect(res.attachments[0].notificationTitle).toBe('Ann');
  });

  // --- data:getModuleItems --------------------------------------------------

  test('data:getModuleItems lists items for visible courses with has_local_content', async () => {
    db.executeWrite(
      `INSERT INTO modules (id, external_id, course_id, name, position) VALUES (1, 'm1', 1, 'Week 1', 0)`,
      [],
      'modules'
    );
    db.executeWrite(
      `INSERT INTO module_items (id, external_id, module_id, title, item_type, content_id, position)
       VALUES (1, 'mi1', 1, 'Lecture', 'File', 'file-9', 0)`,
      [],
      'module_items'
    );
    seedResource({ id: 20, externalId: 'file-9', localPath: '/d/x.pdf' });

    const res = (await invoke('data:getModuleItems')) as Array<{
      title: string;
      hasLocalContent: boolean;
    }>;
    expect(res).toHaveLength(1);
    expect(res[0].title).toBe('Lecture');
    expect(res[0].hasLocalContent).toBe(true);
  });

  test('data:getModuleItems returns empty when no visible courses', async () => {
    oracle.setTermSelection('all');
    db.executeWrite('UPDATE courses SET is_hidden = 1 WHERE id = 1', [], 'courses');
    expect(await invoke('data:getModuleItems')).toEqual([]);
  });

  // --- data:getFileReferences -----------------------------------------------

  test('data:getFileReferences returns refs with linked attachment', async () => {
    seedNotification(100);
    seedAttachment({ id: 5, notifId: 100 });
    db.executeWrite(
      `INSERT INTO announcement_file_references
         (id, notification_id, attachment_id, start_position, end_position, matched_text)
       VALUES (1, 100, 5, 0, 10, 'see file.pdf')`,
      [],
      'announcement_file_references'
    );
    const res = (await invoke('data:getFileReferences', 100)) as Array<{
      matchedText: string;
      attachment?: { id: number };
    }>;
    expect(res).toHaveLength(1);
    expect(res[0].matchedText).toBe('see file.pdf');
    expect(res[0].attachment?.id).toBe(5);
  });

  // --- data:getResourceCanvasUrl --------------------------------------------

  describe('data:getResourceCanvasUrl', () => {
    test('no canvas client → error', async () => {
      canvasClient = null;
      const res = (await invoke('data:getResourceCanvasUrl', 10, 'resource')) as {
        success: boolean;
      };
      expect(res.success).toBe(false);
    });

    test('resource: builds a /files/ URL', async () => {
      seedResource({ id: 10, externalId: 'file-1' });
      const res = (await invoke('data:getResourceCanvasUrl', 10, 'resource')) as {
        success: boolean;
        data: { canvasUrl: string };
      };
      expect(res.success).toBe(true);
      expect(res.data.canvasUrl).toBe(
        'https://canvas.example.com/courses/4242/files/file-1?wrap=1'
      );
    });

    test('resource: html-page external_id resolves the slug', async () => {
      seedResource({ id: 11, externalId: 'html-page-mypage' });
      db.executeWrite(
        `INSERT INTO course_pages (id, external_id, course_id, page_type, title, url_slug)
         VALUES (50, 'mypage', 1, 'content', 'My Page', 'my-page')`,
        [],
        'course_pages'
      );
      const res = (await invoke('data:getResourceCanvasUrl', 11, 'resource')) as {
        data: { canvasUrl: string };
      };
      expect(res.data.canvasUrl).toBe(
        'https://canvas.example.com/courses/4242/pages/my-page'
      );
    });

    test('attachment: builds a /files/ URL', async () => {
      seedNotification(100);
      seedAttachment({ id: 5, notifId: 100 });
      const res = (await invoke('data:getResourceCanvasUrl', 5, 'attachment')) as {
        data: { canvasUrl: string };
      };
      expect(res.data.canvasUrl).toBe(
        'https://canvas.example.com/courses/4242/files/att-5?wrap=1'
      );
    });

    test('resource not found', async () => {
      const res = (await invoke('data:getResourceCanvasUrl', 999, 'resource')) as {
        success: boolean;
        error: string;
      };
      expect(res).toMatchObject({ success: false, error: 'Resource not found' });
    });
  });

  // --- data:getTaskCanvasUrl ------------------------------------------------

  describe('data:getTaskCanvasUrl', () => {
    test('builds an /assignments/ URL', async () => {
      db.executeWrite(
        `INSERT INTO tasks (id, external_id, course_id, title) VALUES (200, 'asg-1', 1, 'HW')`,
        [],
        'tasks'
      );
      const res = (await invoke('data:getTaskCanvasUrl', 200)) as {
        success: boolean;
        data: { canvasUrl: string };
      };
      expect(res.success).toBe(true);
      expect(res.data.canvasUrl).toBe(
        'https://canvas.example.com/courses/4242/assignments/asg-1'
      );
    });

    test('task not found', async () => {
      expect(await invoke('data:getTaskCanvasUrl', 999)).toMatchObject({
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
