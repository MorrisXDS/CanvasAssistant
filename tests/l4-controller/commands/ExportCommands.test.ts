/**
 * ExportCommands Tests (ADR-0007)
 *
 * - RecordExportHistoryCommand
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { RecordExportHistoryCommand } from '../../../src/layers/l4-controller/commands/export/RecordExportHistoryCommand';
import { UpsertHtmlExportCommand } from '../../../src/layers/l4-controller/commands/export/UpsertHtmlExportCommand';
import {
  CommandContext,
  createSimulationContext,
} from '../../../src/layers/l4-controller/types';

function seedCourse(db: Database, id: number): void {
  db.executeWrite(
    `INSERT INTO courses (id, external_id, code, name, target_grade) VALUES (?, ?, ?, ?, 85)`,
    [id, `ext_${id}`, `C${id}`, `Course ${id}`]
  );
}

describe('RecordExportHistoryCommand', () => {
  let db: Database;
  let context: CommandContext;
  const command = new RecordExportHistoryCommand();

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    context = { db, simulationContext: createSimulationContext() };
  });

  afterEach(() => {
    db.close();
  });

  it('inserts a row with the provided fields and returns its id', async () => {
    const result = await command.execute(context, {
      exportType: 'csv',
      filePath: '/tmp/out.csv',
      fileSize: 1234,
      tasksExported: 7,
    });

    expect(result.success).toBe(true);
    expect(result.data?.id).toBeGreaterThan(0);

    const row = db.executeReadOne<{
      export_type: string;
      file_path: string;
      file_size: number;
      tasks_exported: number;
      status: string;
    }>('SELECT * FROM export_history WHERE id = ?', [result.data!.id]);
    expect(row).toMatchObject({
      export_type: 'csv',
      file_path: '/tmp/out.csv',
      file_size: 1234,
      tasks_exported: 7,
      status: 'completed',
    });
  });

  it('persists the full column set (encrypted, courses, files, error)', async () => {
    const result = await command.execute(context, {
      exportType: 'selective',
      filePath: '/tmp/x.cbk',
      fileSize: 9,
      encrypted: true,
      coursesIncluded: [3, 7],
      tasksExported: 2,
      filesExported: 5,
      status: 'failed',
      errorMessage: 'boom',
    });
    expect(result.success).toBe(true);

    const row = db.executeReadOne<{
      encrypted: number;
      courses_included: string;
      files_exported: number;
      status: string;
      error_message: string;
    }>('SELECT * FROM export_history WHERE id = ?', [result.data!.id]);
    expect(row).toMatchObject({
      encrypted: 1,
      courses_included: '[3,7]',
      files_exported: 5,
      status: 'failed',
      error_message: 'boom',
    });
  });

  it('applies defaults for omitted optional fields', async () => {
    const result = await command.execute(context, { exportType: 'full' });
    expect(result.success).toBe(true);

    const row = db.executeReadOne<{
      file_path: string | null;
      file_size: number;
      tasks_exported: number;
      status: string;
    }>('SELECT * FROM export_history WHERE id = ?', [result.data!.id]);
    expect(row).toMatchObject({
      file_path: null,
      file_size: 0,
      tasks_exported: 0,
      status: 'completed',
    });
  });

  it('reports failure when the write throws', async () => {
    db.close();
    const result = await command.execute(context, { exportType: 'csv' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to record export history');
  });
});

describe('UpsertHtmlExportCommand', () => {
  let db: Database;
  let context: CommandContext;
  const command = new UpsertHtmlExportCommand();

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    context = { db, simulationContext: createSimulationContext() };
    seedCourse(db, 1);
  });

  afterEach(() => {
    db.close();
  });

  it('inserts a new export row', async () => {
    const result = await command.execute(context, {
      courseId: 1,
      sourceType: 'page',
      sourceId: '42',
      title: 'Week 1',
      contentHash: 'abc',
      localPath: '/files/w1.html',
    });
    expect(result.success).toBe(true);

    const row = db.executeReadOne<{ title: string; local_path: string }>(
      'SELECT title, local_path FROM html_exports WHERE course_id = 1 AND source_type = ? AND source_id = ?',
      ['page', '42']
    );
    expect(row).toMatchObject({ title: 'Week 1', local_path: '/files/w1.html' });
  });

  it('updates on conflict (same course/type/id) without duplicating', async () => {
    const base = {
      courseId: 1,
      sourceType: 'page',
      sourceId: '42',
      contentHash: 'h1',
      localPath: '/files/old.html',
      title: 'Old',
    };
    await command.execute(context, base);
    await command.execute(context, {
      ...base,
      title: 'New',
      contentHash: 'h2',
      localPath: '/files/new.html',
    });

    const rows = db.executeRead<{ title: string; local_path: string }>(
      'SELECT title, local_path FROM html_exports WHERE course_id = 1',
      []
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: 'New', local_path: '/files/new.html' });
  });

  it('reports failure when the write throws', async () => {
    db.close();
    const result = await command.execute(context, {
      courseId: 1,
      sourceType: 'page',
      sourceId: '1',
      title: 't',
      contentHash: 'h',
      localPath: '/p',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to record HTML export');
  });
});
