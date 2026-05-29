/**
 * LinkCommands Tests (ADR-0007)
 *
 * Tests for L4 task-linking commands:
 * - AcceptLinkSuggestionCommand
 * - RejectLinkSuggestionCommand
 * - ManuallyLinkTasksCommand
 * - UnlinkTasksCommand
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { AcceptLinkSuggestionCommand } from '../../../src/layers/l4-controller/commands/link/AcceptLinkSuggestionCommand';
import { RejectLinkSuggestionCommand } from '../../../src/layers/l4-controller/commands/link/RejectLinkSuggestionCommand';
import { ManuallyLinkTasksCommand } from '../../../src/layers/l4-controller/commands/link/ManuallyLinkTasksCommand';
import { UnlinkTasksCommand } from '../../../src/layers/l4-controller/commands/link/UnlinkTasksCommand';
import {
  CommandContext,
  createSimulationContext,
} from '../../../src/layers/l4-controller/types';

let extCounter = 1;

function seedCourse(db: Database, id: number): void {
  db.executeWrite(
    `INSERT INTO courses (id, external_id, code, name, is_hidden, target_grade)
     VALUES (?, ?, ?, ?, 0, 85)`,
    [id, `ext_${id}`, `C${id}`, `Course ${id}`]
  );
}

function seedTask(
  db: Database,
  opts: {
    courseId: number;
    title: string;
    sourceType?: 'canvas' | 'user';
    externalId?: string | null;
    weight?: number | null;
    notes?: string | null;
    linkedFrom?: string | null;
    deletedAt?: string | null;
    mergedInto?: number | null;
  }
): number {
  const externalId =
    opts.externalId === undefined ? `ext_${extCounter++}` : opts.externalId;
  const result = db.executeWrite(
    `INSERT INTO tasks (course_id, external_id, source_type, title, weight, notes, linked_from_user_task, deleted_at, merged_into_task_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      opts.courseId,
      externalId,
      opts.sourceType ?? 'user',
      opts.title,
      opts.weight ?? null,
      opts.notes ?? null,
      opts.linkedFrom ?? null,
      opts.deletedAt ?? null,
      opts.mergedInto ?? null,
    ]
  );
  return Number(result.lastInsertRowid);
}

function seedSuggestion(
  db: Database,
  opts: { userTaskId: number; canvasTaskId: number; confidence?: number }
): number {
  const result = db.executeWrite(
    `INSERT INTO link_suggestions (user_task_id, canvas_task_id, confidence, status, created_at)
     VALUES (?, ?, ?, 'pending', '2026-01-01T00:00:00.000Z')`,
    [opts.userTaskId, opts.canvasTaskId, opts.confidence ?? 0.8]
  );
  return Number(result.lastInsertRowid);
}

describe('Link Commands', () => {
  let db: Database;
  let context: CommandContext;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    seedCourse(db, 1);
    context = { db, simulationContext: createSimulationContext() };
  });

  afterEach(() => {
    db.close();
  });

  describe('AcceptLinkSuggestionCommand', () => {
    const command = new AcceptLinkSuggestionCommand();

    it('links the Canvas task, soft-deletes the user task, marks accepted', async () => {
      const userTask = seedTask(db, {
        courseId: 1,
        title: 'mine',
        sourceType: 'user',
        externalId: 'user_ext_1',
        weight: 25,
        notes: 'my notes',
      });
      const canvasTask = seedTask(db, {
        courseId: 1,
        title: 'canvas',
        sourceType: 'canvas',
      });
      const suggestionId = seedSuggestion(db, {
        userTaskId: userTask,
        canvasTaskId: canvasTask,
        confidence: 0.9,
      });

      const result = await command.execute(context, { suggestionId });

      expect(result.success).toBe(true);
      expect(result.data?.canvasTaskId).toBe(canvasTask);

      const canvasRow = db.executeReadOne<{
        linked_from_user_task: string;
        link_method: string;
        weight: number;
        notes: string;
      }>(
        'SELECT linked_from_user_task, link_method, weight, notes FROM tasks WHERE id = ?',
        [canvasTask]
      );
      expect(canvasRow?.linked_from_user_task).toBe('user_ext_1');
      expect(canvasRow?.link_method).toBe('suggested');
      expect(canvasRow?.weight).toBe(25);
      expect(canvasRow?.notes).toBe('my notes');

      const userRow = db.executeReadOne<{
        deleted_at: string | null;
        merged_into_task_id: number | null;
      }>('SELECT deleted_at, merged_into_task_id FROM tasks WHERE id = ?', [userTask]);
      expect(userRow?.deleted_at).not.toBeNull();
      expect(userRow?.merged_into_task_id).toBe(canvasTask);

      const sugg = db.executeReadOne<{ status: string }>(
        'SELECT status FROM link_suggestions WHERE id = ?',
        [suggestionId]
      );
      expect(sugg?.status).toBe('accepted');
    });

    it('fails when the suggestion is missing', async () => {
      const result = await command.execute(context, { suggestionId: 9999 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Suggestion not found');
    });

    it('fails when the user task is missing', async () => {
      const userTask = seedTask(db, {
        courseId: 1,
        title: 'mine',
        sourceType: 'user',
      });
      const canvasTask = seedTask(db, {
        courseId: 1,
        title: 'canvas',
        sourceType: 'canvas',
      });
      const suggestionId = seedSuggestion(db, {
        userTaskId: userTask,
        canvasTaskId: canvasTask,
      });
      // Orphan the suggestion: hard-delete the user task with FK enforcement
      // off so the ON DELETE CASCADE doesn't also remove the suggestion. This
      // reproduces the defensive "user task not found" state.
      db.executeWrite('PRAGMA foreign_keys = OFF');
      db.executeWrite('DELETE FROM tasks WHERE id = ?', [userTask]);
      db.executeWrite('PRAGMA foreign_keys = ON');

      const result = await command.execute(context, { suggestionId });
      expect(result.success).toBe(false);
      expect(result.error).toContain('User task not found');
    });

    it('reports failure when the write throws', async () => {
      const userTask = seedTask(db, {
        courseId: 1,
        title: 'mine',
        sourceType: 'user',
        externalId: 'user_ext_1',
      });
      const canvasTask = seedTask(db, {
        courseId: 1,
        title: 'canvas',
        sourceType: 'canvas',
      });
      const suggestionId = seedSuggestion(db, {
        userTaskId: userTask,
        canvasTaskId: canvasTask,
      });
      db.close();

      const result = await command.execute(context, { suggestionId });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to accept link suggestion');
    });
  });

  describe('RejectLinkSuggestionCommand', () => {
    const command = new RejectLinkSuggestionCommand();

    it('marks the suggestion rejected', async () => {
      const userTask = seedTask(db, { courseId: 1, title: 'mine', sourceType: 'user' });
      const canvasTask = seedTask(db, {
        courseId: 1,
        title: 'canvas',
        sourceType: 'canvas',
      });
      const suggestionId = seedSuggestion(db, {
        userTaskId: userTask,
        canvasTaskId: canvasTask,
      });

      const result = await command.execute(context, { suggestionId });

      expect(result.success).toBe(true);
      const sugg = db.executeReadOne<{ status: string }>(
        'SELECT status FROM link_suggestions WHERE id = ?',
        [suggestionId]
      );
      expect(sugg?.status).toBe('rejected');
    });

    it('reports failure when the write throws', async () => {
      db.close();
      const result = await command.execute(context, { suggestionId: 1 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to reject link suggestion');
    });
  });

  describe('ManuallyLinkTasksCommand', () => {
    const command = new ManuallyLinkTasksCommand();

    it('links a user task to a Canvas task and dismisses pending suggestions', async () => {
      const userTask = seedTask(db, {
        courseId: 1,
        title: 'mine',
        sourceType: 'user',
        externalId: 'user_ext_5',
        weight: 10,
      });
      const canvasTask = seedTask(db, {
        courseId: 1,
        title: 'canvas',
        sourceType: 'canvas',
      });
      const suggestionId = seedSuggestion(db, {
        userTaskId: userTask,
        canvasTaskId: canvasTask,
      });

      const result = await command.execute(context, {
        userTaskId: userTask,
        canvasTaskId: canvasTask,
      });

      expect(result.success).toBe(true);
      expect(result.data?.canvasTaskId).toBe(canvasTask);

      const canvasRow = db.executeReadOne<{
        linked_from_user_task: string;
        link_method: string;
      }>('SELECT linked_from_user_task, link_method FROM tasks WHERE id = ?', [
        canvasTask,
      ]);
      expect(canvasRow?.linked_from_user_task).toBe('user_ext_5');
      expect(canvasRow?.link_method).toBe('manual');

      const sugg = db.executeReadOne<{ status: string }>(
        'SELECT status FROM link_suggestions WHERE id = ?',
        [suggestionId]
      );
      expect(sugg?.status).toBe('dismissed');
    });

    it('fails when a task is missing', async () => {
      const result = await command.execute(context, { userTaskId: 1, canvasTaskId: 2 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Task not found');
    });

    it('rejects linking a non-user source task', async () => {
      const a = seedTask(db, { courseId: 1, title: 'a', sourceType: 'canvas' });
      const b = seedTask(db, { courseId: 1, title: 'b', sourceType: 'canvas' });
      const result = await command.execute(context, { userTaskId: a, canvasTaskId: b });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Can only link user-created tasks');
    });

    it('rejects a non-Canvas target', async () => {
      const a = seedTask(db, { courseId: 1, title: 'a', sourceType: 'user' });
      const b = seedTask(db, { courseId: 1, title: 'b', sourceType: 'user' });
      const result = await command.execute(context, { userTaskId: a, canvasTaskId: b });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Target must be a Canvas task');
    });

    it('rejects a Canvas task that is already linked', async () => {
      const user = seedTask(db, { courseId: 1, title: 'u', sourceType: 'user' });
      const canvas = seedTask(db, {
        courseId: 1,
        title: 'c',
        sourceType: 'canvas',
        linkedFrom: 'someone_else',
      });
      const result = await command.execute(context, {
        userTaskId: user,
        canvasTaskId: canvas,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('already linked');
    });

    it('reports failure when the write throws', async () => {
      const user = seedTask(db, { courseId: 1, title: 'u', sourceType: 'user' });
      const canvas = seedTask(db, { courseId: 1, title: 'c', sourceType: 'canvas' });
      db.close();
      const result = await command.execute(context, {
        userTaskId: user,
        canvasTaskId: canvas,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to manually link tasks');
    });
  });

  describe('UnlinkTasksCommand', () => {
    const command = new UnlinkTasksCommand();

    it('restores the user task and strips link metadata', async () => {
      const canvasTask = seedTask(db, {
        courseId: 1,
        title: 'canvas',
        sourceType: 'canvas',
        linkedFrom: 'user_ext_9',
      });
      const userTask = seedTask(db, {
        courseId: 1,
        title: 'mine',
        sourceType: 'user',
        externalId: 'user_ext_9',
        deletedAt: '2026-01-01',
        mergedInto: canvasTask,
      });

      const result = await command.execute(context, { canvasTaskId: canvasTask });

      expect(result.success).toBe(true);

      const userRow = db.executeReadOne<{
        deleted_at: string | null;
        merged_into_task_id: number | null;
      }>('SELECT deleted_at, merged_into_task_id FROM tasks WHERE id = ?', [userTask]);
      expect(userRow?.deleted_at).toBeNull();
      expect(userRow?.merged_into_task_id).toBeNull();

      const canvasRow = db.executeReadOne<{ linked_from_user_task: string | null }>(
        'SELECT linked_from_user_task FROM tasks WHERE id = ?',
        [canvasTask]
      );
      expect(canvasRow?.linked_from_user_task).toBeNull();
    });

    it('strips the link even when the user task cannot be found', async () => {
      const canvasTask = seedTask(db, {
        courseId: 1,
        title: 'canvas',
        sourceType: 'canvas',
        linkedFrom: 'orphan_ext',
      });

      const result = await command.execute(context, { canvasTaskId: canvasTask });

      expect(result.success).toBe(true);
      const canvasRow = db.executeReadOne<{ linked_from_user_task: string | null }>(
        'SELECT linked_from_user_task FROM tasks WHERE id = ?',
        [canvasTask]
      );
      expect(canvasRow?.linked_from_user_task).toBeNull();
    });

    it('fails when the Canvas task has no link', async () => {
      const canvasTask = seedTask(db, {
        courseId: 1,
        title: 'canvas',
        sourceType: 'canvas',
      });
      const result = await command.execute(context, { canvasTaskId: canvasTask });
      expect(result.success).toBe(false);
      expect(result.error).toContain('No link found');
    });
  });
});
