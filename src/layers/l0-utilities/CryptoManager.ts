/**
 * L0 Utilities - Crypto Manager
 *
 * Password-based encryption/decryption for export files.
 * Uses AES-256-GCM with PBKDF2 key derivation.
 */

import crypto from 'crypto';
import { EventEmitter } from 'events';
import { ComponentLogger, Logger } from './Logger';
import { CRYPTO_CONSTANTS, deriveKey, encryptBuffer, decryptBuffer } from './CryptoCore';

// Version for format compatibility
const CRYPTO_VERSION = '1.0';

export interface EncryptedData {
  version: string;
  algorithm: string;
  salt: string; // Base64
  iv: string; // Base64
  authTag: string; // Base64
  data: string; // Base64 encrypted content
}

export interface CryptoManagerOptions {
  logger?: Logger;
  iterations?: number;
}

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4; // 0=very weak, 4=very strong
  feedback: string;
  isAcceptable: boolean;
}

/**
 * Crypto Manager for export file encryption
 *
 * Features:
 * - AES-256-GCM encryption with authenticated encryption
 * - PBKDF2 key derivation with 100,000 iterations
 * - Password strength validation
 * - Secure buffer handling
 */
export class CryptoManager extends EventEmitter {
  private readonly log: ComponentLogger;
  private readonly iterations: number;

  constructor(options: CryptoManagerOptions = {}) {
    super();

    this.iterations = options.iterations ?? CRYPTO_CONSTANTS.PBKDF2_ITERATIONS;

    if (options.logger) {
      this.log = options.logger.child('cryptoManager');
    } else {
      const defaultLogger = new Logger({ enableConsole: false });
      this.log = defaultLogger.child('cryptoManager');
    }
  }

  /**
   * Encrypt data with a password
   * @param data - The data to encrypt (string or Buffer)
   * @param password - The encryption password
   * @returns Encrypted data structure or null on failure
   */
  encrypt(data: string | Buffer, password: string): EncryptedData | null {
    try {
      if (!password || password.length === 0) {
        this.log.error('Cannot encrypt with empty password');
        return null;
      }

      // Generate random salt
      const salt = crypto.randomBytes(CRYPTO_CONSTANTS.SALT_LENGTH);

      // Derive key from password using PBKDF2
      const key = deriveKey(password, salt, this.iterations);

      // Encrypt data
      const inputBuffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
      const { iv, authTag, ciphertext: encrypted } = encryptBuffer(key, inputBuffer);

      // Zero out the key for security
      key.fill(0);

      const result: EncryptedData = {
        version: CRYPTO_VERSION,
        algorithm: CRYPTO_CONSTANTS.ALGORITHM,
        salt: salt.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        data: encrypted.toString('base64'),
      };

      this.log.debug('Data encrypted successfully');
      this.emit('encrypted', { size: encrypted.length });

      return result;
    } catch (error) {
      this.log.error('Encryption failed', error instanceof Error ? error : undefined);
      this.emit('error', { type: 'encrypt-failed', error });
      return null;
    }
  }

  /**
   * Decrypt encrypted data with a password
   * @param encryptedData - The encrypted data structure
   * @param password - The decryption password
   * @returns Decrypted data as Buffer or null on failure
   */
  decrypt(encryptedData: EncryptedData, password: string): Buffer | null {
    try {
      if (!password || password.length === 0) {
        this.log.error('Cannot decrypt with empty password');
        return null;
      }

      // Validate version
      if (encryptedData.version !== CRYPTO_VERSION) {
        this.log.error(`Unsupported encryption version: ${encryptedData.version}`);
        this.emit('error', {
          type: 'unsupported-version',
          version: encryptedData.version,
        });
        return null;
      }

      // Decode base64 values
      const salt = Buffer.from(encryptedData.salt, 'base64');
      const iv = Buffer.from(encryptedData.iv, 'base64');
      const authTag = Buffer.from(encryptedData.authTag, 'base64');
      const encrypted = Buffer.from(encryptedData.data, 'base64');

      // Validate sizes
      if (salt.length !== CRYPTO_CONSTANTS.SALT_LENGTH) {
        this.log.error('Invalid salt length');
        return null;
      }
      if (iv.length !== CRYPTO_CONSTANTS.IV_LENGTH) {
        this.log.error('Invalid IV length');
        return null;
      }
      if (authTag.length !== CRYPTO_CONSTANTS.AUTH_TAG_LENGTH) {
        this.log.error('Invalid auth tag length');
        return null;
      }

      // Derive key from password
      const key = deriveKey(password, salt, this.iterations);

      // Decrypt data
      const decrypted = decryptBuffer(key, iv, authTag, encrypted);

      // Zero out the key for security
      key.fill(0);

      this.log.debug('Data decrypted successfully');
      this.emit('decrypted', { size: decrypted.length });

      return decrypted;
    } catch (error) {
      // GCM authentication failure means wrong password or tampered data
      if (error instanceof Error && error.message.includes('Unsupported state')) {
        this.log.warn('Decryption failed: wrong password or corrupted data');
        this.emit('error', {
          type: 'auth-failed',
          message: 'Wrong password or corrupted data',
        });
      } else {
        this.log.error('Decryption failed', error instanceof Error ? error : undefined);
        this.emit('error', { type: 'decrypt-failed', error });
      }
      return null;
    }
  }

