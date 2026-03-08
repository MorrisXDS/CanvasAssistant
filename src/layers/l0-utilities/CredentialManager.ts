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
import axios, { AxiosError } from 'axios';
import { CredentialManagerConfig } from './AppConfig';
import { ComponentLogger, Logger } from './Logger';
import { DEFAULT_PATHS, ensureDirectory } from './DefaultPaths';
import { CRYPTO_CONSTANTS, deriveKey, encryptBuffer, decryptBuffer } from './CryptoCore';

// Storage backend types
type StorageBackend = 'keychain' | 'file' | 'none';

export interface CredentialManagerOptions {
  serviceName?: string;
  accountName?: string;
  enableFileFallback?: boolean;
  fallbackFilePath?: string;
  validateOnRetrieve?: boolean;
  logger?: Logger;
  /** Base URL for Canvas API (e.g., 'https://utoronto.instructure.com') */
  baseUrl?: string;
  /** Custom token validator function (for testing or custom validation) */
  tokenValidator?: (token: string) => Promise<boolean>;
}

export interface CredentialStatus {
  hasCredential: boolean;
  storageBackend: StorageBackend;
  lastValidated: Date | null;
  isValid: boolean | null;
}


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
  private baseUrl: string;

  private storageBackend: StorageBackend = 'none';
  private lastValidated: Date | null = null;
  private lastValidationResult: boolean | null = null;
  private keytar: typeof import('keytar') | null = null;
  private keytarAvailable: boolean = false;
  private encryptionKey: Buffer | null = null;

  // Initialization state tracking to prevent race conditions
  private initializationPromise: Promise<void> | null = null;
  private isInitialized: boolean = false;

  // Token validation settings
  private static readonly VALIDATION_TIMEOUT_MS = 10000; // 10 seconds
  private static readonly VALIDATION_MAX_RETRIES = 2;
  private static readonly VALIDATION_RETRY_DELAY_MS = 1000;
  private static readonly BACKGROUND_VALIDATION_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

  // Background validation state
  private backgroundValidationTimer: NodeJS.Timeout | null = null;
  private startupValidationTimer: NodeJS.Timeout | null = null;

  constructor(
    config?: CredentialManagerConfig | CredentialManagerOptions,
    logger?: Logger
  ) {
    super();

    // Apply defaults
    this.serviceName = config?.serviceName ?? 'CanvasIntegrationDashboard';
    this.accountName = config?.accountName ?? 'canvas-api-token';
    this.enableFileFallback = config?.enableFileFallback ?? true;
    this.fallbackFilePath = config?.fallbackFilePath ?? DEFAULT_PATHS.credentials;
    this.validateOnRetrieve = config?.validateOnRetrieve ?? true;
    this.baseUrl =
      (config && 'baseUrl' in config ? config.baseUrl : undefined) ?? '';

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

    // Lazy initialization - defer initializeStorage() until first use
    // This avoids macOS TCC keychain prompts at cold startup
    // Callers should use ensureInitialized() or await methods that call waitForInit()
  }

  /**
   * Wait for storage initialization to complete.
   * Lazily triggers init on first call to avoid cold-startup keychain prompts.
   */
  private async waitForInit(): Promise<void> {
    if (this.isInitialized) return;
    if (!this.initializationPromise) {
      this.initializationPromise = this.initializeStorage()
        .then(() => {
          this.isInitialized = true;
          this.emit('initialized', { backend: this.storageBackend });
        })
        .catch((error) => {
          this.log.error(
            'Storage initialization failed',
            error instanceof Error ? error : undefined
          );
          this.isInitialized = true; // Mark as done even on failure
          this.emit('error', {
            type: 'init-failed',
            message: 'Storage initialization failed',
            error,
          });
        });
    }
    await this.initializationPromise;
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
      this.log.warn(
        `Keychain unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`
      );

      if (this.enableFileFallback) {
        try {
          this.initializeFileFallback();
          this.storageBackend = 'file';
          this.log.info('Falling back to encrypted file storage');
        } catch (fileError) {
          this.storageBackend = 'none';
          this.log.error(
            'Failed to initialize file fallback',
            fileError instanceof Error ? fileError : undefined
          );
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
    ensureDirectory(path.dirname(this.fallbackFilePath));

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
    return deriveKey(machineId, salt);
  }

  /**
   * Store a credential securely
   */
  async store(token: string): Promise<boolean> {
    // Wait for initialization to complete before storing
    await this.waitForInit();

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
    // Wait for initialization to complete before retrieving
    await this.waitForInit();

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
      this.log.error(
        'Failed to retrieve token',
        error instanceof Error ? error : undefined
      );
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
    // Wait for initialization to complete before deleting
    await this.waitForInit();

    try {
      if (this.storageBackend === 'keychain' && this.keytar) {
        const deleted = await this.keytar.deletePassword(
          this.serviceName,
          this.accountName
        );
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
      this.log.error(
        'Failed to delete token',
        error instanceof Error ? error : undefined
      );
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
    // Wait for initialization to complete before checking
    await this.waitForInit();

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
      this.log.error(
        'Failed to check token existence',
        error instanceof Error ? error : undefined
      );
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
   * Set the Canvas base URL for token validation
   */
  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl;
  }

  /**
   * Get the current Canvas base URL
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Validate a token by making a test API call with retry logic
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

      // Default validation: make a test API call to Canvas using axios
      // This is a lightweight endpoint that just returns user info
      const validateUrl = `${this.baseUrl}/api/v1/users/self`;

      let lastError: Error | null = null;

      for (
        let attempt = 0;
        attempt <= CredentialManager.VALIDATION_MAX_RETRIES;
        attempt++
      ) {
        try {
          const response = await axios.get(validateUrl, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            timeout: CredentialManager.VALIDATION_TIMEOUT_MS,
            validateStatus: () => true, // Don't throw on non-2xx
          });

          this.lastValidated = new Date();
          this.lastValidationResult = response.status >= 200 && response.status < 300;

          if (!this.lastValidationResult) {
            this.log.warn(`Token validation failed with status ${response.status}`);
          }

          return this.lastValidationResult;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          // Check if error is retryable (network errors, timeouts)
          const isRetryable = this.isRetryableError(error);

          if (isRetryable && attempt < CredentialManager.VALIDATION_MAX_RETRIES) {
            this.log.debug(`Token validation attempt ${attempt + 1} failed, retrying...`);
            await this.delay(CredentialManager.VALIDATION_RETRY_DELAY_MS);
            continue;
          }

          // Non-retryable error or max retries reached
          break;
        }
      }

      this.log.error('Token validation error after retries', lastError || undefined);
      this.lastValidated = new Date();
      this.lastValidationResult = false;
      return false;
    } catch (error) {
      this.log.error(
        'Token validation error',
        error instanceof Error ? error : undefined
      );
      this.lastValidated = new Date();
      this.lastValidationResult = false;
      return false;
    }
  }

  /**
   * Check if an error is retryable (network issues, timeouts)
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof AxiosError) {
      // Network errors (no response)
      if (!error.response) return true;
      // Server errors (5xx)
      if (error.response.status >= 500) return true;
      // Rate limited (429) - should retry after delay
      if (error.response.status === 429) return true;
    }
    return false;
  }

  /**
   * Helper to create a delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Store token to encrypted file with secure permissions
   */
  private storeToFile(token: string): void {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized');
    }

    // Generate random salt
    const salt = crypto.randomBytes(CRYPTO_CONSTANTS.SALT_LENGTH);

    // Encrypt token
    const { iv, authTag, ciphertext } = encryptBuffer(this.encryptionKey, Buffer.from(token, 'utf8'));

    // Combine all parts: salt + iv + authTag + encrypted
    const data = Buffer.concat([salt, iv, authTag, ciphertext]);

    // Write to file with secure permissions (owner read/write only)
    fs.writeFileSync(this.fallbackFilePath, data, { mode: 0o600 });

    // On Unix systems, also explicitly set permissions in case umask affected the write
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(this.fallbackFilePath, 0o600);
      } catch {
        // Ignore chmod errors - the initial write mode should suffice
      }
    }
  }

  /**
   * Retrieve token from encrypted file with integrity verification
   */
  private retrieveFromFile(): string | null {
    if (!this.encryptionKey) {
      return null;
    }

    if (!fs.existsSync(this.fallbackFilePath)) {
      return null;
    }

    try {
      // Verify file permissions on Unix systems (security check)
      if (process.platform !== 'win32') {
        const stats = fs.statSync(this.fallbackFilePath);
        const mode = stats.mode & 0o777;
        if (mode !== 0o600) {
          this.log.warn(
            `Credential file has insecure permissions (${mode.toString(8)}), fixing...`
          );
          fs.chmodSync(this.fallbackFilePath, 0o600);
        }
      }

      const data = fs.readFileSync(this.fallbackFilePath);

      // Verify minimum file size (salt + iv + authTag + at least 1 byte encrypted)
      const minSize = CRYPTO_CONSTANTS.SALT_LENGTH + CRYPTO_CONSTANTS.IV_LENGTH + CRYPTO_CONSTANTS.AUTH_TAG_LENGTH + 1;
      if (data.length < minSize) {
        this.log.error('Credential file corrupted: too small');
        return null;
      }

      // Extract parts
      const _salt = data.subarray(0, CRYPTO_CONSTANTS.SALT_LENGTH);
      const iv = data.subarray(CRYPTO_CONSTANTS.SALT_LENGTH, CRYPTO_CONSTANTS.SALT_LENGTH + CRYPTO_CONSTANTS.IV_LENGTH);
      const authTag = data.subarray(
        CRYPTO_CONSTANTS.SALT_LENGTH + CRYPTO_CONSTANTS.IV_LENGTH,
        CRYPTO_CONSTANTS.SALT_LENGTH + CRYPTO_CONSTANTS.IV_LENGTH + CRYPTO_CONSTANTS.AUTH_TAG_LENGTH
      );
      const encrypted = data.subarray(CRYPTO_CONSTANTS.SALT_LENGTH + CRYPTO_CONSTANTS.IV_LENGTH + CRYPTO_CONSTANTS.AUTH_TAG_LENGTH);

      // Decrypt (GCM mode provides authentication - will throw on tampered data)
      const decrypted = decryptBuffer(this.encryptionKey, iv, authTag, encrypted);

      return decrypted.toString('utf8');
    } catch (error) {
      // GCM authentication failure indicates tampering or corruption
      if (error instanceof Error && error.message.includes('Unsupported state')) {
        this.log.error('Credential file integrity check failed - possible tampering');
      } else {
        this.log.error(
          'Failed to decrypt credential file',
          error instanceof Error ? error : undefined
        );
      }
      return null;
    }
  }

  /**
   * Ensure storage is initialized (call after constructor for async init)
   * This is safe to call multiple times - it will only wait for the initial init
   */
  async ensureInitialized(): Promise<void> {
    await this.waitForInit();
    // If storage backend is still 'none' after init, try one more time
    // This handles the case where keytar failed but file fallback wasn't tried
    if (this.storageBackend === 'none' && this.enableFileFallback) {
      await this.initializeStorage();
    }
  }

  /**
   * Start background token validation
   * Checks token validity every hour and emits event if invalid
   */
  startBackgroundValidation(): void {
    if (this.backgroundValidationTimer) {
      return; // Already running
    }

    this.log.info('Starting background token validation');

    this.backgroundValidationTimer = setInterval(async () => {
      await this.performBackgroundValidation();
    }, CredentialManager.BACKGROUND_VALIDATION_INTERVAL_MS);

    // Also run immediately on start (with small delay to avoid startup congestion)
    this.startupValidationTimer = setTimeout(() => this.performBackgroundValidation(), 5000);
  }

  /**
   * Stop background token validation
   */
  stopBackgroundValidation(): void {
    if (this.startupValidationTimer) {
      clearTimeout(this.startupValidationTimer);
      this.startupValidationTimer = null;
    }
    if (this.backgroundValidationTimer) {
      clearInterval(this.backgroundValidationTimer);
      this.backgroundValidationTimer = null;
      this.log.info('Stopped background token validation');
    }
  }

  /**
   * Perform a single background validation check
   */
  private async performBackgroundValidation(): Promise<void> {
    try {
      // Retrieve token without validation (to avoid recursion)
      let token: string | null = null;

      if (this.storageBackend === 'keychain' && this.keytar) {
        token = await this.keytar.getPassword(this.serviceName, this.accountName);
      } else if (this.storageBackend === 'file') {
        token = this.retrieveFromFile();
      }

      if (!token) {
        return; // No token stored, nothing to validate
      }

      // Validate the token
      const isValid = await this.validateToken(token);

      if (!isValid) {
        this.log.warn('Background validation: stored token is no longer valid');
        this.emit('token-invalid', {
          reason: 'background-validation-failed',
          timestamp: new Date().toISOString(),
        });
      } else {
        this.log.debug('Background validation: token is valid');
      }
    } catch (error) {
      this.log.error(
        'Background validation error',
        error instanceof Error ? error : undefined
      );
    }
  }
}
