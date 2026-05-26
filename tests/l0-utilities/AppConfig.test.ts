import { AppConfig, DEFAULT_APP_CONFIG } from '../../src/layers/l0-utilities/AppConfig';
import { DEFAULT_PATHS } from '../../src/layers/l0-utilities/DefaultPaths';

describe('AppConfig', () => {
  const clearEnvVars = () => {
    // Clear all CID_* environment variables
    delete process.env.CID_LOG_LEVEL;
    delete process.env.CID_LOG_DIR;
    delete process.env.CID_LOG_MAX_SIZE;
    delete process.env.CID_LOG_MAX_FILES;
    delete process.env.CID_MONITOR_POLL_INTERVAL;
    delete process.env.CID_DB_CACHE_SIZE;
    delete process.env.CID_DB_MMAP_SIZE;
    delete process.env.CID_CANVAS_TIMEOUT;
    delete process.env.CID_CANVAS_PAGE_SIZE;
    delete process.env.CID_RATE_MAX_CONCURRENT;
    delete process.env.CID_RATE_MIN_DELAY;
    delete process.env.CID_RATE_MAX_RETRIES;
    delete process.env.CID_DEFAULT_TARGET_GRADE;
    delete process.env.CID_URGENCY_CRITICAL_HOURS;
    delete process.env.CID_URGENCY_HIGH_HOURS;
  };

  beforeEach(() => {
    // Reset singleton between tests
    AppConfig.resetInstance();
    // Clear any test environment variables
    clearEnvVars();
  });

  afterEach(() => {
    // Clean up after each test
    clearEnvVars();
  });

  describe('constructor', () => {
    it('should use default config when no initial config provided', () => {
      const config = new AppConfig();
      expect(config.getUtilities().logger.logDir).toBe(DEFAULT_PATHS.logs);
      expect(config.getPersistence().defaultTargetGrade).toBe(85.0);
    });

    it('should merge initial config with defaults', () => {
      const config = new AppConfig({
        persistence: {
          defaultTargetGrade: 90.0,
          database: DEFAULT_APP_CONFIG.persistence.database,
        },
      });
      expect(config.getPersistence().defaultTargetGrade).toBe(90.0);
      expect(config.getUtilities().logger.logDir).toBe(DEFAULT_PATHS.logs); // From default
    });

    it('should deep merge nested config', () => {
      const config = new AppConfig({
        daemon: {
          ...DEFAULT_APP_CONFIG.daemon,
          rateLimiter: {
            ...DEFAULT_APP_CONFIG.daemon.rateLimiter,
            maxConcurrent: 5,
          },
        },
      });
      expect(config.getDaemon().rateLimiter.maxConcurrent).toBe(5);
      expect(config.getDaemon().rateLimiter.maxRetries).toBe(3); // Preserved from default
    });
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const instance1 = AppConfig.getInstance();
      const instance2 = AppConfig.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = AppConfig.getInstance();
      AppConfig.resetInstance();
      const instance2 = AppConfig.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('getConfig', () => {
    it('should return full configuration', () => {
      const config = new AppConfig();
      const fullConfig = config.getConfig();

      expect(fullConfig.utilities).toBeDefined();
      expect(fullConfig.persistence).toBeDefined();
      expect(fullConfig.daemon).toBeDefined();
      expect(fullConfig.intelligence).toBeDefined();
    });
  });

  describe('get', () => {
    it('should get value by path', () => {
      const config = new AppConfig();

      expect(config.get<string>('utilities.logger.logDir')).toBe(DEFAULT_PATHS.logs);
      expect(config.get<number>('daemon.rateLimiter.maxConcurrent')).toBe(3);
      expect(config.get<number>('intelligence.priority.urgencyCurve.criticalHours')).toBe(
        6
      );
    });

    it('should return undefined for invalid path', () => {
      const config = new AppConfig();
      expect(config.get('invalid.path')).toBeUndefined();
    });
  });

  describe('update', () => {
    it('should update configuration', () => {
      const config = new AppConfig();
      config.update({
        persistence: {
          ...config.getPersistence(),
          defaultTargetGrade: 95.0,
        },
      });
      expect(config.getPersistence().defaultTargetGrade).toBe(95.0);
    });

    it('should emit config-changed event', () => {
      const config = new AppConfig();
      const handler = jest.fn();
      config.on('config-changed', handler);

      config.update({
        persistence: {
          ...config.getPersistence(),
          defaultTargetGrade: 95.0,
        },
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          oldConfig: expect.any(Object),
          newConfig: expect.any(Object),
          updates: expect.any(Object),
        })
      );
    });
  });

  describe('updateSection', () => {
    it('should update specific section', () => {
      const config = new AppConfig();
      config.updateSection('daemon', {
        rateLimiter: {
          ...config.getDaemon().rateLimiter,
          maxConcurrent: 10,
        },
      });
      expect(config.getDaemon().rateLimiter.maxConcurrent).toBe(10);
    });

    it('should emit section-changed event', () => {
      const config = new AppConfig();
      const handler = jest.fn();
      config.on('section-changed', handler);

      config.updateSection('utilities', {
        logger: {
          ...config.getUtilities().logger,
          logLevel: 'debug',
        },
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          section: 'utilities',
          oldValue: expect.any(Object),
          newValue: expect.any(Object),
        })
      );
    });
  });

  describe('resetToDefaults', () => {
    it('should reset all values to defaults', () => {
      const config = new AppConfig();
      config.update({
        persistence: {
          ...config.getPersistence(),
          defaultTargetGrade: 100.0,
        },
      });

      config.resetToDefaults();

      expect(config.getPersistence().defaultTargetGrade).toBe(85.0);
    });

    it('should emit config-reset event', () => {
      const config = new AppConfig();
      const handler = jest.fn();
      config.on('config-reset', handler);

      config.resetToDefaults();

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('exportConfig / importConfig', () => {
    it('should export config as JSON', () => {
      const config = new AppConfig();
      const json = config.exportConfig();
      const parsed = JSON.parse(json);

      expect(parsed.utilities.logger.logDir).toBe(DEFAULT_PATHS.logs);
      expect(parsed.daemon.rateLimiter.maxConcurrent).toBe(3);
    });

    it('should import config from JSON', () => {
      const config = new AppConfig();
      const customJson = JSON.stringify({
        persistence: {
          defaultTargetGrade: 92.0,
          database: config.getPersistence().database,
        },
      });

      config.importConfig(customJson);

      expect(config.getPersistence().defaultTargetGrade).toBe(92.0);
    });

    it('should throw on invalid JSON', () => {
      const config = new AppConfig();
      expect(() => config.importConfig('not valid json')).toThrow(
        'Invalid configuration JSON'
      );
    });
  });

  describe('validate', () => {
    it('should validate valid config', () => {
      const config = new AppConfig();
      const result = config.validate();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid maxFileSize', () => {
      const config = new AppConfig();
      config.updateSection('utilities', {
        logger: {
          ...config.getUtilities().logger,
          maxFileSize: -1,
        },
        systemMonitor: config.getUtilities().systemMonitor,
      });

      const result = config.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('utilities.logger.maxFileSize must be positive');
    });

    it('should detect invalid maxConcurrent', () => {
      const config = new AppConfig();
      config.updateSection('daemon', {
        ...config.getDaemon(),
        rateLimiter: {
          ...config.getDaemon().rateLimiter,
          maxConcurrent: 0,
        },
      });

      const result = config.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'daemon.rateLimiter.maxConcurrent must be positive'
      );
    });

    it('should detect invalid urgency curve ordering', () => {
      const config = new AppConfig();
      config.updateSection('intelligence', {
        ...config.getIntelligence(),
        priority: {
          ...config.getIntelligence().priority,
          urgencyCurve: {
            ...config.getIntelligence().priority.urgencyCurve,
            criticalHours: 30, // > highHours (24)
          },
        },
      });

      const result = config.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'urgencyCurve.criticalHours must be less than highHours'
      );
    });
  });

  describe('environment variable overrides', () => {
    // These tests modify process.env so need careful cleanup
    afterEach(() => {
      clearEnvVars();
      AppConfig.resetInstance();
    });

    it('should apply CID_LOG_LEVEL override', () => {
      clearEnvVars();
      process.env.CID_LOG_LEVEL = 'debug';
      const config = new AppConfig();
      expect(config.getUtilities().logger.logLevel).toBe('debug');
    });

    it('should apply CID_LOG_DIR override', () => {
      clearEnvVars();
      process.env.CID_LOG_DIR = '/custom/logs';
      const config = new AppConfig();
      expect(config.getUtilities().logger.logDir).toBe('/custom/logs');
    });

    it('should apply CID_CANVAS_TIMEOUT override', () => {
      clearEnvVars();
      process.env.CID_CANVAS_TIMEOUT = '60000';
      const config = new AppConfig();
      expect(config.getDaemon().canvasApi.timeoutMs).toBe(60000);
    });

    it('should apply multiple overrides', () => {
      clearEnvVars();
      process.env.CID_LOG_LEVEL = 'error';
      process.env.CID_RATE_MAX_CONCURRENT = '10';

      const config = new AppConfig();

      expect(config.getUtilities().logger.logLevel).toBe('error');
      expect(config.getDaemon().rateLimiter.maxConcurrent).toBe(10);
    });
  });

  describe('DEFAULT_APP_CONFIG', () => {
    it('should have expected structure', () => {
      expect(DEFAULT_APP_CONFIG.utilities).toBeDefined();
      expect(DEFAULT_APP_CONFIG.utilities.logger).toBeDefined();
      expect(DEFAULT_APP_CONFIG.utilities.systemMonitor).toBeDefined();

      expect(DEFAULT_APP_CONFIG.persistence).toBeDefined();
      expect(DEFAULT_APP_CONFIG.persistence.database).toBeDefined();

      expect(DEFAULT_APP_CONFIG.daemon).toBeDefined();
      expect(DEFAULT_APP_CONFIG.daemon.canvasApi).toBeDefined();
      expect(DEFAULT_APP_CONFIG.daemon.rateLimiter).toBeDefined();
      expect(DEFAULT_APP_CONFIG.daemon.sync).toBeDefined();

      expect(DEFAULT_APP_CONFIG.intelligence).toBeDefined();
      expect(DEFAULT_APP_CONFIG.intelligence.priority).toBeDefined();
      expect(DEFAULT_APP_CONFIG.intelligence.policyEvaluator).toBeDefined();
    });

    it('should have expected default values', () => {
      // These values are not affected by env vars in the test suite
      const config = new AppConfig();
      expect(config.getPersistence().defaultTargetGrade).toBe(85.0);
      expect(config.getDaemon().rateLimiter.maxRetries).toBe(3); // Not overridden by env tests
      expect(config.getIntelligence().priority.urgencyCurve.criticalHours).toBe(6);
      expect(config.getIntelligence().priority.refreshTiers).toHaveLength(3);
    });

    it('should have three refresh tiers', () => {
      expect(DEFAULT_APP_CONFIG.intelligence.priority.refreshTiers).toHaveLength(3);
      expect(DEFAULT_APP_CONFIG.intelligence.priority.refreshTiers[0].name).toBe('daily');
      expect(DEFAULT_APP_CONFIG.intelligence.priority.refreshTiers[1].name).toBe(
        'sixHourly'
      );
      expect(DEFAULT_APP_CONFIG.intelligence.priority.refreshTiers[2].name).toBe(
        'halfHourly'
      );
    });
  });

  describe('section getters', () => {
    it('should return utilities config', () => {
      const config = new AppConfig();
      const utilities = config.getUtilities();
      expect(utilities.logger).toBeDefined();
      expect(utilities.systemMonitor).toBeDefined();
    });

    it('should return persistence config', () => {
      const config = new AppConfig();
      const persistence = config.getPersistence();
      expect(persistence.database).toBeDefined();
      expect(persistence.defaultTargetGrade).toBe(85.0);
    });

    it('should return daemon config', () => {
      const config = new AppConfig();
      const daemon = config.getDaemon();
      expect(daemon.canvasApi).toBeDefined();
      expect(daemon.rateLimiter).toBeDefined();
      expect(daemon.sync).toBeDefined();
    });

    it('should return intelligence config', () => {
      const config = new AppConfig();
      const intelligence = config.getIntelligence();
      expect(intelligence.priority).toBeDefined();
      expect(intelligence.policyEvaluator).toBeDefined();
    });
  });
});
