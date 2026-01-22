/**
 * L0 Utilities - Credential Manager
 *
 * Secure credential storage with OS keychain support and encrypted file fallback.
 * Validates tokens on retrieval to ensure they haven't been revoked.
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { CredentialManagerConfig } from './AppConfig';
import { ComponentLogger, Logger } from './Logger';

// Storage backend types
type StorageBackend = 'keychain' | 'file' | 'none';

export interface CredentialManagerOptions {
  serviceName?: string;
  accountName?: string;
  enableFileFallback?: boolean;
  fallbackFilePath?: string;
  validateOnRetrieve?: boolean;
  logger?: Logger;
  /** Custom token validator function (for testing or custom validation) */
  tokenValidator?: (token: string) => Promise<boolean>;
}

export interface CredentialStatus {
  hasCredential: boolean;
  storageBackend: StorageBackend;
  lastValidated: Date | null;
  isValid: boolean | null;
}

// Encryption constants for file fallback
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

/**
 * Credential Manager for secure token storage
 *
 * Features:
 * - OS keychain storage via keytar (primary)
 * - Encrypted file fallback
 * - Token validation on retrieval
 * - Event emission for errors
 */
export class CredentialManager extends EventEmitter {
  private readonly serviceName: string;
  private readonly accountName: string;
  private readonly enableFileFallback: boolean;
  private readonly fallbackFilePath: string;
  private readonly validateOnRetrieve: boolean;
  private readonly tokenValidator?: (token: string) => Promise<boolean>;
  private readonly log: ComponentLogger;

  private storageBackend: StorageBackend = 'none';
  private lastValidated: Date | null = null;
  private lastValidationResult: boolean | null = null;
  private keytar: typeof import('keytar') | null = null;
  private keytarAvailable: boolean = false;
  private encryptionKey: Buffer | null = null;

  constructor(config?: CredentialManagerConfig | CredentialManagerOptions, logger?: Logger) {
    super();

    // Apply defaults
    this.serviceName = config?.serviceName ?? 'CanvasIntegrationDashboard';
    this.accountName = config?.accountName ?? 'canvas-api-token';
    this.enableFileFallback = config?.enableFileFallback ?? true;
    this.fallbackFilePath = config?.fallbackFilePath ?? 'data/.credentials';
    this.validateOnRetrieve = config?.validateOnRetrieve ?? true;

    // Check for options-specific properties
    if (config && 'tokenValidator' in config) {
      this.tokenValidator = config.tokenValidator;
    }
    if (config && 'logger' in config && config.logger) {
      this.log = config.logger.child('credentialManager');
    } else if (logger) {
      this.log = logger.child('credentialManager');
    } else {
      // Create a minimal logger for standalone use
      const defaultLogger = new Logger({ enableConsole: false });
      this.log = defaultLogger.child('credentialManager');
    }

    // Initialize storage backend
    this.initializeStorage();
  }

  /**
   * Initialize storage backend - try keytar, fall back to file
   */
  private async initializeStorage(): Promise<void> {
    // Try to load keytar
    try {
      this.keytar = await import('keytar');
      // Test if keytar actually works
      await this.keytar.findCredentials(this.serviceName);
      this.keytarAvailable = true;
      this.storageBackend = 'keychain';
      this.log.info('Keychain storage initialized successfully');
    } catch (error) {
      this.keytarAvailable = false;
      this.log.warn(`Keychain unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`);

      if (this.enableFileFallback) {
        try {
          this.initializeFileFallback();
          this.storageBackend = 'file';
          this.log.info('Falling back to encrypted file storage');
        } catch (fileError) {
          this.storageBackend = 'none';
          this.log.error('Failed to initialize file fallback', fileError instanceof Error ? fileError : undefined);
          this.emit('error', {
            type: 'storage-init-failed',
            message: 'No secure storage available',
            error: fileError,
          });
        }
      } else {
        this.storageBackend = 'none';
        this.emit('error', {
          type: 'keychain-unavailable',
          message: 'Keychain unavailable and file fallback disabled',
          error,
        });
      }
    }
  }

