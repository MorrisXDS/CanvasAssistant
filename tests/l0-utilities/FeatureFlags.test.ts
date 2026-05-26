/**
 * Tests for FeatureFlags module
 *
 * Tests the feature flag system without database persistence (in-memory only mode).
 */

import {
  FeatureFlags,
  FLAG_DEFINITIONS,
  FlagType,
  FlagCategory,
  type FlagKey,
} from '../../src/layers/l0-utilities/FeatureFlags';

// Helper to bypass literal type constraints in tests
// FlagValue<K> resolves to literal types (e.g., false, 300) which prevents setting different values
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const setFlag = (flags: FeatureFlags, key: FlagKey, value: any) => flags.set(key, value);

describe('FeatureFlags', () => {
  describe('initialization', () => {
    it('should create instance without database', () => {
      const flags = new FeatureFlags();
      expect(flags).toBeInstanceOf(FeatureFlags);
    });

    it('should initialize successfully', () => {
      const flags = new FeatureFlags();
      flags.initialize();
      // Should not throw
    });

    it('should be idempotent (multiple initialize calls are safe)', () => {
      const flags = new FeatureFlags();
      flags.initialize();
      flags.initialize();
      flags.initialize();
      // Should not throw
    });

    it('should emit initialized event', (done) => {
      const flags = new FeatureFlags();
      flags.on('initialized', () => {
        done();
      });
      flags.initialize();
    });
  });

  describe('default flag values', () => {
    it('should return default values from FLAG_DEFINITIONS', () => {
      const flags = new FeatureFlags();
      flags.initialize();

      // Boolean flags
      expect(flags.get('experimental.smart_priority_v2')).toBe(false);
      expect(flags.get('experimental.ai_suggestions')).toBe(false);
      expect(flags.get('experimental.grade_predictions')).toBe(false);
      expect(flags.get('performance.lazy_load_tasks')).toBe(true);
      expect(flags.get('performance.virtualize_lists')).toBe(true);
      expect(flags.get('ui.dark_mode')).toBe(false);
      expect(flags.get('ui.compact_view')).toBe(false);
      expect(flags.get('debug.verbose_logging')).toBe(false);
      expect(flags.get('debug.show_priority_scores')).toBe(false);

      // Number flags
      expect(flags.get('performance.cache_ttl_seconds')).toBe(300);
      expect(flags.get('sync.batch_size')).toBe(50);
      expect(flags.get('sync.auto_sync_interval_minutes')).toBe(15);

      // String flags
      expect(flags.get('ui.calendar_week_start')).toBe('sunday');
    });

    it('should match FLAG_DEFINITIONS for all flags', () => {
      const flags = new FeatureFlags();
      flags.initialize();

      for (const [key, definition] of Object.entries(FLAG_DEFINITIONS)) {
        expect(flags.get(key as keyof typeof FLAG_DEFINITIONS)).toBe(
          definition.defaultValue
        );
      }
    });
  });

  describe('isEnabled()', () => {
    it('should return correct boolean for boolean flags', () => {
      const flags = new FeatureFlags();
      flags.initialize();

      // Boolean flags that default to false
      expect(flags.isEnabled('experimental.smart_priority_v2')).toBe(false);
      expect(flags.isEnabled('ui.dark_mode')).toBe(false);

      // Boolean flags that default to true
      expect(flags.isEnabled('performance.lazy_load_tasks')).toBe(true);
      expect(flags.isEnabled('performance.virtualize_lists')).toBe(true);
    });

    it('should return false for non-boolean flags', () => {
      const flags = new FeatureFlags();
      flags.initialize();

      // Number flags
      expect(flags.isEnabled('performance.cache_ttl_seconds' as any)).toBe(false);
      expect(flags.isEnabled('sync.batch_size' as any)).toBe(false);

      // String flags
      expect(flags.isEnabled('ui.calendar_week_start' as any)).toBe(false);
    });
  });

  describe('get()', () => {
    it('should return correct typed value for boolean flags', () => {
      const flags = new FeatureFlags();
      flags.initialize();

      const value = flags.get('ui.dark_mode');
      expect(typeof value).toBe('boolean');
      expect(value).toBe(false);
    });

    it('should return correct typed value for number flags', () => {
      const flags = new FeatureFlags();
      flags.initialize();

      const cacheTtl = flags.get('performance.cache_ttl_seconds');
      expect(typeof cacheTtl).toBe('number');
      expect(cacheTtl).toBe(300);

      const batchSize = flags.get('sync.batch_size');
      expect(typeof batchSize).toBe('number');
      expect(batchSize).toBe(50);
    });

    it('should return correct typed value for string flags', () => {
      const flags = new FeatureFlags();
      flags.initialize();

      const weekStart = flags.get('ui.calendar_week_start');
      expect(typeof weekStart).toBe('string');
      expect(weekStart).toBe('sunday');
    });
  });

  describe('set()', () => {
    it('should update value in memory', () => {
      const flags = new FeatureFlags();
      flags.initialize();

      setFlag(flags, 'ui.dark_mode', true);
      expect(flags.get('ui.dark_mode')).toBe(true);
      expect(flags.isEnabled('ui.dark_mode')).toBe(true);

      setFlag(flags, 'performance.cache_ttl_seconds', 600);
      expect(flags.get('performance.cache_ttl_seconds')).toBe(600);

      setFlag(flags, 'ui.calendar_week_start', 'monday');
      expect(flags.get('ui.calendar_week_start')).toBe('monday');
    });

    it('should emit flag-changed event', (done) => {
      const flags = new FeatureFlags();
      flags.initialize();

      flags.on('flag-changed', (event) => {
        expect(event.key).toBe('ui.dark_mode');
        expect(event.value).toBe(true);
        expect(event.previousValue).toBe(false);
        done();
      });

      setFlag(flags, 'ui.dark_mode', true);
    });

    it('should emit flag-changed event with correct values for multiple changes', () => {
      const flags = new FeatureFlags();
      flags.initialize();

      const events: any[] = [];
      flags.on('flag-changed', (event) => {
        events.push(event);
      });

      setFlag(flags, 'ui.dark_mode', true);
      setFlag(flags, 'performance.cache_ttl_seconds', 600);
      setFlag(flags, 'ui.calendar_week_start', 'monday');

      expect(events).toHaveLength(3);
      expect(events[0]).toMatchObject({
        key: 'ui.dark_mode',
        value: true,
        previousValue: false,
      });
      expect(events[1]).toMatchObject({
        key: 'performance.cache_ttl_seconds',
        value: 600,
        previousValue: 300,
      });
      expect(events[2]).toMatchObject({
        key: 'ui.calendar_week_start',
        value: 'monday',
        previousValue: 'sunday',
      });
    });
  });

  describe('reset()', () => {
    it('should restore default value for a flag', () => {
      const flags = new FeatureFlags();
      flags.initialize();

      // Change value
      setFlag(flags, 'ui.dark_mode', true);
      expect(flags.get('ui.dark_mode')).toBe(true);

      // Reset to default
      flags.reset('ui.dark_mode');
      expect(flags.get('ui.dark_mode')).toBe(false);
    });

    it('should emit flag-changed event on reset', (done) => {
      const flags = new FeatureFlags();
      flags.initialize();

      setFlag(flags, 'ui.dark_mode', true);

      flags.on('flag-changed', (event) => {
        if (event.value === false) {
          // This is the reset event
          expect(event.key).toBe('ui.dark_mode');
          expect(event.value).toBe(false);
          done();
        }
      });

      flags.reset('ui.dark_mode');
    });

    it('should handle reset of unchanged flag', () => {
      const flags = new FeatureFlags();
      flags.initialize();

      // Reset without changing first
      flags.reset('ui.dark_mode');
      expect(flags.get('ui.dark_mode')).toBe(false);
    });
  });

  describe('resetAll()', () => {
    it('should restore all defaults', () => {
      const flags = new FeatureFlags();
      flags.initialize();

      // Change multiple values
      setFlag(flags, 'ui.dark_mode', true);
      setFlag(flags, 'performance.cache_ttl_seconds', 600);
      setFlag(flags, 'ui.calendar_week_start', 'monday');

      expect(flags.get('ui.dark_mode')).toBe(true);
      expect(flags.get('performance.cache_ttl_seconds')).toBe(600);
      expect(flags.get('ui.calendar_week_start')).toBe('monday');

      // Reset all
      flags.resetAll();

      expect(flags.get('ui.dark_mode')).toBe(false);
      expect(flags.get('performance.cache_ttl_seconds')).toBe(300);
      expect(flags.get('ui.calendar_week_start')).toBe('sunday');
    });

    it('should emit all-flags-reset event', (done) => {
      const flags = new FeatureFlags();
      flags.initialize();

      setFlag(flags, 'ui.dark_mode', true);

      flags.on('all-flags-reset', () => {
        done();
      });

      flags.resetAll();
    });
  });

  describe('devMode', () => {
    it('should enable all experimental flags when devMode is true', () => {
      const flags = new FeatureFlags({ devMode: true });
      flags.initialize();

      // All experimental flags should be enabled
      expect(flags.isEnabled('experimental.smart_priority_v2')).toBe(true);
      expect(flags.isEnabled('experimental.ai_suggestions')).toBe(true);
      expect(flags.isEnabled('experimental.grade_predictions')).toBe(true);

      // Also check via get()
      expect(flags.get('experimental.smart_priority_v2')).toBe(true);
      expect(flags.get('experimental.ai_suggestions')).toBe(true);
      expect(flags.get('experimental.grade_predictions')).toBe(true);
    });

    it('should not affect non-experimental flags', () => {
      const flags = new FeatureFlags({ devMode: true });
      flags.initialize();

      // Performance flags should keep their defaults
      expect(flags.get('performance.lazy_load_tasks')).toBe(true);
      expect(flags.get('performance.virtualize_lists')).toBe(true);
      expect(flags.get('performance.cache_ttl_seconds')).toBe(300);

      // UI flags should keep their defaults
      expect(flags.isEnabled('ui.dark_mode')).toBe(false);
      expect(flags.isEnabled('ui.compact_view')).toBe(false);
      expect(flags.get('ui.calendar_week_start')).toBe('sunday');

      // Debug flags should keep their defaults
      expect(flags.isEnabled('debug.verbose_logging')).toBe(false);
      expect(flags.isEnabled('debug.show_priority_scores')).toBe(false);

      // Sync flags should keep their defaults
      expect(flags.get('sync.batch_size')).toBe(50);
      expect(flags.get('sync.auto_sync_interval_minutes')).toBe(15);
    });

    it('should allow overriding experimental flags in devMode', () => {
      const flags = new FeatureFlags({ devMode: true });
      flags.initialize();

      // Initially enabled by devMode
      expect(flags.isEnabled('experimental.smart_priority_v2')).toBe(true);

      // Explicitly set to false
      setFlag(flags, 'experimental.smart_priority_v2', false);
      expect(flags.isEnabled('experimental.smart_priority_v2')).toBe(false);
    });
  });

  describe('getAllValues()', () => {
    it('should return values for all flags', () => {
      const flags = new FeatureFlags();
      flags.initialize();

      const allValues = flags.getAllValues();

      expect(Object.keys(allValues)).toHaveLength(Object.keys(FLAG_DEFINITIONS).length);

      // Verify some values
      expect(allValues['ui.dark_mode']).toBe(false);
      expect(allValues['performance.cache_ttl_seconds']).toBe(300);
      expect(allValues['ui.calendar_week_start']).toBe('sunday');
    });

    it('should return current values including overrides', () => {
      const flags = new FeatureFlags();
      flags.initialize();

      setFlag(flags, 'ui.dark_mode', true);
      setFlag(flags, 'performance.cache_ttl_seconds', 600);

      const allValues = flags.getAllValues();

      expect(allValues['ui.dark_mode']).toBe(true);
      expect(allValues['performance.cache_ttl_seconds']).toBe(600);
      expect(allValues['ui.calendar_week_start']).toBe('sunday'); // Not changed
    });

    it('should reflect devMode values', () => {
      const flags = new FeatureFlags({ devMode: true });
      flags.initialize();

      const allValues = flags.getAllValues();

      expect(allValues['experimental.smart_priority_v2']).toBe(true);
      expect(allValues['experimental.ai_suggestions']).toBe(true);
      expect(allValues['experimental.grade_predictions']).toBe(true);
    });
  });

  describe('getByCategory()', () => {
    it('should filter flags by category correctly', () => {
      const flags = new FeatureFlags();
      flags.initialize();

      const experimentalFlags = flags.getByCategory(FlagCategory.EXPERIMENTAL);
      expect(experimentalFlags).toHaveLength(3);
      expect(
        experimentalFlags.every((f) => f.category === FlagCategory.EXPERIMENTAL)
      ).toBe(true);

      const performanceFlags = flags.getByCategory(FlagCategory.PERFORMANCE);
      expect(performanceFlags).toHaveLength(3);
      expect(performanceFlags.every((f) => f.category === FlagCategory.PERFORMANCE)).toBe(
        true
      );

      const uiFlags = flags.getByCategory(FlagCategory.UI);
      expect(uiFlags).toHaveLength(3);
      expect(uiFlags.every((f) => f.category === FlagCategory.UI)).toBe(true);

      const syncFlags = flags.getByCategory(FlagCategory.SYNC);
      expect(syncFlags).toHaveLength(2);
      expect(syncFlags.every((f) => f.category === FlagCategory.SYNC)).toBe(true);

      const debugFlags = flags.getByCategory(FlagCategory.DEBUG);
      expect(debugFlags).toHaveLength(1); // verbose_logging is internal, excluded
      expect(debugFlags.every((f) => f.category === FlagCategory.DEBUG)).toBe(true);
    });

    it('should include current values in results', () => {
      const flags = new FeatureFlags();
      flags.initialize();

      setFlag(flags, 'ui.dark_mode', true);

      const uiFlags = flags.getByCategory(FlagCategory.UI);
      const darkModeFlag = uiFlags.find((f) => f.key === 'ui.dark_mode');

      expect(darkModeFlag).toBeDefined();
      expect(darkModeFlag?.currentValue).toBe(true);
    });

    it('should exclude internal flags', () => {
      const flags = new FeatureFlags();
      flags.initialize();

      const debugFlags = flags.getByCategory(FlagCategory.DEBUG);

      // verbose_logging is marked as internal, should be excluded
      const verboseLogging = debugFlags.find((f) => f.key === 'debug.verbose_logging');
      expect(verboseLogging).toBeUndefined();

      // show_priority_scores is not internal, should be included
      const showPriority = debugFlags.find((f) => f.key === 'debug.show_priority_scores');
      expect(showPriority).toBeDefined();
    });

    it('should return empty array for category with no flags', () => {
      const flags = new FeatureFlags();
      flags.initialize();

      // Create a new category that doesn't exist in definitions
      const nonExistentFlags = flags.getByCategory('nonexistent' as any);
      expect(nonExistentFlags).toHaveLength(0);
    });
  });

  describe('getDefinitions()', () => {
    it('should return FLAG_DEFINITIONS', () => {
      const flags = new FeatureFlags();
      flags.initialize();

      const definitions = flags.getDefinitions();

      expect(definitions).toBe(FLAG_DEFINITIONS);
      expect(Object.keys(definitions)).toHaveLength(Object.keys(FLAG_DEFINITIONS).length);
    });

    it('should contain all expected properties', () => {
      const flags = new FeatureFlags();
      flags.initialize();

      const definitions = flags.getDefinitions();
      const darkModeFlag = definitions['ui.dark_mode'];

      expect(darkModeFlag).toBeDefined();
      expect(darkModeFlag.key).toBe('ui.dark_mode');
      expect(darkModeFlag.type).toBe(FlagType.BOOLEAN);
      expect(darkModeFlag.defaultValue).toBe(false);
      expect(darkModeFlag.category).toBe(FlagCategory.UI);
      expect(darkModeFlag.description).toBeTruthy();
      expect(darkModeFlag.addedVersion).toBeTruthy();
    });
  });

  describe('in-memory only mode', () => {
    it('should work without database', () => {
      const flags = new FeatureFlags();
      flags.initialize();

      // Should be able to get values
      expect(flags.get('ui.dark_mode')).toBe(false);

      // Should be able to set values
      setFlag(flags, 'ui.dark_mode', true);
      expect(flags.get('ui.dark_mode')).toBe(true);

      // Should be able to reset
      flags.reset('ui.dark_mode');
      expect(flags.get('ui.dark_mode')).toBe(false);
    });

    it('should maintain state across operations', () => {
      const flags = new FeatureFlags();
      flags.initialize();

      // Set multiple values
      setFlag(flags, 'ui.dark_mode', true);
      setFlag(flags, 'performance.cache_ttl_seconds', 600);
      setFlag(flags, 'ui.calendar_week_start', 'monday');

      // All values should persist
      expect(flags.get('ui.dark_mode')).toBe(true);
      expect(flags.get('performance.cache_ttl_seconds')).toBe(600);
      expect(flags.get('ui.calendar_week_start')).toBe('monday');

      // Reset one
      flags.reset('ui.dark_mode');

      // Others should remain
      expect(flags.get('ui.dark_mode')).toBe(false);
      expect(flags.get('performance.cache_ttl_seconds')).toBe(600);
      expect(flags.get('ui.calendar_week_start')).toBe('monday');
    });
  });

  describe('userId and percentage rollouts', () => {
    it('should use default userId if not provided', () => {
      const flags = new FeatureFlags();
      flags.initialize();

      // Should not throw
      const result = flags.isEnabledForPercentage('experimental.smart_priority_v2', 50);
      expect(typeof result).toBe('boolean');
    });

    it('should accept custom userId', () => {
      const flags = new FeatureFlags({ userId: 'user-123' });
      flags.initialize();

      const result = flags.isEnabledForPercentage('experimental.smart_priority_v2', 50);
      expect(typeof result).toBe('boolean');
    });

    it('should be consistent for same userId', () => {
      const flags = new FeatureFlags({ userId: 'user-123' });
      flags.initialize();

      const result1 = flags.isEnabledForPercentage('experimental.smart_priority_v2', 50);
      const result2 = flags.isEnabledForPercentage('experimental.smart_priority_v2', 50);
      const result3 = flags.isEnabledForPercentage('experimental.smart_priority_v2', 50);

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
    });

    it('should enable for 100% rollout', () => {
      const flags = new FeatureFlags({ userId: 'user-123' });
      flags.initialize();

      const result = flags.isEnabledForPercentage('experimental.smart_priority_v2', 100);
      expect(result).toBe(true);
    });

    it('should not enable for 0% rollout', () => {
      const flags = new FeatureFlags({ userId: 'user-123' });
      flags.initialize();

      const result = flags.isEnabledForPercentage('experimental.smart_priority_v2', 0);
      expect(result).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle multiple set operations on same flag', () => {
      const flags = new FeatureFlags();
      flags.initialize();

      setFlag(flags, 'performance.cache_ttl_seconds', 100);
      expect(flags.get('performance.cache_ttl_seconds')).toBe(100);

      setFlag(flags, 'performance.cache_ttl_seconds', 200);
      expect(flags.get('performance.cache_ttl_seconds')).toBe(200);

      setFlag(flags, 'performance.cache_ttl_seconds', 300);
      expect(flags.get('performance.cache_ttl_seconds')).toBe(300);
    });

    it('should handle reset of already-default flag', () => {
      const flags = new FeatureFlags();
      flags.initialize();

      // Flag is already at default
      expect(flags.get('ui.dark_mode')).toBe(false);

      // Reset should not cause issues
      flags.reset('ui.dark_mode');
      expect(flags.get('ui.dark_mode')).toBe(false);
    });

    it('should handle resetAll when no flags are changed', () => {
      const flags = new FeatureFlags();
      flags.initialize();

      const valuesBefore = flags.getAllValues();
      flags.resetAll();
      const valuesAfter = flags.getAllValues();

      expect(valuesAfter).toEqual(valuesBefore);
    });

    it('should not initialize without explicit call', () => {
      const flags = new FeatureFlags();

      // Should still work (lazy initialization or safe defaults)
      expect(() => flags.get('ui.dark_mode')).not.toThrow();
    });
  });
});
