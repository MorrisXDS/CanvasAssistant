/**
 * Backup Encryption - AES-256-GCM encryption for database backups
 *
 * Uses PBKDF2 for key derivation and AES-256-GCM for authenticated encryption.
 * Output format: [salt (32)] [iv (16)] [authTag (16)] [encrypted data]
 */

import crypto from 'crypto';
import fs from 'fs';
import { CRYPTO_CONSTANTS, deriveKey, encryptBuffer, decryptBuffer } from './CryptoCore';

// Header size for detecting encrypted files
const HEADER_SIZE =
  CRYPTO_CONSTANTS.SALT_LENGTH + CRYPTO_CONSTANTS.IV_LENGTH + CRYPTO_CONSTANTS.AUTH_TAG_LENGTH;

export interface EncryptionResult {
  success: boolean;
  outputPath?: string;
  error?: string;
}

/**
 * Encrypt a database backup file with password
 *
 * @param inputPath - Path to the unencrypted backup file
 * @param outputPath - Path for the encrypted output file
 * @param password - User-provided password
 * @returns Result indicating success or failure with error message
 */
export function encryptBackup(
  inputPath: string,
  outputPath: string,
  password: string
): EncryptionResult {
  try {
    // Generate random salt for key derivation
    const salt = crypto.randomBytes(CRYPTO_CONSTANTS.SALT_LENGTH);

    // Derive key from password using PBKDF2
    const key = deriveKey(password, salt);

    // Encrypt file contents
    const input = fs.readFileSync(inputPath);
    const { iv, authTag, ciphertext: encrypted } = encryptBuffer(key, input);

    // Write output: salt + iv + authTag + encrypted data
    const output = Buffer.concat([salt, iv, authTag, encrypted]);
    fs.writeFileSync(outputPath, output);

    return { success: true, outputPath };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Decrypt an encrypted backup file
 *
 * @param inputPath - Path to the encrypted backup file
 * @param outputPath - Path for the decrypted output file
 * @param password - User-provided password
 * @returns Result indicating success or failure with error message
 */
export function decryptBackup(
  inputPath: string,
  outputPath: string,
  password: string
): EncryptionResult {
  try {
    const data = fs.readFileSync(inputPath);

    // Validate minimum file size
    if (data.length < HEADER_SIZE + 16) {
      return { success: false, error: 'Invalid encrypted backup file (too small)' };
    }

    // Extract header components
    const salt = data.subarray(0, CRYPTO_CONSTANTS.SALT_LENGTH);
    const iv = data.subarray(
      CRYPTO_CONSTANTS.SALT_LENGTH,
      CRYPTO_CONSTANTS.SALT_LENGTH + CRYPTO_CONSTANTS.IV_LENGTH
    );
    const authTag = data.subarray(
      CRYPTO_CONSTANTS.SALT_LENGTH + CRYPTO_CONSTANTS.IV_LENGTH,
      CRYPTO_CONSTANTS.SALT_LENGTH + CRYPTO_CONSTANTS.IV_LENGTH + CRYPTO_CONSTANTS.AUTH_TAG_LENGTH
    );
    const encrypted = data.subarray(HEADER_SIZE);

    // Derive key from password
    const key = deriveKey(password, salt);

    // Decrypt
    const decrypted = decryptBuffer(key, iv, authTag, encrypted);
    fs.writeFileSync(outputPath, decrypted);

    return { success: true, outputPath };
  } catch (error) {
    // GCM authentication failure means wrong password or corrupted file
    if (
      error instanceof Error &&
      (error.message.includes('Unsupported state') ||
        error.message.includes('authentication'))
    ) {
      return { success: false, error: 'Invalid password or corrupted backup file' };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check if a file is an encrypted backup
 *
 * Encrypted backups don't start with the SQLite header,
 * while unencrypted SQLite files start with "SQLite format 3\0"
 *
 * @param filePath - Path to the file to check
 * @returns true if the file appears to be encrypted, false otherwise
 */
export function isEncryptedBackup(filePath: string): boolean {
  try {
    const stats = fs.statSync(filePath);

    // Minimum size: header + some encrypted data
    if (stats.size < HEADER_SIZE + 100) {
      return false;
    }

    // Read first 16 bytes to check for SQLite header
    const header = Buffer.alloc(16);
    const fd = fs.openSync(filePath, 'r');
    try {
      fs.readSync(fd, header, 0, 16, 0);
    } finally {
      fs.closeSync(fd);
    }

    // SQLite files start with "SQLite format 3\0"
    const sqliteHeader = 'SQLite format 3\0';
    const isSqlite = header.toString('utf8').startsWith(sqliteHeader);

    // If it doesn't look like SQLite, assume it's encrypted
    return !isSqlite;
  } catch {
    return false;
  }
}

/**
 * Verify a password against an encrypted backup
 * Attempts decryption to a temp buffer without writing to disk
 *
 * @param filePath - Path to the encrypted backup file
 * @param password - Password to verify
 * @returns true if password is correct, false otherwise
 */
export function verifyBackupPassword(filePath: string, password: string): boolean {
  try {
    const data = fs.readFileSync(filePath);

    if (data.length < HEADER_SIZE + 16) {
      return false;
    }

    const salt = data.subarray(0, CRYPTO_CONSTANTS.SALT_LENGTH);
    const iv = data.subarray(
      CRYPTO_CONSTANTS.SALT_LENGTH,
      CRYPTO_CONSTANTS.SALT_LENGTH + CRYPTO_CONSTANTS.IV_LENGTH
    );
    const authTag = data.subarray(
      CRYPTO_CONSTANTS.SALT_LENGTH + CRYPTO_CONSTANTS.IV_LENGTH,
      CRYPTO_CONSTANTS.SALT_LENGTH + CRYPTO_CONSTANTS.IV_LENGTH + CRYPTO_CONSTANTS.AUTH_TAG_LENGTH
    );
    const encrypted = data.subarray(HEADER_SIZE);

    const key = deriveKey(password, salt);

    // Try to decrypt - will throw if password is wrong
    decryptBuffer(key, iv, authTag, encrypted);

    return true;
  } catch {
    return false;
  }
}
