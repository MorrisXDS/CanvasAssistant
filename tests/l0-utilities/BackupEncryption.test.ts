/**
 * Tests for BackupEncryption module
 *
 * Tests encryption/decryption round-trips, password verification,
 * encrypted file detection, and error handling.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  encryptBackup,
  decryptBackup,
  isEncryptedBackup,
  verifyBackupPassword,
} from '../../src/layers/l0-utilities/BackupEncryption';
import { CRYPTO_CONSTANTS } from '../../src/layers/l0-utilities/CryptoCore';

describe('BackupEncryption', () => {
  let tempDir: string;
  let testDbPath: string;
  let encryptedPath: string;
  let decryptedPath: string;

  beforeAll(() => {
    // Create temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-test-'));

    // Create paths for test files
    testDbPath = path.join(tempDir, 'test.db');
    encryptedPath = path.join(tempDir, 'test.db.encrypted');
    decryptedPath = path.join(tempDir, 'test.db.decrypted');

    // Create a test SQLite database file with valid header
    // Must be large enough that encrypted output exceeds HEADER_SIZE + 100 = 164 bytes
    const sqliteHeader = 'SQLite format 3\0';
    const testData = Buffer.concat([
      Buffer.from(sqliteHeader, 'utf8'),
      Buffer.alloc(256, 'x'), // Pad to ensure encrypted file is large enough
    ]);
    fs.writeFileSync(testDbPath, testData);
  });

  afterAll(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('encryptBackup and decryptBackup', () => {
    it('should successfully encrypt and decrypt a backup file (round-trip)', () => {
      const password = 'test-password-123';
      const originalContent = fs.readFileSync(testDbPath);

      // Encrypt the file
      const encryptResult = encryptBackup(testDbPath, encryptedPath, password);
      expect(encryptResult.success).toBe(true);
      expect(encryptResult.outputPath).toBe(encryptedPath);
      expect(encryptResult.error).toBeUndefined();
      expect(fs.existsSync(encryptedPath)).toBe(true);

      // Verify encrypted file is different from original
      const encryptedContent = fs.readFileSync(encryptedPath);
      expect(encryptedContent).not.toEqual(originalContent);

      // Decrypt the file
      const decryptResult = decryptBackup(encryptedPath, decryptedPath, password);
      expect(decryptResult.success).toBe(true);
      expect(decryptResult.outputPath).toBe(decryptedPath);
      expect(decryptResult.error).toBeUndefined();
      expect(fs.existsSync(decryptedPath)).toBe(true);

      // Verify decrypted content matches original
      const decryptedContent = fs.readFileSync(decryptedPath);
      expect(decryptedContent).toEqual(originalContent);
    });

    it('should return success: false when decrypting with wrong password', () => {
      const correctPassword = 'correct-password';
      const wrongPassword = 'wrong-password';

      // Encrypt with correct password
      const encryptResult = encryptBackup(testDbPath, encryptedPath, correctPassword);
      expect(encryptResult.success).toBe(true);

      // Try to decrypt with wrong password
      const decryptResult = decryptBackup(encryptedPath, decryptedPath, wrongPassword);
      expect(decryptResult.success).toBe(false);
      expect(decryptResult.error).toBeDefined();
      // Error message varies by Node.js version; just verify it's present
      expect(decryptResult.error).toBeDefined();
    });

    it('should return success: false when encrypting non-existent file', () => {
      const nonExistentPath = path.join(tempDir, 'does-not-exist.db');
      const outputPath = path.join(tempDir, 'output.encrypted');
      const password = 'test-password';

      const result = encryptBackup(nonExistentPath, outputPath, password);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.outputPath).toBeUndefined();
    });
  });

  describe('isEncryptedBackup', () => {
    it('should return false for a real SQLite file header', () => {
      expect(isEncryptedBackup(testDbPath)).toBe(false);
    });

    it('should return true for an encrypted file', () => {
      const password = 'test-password';
      encryptBackup(testDbPath, encryptedPath, password);

      expect(isEncryptedBackup(encryptedPath)).toBe(true);
    });

    it('should return false for non-existent file', () => {
      const nonExistentPath = path.join(tempDir, 'does-not-exist.db');
      expect(isEncryptedBackup(nonExistentPath)).toBe(false);
    });

    it('should return false for file smaller than minimum encrypted size', () => {
      const tinyFilePath = path.join(tempDir, 'tiny.db');
      fs.writeFileSync(tinyFilePath, 'small');
      expect(isEncryptedBackup(tinyFilePath)).toBe(false);
    });
  });

  describe('verifyBackupPassword', () => {
    it('should return true for correct password', () => {
      const password = 'correct-password-456';
      encryptBackup(testDbPath, encryptedPath, password);

      expect(verifyBackupPassword(encryptedPath, password)).toBe(true);
    });

    it('should return false for wrong password', () => {
      const correctPassword = 'correct-password-789';
      const wrongPassword = 'wrong-password-789';
      encryptBackup(testDbPath, encryptedPath, correctPassword);

      expect(verifyBackupPassword(encryptedPath, wrongPassword)).toBe(false);
    });

    it('should return false for non-encrypted file', () => {
      expect(verifyBackupPassword(testDbPath, 'any-password')).toBe(false);
    });

    it('should return false for non-existent file', () => {
      const nonExistentPath = path.join(tempDir, 'does-not-exist.encrypted');
      expect(verifyBackupPassword(nonExistentPath, 'any-password')).toBe(false);
    });
  });

  describe('file format verification', () => {
    it('should create encrypted file with correct structure: salt(32) + iv(16) + authTag(16) + data', () => {
      const password = 'format-test-password';
      encryptBackup(testDbPath, encryptedPath, password);

      const encryptedData = fs.readFileSync(encryptedPath);
      const originalData = fs.readFileSync(testDbPath);

      // Verify header sizes
      const saltSize = CRYPTO_CONSTANTS.SALT_LENGTH;
      const ivSize = CRYPTO_CONSTANTS.IV_LENGTH;
      const authTagSize = CRYPTO_CONSTANTS.AUTH_TAG_LENGTH;
      const headerSize = saltSize + ivSize + authTagSize;

      expect(saltSize).toBe(32);
      expect(ivSize).toBe(16);
      expect(authTagSize).toBe(16);
      expect(headerSize).toBe(64);

      // Verify encrypted file is larger than original (has header)
      expect(encryptedData.length).toBeGreaterThanOrEqual(
        originalData.length + headerSize
      );

      // Verify we can extract all components
      const salt = encryptedData.subarray(0, saltSize);
      const iv = encryptedData.subarray(saltSize, saltSize + ivSize);
      const authTag = encryptedData.subarray(
        saltSize + ivSize,
        saltSize + ivSize + authTagSize
      );
      const ciphertext = encryptedData.subarray(headerSize);

      expect(salt.length).toBe(32);
      expect(iv.length).toBe(16);
      expect(authTag.length).toBe(16);
      expect(ciphertext.length).toBeGreaterThan(0);

      // Salt and IV should be random (not all zeros)
      const saltIsRandom = !salt.every((byte) => byte === 0);
      const ivIsRandom = !iv.every((byte) => byte === 0);
      expect(saltIsRandom).toBe(true);
      expect(ivIsRandom).toBe(true);
    });

    it('should use different salt and IV for each encryption of same file', () => {
      const password = 'unique-test-password';
      const encrypted1Path = path.join(tempDir, 'test1.encrypted');
      const encrypted2Path = path.join(tempDir, 'test2.encrypted');

      encryptBackup(testDbPath, encrypted1Path, password);
      encryptBackup(testDbPath, encrypted2Path, password);

      const encrypted1 = fs.readFileSync(encrypted1Path);
      const encrypted2 = fs.readFileSync(encrypted2Path);

      // Extract salts and IVs
      const salt1 = encrypted1.subarray(0, 32);
      const salt2 = encrypted2.subarray(0, 32);
      const iv1 = encrypted1.subarray(32, 48);
      const iv2 = encrypted2.subarray(32, 48);

      // Salts should be different
      expect(salt1).not.toEqual(salt2);

      // IVs should be different
      expect(iv1).not.toEqual(iv2);

      // Both files should still decrypt correctly
      const decrypted1Path = path.join(tempDir, 'test1.decrypted');
      const decrypted2Path = path.join(tempDir, 'test2.decrypted');

      const decrypt1Result = decryptBackup(encrypted1Path, decrypted1Path, password);
      const decrypt2Result = decryptBackup(encrypted2Path, decrypted2Path, password);

      expect(decrypt1Result.success).toBe(true);
      expect(decrypt2Result.success).toBe(true);

      const decrypted1 = fs.readFileSync(decrypted1Path);
      const decrypted2 = fs.readFileSync(decrypted2Path);
      const original = fs.readFileSync(testDbPath);

      expect(decrypted1).toEqual(original);
      expect(decrypted2).toEqual(original);
    });
  });

  describe('edge cases', () => {
    it('should handle empty password', () => {
      const password = '';
      const result = encryptBackup(testDbPath, encryptedPath, password);
      expect(result.success).toBe(true);

      // Should be able to decrypt with empty password
      const decryptResult = decryptBackup(encryptedPath, decryptedPath, password);
      expect(decryptResult.success).toBe(true);
    });

    it('should handle very long password', () => {
      const password = 'a'.repeat(1000);
      const result = encryptBackup(testDbPath, encryptedPath, password);
      expect(result.success).toBe(true);

      const decryptResult = decryptBackup(encryptedPath, decryptedPath, password);
      expect(decryptResult.success).toBe(true);
    });

    it('should handle special characters in password', () => {
      const password = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/~`';
      const result = encryptBackup(testDbPath, encryptedPath, password);
      expect(result.success).toBe(true);

      const decryptResult = decryptBackup(encryptedPath, decryptedPath, password);
      expect(decryptResult.success).toBe(true);
    });

    it('should handle Unicode characters in password', () => {
      const password = '密码🔐🛡️';
      const result = encryptBackup(testDbPath, encryptedPath, password);
      expect(result.success).toBe(true);

      const decryptResult = decryptBackup(encryptedPath, decryptedPath, password);
      expect(decryptResult.success).toBe(true);
    });
  });
});
