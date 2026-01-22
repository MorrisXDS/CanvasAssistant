import { PriorityConfig, DEFAULT_CONFIG } from '../../src/layers/l3-intelligence/PriorityConfig';

describe('PriorityConfig', () => {
  let config: PriorityConfig;

  beforeEach(() => {
    config = new PriorityConfig();
  });

  describe('constructor', () => {
    it('should use default config when no initial config provided', () => {
      const fullConfig = config.getConfig();
      expect(fullConfig.defaultTargetGrade).toBe(85);
      expect(fullConfig.assumeSubmittedAfterHours).toBe(48);
    });

    it('should merge initial config with defaults', () => {
      const customConfig = new PriorityConfig({
        defaultTargetGrade: 90,
      });
      expect(customConfig.getConfig().defaultTargetGrade).toBe(90);
      expect(customConfig.getConfig().assumeSubmittedAfterHours).toBe(48); // From default
    });
  });

  describe('getRefreshIntervalForTask', () => {
    it('should return daily refresh for tasks > 3 days out', () => {
      const interval = config.getRefreshIntervalForTask(100); // 100 hours
      expect(interval).toBe(24 * 60 * 60 * 1000); // Daily
    });

    it('should return 6-hourly refresh for tasks 1-3 days out', () => {
      const interval = config.getRefreshIntervalForTask(48); // 48 hours
      expect(interval).toBe(6 * 60 * 60 * 1000); // 6 hours
    });

    it('should return half-hourly refresh for tasks < 24 hours out', () => {
      const interval = config.getRefreshIntervalForTask(12); // 12 hours
      expect(interval).toBe(30 * 60 * 1000); // 30 minutes
    });

    it('should return half-hourly for tasks with no deadline (Infinity)', () => {
      const interval = config.getRefreshIntervalForTask(Infinity);
      expect(interval).toBe(24 * 60 * 60 * 1000); // Defaults to daily for far-out
    });
  });

  describe('calculateUrgencyMultiplier', () => {
    it('should return critical multiplier for < 6 hours', () => {
      expect(config.calculateUrgencyMultiplier(5)).toBe(3.0);
    });

    it('should return high multiplier for 6-24 hours', () => {
      expect(config.calculateUrgencyMultiplier(12)).toBe(2.0);
    });

    it('should return medium multiplier for 24-72 hours', () => {
      expect(config.calculateUrgencyMultiplier(48)).toBe(1.5);
    });

    it('should return low multiplier for > 72 hours', () => {
      expect(config.calculateUrgencyMultiplier(100)).toBe(1.0);
    });

    it('should return 0 for overdue tasks', () => {
      expect(config.calculateUrgencyMultiplier(-5)).toBe(0);
    });
  });

  describe('calculateRiskLevel', () => {
    it('should return critical for drop >= 10%', () => {
      expect(config.calculateRiskLevel(15)).toBe('critical');
      expect(config.calculateRiskLevel(10)).toBe('critical');
    });

    it('should return high for drop >= 5%', () => {
      expect(config.calculateRiskLevel(7)).toBe('high');
      expect(config.calculateRiskLevel(5)).toBe('high');
    });

    it('should return medium for drop >= 2%', () => {
      expect(config.calculateRiskLevel(3)).toBe('medium');
      expect(config.calculateRiskLevel(2)).toBe('medium');
    });

    it('should return low for drop < 2%', () => {
      expect(config.calculateRiskLevel(1)).toBe('low');
      expect(config.calculateRiskLevel(0)).toBe('low');
    });
  });

  describe('updateConfig', () => {
    it('should update configuration values', () => {
      config.updateConfig({ defaultTargetGrade: 90 });
      expect(config.getConfig().defaultTargetGrade).toBe(90);
    });

    it('should emit config-changed event', () => {
      const handler = jest.fn();
      config.on('config-changed', handler);

      config.updateConfig({ defaultTargetGrade: 90 });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          oldConfig: expect.objectContaining({ defaultTargetGrade: 85 }),
          newConfig: expect.objectContaining({ defaultTargetGrade: 90 }),
        })
      );
    });
  });

  describe('updateRefreshTier', () => {
    it('should update specific tier', () => {
      config.updateRefreshTier('halfHourly', { refreshIntervalMs: 15 * 60 * 1000 });

      const tiers = config.getRefreshTiers();
      const halfHourly = tiers.find((t) => t.name === 'halfHourly');
      expect(halfHourly?.refreshIntervalMs).toBe(15 * 60 * 1000);
    });

    it('should emit refresh-tier-changed event', () => {
      const handler = jest.fn();
      config.on('refresh-tier-changed', handler);

      config.updateRefreshTier('daily', { minHoursUntilDue: 80 });

      expect(handler).toHaveBeenCalledWith({
        tierName: 'daily',
        updates: { minHoursUntilDue: 80 },
      });
    });

    it('should do nothing for non-existent tier', () => {
      const handler = jest.fn();
      config.on('refresh-tier-changed', handler);

      config.updateRefreshTier('nonexistent', { minHoursUntilDue: 100 });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('updateFactorWeights', () => {
    it('should update weights', () => {
      config.updateFactorWeights({ urgency: 2.0 });
      expect(config.getFactorWeights().urgency).toBe(2.0);
    });

    it('should emit weights-changed event', () => {
      const handler = jest.fn();
      config.on('weights-changed', handler);

      config.updateFactorWeights({ urgency: 2.0 });

      expect(handler).toHaveBeenCalledWith({
        weights: expect.objectContaining({ urgency: 2.0 }),
      });
    });
  });

  describe('resetToDefaults', () => {
    it('should reset all values to defaults', () => {
      config.updateConfig({ defaultTargetGrade: 90 });
      config.updateFactorWeights({ urgency: 5.0 });

      config.resetToDefaults();

      expect(config.getConfig().defaultTargetGrade).toBe(85);
      expect(config.getFactorWeights().urgency).toBe(1.0);
    });

    it('should emit config-reset event', () => {
      const handler = jest.fn();
      config.on('config-reset', handler);

      config.resetToDefaults();

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('exportConfig / importConfig', () => {
    it('should export config as JSON', () => {
      const json = config.exportConfig();
      const parsed = JSON.parse(json);

      expect(parsed.defaultTargetGrade).toBe(85);
      expect(parsed.factorWeights.urgency).toBe(1.0);
    });

    it('should import config from JSON', () => {
      const customJson = JSON.stringify({
        defaultTargetGrade: 95,
      });

      config.importConfig(customJson);

      expect(config.getConfig().defaultTargetGrade).toBe(95);
    });

    it('should throw on invalid JSON', () => {
      expect(() => config.importConfig('not valid json')).toThrow('Invalid configuration JSON');
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('should have expected refresh tiers', () => {
      expect(DEFAULT_CONFIG.refreshTiers).toHaveLength(3);
      expect(DEFAULT_CONFIG.refreshTiers[0].name).toBe('daily');
      expect(DEFAULT_CONFIG.refreshTiers[1].name).toBe('sixHourly');
      expect(DEFAULT_CONFIG.refreshTiers[2].name).toBe('halfHourly');
    });

    it('should have expected urgency curve', () => {
      expect(DEFAULT_CONFIG.urgencyCurve.criticalHours).toBe(6);
      expect(DEFAULT_CONFIG.urgencyCurve.highHours).toBe(24);
      expect(DEFAULT_CONFIG.urgencyCurve.mediumHours).toBe(72);
    });
  });
});
