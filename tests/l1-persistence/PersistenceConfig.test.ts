/**
 * Tests for Layer 1 Persistence Configuration
 */

import {
  DEFAULT_PERSISTENCE_CONFIG,
  type PersistenceConfig,
  type DatabaseConfig,
} from '../../src/layers/l1-persistence/PersistenceConfig';

describe('PersistenceConfig', () => {
  describe('DEFAULT_PERSISTENCE_CONFIG', () => {
    test('should have valid database config', () => {
      const db = DEFAULT_PERSISTENCE_CONFIG.database;
      expect(db.cacheSizeKb).toBe(64000);
      expect(db.mmapSizeBytes).toBe(268435456); // 256MB
      expect(db.walMode).toBe(true);
    });

    test('should have valid default target grade', () => {
      expect(DEFAULT_PERSISTENCE_CONFIG.defaultTargetGrade).toBe(85.0);
    });

    test('database cache size should be positive', () => {
      expect(DEFAULT_PERSISTENCE_CONFIG.database.cacheSizeKb).toBeGreaterThan(0);
    });

    test('database mmap size should be positive', () => {
      expect(DEFAULT_PERSISTENCE_CONFIG.database.mmapSizeBytes).toBeGreaterThan(0);
    });

    test('default target grade should be between 0 and 100', () => {
      expect(DEFAULT_PERSISTENCE_CONFIG.defaultTargetGrade).toBeGreaterThanOrEqual(0);
      expect(DEFAULT_PERSISTENCE_CONFIG.defaultTargetGrade).toBeLessThanOrEqual(100);
    });
  });

  describe('Type structure', () => {
    test('PersistenceConfig has expected shape', () => {
      const config: PersistenceConfig = DEFAULT_PERSISTENCE_CONFIG;
      expect(config).toHaveProperty('database');
      expect(config).toHaveProperty('defaultTargetGrade');
    });

    test('DatabaseConfig has expected shape', () => {
      const config: DatabaseConfig = DEFAULT_PERSISTENCE_CONFIG.database;
      expect(config).toHaveProperty('cacheSizeKb');
      expect(config).toHaveProperty('mmapSizeBytes');
      expect(config).toHaveProperty('walMode');
    });
  });
});
