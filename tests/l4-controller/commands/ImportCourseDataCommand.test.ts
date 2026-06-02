/**
 * ImportCourseDataCommand tests (ADR-0007).
 *
 * Exercises the full import pipeline: per-entity upserts + old→new id
 * remapping, the skip-if-dependency-missing branches, payload validation,
 * and the write-failure path.
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { ImportCourseDataCommand } from '../../../src/layers/l4-controller/commands/export/ImportCourseDataCommand';
import {
  CommandContext,
  createSimulationContext,
} from '../../../src/layers/l4-controller/types';

describe('ImportCourseDataCommand', () => {
  let db: Database;
  let context: CommandContext;
  const command = new ImportCourseDataCommand();

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

  it('rejects a payload missing version or courses', async () => {
    expect((await command.execute(context, { importData: {} })).success).toBe(false);
    const res = await command.execute(context, { importData: { version: '1.1' } });
    expect(res.success).toBe(false);
    expect(res.error).toContain('Invalid export file format');
  });

  it('imports a full payload and remaps foreign keys', async () => {
    const importData = {
      version: '1.1',
      courses: [{ id: 100, externalId: 'c_ext_1', code: 'CS101', name: 'Intro' }],
      tasks: [
        { id: 200, external_id: 't_ext_1', course_id: 100, title: 'HW1', weight: 10 },
      ],
      notifications: [
        {
          source_id: 'n1',
          source_type: 'canvas',
          course_id: 100,
          title: 'N',
          message: 'm',
          published_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      pages: [
        { external_id: 'p1', course_id: 100, title: 'Page', body_html: '<p>x</p>' },
      ],
      policies: [{ id: 300, course_id: 100, policy_type: 'late', policy_name: 'Late' }],
      resources: [
        { id: 400, external_id: 'r1', course_id: 100, type: 'file', title: 'F' },
      ],
      syllabuses: [{ course_id: 100, resource_id: 400, source_type: 'resource' }],
    };

    const res = await command.execute(context, { importData });

    expect(res.success).toBe(true);
    expect(res.data).toMatchObject({
      coursesImported: 1,
      tasksImported: 1,
      notificationsImported: 1,
      pagesImported: 1,
      policiesImported: 1,
      resourcesImported: 1,
      syllabusesImported: 1,
    });

    // Course got a fresh autoincrement id; the task should point at it.
    const course = db.executeReadOne<{ id: number }>(
      'SELECT id FROM courses WHERE external_id = ?',
      ['c_ext_1']
    );
    const task = db.executeReadOne<{ course_id: number }>(
      'SELECT course_id FROM tasks WHERE external_id = ?',
      ['t_ext_1']
    );
    expect(task?.course_id).toBe(course?.id);
  });

  it('skips entities whose dependencies are missing', async () => {
    const importData = {
      version: '1.1',
      courses: [{ id: 1, externalId: 'c1', code: 'C', name: 'C' }],
      // null course_id → mapCourseId returns null → skipped
      tasks: [{ id: 2, external_id: 't_skip', course_id: null, title: 'orphan' }],
      pages: [{ external_id: 'p_skip', course_id: null, title: 'orphan' }],
      policies: [{ id: 3, course_id: null, policy_type: 'x' }],
      resources: [{ id: 4, external_id: 'r_skip', course_id: null, type: 'file' }],
      // resource_id 999 was never imported → skipped
      syllabuses: [{ course_id: 1, resource_id: 999 }],
    };

    const res = await command.execute(context, { importData });

    expect(res.success).toBe(true);
    expect(res.data).toMatchObject({
      coursesImported: 1,
      tasksImported: 0,
      pagesImported: 0,
      policiesImported: 0,
      resourcesImported: 0,
      syllabusesImported: 0,
    });
  });

  it('reports failure when a write throws', async () => {
    db.close();
    const res = await command.execute(context, {
      importData: {
        version: '1.1',
        courses: [{ externalId: 'c', code: 'C', name: 'C' }],
      },
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain('Failed to import course data');
  });
});
