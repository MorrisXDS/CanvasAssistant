/**
 * Regression: a non-writable downloads directory must NOT crash app startup.
 *
 * On Linux a packaged install dir is /opt/<App> (root-owned). Before the fix,
 * `new FileDownloadManager({ baseDir })` called `ensureBaseDirExists()` in the
 * constructor, which threw EACCES and took the whole main process down at launch.
 * The constructor now swallows + logs the error and re-attempts lazily per
 * download. (The path itself is also fixed in appPaths.ts FILES_DIR.)
 */

jest.mock('../../src/layers/l0-utilities/DefaultPaths', () => ({
  ...jest.requireActual('../../src/layers/l0-utilities/DefaultPaths'),
  ensureDirectory: jest.fn(() => {
    throw new Error('EACCES: permission denied, mkdir /opt/Canvas Assistant/Downloads');
  }),
}));

import { FileDownloadManager } from '../../src/layers/l0-utilities/FileDownloadManager';

describe('FileDownloadManager — non-writable downloads dir at startup', () => {
  it('does not throw at construction when the base dir cannot be created', () => {
    const warn = jest.fn();
    expect(
      () =>
        new FileDownloadManager({
          baseDir: '/opt/Canvas Assistant/Downloads',
          // minimal logger stub with the warn() the constructor calls on failure
          logger: { warn } as unknown as ConstructorParameters<
            typeof FileDownloadManager
          >[0]['logger'],
        })
    ).not.toThrow();
    // It logs a warning instead of crashing.
    expect(warn).toHaveBeenCalled();
  });

  it('constructs without a logger and still does not throw on an unwritable dir', () => {
    expect(
      () => new FileDownloadManager({ baseDir: '/opt/Canvas Assistant/Downloads' })
    ).not.toThrow();
  });
});
