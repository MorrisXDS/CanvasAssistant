/**
 * Backup Encryption - AES-256-GCM encryption for database backups
 *
 * Uses PBKDF2 for key derivation and AES-256-GCM for authenticated encryption.
 * Output format: [salt (32)] [iv (16)] [authTag (16)] [encrypted data]
 */

import crypto from 'crypto';
import fs from 'fs';

// Encryption constants
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits for GCM
const SALT_LENGTH = 32; // 256 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_DIGEST = 'sha256';

// Header size for detecting encrypted files
const HEADER_SIZE = SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH;

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
    const salt = crypto.randomBytes(SALT_LENGTH);

    // Derive key from password using PBKDF2
    const key = crypto.pbkdf2Sync(
      password,
      salt,
      PBKDF2_ITERATIONS,
      KEY_LENGTH,
      PBKDF2_DIGEST
    );

    // Generate random IV for encryption
    const iv = crypto.randomBytes(IV_LENGTH);

    // Create cipher and encrypt
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const input = fs.readFileSync(inputPath);
    const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
    const authTag = cipher.getAuthTag();

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
    const salt = data.subarray(0, SALT_LENGTH);
    const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = data.subarray(
      SALT_LENGTH + IV_LENGTH,
      SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
    );
    const encrypted = data.subarray(HEADER_SIZE);

    // Derive key from password
    const key = crypto.pbkdf2Sync(
      password,
      salt,
      PBKDF2_ITERATIONS,
      KEY_LENGTH,
      PBKDF2_DIGEST
    );

    // Create decipher and decrypt
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
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

    const salt = data.subarray(0, SALT_LENGTH);
    const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = data.subarray(
      SALT_LENGTH + IV_LENGTH,
      SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
    );
    const encrypted = data.subarray(HEADER_SIZE);

    const key = crypto.pbkdf2Sync(
      password,
      salt,
      PBKDF2_ITERATIONS,
      KEY_LENGTH,
      PBKDF2_DIGEST
    );

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Try to decrypt - will throw if password is wrong
    decipher.update(encrypted);
    decipher.final();

    return true;
  } catch {
    return false;
  }
}
