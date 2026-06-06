/**
 * CredentialManager Tests
 *
 * Tests the secure credential storage system with keytar and file fallback.
 * These tests focus on file fallback behavior since keytar requires system integration.
 */

import fs from 'fs';
import path from 'path';
import axios, { AxiosError } from 'axios';
import { CredentialManager } from '../../src/layers/l0-utilities/CredentialManager';
import { Logger } from '../../src/layers/l0-utilities/Logger';

// Spy on axios.get (not a full module mock) so the real `AxiosError` class is
// preserved for the classifier's `instanceof` checks.
function axiosErrorNoResponse(): AxiosError {
  return new AxiosError('Network Error');
}
function axiosErrorWithStatus(status: number): AxiosError {
  const err = new AxiosError('Request failed');
  err.response = {
    status,
    statusText: '',
    headers: {},
    config: {} as never,
    data: undefined,
  };
  return err;
}

// Test directory for credential files
const TEST_DIR = path.join(__dirname, '../temp-credentials');
const TEST_CREDENTIAL_FILE = path.join(TEST_DIR, '.credentials');

// Mock keytar module - simulate unavailable keychain to force file fallback
jest.mock('keytar', () => ({
  setPassword: jest.fn().mockRejectedValue(new Error('Keytar not available')),
  getPassword: jest.fn().mockRejectedValue(new Error('Keytar not available')),
  deletePassword: jest.fn().mockRejectedValue(new Error('Keytar not available')),
  findCredentials: jest.fn().mockRejectedValue(new Error('Keytar not available')),
}));

