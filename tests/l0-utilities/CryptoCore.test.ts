/**
 * Tests for CryptoCore - Shared cryptographic primitives
 */

import crypto from 'crypto';
import {
  CRYPTO_CONSTANTS,
  deriveKey,
  encryptBuffer,
  decryptBuffer,
} from '../../src/layers/l0-utilities/CryptoCore';

describe('CryptoCore', () => {
  describe('CRYPTO_CONSTANTS', () => {
    test('has correct values', () => {
      expect(CRYPTO_CONSTANTS.ALGORITHM).toBe('aes-256-gcm');
      expect(CRYPTO_CONSTANTS.KEY_LENGTH).toBe(32);
      expect(CRYPTO_CONSTANTS.IV_LENGTH).toBe(16);
      expect(CRYPTO_CONSTANTS.AUTH_TAG_LENGTH).toBe(16);
      expect(CRYPTO_CONSTANTS.SALT_LENGTH).toBe(32);
      expect(CRYPTO_CONSTANTS.PBKDF2_ITERATIONS).toBe(100000);
      expect(CRYPTO_CONSTANTS.PBKDF2_DIGEST).toBe('sha256');
    });
  });

  describe('deriveKey', () => {
    test('returns consistent output for same inputs', () => {
      const password = 'test-password-123';
      const salt = crypto.randomBytes(CRYPTO_CONSTANTS.SALT_LENGTH);

      const key1 = deriveKey(password, salt);
      const key2 = deriveKey(password, salt);

      expect(key1).toEqual(key2);
    });

    test('returns different output for different salts', () => {
      const password = 'test-password-123';
      const salt1 = crypto.randomBytes(CRYPTO_CONSTANTS.SALT_LENGTH);
      const salt2 = crypto.randomBytes(CRYPTO_CONSTANTS.SALT_LENGTH);

      const key1 = deriveKey(password, salt1);
      const key2 = deriveKey(password, salt2);

      expect(key1).not.toEqual(key2);
    });

    test('returns Buffer of KEY_LENGTH bytes', () => {
      const password = 'test-password-123';
      const salt = crypto.randomBytes(CRYPTO_CONSTANTS.SALT_LENGTH);

      const key = deriveKey(password, salt);

      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(CRYPTO_CONSTANTS.KEY_LENGTH);
    });

    test('accepts both string and Buffer passwords', () => {
      const passwordString = 'test-password-123';
      const passwordBuffer = Buffer.from(passwordString);
      const salt = crypto.randomBytes(CRYPTO_CONSTANTS.SALT_LENGTH);

      const key1 = deriveKey(passwordString, salt);
      const key2 = deriveKey(passwordBuffer, salt);

      expect(key1).toEqual(key2);
    });
  });

  describe('encryptBuffer and decryptBuffer', () => {
    test('round-trip: plaintext -> encrypt -> decrypt -> same plaintext', () => {
      const key = crypto.randomBytes(CRYPTO_CONSTANTS.KEY_LENGTH);
      const plaintext = Buffer.from('Hello, World! This is a test message.');

      const { iv, authTag, ciphertext } = encryptBuffer(key, plaintext);
      const decrypted = decryptBuffer(key, iv, authTag, ciphertext);

      expect(decrypted).toEqual(plaintext);
      expect(decrypted.toString()).toBe('Hello, World! This is a test message.');
    });

    test('encryptBuffer produces different ciphertext for same plaintext (random IV)', () => {
      const key = crypto.randomBytes(CRYPTO_CONSTANTS.KEY_LENGTH);
      const plaintext = Buffer.from('Same message');

      const result1 = encryptBuffer(key, plaintext);
      const result2 = encryptBuffer(key, plaintext);

      // IVs should be different (randomly generated)
      expect(result1.iv).not.toEqual(result2.iv);
      // Ciphertexts should be different due to different IVs
      expect(result1.ciphertext).not.toEqual(result2.ciphertext);
      // Auth tags should be different
      expect(result1.authTag).not.toEqual(result2.authTag);

      // But both should decrypt to the same plaintext
      const decrypted1 = decryptBuffer(key, result1.iv, result1.authTag, result1.ciphertext);
      const decrypted2 = decryptBuffer(key, result2.iv, result2.authTag, result2.ciphertext);
      expect(decrypted1).toEqual(plaintext);
      expect(decrypted2).toEqual(plaintext);
    });
  });

  describe('decryptBuffer error cases', () => {
    test('decryptBuffer with wrong key throws', () => {
      const correctKey = crypto.randomBytes(CRYPTO_CONSTANTS.KEY_LENGTH);
      const wrongKey = crypto.randomBytes(CRYPTO_CONSTANTS.KEY_LENGTH);
      const plaintext = Buffer.from('Secret message');

      const { iv, authTag, ciphertext } = encryptBuffer(correctKey, plaintext);

      expect(() => {
        decryptBuffer(wrongKey, iv, authTag, ciphertext);
      }).toThrow();
    });

    test('decryptBuffer with tampered ciphertext throws', () => {
      const key = crypto.randomBytes(CRYPTO_CONSTANTS.KEY_LENGTH);
      const plaintext = Buffer.from('Secret message');

      const { iv, authTag, ciphertext } = encryptBuffer(key, plaintext);

      // Tamper with the ciphertext
      const tamperedCiphertext = Buffer.from(ciphertext);
      tamperedCiphertext[0] = tamperedCiphertext[0] ^ 0xFF; // Flip bits

      expect(() => {
        decryptBuffer(key, iv, authTag, tamperedCiphertext);
      }).toThrow();
    });

    test('decryptBuffer with wrong IV throws', () => {
      const key = crypto.randomBytes(CRYPTO_CONSTANTS.KEY_LENGTH);
      const plaintext = Buffer.from('Secret message');

      const { iv, authTag, ciphertext } = encryptBuffer(key, plaintext);

      // Use a different IV
      const wrongIV = crypto.randomBytes(CRYPTO_CONSTANTS.IV_LENGTH);

      expect(() => {
        decryptBuffer(key, wrongIV, authTag, ciphertext);
      }).toThrow();
    });
  });
});
