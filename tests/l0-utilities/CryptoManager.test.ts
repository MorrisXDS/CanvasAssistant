/**
 * CryptoManager Tests
 *
 * Tests for password-based encryption/decryption functionality.
 */

import {
  CryptoManager,
  EncryptedData,
} from '../../src/layers/l0-utilities/CryptoManager';

describe('CryptoManager', () => {
  let cryptoManager: CryptoManager;

  beforeEach(() => {
    cryptoManager = new CryptoManager();
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt a string', () => {
      const originalData = 'Hello, World!';
      const password = 'test-password-123';

      const encrypted = cryptoManager.encrypt(originalData, password);
      expect(encrypted).not.toBeNull();
      expect(encrypted?.version).toBe('1.0');
      expect(encrypted?.algorithm).toBe('aes-256-gcm');

      const decrypted = cryptoManager.decryptToString(encrypted!, password);
      expect(decrypted).toBe(originalData);
    });

    it('should encrypt and decrypt a buffer', () => {
      const originalData = Buffer.from('Binary data test');
      const password = 'secure-password';

      const encrypted = cryptoManager.encrypt(originalData, password);
      expect(encrypted).not.toBeNull();

      const decrypted = cryptoManager.decrypt(encrypted!, password);
      expect(decrypted).not.toBeNull();
      expect(decrypted!.toString()).toBe(originalData.toString());
    });

    it('should encrypt and decrypt large data', () => {
      const originalData = 'x'.repeat(100000); // 100KB of data
      const password = 'long-password-test';

      const encrypted = cryptoManager.encrypt(originalData, password);
      expect(encrypted).not.toBeNull();

      const decrypted = cryptoManager.decryptToString(encrypted!, password);
      expect(decrypted).toBe(originalData);
    });

    it('should encrypt and decrypt JSON data', () => {
      const jsonData = {
        courses: [
          { id: 1, name: 'CSC108' },
          { id: 2, name: 'MAT137' },
        ],
        tasks: [{ id: 1, title: 'Assignment 1' }],
        exportedAt: new Date().toISOString(),
      };
      const originalData = JSON.stringify(jsonData);
      const password = 'json-encryption-test';

      const encrypted = cryptoManager.encrypt(originalData, password);
      expect(encrypted).not.toBeNull();

      const decrypted = cryptoManager.decryptToString(encrypted!, password);
      expect(decrypted).toBe(originalData);
      expect(JSON.parse(decrypted!)).toEqual(jsonData);
    });

    it('should produce different ciphertext for same data with same password', () => {
      const originalData = 'Same data';
      const password = 'same-password';

      const encrypted1 = cryptoManager.encrypt(originalData, password);
      const encrypted2 = cryptoManager.encrypt(originalData, password);

      // Different salt/IV means different ciphertext
      expect(encrypted1?.data).not.toBe(encrypted2?.data);
      expect(encrypted1?.salt).not.toBe(encrypted2?.salt);
      expect(encrypted1?.iv).not.toBe(encrypted2?.iv);
    });

    it('should fail to decrypt with wrong password', () => {
      const originalData = 'Secret data';
      const password = 'correct-password';
      const wrongPassword = 'wrong-password';

      const encrypted = cryptoManager.encrypt(originalData, password);
      expect(encrypted).not.toBeNull();

      // Create a new manager and add error listener to prevent unhandled error
      const decryptManager = new CryptoManager();
      decryptManager.on('error', () => {
        // Expected - silently handle the error event
      });
      const decrypted = decryptManager.decryptToString(encrypted!, wrongPassword);
      expect(decrypted).toBeNull();
    });

    it('should return null when encrypting with empty password', () => {
      const originalData = 'Some data';

      const encrypted = cryptoManager.encrypt(originalData, '');
      expect(encrypted).toBeNull();
    });

    it('should return null when decrypting with empty password', () => {
      const originalData = 'Some data';
      const password = 'valid-password';

      const encrypted = cryptoManager.encrypt(originalData, password);
      expect(encrypted).not.toBeNull();

      const decrypted = cryptoManager.decrypt(encrypted!, '');
      expect(decrypted).toBeNull();
    });
  });

  describe('isValidEncryptedData', () => {
    it('should validate a proper encrypted data structure', () => {
      const validData: EncryptedData = {
        version: '1.0',
        algorithm: 'aes-256-gcm',
        salt: 'base64salt',
        iv: 'base64iv',
        authTag: 'base64tag',
        data: 'base64data',
      };

      expect(cryptoManager.isValidEncryptedData(validData)).toBe(true);
    });

    it('should reject invalid structures', () => {
      expect(cryptoManager.isValidEncryptedData(null)).toBe(false);
      expect(cryptoManager.isValidEncryptedData(undefined)).toBe(false);
      expect(cryptoManager.isValidEncryptedData('string')).toBe(false);
      expect(cryptoManager.isValidEncryptedData(123)).toBe(false);
      expect(cryptoManager.isValidEncryptedData({})).toBe(false);
      expect(cryptoManager.isValidEncryptedData({ version: '1.0' })).toBe(false);
    });

    it('should reject structures with wrong types', () => {
      expect(
        cryptoManager.isValidEncryptedData({
          version: 1,
          algorithm: 'aes',
          salt: 'salt',
          iv: 'iv',
          authTag: 'tag',
          data: 'data',
        })
      ).toBe(false);
    });
  });

  describe('evaluatePasswordStrength', () => {
    it('should rate very short passwords as weak', () => {
      const result = cryptoManager.evaluatePasswordStrength('abc');
      expect(result.score).toBe(0);
      expect(result.isAcceptable).toBe(false);
    });

    it('should rate 8 character passwords as minimum acceptable', () => {
      const result = cryptoManager.evaluatePasswordStrength('abcdefgh');
      expect(result.score).toBeGreaterThanOrEqual(1);
      expect(result.isAcceptable).toBe(false); // Still needs variety
    });

    it('should rate diverse passwords higher', () => {
      const result = cryptoManager.evaluatePasswordStrength('Password1!');
      expect(result.score).toBeGreaterThanOrEqual(2); // 10 chars + variety
      expect(result.isAcceptable).toBe(true);
    });

    it('should rate long diverse passwords as strong', () => {
      const result = cryptoManager.evaluatePasswordStrength('MyStrongPassword123!@#');
      expect(result.score).toBe(4);
      expect(result.isAcceptable).toBe(true);
      expect(result.feedback).toBe('Strong password');
    });

    it('should provide specific feedback for missing elements', () => {
      const lowercase = cryptoManager.evaluatePasswordStrength('abcdefghij');
      expect(lowercase.feedback).toContain('uppercase');

      const noNumbers = cryptoManager.evaluatePasswordStrength('AbcDefGh');
      expect(noNumbers.feedback).toContain('numbers');

      const noSpecial = cryptoManager.evaluatePasswordStrength('AbcDef123');
      expect(noSpecial.feedback).toContain('special');
    });
  });

  describe('generatePassword', () => {
    it('should generate a password of specified length', () => {
      const password = cryptoManager.generatePassword(16);
      expect(password.length).toBe(16);
    });

    it('should generate different passwords each time', () => {
      const password1 = cryptoManager.generatePassword(20);
      const password2 = cryptoManager.generatePassword(20);
      expect(password1).not.toBe(password2);
    });

    it('should generate strong passwords', () => {
      const password = cryptoManager.generatePassword(16);
      const strength = cryptoManager.evaluatePasswordStrength(password);
      expect(strength.isAcceptable).toBe(true);
    });

    it('should use default length of 16', () => {
      const password = cryptoManager.generatePassword();
      expect(password.length).toBe(16);
    });
  });

  describe('computeHash and verifyHash', () => {
    it('should compute consistent hashes', () => {
      const data = 'Test data for hashing';
      const hash1 = cryptoManager.computeHash(data);
      const hash2 = cryptoManager.computeHash(data);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different data', () => {
      const hash1 = cryptoManager.computeHash('Data 1');
      const hash2 = cryptoManager.computeHash('Data 2');
      expect(hash1).not.toBe(hash2);
    });

    it('should verify correct hashes', () => {
      const data = 'Verify this data';
      const hash = cryptoManager.computeHash(data);
      expect(cryptoManager.verifyHash(data, hash)).toBe(true);
    });

    it('should reject incorrect hashes', () => {
      const data = 'Original data';
      const hash = cryptoManager.computeHash(data);
      expect(cryptoManager.verifyHash('Modified data', hash)).toBe(false);
    });

    it('should handle buffer input', () => {
      const buffer = Buffer.from('Buffer data');
      const hash = cryptoManager.computeHash(buffer);
      expect(hash).toBeTruthy();
      expect(cryptoManager.verifyHash(buffer, hash)).toBe(true);
    });
  });

  describe('events', () => {
    it('should emit encrypted event on successful encryption', (done) => {
      cryptoManager.on('encrypted', (data) => {
        expect(data.size).toBeGreaterThan(0);
        done();
      });

      cryptoManager.encrypt('Test data', 'password');
    });

    it('should emit decrypted event on successful decryption', (done) => {
      const encrypted = cryptoManager.encrypt('Test data', 'password');

      cryptoManager.on('decrypted', (data) => {
        expect(data.size).toBeGreaterThan(0);
        done();
      });

      cryptoManager.decrypt(encrypted!, 'password');
    });

    it('should emit error event on decryption failure', (done) => {
      const encrypted = cryptoManager.encrypt('Test data', 'password');

      // Create fresh manager to avoid event handler leaks
      const decryptManager = new CryptoManager();
      decryptManager.on('error', (data) => {
        // Could be 'auth-failed' or 'decrypt-failed' depending on error type
        expect(['auth-failed', 'decrypt-failed']).toContain(data.type);
        done();
      });

      decryptManager.decrypt(encrypted!, 'wrong-password');
    });
  });
});
