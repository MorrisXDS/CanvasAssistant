/**
 * CryptoCore - Shared cryptographic primitives
 *
 * Single source of truth for AES-256-GCM encryption constants and operations.
 * Pure functions, no class, no Logger dependency, no EventEmitter.
 */

import crypto from 'crypto';

export const CRYPTO_CONSTANTS = {
  ALGORITHM: 'aes-256-gcm' as const,
  KEY_LENGTH: 32, // 256 bits
  IV_LENGTH: 16, // 128 bits for GCM
  AUTH_TAG_LENGTH: 16, // 128 bits
  SALT_LENGTH: 32, // 256 bits
  PBKDF2_ITERATIONS: 100000,
  PBKDF2_DIGEST: 'sha256' as const,
};

/**
 * Derive an encryption key from a password/passphrase and salt using PBKDF2.
 */
export function deriveKey(
  password: string | Buffer,
  salt: Buffer,
  iterations: number = CRYPTO_CONSTANTS.PBKDF2_ITERATIONS
): Buffer {
  return crypto.pbkdf2Sync(
    password,
    salt,
    iterations,
    CRYPTO_CONSTANTS.KEY_LENGTH,
    CRYPTO_CONSTANTS.PBKDF2_DIGEST
  );
}

/**
 * Encrypt a plaintext buffer using AES-256-GCM.
 * Returns the IV, auth tag, and ciphertext.
 */
export function encryptBuffer(
  key: Buffer,
  plaintext: Buffer
): { iv: Buffer; authTag: Buffer; ciphertext: Buffer } {
  const iv = crypto.randomBytes(CRYPTO_CONSTANTS.IV_LENGTH);
  const cipher = crypto.createCipheriv(CRYPTO_CONSTANTS.ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { iv, authTag, ciphertext };
}

/**
 * Decrypt a ciphertext buffer using AES-256-GCM.
 * Throws on authentication failure (wrong key, tampered data).
 */
export function decryptBuffer(
  key: Buffer,
  iv: Buffer,
  authTag: Buffer,
  ciphertext: Buffer
): Buffer {
  const decipher = crypto.createDecipheriv(CRYPTO_CONSTANTS.ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
