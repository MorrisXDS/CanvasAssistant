/**
 * credentialHandlers — `auth:getStatus` delegation test (ADR-0013 / ADR-0007).
 *
 * Verifies that:
 * - `auth:getStatus` delegates to `credentialManager.exists()` +
 *   `credentialManager.getStatus()` and returns the
 *   `{ hasCredential, validity, lastCheckedAt }` shape.
 * - `null` validity (never validated) maps to `'unknown'`.
 * - No database access occurs (credentials live in keychain / file; the
 *   ADR-0007 hard-zero SQL gate is satisfied trivially).
 *
 * `electron` is mocked BEFORE importing the handler (known train gotcha:
 * importing the handler transitively pulls in `ipcMain`).
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
import { registerCredentialHandlers } from '../../src/lifecycle/ipc-handlers/credentialHandlers';
import type { IpcContext } from '../../src/lifecycle/ipc-handlers/IpcContext';
import type { CredentialManager } from '../../src/layers/l0-utilities/CredentialManager';

interface IpcMainMock {
  __getHandler: (channel: string) => ((...args: unknown[]) => unknown) | undefined;
  __reset: () => void;
}

const mockIpc = ipcMain as unknown as IpcMainMock;

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = mockIpc.__getHandler(channel);
  if (!handler) throw new Error(`No handler registered for ${channel}`);
  return Promise.resolve(handler({} as unknown, ...args));
}

const noopLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: () => noopLogger,
};

// A database stub that throws on ANY access — proves the handler doesn't touch it.
const databaseTrap = new Proxy(
  {},
  {
    get(_t, prop) {
      throw new Error(
        `auth:getStatus must not access the database (accessed .${String(prop)})`
      );
    },
  }
);

function buildCtx(credentialManager: CredentialManager): IpcContext {
  const unused = (name: string) => () => {
    throw new Error(`IpcContext.${name} should not be called by these tests`);
  };
  // Only the getters used during registration / by auth:getStatus are real.
  return {
    getDatabase: () => databaseTrap as never,
    getLogger: () => noopLogger as unknown as ReturnType<IpcContext['getLogger']>,
    getMetricsCollector: () =>
      ({ increment: jest.fn() }) as unknown as ReturnType<
        IpcContext['getMetricsCollector']
      >,
    getCredentialManager: () => credentialManager,
    getCanvasClient: () => null,
    clearCanvasClient: () => {},
    initializeCanvasClient: (() =>
      Promise.resolve(false)) as IpcContext['initializeCanvasClient'],
    getConfigDir: () => '/tmp/config',
    getMainWindow: () => null,
    getVisibilityOracle: unused(
      'getVisibilityOracle'
    ) as IpcContext['getVisibilityOracle'],
    getFileEntityProvider: unused(
      'getFileEntityProvider'
    ) as IpcContext['getFileEntityProvider'],
    getUpdateChecker: unused('getUpdateChecker') as IpcContext['getUpdateChecker'],
    getFileDownloadManager: unused(
      'getFileDownloadManager'
    ) as IpcContext['getFileDownloadManager'],
    getHealthCheck: unused('getHealthCheck') as IpcContext['getHealthCheck'],
    getSystemMonitor: unused('getSystemMonitor') as IpcContext['getSystemMonitor'],
    getSyncEngine: unused('getSyncEngine') as IpcContext['getSyncEngine'],
    getOperationCoordinator: unused(
      'getOperationCoordinator'
    ) as IpcContext['getOperationCoordinator'],
    getCommandDispatcher: unused(
      'getCommandDispatcher'
    ) as IpcContext['getCommandDispatcher'],
    getWindowBehavior: unused('getWindowBehavior') as IpcContext['getWindowBehavior'],
    setWindowBehavior: unused('setWindowBehavior') as IpcContext['setWindowBehavior'],
    getLocalHtmlPathsSettings: unused(
      'getLocalHtmlPathsSettings'
    ) as IpcContext['getLocalHtmlPathsSettings'],
    getIsQuitting: unused('getIsQuitting') as IpcContext['getIsQuitting'],
    setIsQuitting: unused('setIsQuitting') as IpcContext['setIsQuitting'],
    getFilesDir: unused('getFilesDir') as IpcContext['getFilesDir'],
    getDbPath: unused('getDbPath') as IpcContext['getDbPath'],
    getBackupDir: unused('getBackupDir') as IpcContext['getBackupDir'],
    getAppVersion: unused('getAppVersion') as IpcContext['getAppVersion'],
    getSyncPreferences: unused('getSyncPreferences') as IpcContext['getSyncPreferences'],
    startAutoSync: unused('startAutoSync') as IpcContext['startAutoSync'],
    stopAutoSync: unused('stopAutoSync') as IpcContext['stopAutoSync'],
    getCrashProtectionManager: unused(
      'getCrashProtectionManager'
    ) as IpcContext['getCrashProtectionManager'],
    getAppDataDir: unused('getAppDataDir') as IpcContext['getAppDataDir'],
    getDatabaseCorruptionDetected: unused(
      'getDatabaseCorruptionDetected'
    ) as IpcContext['getDatabaseCorruptionDetected'],
    setDatabaseCorruptionDetected: unused(
      'setDatabaseCorruptionDetected'
    ) as IpcContext['setDatabaseCorruptionDetected'],
    resetWindowSize: unused('resetWindowSize') as IpcContext['resetWindowSize'],
    createTray: unused('createTray') as IpcContext['createTray'],
    destroyTray: unused('destroyTray') as IpcContext['destroyTray'],
    resetAppState: unused('resetAppState') as IpcContext['resetAppState'],
  } as unknown as IpcContext;
}

function makeCredentialManager(
  overrides: Partial<{
    exists: boolean;
    validity: 'valid' | 'invalid' | 'unknown' | null;
    lastValidated: Date | null;
  }>
): { manager: CredentialManager; existsSpy: jest.Mock; getStatusSpy: jest.Mock } {
  const existsSpy = jest.fn().mockResolvedValue(overrides.exists ?? false);
  const getStatusSpy = jest.fn().mockReturnValue({
    hasCredential: false,
    storageBackend: 'file',
    lastValidated: overrides.lastValidated ?? null,
    isValid: null,
    validity: overrides.validity ?? null,
  });
  const manager = {
    exists: existsSpy,
    getStatus: getStatusSpy,
  } as unknown as CredentialManager;
  return { manager, existsSpy, getStatusSpy };
}

describe('credentialHandlers — auth:getStatus (ADR-0013)', () => {
  beforeEach(() => {
    mockIpc.__reset();
    jest.clearAllMocks();
  });

  test('delegates to exists() + getStatus() and returns the contract shape', async () => {
    const checkedAt = new Date('2026-06-05T12:00:00.000Z');
    const { manager, existsSpy, getStatusSpy } = makeCredentialManager({
      exists: true,
      validity: 'invalid',
      lastValidated: checkedAt,
    });
    registerCredentialHandlers(buildCtx(manager));

    const res = (await invoke('auth:getStatus')) as {
      hasCredential: boolean;
      validity: string;
      lastCheckedAt: string | null;
    };

    expect(existsSpy).toHaveBeenCalledTimes(1);
    expect(getStatusSpy).toHaveBeenCalledTimes(1);
    expect(res).toEqual({
      hasCredential: true,
      validity: 'invalid',
      lastCheckedAt: checkedAt.toISOString(),
    });
  });

  test('maps null validity (never validated) -> "unknown" and null lastCheckedAt', async () => {
    const { manager } = makeCredentialManager({
      exists: false,
      validity: null,
      lastValidated: null,
    });
    registerCredentialHandlers(buildCtx(manager));

    const res = (await invoke('auth:getStatus')) as {
      hasCredential: boolean;
      validity: string;
      lastCheckedAt: string | null;
    };

    expect(res).toEqual({
      hasCredential: false,
      validity: 'unknown',
      lastCheckedAt: null,
    });
  });

  test('does not touch the database', async () => {
    const { manager } = makeCredentialManager({ exists: true, validity: 'valid' });
    registerCredentialHandlers(buildCtx(manager));

    // databaseTrap throws on any property access; a clean resolve proves no DB use.
    await expect(invoke('auth:getStatus')).resolves.toMatchObject({
      validity: 'valid',
    });
  });
});
