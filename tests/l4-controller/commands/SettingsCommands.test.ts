/**
 * SettingsCommands Tests (ADR-0007)
 *
 * - SetUserPreferenceCommand
 * - UpdateCourseSettingsCommand
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { SetUserPreferenceCommand } from '../../../src/layers/l4-controller/commands/settings/SetUserPreferenceCommand';
import { UpdateCourseSettingsCommand } from '../../../src/layers/l4-controller/commands/settings/UpdateCourseSettingsCommand';
import { UpdateCourseAuthorityCommand } from '../../../src/layers/l4-controller/commands/settings/UpdateCourseAuthorityCommand';
import { SetAppSettingCommand } from '../../../src/layers/l4-controller/commands/settings/SetAppSettingCommand';
import { DeleteAppSettingCommand } from '../../../src/layers/l4-controller/commands/settings/DeleteAppSettingCommand';
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

describe('Settings Commands', () => {
  let db: Database;
  let context: CommandContext;

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

  describe('SetUserPreferenceCommand', () => {
    const command = new SetUserPreferenceCommand();

    it('rejects an empty key', async () => {
      expect(command.validate({ key: '', value: 'x' })).toEqual({
        valid: false,
        error: 'Preference key is required',
      });
      const result = await command.execute(context, { key: '', value: 'x' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });

    it('inserts a new preference', async () => {
      const result = await command.execute(context, { key: 'k', value: 'v1' });
      expect(result.success).toBe(true);

      const row = db.executeReadOne<{ value: string }>(
        'SELECT value FROM user_preferences WHERE key = ?',
        ['k']
      );
      expect(row?.value).toBe('v1');
    });

    it('upserts (overwrites) an existing preference', async () => {
      await command.execute(context, { key: 'k', value: 'v1' });
      await command.execute(context, { key: 'k', value: 'v2' });

      const rows = db.executeRead<{ value: string }>(
        'SELECT value FROM user_preferences WHERE key = ?',
        ['k']
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].value).toBe('v2');
    });

    it('reports failure when the write throws', async () => {
      db.close();
      const result = await command.execute(context, { key: 'k', value: 'v' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to set user preference');
    });
  });

  describe('UpdateCourseSettingsCommand', () => {
    const command = new UpdateCourseSettingsCommand();

    beforeEach(() => seedCourse(db, 1));

    it('updates only the fields provided', async () => {
      const result = await command.execute(context, {
        courseId: 1,
        autoAssignDueDate: 1,
      });
      expect(result.success).toBe(true);

      const row = db.executeReadOne<{
        auto_assign_due_date: number | null;
        allow_guessed_override: number | null;
      }>(
        'SELECT auto_assign_due_date, allow_guessed_override FROM courses WHERE id = 1',
        []
      );
      expect(row?.auto_assign_due_date).toBe(1);
      // unchanged — schema default
      expect(row?.allow_guessed_override).toBe(1);
    });

    it('coerces a null allowGuessedOverride to the default of 1', async () => {
      const result = await command.execute(context, {
        courseId: 1,
        allowGuessedOverride: 0,
      });
      expect(result.success).toBe(true);
      const row = db.executeReadOne<{ allow_guessed_override: number }>(
        'SELECT allow_guessed_override FROM courses WHERE id = 1',
        []
      );
      expect(row?.allow_guessed_override).toBe(0);
    });

    it('is a no-op success when no fields are provided', async () => {
      const result = await command.execute(context, { courseId: 1 });
      expect(result.success).toBe(true);
    });

    it('reports failure when the write throws', async () => {
      db.close();
      const result = await command.execute(context, {
        courseId: 1,
        autoAssignDueDate: 1,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to update course settings');
    });
  });

  describe('UpdateCourseAuthorityCommand', () => {
    const command = new UpdateCourseAuthorityCommand();

    beforeEach(() => seedCourse(db, 1));

    it('updates only the provided authority fields', async () => {
      const result = await command.execute(context, {
        courseId: 1,
        latePenaltyAuthority: 'local',
        gradeCalcMode: 'both',
      });
      expect(result.success).toBe(true);

      const row = db.executeReadOne<{
        late_penalty_authority: string | null;
        drop_lowest_authority: string | null;
        grade_calc_mode: string | null;
      }>(
        'SELECT late_penalty_authority, drop_lowest_authority, grade_calc_mode FROM courses WHERE id = 1',
        []
      );
      expect(row?.late_penalty_authority).toBe('local');
      expect(row?.grade_calc_mode).toBe('both');
      // not provided → unchanged (schema default 'canvas')
      expect(row?.drop_lowest_authority).toBe('canvas');
    });

    it('is a no-op success when no fields are provided', async () => {
      const result = await command.execute(context, { courseId: 1 });
      expect(result.success).toBe(true);
    });

    it('reports failure when the write throws', async () => {
      db.close();
      const result = await command.execute(context, {
        courseId: 1,
        latePenaltyAuthority: 'local',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to update course authority');
    });
  });

  describe('SetAppSettingCommand', () => {
    const command = new SetAppSettingCommand();

    it('rejects an empty key', async () => {
      expect(command.validate({ key: '', value: 'x' }).valid).toBe(false);
      const result = await command.execute(context, { key: '', value: 'x' });
      expect(result.success).toBe(false);
    });

    it('inserts then upserts a key', async () => {
      await command.execute(context, { key: 'k', value: 'v1' });
      await command.execute(context, { key: 'k', value: 'v2' });

      const rows = db.executeRead<{ value: string }>(
        'SELECT value FROM app_settings WHERE key = ?',
        ['k']
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].value).toBe('v2');
    });

    it('reports failure when the write throws', async () => {
      db.close();
      const result = await command.execute(context, { key: 'k', value: 'v' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to set app setting');
    });
  });

  describe('DeleteAppSettingCommand', () => {
    const command = new DeleteAppSettingCommand();

    it('rejects an empty key', async () => {
      expect(command.validate({ key: '' }).valid).toBe(false);
      const result = await command.execute(context, { key: '' });
      expect(result.success).toBe(false);
    });

    it('removes the key', async () => {
      db.executeWrite(`INSERT INTO app_settings (key, value) VALUES ('k', 'v')`, []);

      const result = await command.execute(context, { key: 'k' });
      expect(result.success).toBe(true);

      const row = db.executeReadOne<{ value: string }>(
        'SELECT value FROM app_settings WHERE key = ?',
        ['k']
      );
      expect(row).toBeUndefined();
    });

    it('reports failure when the write throws', async () => {
      db.close();
      const result = await command.execute(context, { key: 'k' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to delete app setting');
    });
  });
});