  /**
   * Decrypt encrypted data and return as string
   * @param encryptedData - The encrypted data structure
   * @param password - The decryption password
   * @returns Decrypted string or null on failure
   */
  decryptToString(encryptedData: EncryptedData, password: string): string | null {
    const buffer = this.decrypt(encryptedData, password);
    return buffer ? buffer.toString('utf8') : null;
  }

  /**
   * Validate if encrypted data structure is well-formed
   * @param data - The data to validate
   * @returns True if the structure is valid
   */
  isValidEncryptedData(data: unknown): data is EncryptedData {
    if (typeof data !== 'object' || data === null) {
      return false;
    }

    const obj = data as Record<string, unknown>;

    return (
      typeof obj.version === 'string' &&
      typeof obj.algorithm === 'string' &&
      typeof obj.salt === 'string' &&
      typeof obj.iv === 'string' &&
      typeof obj.authTag === 'string' &&
      typeof obj.data === 'string'
    );
  }

  /**
   * Evaluate password strength
   * @param password - The password to evaluate
   * @returns Password strength assessment
   */
  evaluatePasswordStrength(password: string): PasswordStrength {
    let score = 0;
    const feedback: string[] = [];

    // Length checks
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (password.length >= 16) score++;

    if (password.length < 8) {
      feedback.push('Use at least 8 characters');
    }

    // Character variety checks
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[^a-zA-Z0-9]/.test(password);

    const varietyCount = [hasLower, hasUpper, hasNumber, hasSpecial].filter(
      Boolean
    ).length;
    if (varietyCount >= 3) score++;

    if (!hasUpper) feedback.push('Add uppercase letters');
    if (!hasNumber) feedback.push('Add numbers');
    if (!hasSpecial) feedback.push('Add special characters');

    // Cap score at 4
    const finalScore = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;

    // Determine if acceptable (minimum score of 2)
    const isAcceptable = finalScore >= 2 && password.length >= 8;

    return {
      score: finalScore,
      feedback: feedback.length > 0 ? feedback.join('; ') : 'Strong password',
      isAcceptable,
    };
  }

  /**
   * Generate a secure random password
   * @param length - The desired password length (default: 16)
   * @returns A randomly generated password
   */
  generatePassword(length: number = 16): string {
    const charset =
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    const randomBytes = crypto.randomBytes(length);
    let password = '';

    for (let i = 0; i < length; i++) {
      password += charset[randomBytes[i] % charset.length];
    }

    return password;
  }

  /**
   * Compute SHA-256 hash of data (for manifests/verification)
   * @param data - The data to hash
   * @returns Hex-encoded hash
   */
  computeHash(data: string | Buffer): string {
    const hash = crypto.createHash('sha256');
    hash.update(data);
    return hash.digest('hex');
  }

  /**
   * Verify data integrity against a hash
   * @param data - The data to verify
   * @param expectedHash - The expected hash
   * @returns True if hash matches
   */
  verifyHash(data: string | Buffer, expectedHash: string): boolean {
    const actualHash = this.computeHash(data);
    return actualHash === expectedHash;
  }
}
