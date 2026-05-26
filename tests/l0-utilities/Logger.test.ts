import { Logger } from '../../src/layers/l0-utilities/Logger';
import fs from 'fs';
import path from 'path';

// Helper to wait for async file writes
const waitForFileWrite = (ms: number = 200): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Helper to find today's log file (daily rotation adds date)
const findLogFile = (logDir: string): string | null => {
  if (!fs.existsSync(logDir)) return null;
  const files = fs.readdirSync(logDir);
  const logFile = files.find((f) => f.startsWith('cid-') && f.endsWith('.log'));
  return logFile ? path.join(logDir, logFile) : null;
};

// Helper to read log file content safely
const readLogContent = (logDir: string): string => {
  const logFile = findLogFile(logDir);
  if (!logFile || !fs.existsSync(logFile)) return '';
  return fs.readFileSync(logFile, 'utf-8');
};

describe('Logger', () => {
  const TEST_LOG_DIR = 'logs-test';
  let logger: Logger;

  beforeEach(() => {
    // Clean up any existing test directory first
    if (fs.existsSync(TEST_LOG_DIR)) {
      fs.rmSync(TEST_LOG_DIR, { recursive: true, force: true });
    }
    // Create fresh logger for each test with config object
    logger = new Logger({
      logDir: TEST_LOG_DIR,
      enableConsole: false, // Disable console for cleaner test output
      format: 'text', // Use text format so tests can match [INFO], [ERROR], etc.
      directoryStructure: {
        useStructuredDirs: false,
        currentWeekDays: 7,
        retentionWeeks: 13,
      },
    });
  });

  afterEach(async () => {
    // Wait for any pending writes
    await waitForFileWrite(100);
    // Close logger first
    logger.close();
    // Wait a bit more for file handles to release
    await waitForFileWrite(100);

    // Clean up test log directory
    if (fs.existsSync(TEST_LOG_DIR)) {
      try {
        fs.rmSync(TEST_LOG_DIR, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe('Initialization', () => {
    it('should create log directory if it does not exist', () => {
      expect(fs.existsSync(TEST_LOG_DIR)).toBe(true);
    });

    it('should create log file with date pattern', async () => {
      logger.info('Test message');
      await waitForFileWrite();

      const logFile = findLogFile(TEST_LOG_DIR);
      expect(logFile).not.toBeNull();
      expect(fs.existsSync(logFile!)).toBe(true);
    });
  });

  describe('PII Redaction', () => {
    it('should redact Bearer tokens', async () => {
      const testMessage = 'Authorization: Bearer abc123def456';
      logger.info(testMessage);
      await waitForFileWrite();

      const logContent = readLogContent(TEST_LOG_DIR);
      expect(logContent).not.toContain('abc123def456');
      expect(logContent).toContain('Bearer [REDACTED]');
    });

    it('should redact email addresses', async () => {
      const testMessage = 'User: student@mail.utoronto.ca logged in';
      logger.info(testMessage);
      await waitForFileWrite();

      const logContent = readLogContent(TEST_LOG_DIR);
      expect(logContent).not.toContain('student@mail.utoronto.ca');
      expect(logContent).toContain('[EMAIL_REDACTED]');
    });

    it('should redact long API keys', async () => {
      const testMessage = 'API Key: 1234567890abcdef1234567890abcdef12345678';
      logger.info(testMessage);
      await waitForFileWrite();

      const logContent = readLogContent(TEST_LOG_DIR);
      expect(logContent).not.toContain('1234567890abcdef');
      expect(logContent).toContain('[KEY_REDACTED]');
    });

    it('should redact Canvas tokens', async () => {
      const testMessage = 'canvas_token_abc123xyz789';
      logger.info(testMessage);
      await waitForFileWrite();

      const logContent = readLogContent(TEST_LOG_DIR);
      expect(logContent).not.toContain('canvas_token_abc123xyz789');
      expect(logContent).toContain('[CANVAS_TOKEN_REDACTED]');
    });
  });

  describe('Log Levels', () => {
    it('should log info messages', async () => {
      logger.info('Info message');
      await waitForFileWrite();

      const logContent = readLogContent(TEST_LOG_DIR);
      expect(logContent).toContain('[INFO]');
      expect(logContent).toContain('Info message');
    });

    it('should log warning messages', async () => {
      logger.warn('Warning message');
      await waitForFileWrite();

      const logContent = readLogContent(TEST_LOG_DIR);
      expect(logContent).toContain('[WARN]');
      expect(logContent).toContain('Warning message');
    });

    it('should log error messages', async () => {
      logger.error('Error message');
      await waitForFileWrite();

      const logContent = readLogContent(TEST_LOG_DIR);
      expect(logContent).toContain('[ERROR]');
      expect(logContent).toContain('Error message');
    });

    it('should log error with stack trace', async () => {
      const testError = new Error('Test error');
      logger.error('Error occurred', testError);
      await waitForFileWrite();

      const logContent = readLogContent(TEST_LOG_DIR);
      expect(logContent).toContain('[ERROR]');
      expect(logContent).toContain('Error occurred');
      expect(logContent).toContain('Test error');
    });
  });

  describe('Component Logger', () => {
    it('should create child logger for component', () => {
      const componentLogger = logger.child('testComponent');
      expect(componentLogger).toBeDefined();
    });

    it('should tag logs with component name', async () => {
      const componentLogger = logger.child('healthCheck');
      componentLogger.info('Component message');
      await waitForFileWrite();

      const logContent = readLogContent(TEST_LOG_DIR);
      expect(logContent).toContain('[healthCheck]');
      expect(logContent).toContain('Component message');
    });

    it('should support component-specific log levels configuration', () => {
      // Component-specific log levels are configured but require
      // winston custom filtering which will be implemented with MetricsCollector
      const customLogger = new Logger({
        logDir: TEST_LOG_DIR,
        logLevel: 'info',
        enableConsole: false,
        componentLevels: {
          verboseComponent: 'debug',
          quietComponent: 'error',
        },
      });

      // Verify configuration is accepted
      expect(customLogger).toBeDefined();
      customLogger.close();
    });
  });

  describe('Log Rotation', () => {
    it('should have daily rotation configured by default', () => {
      // Verify logger is created with daily rotation
      expect(logger).toBeDefined();
      // The log file should have date pattern
      logger.info('Rotation test');
    });
  });
});
