/**
 * AppConfig Layer Integration Tests
 *
 * Verifies layer config types are importable from their source files
 * and cross-layer config access via AppConfig.
 */

import { AppConfig, DEFAULT_APP_CONFIG } from '../../src/layers/l0-utilities/AppConfig';
import { DEFAULT_PERSISTENCE_CONFIG } from '../../src/layers/l1-persistence/PersistenceConfig';
import { DEFAULT_DAEMON_CONFIG } from '../../src/layers/l2-daemon/DaemonConfig';
import { DEFAULT_INTELLIGENCE_CONFIG } from '../../src/layers/l3-intelligence/IntelligenceConfig';

// Import layer config types from their source files
import type {
  PersistenceConfig,
  DatabaseConfig,
} from '../../src/layers/l1-persistence/PersistenceConfig';
import type {
  DaemonConfig,
  CanvasApiConfig,
  RateLimiterConfig,
  CircuitBreakerConfig,
} from '../../src/layers/l2-daemon/DaemonConfig';
import type {
  IntelligenceConfig,
  PriorityConfig,
  FactorWeightsConfig,
} from '../../src/layers/l3-intelligence/IntelligenceConfig';

describe('AppConfig Layer Integration', () => {
  let config: AppConfig;

  beforeEach(() => {
    AppConfig.resetInstance();
    config = new AppConfig();
  });

  describe('Layer config types are importable from source', () => {
    test('PersistenceConfig type is importable from AppConfig', () => {
      // This test passes if TypeScript compilation succeeds
      const pc: PersistenceConfig = DEFAULT_PERSISTENCE_CONFIG;
      expect(pc.database).toBeDefined();
    });

    test('DatabaseConfig type is importable from AppConfig', () => {
      const dc: DatabaseConfig = DEFAULT_PERSISTENCE_CONFIG.database;
      expect(dc.cacheSizeKb).toBeDefined();
    });

    test('DaemonConfig type is importable from AppConfig', () => {
      const dc: DaemonConfig = DEFAULT_DAEMON_CONFIG;
      expect(dc.canvasApi).toBeDefined();
    });

    test('CanvasApiConfig type is importable from AppConfig', () => {
      const ac: CanvasApiConfig = DEFAULT_DAEMON_CONFIG.canvasApi;
      expect(ac.timeoutMs).toBeDefined();
    });

    test('RateLimiterConfig type is importable from AppConfig', () => {
      const rl: RateLimiterConfig = DEFAULT_DAEMON_CONFIG.rateLimiter;
      expect(rl.maxConcurrent).toBeDefined();
    });

    test('CircuitBreakerConfig type is importable from AppConfig', () => {
      const cb: CircuitBreakerConfig = DEFAULT_DAEMON_CONFIG.circuitBreaker;
      expect(cb.failureThreshold).toBeDefined();
    });

    test('IntelligenceConfig type is importable from AppConfig', () => {
      const ic: IntelligenceConfig = DEFAULT_INTELLIGENCE_CONFIG;
      expect(ic.priority).toBeDefined();
    });

    test('PriorityConfig type is importable from AppConfig', () => {
      const pc: PriorityConfig = DEFAULT_INTELLIGENCE_CONFIG.priority;
      expect(pc.refreshTiers).toBeDefined();
    });

    test('FactorWeightsConfig type is importable from AppConfig', () => {
      const fw: FactorWeightsConfig = DEFAULT_INTELLIGENCE_CONFIG.priority.factorWeights;
      expect(fw.urgency).toBeDefined();
    });
  });

  describe('Cross-layer config access via AppConfig', () => {
    test('getPersistence() returns layer config defaults', () => {
      const persistence = config.getPersistence();
      expect(persistence.database.cacheSizeKb).toBe(
        DEFAULT_PERSISTENCE_CONFIG.database.cacheSizeKb
      );
      expect(persistence.defaultTargetGrade).toBe(
        DEFAULT_PERSISTENCE_CONFIG.defaultTargetGrade
      );
    });

    test('getDaemon() returns layer config defaults', () => {
      const daemon = config.getDaemon();
      expect(daemon.canvasApi.timeoutMs).toBe(DEFAULT_DAEMON_CONFIG.canvasApi.timeoutMs);
      expect(daemon.rateLimiter.maxConcurrent).toBe(
        DEFAULT_DAEMON_CONFIG.rateLimiter.maxConcurrent
      );
    });

    test('getIntelligence() returns layer config defaults', () => {
      const intel = config.getIntelligence();
      expect(intel.priority.refreshTiers.length).toBe(
        DEFAULT_INTELLIGENCE_CONFIG.priority.refreshTiers.length
      );
      expect(intel.policyEvaluator.graceTokenBoostFactorBase).toBe(
        DEFAULT_INTELLIGENCE_CONFIG.policyEvaluator.graceTokenBoostFactorBase
      );
    });

    test('get() path-based access works for layer configs', () => {
      expect(config.get<number>('persistence.database.cacheSizeKb')).toBe(64000);
      expect(config.get<number>('daemon.canvasApi.timeoutMs')).toBe(30000);
      expect(config.get<number>('intelligence.priority.urgencyCurve.criticalHours')).toBe(6);
    });
  });

  describe('DEFAULT_APP_CONFIG references layer defaults', () => {
    test('persistence section matches DEFAULT_PERSISTENCE_CONFIG', () => {
      expect(DEFAULT_APP_CONFIG.persistence).toEqual(DEFAULT_PERSISTENCE_CONFIG);
    });

    test('daemon section matches DEFAULT_DAEMON_CONFIG', () => {
      expect(DEFAULT_APP_CONFIG.daemon).toEqual(DEFAULT_DAEMON_CONFIG);
    });

    test('intelligence section matches DEFAULT_INTELLIGENCE_CONFIG', () => {
      expect(DEFAULT_APP_CONFIG.intelligence).toEqual(DEFAULT_INTELLIGENCE_CONFIG);
    });
  });

  describe('Config validation catches cross-layer issues', () => {
    test('validation passes with defaults', () => {
      const result = config.validate();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('validation catches invalid persistence config', () => {
      config.updateSection('persistence', {
        database: { cacheSizeKb: -1, mmapSizeBytes: 0, walMode: true },
      });
      const result = config.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('persistence.database.cacheSizeKb must be positive');
    });

    test('validation catches invalid daemon config', () => {
      config.updateSection('daemon', {
        rateLimiter: {
          ...DEFAULT_DAEMON_CONFIG.rateLimiter,
          maxConcurrent: 0,
        },
      });
      const result = config.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('daemon.rateLimiter.maxConcurrent must be positive');
    });

    test('validation catches invalid intelligence config', () => {
      config.updateSection('intelligence', {
        priority: {
          ...DEFAULT_INTELLIGENCE_CONFIG.priority,
          urgencyCurve: {
            ...DEFAULT_INTELLIGENCE_CONFIG.priority.urgencyCurve,
            criticalHours: 100, // Greater than highHours (24)
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

  describe('Deep merge works across layer configs', () => {
    test('partial persistence update preserves other fields', () => {
      config.updateSection('persistence', { defaultTargetGrade: 90 });
      const persistence = config.getPersistence();
      expect(persistence.defaultTargetGrade).toBe(90);
      expect(persistence.database.cacheSizeKb).toBe(64000); // Preserved
    });

    test('partial daemon update preserves other sections', () => {
      config.updateSection('daemon', {
        canvasApi: { ...DEFAULT_DAEMON_CONFIG.canvasApi, timeoutMs: 60000 },
      });
      const daemon = config.getDaemon();
      expect(daemon.canvasApi.timeoutMs).toBe(60000);
      expect(daemon.rateLimiter.maxConcurrent).toBe(3); // Preserved
    });

    test('environment variable overrides apply to layer configs', () => {
      const originalEnv = process.env.CID_DB_CACHE_SIZE;
      process.env.CID_DB_CACHE_SIZE = '128000';

      const envConfig = new AppConfig();
      expect(envConfig.get<number>('persistence.database.cacheSizeKb')).toBe(128000);

      // Cleanup
      if (originalEnv !== undefined) {
        process.env.CID_DB_CACHE_SIZE = originalEnv;
      } else {
        delete process.env.CID_DB_CACHE_SIZE;
      }
    });
  });
});