  /**
   * Initialize encrypted file fallback storage
   */
  private initializeFileFallback(): void {
    // Ensure directory exists
    const dir = path.dirname(this.fallbackFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Derive encryption key from machine-specific data
    this.encryptionKey = this.deriveEncryptionKey();
  }

  /**
   * Derive encryption key from machine-specific data
   * Uses a combination of factors to create a machine-bound key
   */
  private deriveEncryptionKey(): Buffer {
    // Use environment-specific data for key derivation
    const machineId = [
      process.env.USER || process.env.USERNAME || 'user',
      process.env.HOME || process.env.USERPROFILE || '/home',
      process.platform,
      process.arch,
    ].join(':');

    // Use PBKDF2 to derive a key
    const salt = Buffer.from('CID-CredentialManager-Salt-v1');
    return crypto.pbkdf2Sync(machineId, salt, 100000, KEY_LENGTH, 'sha256');
  }

  /**
   * Store a credential securely
   */
  async store(token: string): Promise<boolean> {
    if (!token || token.trim() === '') {
      this.log.error('Attempted to store empty token');
      this.emit('error', {
        type: 'invalid-token',
        message: 'Cannot store empty token',
      });
      return false;
    }

    try {
      if (this.storageBackend === 'keychain' && this.keytar) {
        await this.keytar.setPassword(this.serviceName, this.accountName, token);
        this.log.info('Token stored in OS keychain');
        this.emit('credential-stored', { backend: 'keychain' });
        return true;
      }

      if (this.storageBackend === 'file') {
        this.storeToFile(token);
        this.log.info('Token stored in encrypted file');
        this.emit('credential-stored', { backend: 'file' });
        return true;
      }

      this.log.error('No storage backend available');
      this.emit('error', {
        type: 'no-storage',
        message: 'No secure storage backend available',
      });
      return false;
    } catch (error) {
      this.log.error('Failed to store token', error instanceof Error ? error : undefined);
      this.emit('error', {
        type: 'store-failed',
        message: 'Failed to store token',
        error,
      });
      return false;
    }
  }

  /**
   * Retrieve stored credential
   * Optionally validates the token before returning
   */
  async retrieve(): Promise<string | null> {
    try {
      let token: string | null = null;

      if (this.storageBackend === 'keychain' && this.keytar) {
        token = await this.keytar.getPassword(this.serviceName, this.accountName);
      } else if (this.storageBackend === 'file') {
        token = this.retrieveFromFile();
      }

      if (!token) {
        this.log.debug('No token found in storage');
        return null;
      }

      // Validate token if configured
      if (this.validateOnRetrieve) {
        const isValid = await this.validateToken(token);
        if (!isValid) {
          this.log.warn('Stored token failed validation (may be revoked)');
          this.emit('token-invalid', { reason: 'validation-failed' });
          // Return null since token is invalid
          return null;
        }
      }

      this.log.debug('Token retrieved successfully');
      return token;
    } catch (error) {
      this.log.error('Failed to retrieve token', error instanceof Error ? error : undefined);
      this.emit('error', {
        type: 'retrieve-failed',
        message: 'Failed to retrieve token',
        error,
      });
      return null;
    }
  }

  /**
   * Delete stored credential
   */
  async delete(): Promise<boolean> {
    try {
      if (this.storageBackend === 'keychain' && this.keytar) {
        const deleted = await this.keytar.deletePassword(this.serviceName, this.accountName);
        if (deleted) {
          this.log.info('Token deleted from OS keychain');
          this.emit('credential-deleted', { backend: 'keychain' });
        }
        return deleted;
      }

      if (this.storageBackend === 'file') {
        if (fs.existsSync(this.fallbackFilePath)) {
          fs.unlinkSync(this.fallbackFilePath);
          this.log.info('Token deleted from encrypted file');
          this.emit('credential-deleted', { backend: 'file' });
          return true;
        }
        return false;
      }

      return false;
    } catch (error) {
      this.log.error('Failed to delete token', error instanceof Error ? error : undefined);
      this.emit('error', {
        type: 'delete-failed',
        message: 'Failed to delete token',
        error,
      });
      return false;
    }
  }

  /**
   * Check if a credential exists (without retrieving it)
   */
  async exists(): Promise<boolean> {
    try {
      if (this.storageBackend === 'keychain' && this.keytar) {
        const token = await this.keytar.getPassword(this.serviceName, this.accountName);
        return token !== null;
      }

      if (this.storageBackend === 'file') {
        return fs.existsSync(this.fallbackFilePath);
      }

      return false;
    } catch (error) {
      this.log.error('Failed to check token existence', error instanceof Error ? error : undefined);
      return false;
    }
  }

  /**
   * Get current status
   */
  getStatus(): CredentialStatus {
    return {
      hasCredential: false, // Will be updated by exists() call
      storageBackend: this.storageBackend,
      lastValidated: this.lastValidated,
      isValid: this.lastValidationResult,
    };
  }

  /**
   * Get current storage backend
   */
  getStorageBackend(): StorageBackend {
    return this.storageBackend;
  }

  /**
   * Validate a token by making a test API call
   */
  private async validateToken(token: string): Promise<boolean> {
    try {
      // Use custom validator if provided
      if (this.tokenValidator) {
        const isValid = await this.tokenValidator(token);
        this.lastValidated = new Date();
        this.lastValidationResult = isValid;
        return isValid;
      }

      // Default validation: make a test API call to Canvas
      // This is a lightweight endpoint that just returns user info
      const response = await fetch('https://canvas.instructure.com/api/v1/users/self', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      this.lastValidated = new Date();
      this.lastValidationResult = response.ok;

      if (!response.ok) {
        this.log.warn(`Token validation failed with status ${response.status}`);
      }

      return response.ok;
    } catch (error) {
      this.log.error('Token validation error', error instanceof Error ? error : undefined);
      this.lastValidated = new Date();
      this.lastValidationResult = false;
      return false;
    }
  }

  /**
   * Store token to encrypted file
   */
  private storeToFile(token: string): void {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized');
    }

    // Generate random IV and salt
    const iv = crypto.randomBytes(IV_LENGTH);
    const salt = crypto.randomBytes(SALT_LENGTH);

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);

    // Encrypt token
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    // Combine all parts: salt + iv + authTag + encrypted
    const data = Buffer.concat([
      salt,
      iv,
      authTag,
      Buffer.from(encrypted, 'hex'),
    ]);

    // Write to file
    fs.writeFileSync(this.fallbackFilePath, data);
  }

  /**
   * Retrieve token from encrypted file
   */
  private retrieveFromFile(): string | null {
    if (!this.encryptionKey) {
      return null;
    }

    if (!fs.existsSync(this.fallbackFilePath)) {
      return null;
    }

    try {
      const data = fs.readFileSync(this.fallbackFilePath);

      // Extract parts
      const salt = data.subarray(0, SALT_LENGTH);
      const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
      const authTag = data.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
      const encrypted = data.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

      // Create decipher
      const decipher = crypto.createDecipheriv(ALGORITHM, this.encryptionKey, iv);
      decipher.setAuthTag(authTag);

      // Decrypt
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      return decrypted.toString('utf8');
    } catch (error) {
      this.log.error('Failed to decrypt credential file', error instanceof Error ? error : undefined);
      return null;
    }
  }

  /**
   * Ensure storage is initialized (call after constructor for async init)
   */
  async ensureInitialized(): Promise<void> {
    if (this.storageBackend === 'none') {
      await this.initializeStorage();
    }
  }
}