describe('CredentialManager', () => {
  let logger: Logger;
  let manager: CredentialManager;

  // Helper to wait for async initialization
  const waitForInit = () => new Promise((resolve) => setTimeout(resolve, 300));

  // Helper to create manager and wait for initialization
  const createManager = async (
    options: ConstructorParameters<typeof CredentialManager>[0]
  ): Promise<CredentialManager> => {
    const mgr = new CredentialManager(options);
    // Add error handler to prevent unhandled error crashes
    mgr.on('error', () => {}); // Silently handle errors in tests
    // Explicitly trigger lazy initialization so storageBackend is set
    await mgr.ensureInitialized();
    return mgr;
  };

  beforeAll(() => {
    // Setup test directory
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
    logger = new Logger({ enableConsole: false, logDir: TEST_DIR });
  });

  afterAll(async () => {
    // Close logger first to release file handles
    if (logger) {
      logger.close();
    }

    // Wait a bit for file handles to be fully released (Windows needs this)
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Cleanup test directory with retry logic for Windows
    if (fs.existsSync(TEST_DIR)) {
      try {
        fs.rmSync(TEST_DIR, {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 100,
        });
      } catch {
        // Ignore cleanup errors in CI - directory will be cleaned up on next run
      }
    }
  });

  beforeEach(() => {
    // Clear any credential files before each test
    if (fs.existsSync(TEST_CREDENTIAL_FILE)) {
      fs.unlinkSync(TEST_CREDENTIAL_FILE);
    }
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default options', async () => {
      manager = await createManager({
        enableFileFallback: true,
        fallbackFilePath: TEST_CREDENTIAL_FILE,
        logger,
      });
      const status = manager.getStatus();

      expect(status.hasCredential).toBe(false);
      expect(status.lastValidated).toBeNull();
    });

    it('should accept custom options', async () => {
      manager = await createManager({
        serviceName: 'TestService',
        accountName: 'test-account',
        enableFileFallback: true,
        fallbackFilePath: TEST_CREDENTIAL_FILE,
        validateOnRetrieve: false,
        logger,
      });

      const status = manager.getStatus();
      expect(status.hasCredential).toBe(false);
    });

    it('should initialize with file fallback when keytar unavailable', async () => {
      manager = await createManager({
        enableFileFallback: true,
        fallbackFilePath: TEST_CREDENTIAL_FILE,
        logger,
      });

      const status = manager.getStatus();
      expect(status.storageBackend).toBe('file');
    });
  });

  describe('store', () => {
    beforeEach(async () => {
      manager = await createManager({
        enableFileFallback: true,
        fallbackFilePath: TEST_CREDENTIAL_FILE,
        validateOnRetrieve: false,
        logger,
      });
    });

    it('should store a token', async () => {
      // Verify we're using file backend
      expect(manager.getStatus().storageBackend).toBe('file');

      const token = 'test-api-token-12345';
      const result = await manager.store(token);

      expect(result).toBe(true);
      // Use exists() to verify credential was stored
      const exists = await manager.exists();
      expect(exists).toBe(true);
    });

    it('should reject empty tokens', async () => {
      const result = await manager.store('');
      expect(result).toBe(false);
    });

    it('should reject null/undefined tokens', async () => {
      const result = await manager.store(null as unknown as string);
      expect(result).toBe(false);
    });
  });

  describe('retrieve', () => {
    beforeEach(async () => {
      manager = await createManager({
        enableFileFallback: true,
        fallbackFilePath: TEST_CREDENTIAL_FILE,
        validateOnRetrieve: false,
        logger,
      });
    });

    it('should retrieve a stored token', async () => {
      const token = 'test-api-token-67890';
      await manager.store(token);

      const retrieved = await manager.retrieve();
      expect(retrieved).toBe(token);
    });

    it('should return null when no token stored', async () => {
      const retrieved = await manager.retrieve();
      expect(retrieved).toBeNull();
    });
  });

  describe('delete', () => {
    beforeEach(async () => {
      manager = await createManager({
        enableFileFallback: true,
        fallbackFilePath: TEST_CREDENTIAL_FILE,
        validateOnRetrieve: false,
        logger,
      });
    });

    it('should delete a stored token', async () => {
      const token = 'test-api-token-delete';
      await manager.store(token);

      // Use exists() to verify credential was stored
      let exists = await manager.exists();
      expect(exists).toBe(true);

      const result = await manager.delete();
      expect(result).toBe(true);

      // Verify credential is gone
      exists = await manager.exists();
      expect(exists).toBe(false);

      const retrieved = await manager.retrieve();
      expect(retrieved).toBeNull();
    });

    it('should return false when deleting non-existent token', async () => {
      // File backend returns false when file doesn't exist
      const result = await manager.delete();
      expect(result).toBe(false);
    });
  });

  describe('exists', () => {
    beforeEach(async () => {
      manager = await createManager({
        enableFileFallback: true,
        fallbackFilePath: TEST_CREDENTIAL_FILE,
        validateOnRetrieve: false,
        logger,
      });
    });

    it('should return false when no token exists', async () => {
      const exists = await manager.exists();
      expect(exists).toBe(false);
    });

    it('should return true when token exists', async () => {
      await manager.store('test-token');
      const exists = await manager.exists();
      expect(exists).toBe(true);
    });
  });

  describe('validation', () => {
    it('should validate token on retrieve when enabled', async () => {
      const validator = jest.fn().mockResolvedValue(true);

      manager = await createManager({
        enableFileFallback: true,
        fallbackFilePath: TEST_CREDENTIAL_FILE,
        validateOnRetrieve: true,
        tokenValidator: validator,
        logger,
      });

      await manager.store('valid-token');
      await manager.retrieve();

      expect(validator).toHaveBeenCalledWith('valid-token');
    });

    it('should return null for invalid tokens', async () => {
      const validator = jest.fn().mockResolvedValue(false);

      manager = await createManager({
        enableFileFallback: true,
        fallbackFilePath: TEST_CREDENTIAL_FILE,
        validateOnRetrieve: true,
        tokenValidator: validator,
        logger,
      });

      await manager.store('invalid-token');
      const retrieved = await manager.retrieve();

      expect(retrieved).toBeNull();
    });

    it('should skip validation when disabled', async () => {
      const validator = jest.fn().mockResolvedValue(true);

      manager = await createManager({
        enableFileFallback: true,
        fallbackFilePath: TEST_CREDENTIAL_FILE,
        validateOnRetrieve: false,
        tokenValidator: validator,
        logger,
      });

      await manager.store('test-token');
      const retrieved = await manager.retrieve();

      expect(validator).not.toHaveBeenCalled();
      expect(retrieved).toBe('test-token');
    });
  });

  describe('getStatus', () => {
    beforeEach(async () => {
      manager = await createManager({
        enableFileFallback: true,
        fallbackFilePath: TEST_CREDENTIAL_FILE,
        validateOnRetrieve: false,
        logger,
      });
    });

    it('should return correct status structure', () => {
      const status = manager.getStatus();

      expect(status).toHaveProperty('hasCredential');
      expect(status).toHaveProperty('storageBackend');
      expect(status).toHaveProperty('lastValidated');
      expect(status).toHaveProperty('isValid');
    });

    it('should report storage backend correctly', async () => {
      const status = manager.getStatus();
      expect(status.storageBackend).toBe('file');
    });

    it('should track validation status', async () => {
      const validator = jest.fn().mockResolvedValue(true);

      manager = await createManager({
        enableFileFallback: true,
        fallbackFilePath: TEST_CREDENTIAL_FILE,
        validateOnRetrieve: true,
        tokenValidator: validator,
        logger,
      });

      await manager.store('test-token');
      await manager.retrieve();

      const status = manager.getStatus();
      expect(status.lastValidated).toBeInstanceOf(Date);
      expect(status.isValid).toBe(true);
    });
  });

  describe('events', () => {
    it('should emit credential-stored event', async () => {
      manager = await createManager({
        enableFileFallback: true,
        fallbackFilePath: TEST_CREDENTIAL_FILE,
        validateOnRetrieve: false,
        logger,
      });

      const eventHandler = jest.fn();
      manager.on('credential-stored', eventHandler);

      await manager.store('test-token');

      expect(eventHandler).toHaveBeenCalled();
    });

    it('should emit credential-deleted event', async () => {
      manager = await createManager({
        enableFileFallback: true,
        fallbackFilePath: TEST_CREDENTIAL_FILE,
        validateOnRetrieve: false,
        logger,
      });

      const eventHandler = jest.fn();
      manager.on('credential-deleted', eventHandler);

      await manager.store('test-token');
      await manager.delete();

      expect(eventHandler).toHaveBeenCalled();
    });

    it('should emit token-invalid event on validation failure', async () => {
      const validator = jest.fn().mockResolvedValue(false);

      manager = await createManager({
        enableFileFallback: true,
        fallbackFilePath: TEST_CREDENTIAL_FILE,
        validateOnRetrieve: true,
        tokenValidator: validator,
        logger,
      });

      const eventHandler = jest.fn();
      manager.on('token-invalid', eventHandler);

      await manager.store('test-token');
      await manager.retrieve();

      expect(eventHandler).toHaveBeenCalled();
    });
  });

  describe('tri-state validity (ADR-0013)', () => {
    let getSpy: jest.SpyInstance;

    const makeAxiosManager = async () =>
      createManager({
        enableFileFallback: true,
        fallbackFilePath: TEST_CREDENTIAL_FILE,
        validateOnRetrieve: true,
        baseUrl: 'https://canvas.example.com',
        logger,
      } as ConstructorParameters<typeof CredentialManager>[0]);

    beforeEach(() => {
      getSpy = jest.spyOn(axios, 'get');
    });

    afterEach(() => {
      getSpy.mockRestore();
    });

    it('200 -> valid, no token-invalid, retrieve returns token', async () => {
      getSpy.mockResolvedValue({ status: 200, data: {} } as never);
      manager = await makeAxiosManager();
      const invalidHandler = jest.fn();
      manager.on('token-invalid', invalidHandler);

      await manager.store('good-token');
      const retrieved = await manager.retrieve();

      expect(retrieved).toBe('good-token');
      expect(invalidHandler).not.toHaveBeenCalled();
      const status = manager.getStatus();
      expect(status.validity).toBe('valid');
      expect(status.isValid).toBe(true);
    });

    it('401 -> invalid, token-invalid emitted once, retrieve returns null', async () => {
      getSpy.mockResolvedValue({ status: 401, data: {} } as never);
      manager = await makeAxiosManager();
      const invalidHandler = jest.fn();
      manager.on('token-invalid', invalidHandler);

      await manager.store('revoked-token');
      const retrieved = await manager.retrieve();

      expect(retrieved).toBeNull();
      expect(invalidHandler).toHaveBeenCalledTimes(1);
      expect(manager.getStatus().validity).toBe('invalid');
      expect(manager.getStatus().isValid).toBe(false);
    });

    it('403 -> invalid (same as 401)', async () => {
      getSpy.mockResolvedValue({ status: 403, data: {} } as never);
      manager = await makeAxiosManager();
      const invalidHandler = jest.fn();
      manager.on('token-invalid', invalidHandler);

      await manager.store('forbidden-token');
      const retrieved = await manager.retrieve();

      expect(retrieved).toBeNull();
      expect(invalidHandler).toHaveBeenCalledTimes(1);
      expect(manager.getStatus().validity).toBe('invalid');
    });

    it('network error (offline, retries exhausted) -> unknown; token RETAINED; no token-invalid', async () => {
      // The offline-≠-revoked regression test for the reported bug class.
      getSpy.mockRejectedValue(axiosErrorNoResponse());
      manager = await makeAxiosManager();
      const invalidHandler = jest.fn();
      manager.on('token-invalid', invalidHandler);

      await manager.store('good-but-offline-token');
      const retrieved = await manager.retrieve();

      expect(retrieved).toBe('good-but-offline-token');
      expect(invalidHandler).not.toHaveBeenCalled();
      const status = manager.getStatus();
      expect(status.validity).toBe('unknown');
      // Back-compat boolean must NOT be clobbered to false on a network blip.
      expect(status.isValid).toBeNull();
    });

    it('transient network throw then 200 (retry) -> ends valid', async () => {
      // Retries fire on THROWN retryable errors (network/timeout/5xx-throw),
      // not on a non-2xx *response* (validateStatus:()=>true never throws).
      getSpy
        .mockRejectedValueOnce(axiosErrorNoResponse())
        .mockResolvedValue({ status: 200, data: {} } as never);
      manager = await makeAxiosManager();

      await manager.store('flaky-token');
      const retrieved = await manager.retrieve();

      expect(retrieved).toBe('flaky-token');
      expect(manager.getStatus().validity).toBe('valid');
    });

    it('axios error carrying a 401 response -> invalid', async () => {
      getSpy.mockRejectedValue(axiosErrorWithStatus(401));
      manager = await makeAxiosManager();
      const invalidHandler = jest.fn();
      manager.on('token-invalid', invalidHandler);

      await manager.store('token');
      const retrieved = await manager.retrieve();

      expect(retrieved).toBeNull();
      expect(invalidHandler).toHaveBeenCalledTimes(1);
      expect(manager.getStatus().validity).toBe('invalid');
    });

    it('background validation: 401 emits token-invalid', async () => {
      getSpy.mockResolvedValue({ status: 401, data: {} } as never);
      manager = await makeAxiosManager();
      const invalidHandler = jest.fn();
      manager.on('token-invalid', invalidHandler);

      // Store WITHOUT validation interfering, then drive background pass.
      await manager.store('revoked');
      // performBackgroundValidation is private; exercise via the public timer
      // entry point indirectly by casting to access it (test-only).
      await (
        manager as unknown as {
          performBackgroundValidation: () => Promise<void>;
        }
      ).performBackgroundValidation();

      expect(invalidHandler).toHaveBeenCalledTimes(1);
      expect(manager.getStatus().validity).toBe('invalid');
    });

    it('background validation: network error emits nothing', async () => {
      getSpy.mockRejectedValue(axiosErrorNoResponse());
      manager = await makeAxiosManager();
      const invalidHandler = jest.fn();
      manager.on('token-invalid', invalidHandler);

      await manager.store('good-offline');
      await (
        manager as unknown as {
          performBackgroundValidation: () => Promise<void>;
        }
      ).performBackgroundValidation();

      expect(invalidHandler).not.toHaveBeenCalled();
      expect(manager.getStatus().validity).toBe('unknown');
    });
  });

  describe('file fallback encryption', () => {
    it('should encrypt data in file storage', async () => {
      manager = await createManager({
        enableFileFallback: true,
        fallbackFilePath: TEST_CREDENTIAL_FILE,
        validateOnRetrieve: false,
        logger,
      });

      await manager.store('secret-token');

      // Verify file exists
      expect(fs.existsSync(TEST_CREDENTIAL_FILE)).toBe(true);

      // Verify file content is encrypted (not plaintext)
      const fileContent = fs.readFileSync(TEST_CREDENTIAL_FILE, 'utf8');
      expect(fileContent).not.toContain('secret-token');
    });

    it('should decrypt data correctly on retrieve', async () => {
      manager = await createManager({
        enableFileFallback: true,
        fallbackFilePath: TEST_CREDENTIAL_FILE,
        validateOnRetrieve: false,
        logger,
      });

      const originalToken = 'my-secret-api-token-with-special-chars-!@#$%';
      await manager.store(originalToken);

      const retrieved = await manager.retrieve();
      expect(retrieved).toBe(originalToken);
    });
  });
});
