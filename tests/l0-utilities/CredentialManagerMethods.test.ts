/**
 * Tests for CredentialManager new methods: setBaseUrl, getBaseUrl, timer cleanup
 */

import { CredentialManager } from '../../src/layers/l0-utilities/CredentialManager';
import { Logger } from '../../src/layers/l0-utilities/Logger';

describe('CredentialManager - New Methods', () => {
  let manager: CredentialManager;

  beforeEach(() => {
    manager = new CredentialManager({
      serviceName: 'test-service',
      accountName: 'test-account',
      enableFileFallback: false,
      validateOnRetrieve: false,
      logger: new Logger({ enableConsole: false }),
    });
  });

  describe('setBaseUrl / getBaseUrl', () => {
    test('getBaseUrl returns empty string by default', () => {
      expect(manager.getBaseUrl()).toBe('');
    });

    test('setBaseUrl updates the base URL', () => {
      manager.setBaseUrl('https://canvas.example.com');
      expect(manager.getBaseUrl()).toBe('https://canvas.example.com');
    });

    test('setBaseUrl can be called multiple times', () => {
      manager.setBaseUrl('https://first.example.com');
      expect(manager.getBaseUrl()).toBe('https://first.example.com');

      manager.setBaseUrl('https://second.example.com');
      expect(manager.getBaseUrl()).toBe('https://second.example.com');
    });

    test('setBaseUrl accepts empty string', () => {
      manager.setBaseUrl('https://canvas.example.com');
      manager.setBaseUrl('');
      expect(manager.getBaseUrl()).toBe('');
    });
  });

  describe('Background validation timer cleanup', () => {
    test('stopBackgroundValidation is safe to call without starting', () => {
      expect(() => manager.stopBackgroundValidation()).not.toThrow();
    });

    test('startBackgroundValidation then stopBackgroundValidation cleans up', () => {
      manager.startBackgroundValidation();
      // Should not throw and should clean up timers
      manager.stopBackgroundValidation();
    });

    test('startBackgroundValidation is idempotent', () => {
      manager.startBackgroundValidation();
      manager.startBackgroundValidation(); // Second call should be no-op
      manager.stopBackgroundValidation();
    });
  });

  describe('Constructor with baseUrl option', () => {
    test('accepts baseUrl in options', () => {
      const mgr = new CredentialManager({
        serviceName: 'test',
        accountName: 'test',
        enableFileFallback: false,
        validateOnRetrieve: false,
        baseUrl: 'https://canvas.example.com',
        logger: new Logger({ enableConsole: false }),
      });
      expect(mgr.getBaseUrl()).toBe('https://canvas.example.com');
    });

    test('defaults to empty string without baseUrl option', () => {
      const mgr = new CredentialManager({
        serviceName: 'test',
        accountName: 'test',
        enableFileFallback: false,
        validateOnRetrieve: false,
        logger: new Logger({ enableConsole: false }),
      });
      expect(mgr.getBaseUrl()).toBe('');
    });
  });

  describe('Token validation with baseUrl', () => {
    test('custom tokenValidator receives token correctly', async () => {
      const validator = jest.fn().mockResolvedValue(true);
      const mgr = new CredentialManager({
        serviceName: 'test',
        accountName: 'test',
        enableFileFallback: true,
        fallbackFilePath: '/tmp/cid-test-cred-' + Date.now(),
        validateOnRetrieve: true,
        tokenValidator: validator,
        logger: new Logger({ enableConsole: false }),
      });

      await mgr.ensureInitialized();
      await mgr.store('test-token-123');
      const token = await mgr.retrieve();

      expect(validator).toHaveBeenCalledWith('test-token-123');
      expect(token).toBe('test-token-123');

      // Cleanup
      await mgr.delete();
    });
  });
});
