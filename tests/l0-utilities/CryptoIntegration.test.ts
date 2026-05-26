/**
 * CryptoCore Integration Tests
 *
 * Verifies that CryptoManager, CredentialManager, and BackupEncryption
 * work correctly after refactoring to use shared CryptoCore primitives.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { CryptoManager } from '../../src/layers/l0-utilities/CryptoManager';
import {
  CRYPTO_CONSTANTS,
  deriveKey,
  encryptBuffer,
  decryptBuffer,
} from '../../src/layers/l0-utilities/CryptoCore';
import {
  encryptBackup,
  decryptBackup,
  isEncryptedBackup,
  verifyBackupPassword,
} from '../../src/layers/l0-utilities/BackupEncryption';

describe('CryptoCore Integration', () => {
  describe('CryptoManager uses CryptoCore primitives', () => {
    let manager: CryptoManager;

    beforeEach(() => {
      manager = new CryptoManager();
    });

    test('encrypt → decrypt round-trip with string data', () => {
      const plaintext = 'Hello, Canvas!';
      const password = 'test-password-123!';

      const encrypted = manager.encrypt(plaintext, password);
      expect(encrypted).not.toBeNull();

      const decrypted = manager.decryptToString(encrypted!, password);
      expect(decrypted).toBe(plaintext);
    });

    test('encrypt → decrypt round-trip with buffer data', () => {
      const plaintext = Buffer.from('Binary data \x00\x01\x02');
      const password = 'secure-pass';

      const encrypted = manager.encrypt(plaintext, password);
      expect(encrypted).not.toBeNull();

      const decrypted = manager.decrypt(encrypted!, password);
      expect(decrypted).not.toBeNull();
      expect(Buffer.compare(decrypted!, plaintext)).toBe(0);
    });

    test('encrypted output uses CryptoCore constants', () => {
      const encrypted = manager.encrypt('data', 'password');
      expect(encrypted).not.toBeNull();
      expect(encrypted!.algorithm).toBe(CRYPTO_CONSTANTS.ALGORITHM);

      // Verify salt length
      const salt = Buffer.from(encrypted!.salt, 'base64');
      expect(salt.length).toBe(CRYPTO_CONSTANTS.SALT_LENGTH);

      // Verify IV length
      const iv = Buffer.from(encrypted!.iv, 'base64');
      expect(iv.length).toBe(CRYPTO_CONSTANTS.IV_LENGTH);

      // Verify auth tag length
      const authTag = Buffer.from(encrypted!.authTag, 'base64');
      expect(authTag.length).toBe(CRYPTO_CONSTANTS.AUTH_TAG_LENGTH);
    });

    test('wrong password returns null', () => {
      // Suppress unhandled 'error' event from EventEmitter
      manager.on('error', () => {});
      const encrypted = manager.encrypt('secret', 'correct-password');
      const decrypted = manager.decrypt(encrypted!, 'wrong-password');
      expect(decrypted).toBeNull();
    });

    test('each encryption produces different ciphertext (random IV)', () => {
      const password = 'same-password';
      const data = 'same-data';

      const enc1 = manager.encrypt(data, password);
      const enc2 = manager.encrypt(data, password);

      expect(enc1!.iv).not.toBe(enc2!.iv);
      expect(enc1!.data).not.toBe(enc2!.data);
    });
  });

  describe('CryptoCore functions are directly interoperable', () => {
    test('deriveKey produces consistent results', () => {
      const salt = crypto.randomBytes(CRYPTO_CONSTANTS.SALT_LENGTH);
      const key1 = deriveKey('password', salt);
      const key2 = deriveKey('password', salt);

      expect(Buffer.compare(key1, key2)).toBe(0);
    });

    test('encryptBuffer → decryptBuffer round-trip', () => {
      const key = deriveKey('password', crypto.randomBytes(CRYPTO_CONSTANTS.SALT_LENGTH));
      const plaintext = Buffer.from('round-trip test');

      const { iv, authTag, ciphertext } = encryptBuffer(key, plaintext);
      const decrypted = decryptBuffer(key, iv, authTag, ciphertext);

      expect(Buffer.compare(decrypted, plaintext)).toBe(0);
    });

    test('decryptBuffer throws on wrong key', () => {
      const salt = crypto.randomBytes(CRYPTO_CONSTANTS.SALT_LENGTH);
      const key1 = deriveKey('password1', salt);
      const key2 = deriveKey('password2', salt);
      const { iv, authTag, ciphertext } = encryptBuffer(key1, Buffer.from('secret'));

      expect(() => decryptBuffer(key2, iv, authTag, ciphertext)).toThrow();
    });

    test('decryptBuffer throws on tampered ciphertext', () => {
      const key = deriveKey('password', crypto.randomBytes(CRYPTO_CONSTANTS.SALT_LENGTH));
      const { iv, authTag, ciphertext } = encryptBuffer(key, Buffer.from('secret'));

      // Tamper with ciphertext
      ciphertext[0] ^= 0xff;

      expect(() => decryptBuffer(key, iv, authTag, ciphertext)).toThrow();
    });
  });

  describe('BackupEncryption uses CryptoCore primitives', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cid-test-backup-'));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test('encryptBackup → decryptBackup round-trip', () => {
      const inputPath = path.join(tempDir, 'input.db');
      const encryptedPath = path.join(tempDir, 'encrypted.db');
      const decryptedPath = path.join(tempDir, 'decrypted.db');
      const data = JSON.stringify({ courses: [], tasks: [] });
      fs.writeFileSync(inputPath, data);

      const encResult = encryptBackup(inputPath, encryptedPath, 'backup-pass-123!');
      expect(encResult.success).toBe(true);

      const decResult = decryptBackup(encryptedPath, decryptedPath, 'backup-pass-123!');
      expect(decResult.success).toBe(true);

      const decrypted = fs.readFileSync(decryptedPath, 'utf8');
      expect(decrypted).toBe(data);
    });

    test('isEncryptedBackup detects encrypted file', () => {
      const inputPath = path.join(tempDir, 'input.db');
      const encryptedPath = path.join(tempDir, 'encrypted.db');
      // Write enough data to pass minimum size check
      fs.writeFileSync(inputPath, 'x'.repeat(200));

      encryptBackup(inputPath, encryptedPath, 'password');

      expect(isEncryptedBackup(encryptedPath)).toBe(true);
    });

    test('isEncryptedBackup returns false for SQLite file', () => {
      const sqlitePath = path.join(tempDir, 'test.db');
      // Write a fake SQLite header + padding
      const header = Buffer.alloc(200);
      header.write('SQLite format 3\0');
      fs.writeFileSync(sqlitePath, header);

      expect(isEncryptedBackup(sqlitePath)).toBe(false);
    });

    test('verifyBackupPassword returns true for correct password', () => {
      const inputPath = path.join(tempDir, 'input.db');
      const encryptedPath = path.join(tempDir, 'encrypted.db');
      fs.writeFileSync(inputPath, 'verify test data');

      encryptBackup(inputPath, encryptedPath, 'correct-pass');

      expect(verifyBackupPassword(encryptedPath, 'correct-pass')).toBe(true);
      expect(verifyBackupPassword(encryptedPath, 'wrong-pass')).toBe(false);
    });

    test('encrypted backup with special characters in password', () => {
      const inputPath = path.join(tempDir, 'input.db');
      const encryptedPath = path.join(tempDir, 'encrypted.db');
      const decryptedPath = path.join(tempDir, 'decrypted.db');
      const password = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`"\'\\';
      fs.writeFileSync(inputPath, 'special chars test');

      encryptBackup(inputPath, encryptedPath, password);
      const result = decryptBackup(encryptedPath, decryptedPath, password);

      expect(result.success).toBe(true);
      expect(fs.readFileSync(decryptedPath, 'utf8')).toBe('special chars test');
    });
  });
});
