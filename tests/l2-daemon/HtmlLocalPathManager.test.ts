/**
 * HtmlLocalPathManager — autoRegenerate fork (A5, Batch 2 of the settings sweep).
 *
 * Covers the `localHtmlPaths.autoRegenerate` setting's two behavioral forks:
 *   - handleFileDeleted (line 331): `if (!this.config.autoRegenerate) return;`
 *   - handleFileAdded   (line 352): `if (!this.config.autoRegenerate) return;`
 *
 * When autoRegenerate is OFF, both methods return immediately and emit NOTHING.
 * When ON, they proceed to findAffectedHtmls and emit the dependency-changed
 * event (with an empty affected list when no resource matches the path — which
 * is the deterministic, IO-free case used here: empty DB → no file IO, no
 * chokidar, no regeneration writes). The constructor is cleanly injectable
 * (db, config), so no production seam is needed.
 *
 * Native ABI: Node (npm test pretest). In-memory better-sqlite3 only.
 */

import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';
import { HtmlLocalPathManager } from '../../src/layers/l2-daemon/html/HtmlLocalPathManager';

describe('HtmlLocalPathManager — autoRegenerate fork', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
  });

  afterEach(() => {
    db.close();
  });

  function makeManager(autoRegenerate: boolean): HtmlLocalPathManager {
    return new HtmlLocalPathManager(db, {
      filesBaseDir: '/tmp/cid-test-files',
      autoRegenerate,
      canvasBaseUrl: 'https://canvas.example.com',
    });
  }

  describe('handleFileDeleted', () => {
    it('autoRegenerate:false → returns early, emits nothing', async () => {
      const manager = makeManager(false);
      const onDeleted = jest.fn();
      manager.on('dependency-deleted', onDeleted);

      await manager.handleFileDeleted('/tmp/cid-test-files/CS101/Pages/x_files/img.png');

      // Backwards-wiring guard: the regen path must NOT run when the setting is off.
      expect(onDeleted).not.toHaveBeenCalled();
    });

    it('autoRegenerate:true → proceeds, emits dependency-deleted', async () => {
      const manager = makeManager(true);
      const onDeleted = jest.fn();
      manager.on('dependency-deleted', onDeleted);

      // No resource matches the path → empty affected list, but the method still
      // runs to completion and emits (proving the early-return did NOT fire).
      await manager.handleFileDeleted('/tmp/cid-test-files/CS101/Pages/x_files/img.png');

      expect(onDeleted).toHaveBeenCalledTimes(1);
      expect(onDeleted).toHaveBeenCalledWith(
        expect.objectContaining({ affectedHtmls: [] })
      );
    });
  });

  describe('handleFileAdded', () => {
    it('autoRegenerate:false → returns early, emits nothing, no DB write', async () => {
      const manager = makeManager(false);
      const onAdded = jest.fn();
      manager.on('dependency-added', onAdded);
      const writeSpy = jest.spyOn(db, 'executeWrite');

      await manager.handleFileAdded(
        '/tmp/cid-test-files/CS101/Pages/x_files/img.png',
        42
      );

      // Backwards-wiring guard: neither the resource local_path write nor the
      // emit happens when the setting is off.
      expect(onAdded).not.toHaveBeenCalled();
      expect(writeSpy).not.toHaveBeenCalled();
    });

    it('autoRegenerate:true → proceeds, emits dependency-added', async () => {
      const manager = makeManager(true);
      const onAdded = jest.fn();
      manager.on('dependency-added', onAdded);

      await manager.handleFileAdded('/tmp/cid-test-files/CS101/Pages/x_files/img.png');

      expect(onAdded).toHaveBeenCalledTimes(1);
      expect(onAdded).toHaveBeenCalledWith(
        expect.objectContaining({ affectedHtmls: [] })
      );
    });
  });
});
