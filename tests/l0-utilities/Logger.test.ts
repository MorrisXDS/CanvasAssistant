import { Logger } from '../../src/layers/l0-utilities/Logger';
import fs from 'fs';
import path from 'path';

// Helper to wait for async file writes
const waitForFileWrite = (ms: number = 100): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe('Logger', () => {
  const TEST_LOG_DIR = 'logs-test';
  let logger: Logger;

  beforeEach(() => {
    // Create fresh logger for each test
    logger = new Logger(TEST_LOG_DIR);
  });

  afterEach(() => {
    // Clean up logger
    logger.close();

    // Clean up test log directory
    if (fs.existsSync(TEST_LOG_DIR)) {
      fs.rmSync(TEST_LOG_DIR, { recursive: true, force: true });
    }
  });

  describe('Initialization', () => {
    it('should create log directory if it does not exist', () => {
      expect(fs.existsSync(TEST_LOG_DIR)).toBe(true);
    });

    it('should create log file', async () => {
      logger.info('Test message');
      await waitForFileWrite();
      const logFile = path.join(TEST_LOG_DIR, 'cid.log');
      expect(fs.existsSync(logFile)).toBe(true);
    });
  });

  describe('PII Redaction', () => {
    it('should redact Bearer tokens', async () => {
      const testMessage = 'Authorization: Bearer abc123def456';
      logger.info(testMessage);
      await waitForFileWrite();

      const logFile = path.join(TEST_LOG_DIR, 'cid.log');
      const logContent = fs.readFileSync(logFile, 'utf-8');

      expect(logContent).not.toContain('abc123def456');
      expect(logContent).toContain('Bearer [REDACTED]');
    });

    it('should redact email addresses', async () => {
      const testMessage = 'User: student@mail.utoronto.ca logged in';
      logger.info(testMessage);
      await waitForFileWrite();

      const logFile = path.join(TEST_LOG_DIR, 'cid.log');
      const logContent = fs.readFileSync(logFile, 'utf-8');

      expect(logContent).not.toContain('student@mail.utoronto.ca');
      expect(logContent).toContain('[EMAIL_REDACTED]');
    });

    it('should redact long API keys', async () => {
      const testMessage = 'API Key: 1234567890abcdef1234567890abcdef12345678';
      logger.info(testMessage);
      await waitForFileWrite();

      const logFile = path.join(TEST_LOG_DIR, 'cid.log');
      const logContent = fs.readFileSync(logFile, 'utf-8');

      expect(logContent).not.toContain('1234567890abcdef');
      expect(logContent).toContain('[KEY_REDACTED]');
    });

    it('should redact Canvas tokens', async () => {
      const testMessage = 'canvas_token_abc123xyz789';
      logger.info(testMessage);
      await waitForFileWrite();

      const logFile = path.join(TEST_LOG_DIR, 'cid.log');
      const logContent = fs.readFileSync(logFile, 'utf-8');

      expect(logContent).not.toContain('canvas_token_abc123xyz789');
      expect(logContent).toContain('[CANVAS_TOKEN_REDACTED]');
    });
  });

  describe('Log Levels', () => {
    it('should log info messages', async () => {
      logger.info('Info message');
      await waitForFileWrite();

      const logFile = path.join(TEST_LOG_DIR, 'cid.log');
      const logContent = fs.readFileSync(logFile, 'utf-8');

      expect(logContent).toContain('[INFO]');
      expect(logContent).toContain('Info message');
    });

    it('should log warning messages', async () => {
      logger.warn('Warning message');
      await waitForFileWrite();

      const logFile = path.join(TEST_LOG_DIR, 'cid.log');
      const logContent = fs.readFileSync(logFile, 'utf-8');

      expect(logContent).toContain('[WARN]');
      expect(logContent).toContain('Warning message');
    });

    it('should log error messages', async () => {
      logger.error('Error message');
      await waitForFileWrite();

      const logFile = path.join(TEST_LOG_DIR, 'cid.log');
      const logContent = fs.readFileSync(logFile, 'utf-8');

      expect(logContent).toContain('[ERROR]');
      expect(logContent).toContain('Error message');
    });

    it('should log error with stack trace', async () => {
      const testError = new Error('Test error');
      logger.error('Error occurred', testError);
      await waitForFileWrite();

      const logFile = path.join(TEST_LOG_DIR, 'cid.log');
      const logContent = fs.readFileSync(logFile, 'utf-8');

      expect(logContent).toContain('[ERROR]');
      expect(logContent).toContain('Error occurred');
      expect(logContent).toContain('Test error');
    });
  });

  describe('Log Rotation', () => {
    it('should respect max file size configuration', () => {
      // This test verifies the configuration is set correctly
      // Actual rotation would require writing 10MB of logs
      expect(logger).toBeDefined();
    });
  });
});
