/**
 * Tests for Layer 3 Intelligence Configuration
 */

import {
  DEFAULT_INTELLIGENCE_CONFIG,
  type IntelligenceConfig,
} from '../../src/layers/l3-intelligence/IntelligenceConfig';

describe('IntelligenceConfig', () => {
  describe('DEFAULT_INTELLIGENCE_CONFIG', () => {
    test('refreshTiers are in descending order by minHoursUntilDue', () => {
      const tiers = DEFAULT_INTELLIGENCE_CONFIG.priority.refreshTiers;
      expect(tiers.length).toBeGreaterThan(0);

      for (let i = 0; i < tiers.length - 1; i++) {
        expect(tiers[i].minHoursUntilDue).toBeGreaterThan(tiers[i + 1].minHoursUntilDue);
      }
    });

    test('refreshTier intervals decrease as deadline approaches', () => {
      const tiers = DEFAULT_INTELLIGENCE_CONFIG.priority.refreshTiers;
      for (let i = 0; i < tiers.length - 1; i++) {
        expect(tiers[i].refreshIntervalMs).toBeGreaterThan(
          tiers[i + 1].refreshIntervalMs
        );
      }
    });

    test('factorWeights are all positive', () => {
      const weights = DEFAULT_INTELLIGENCE_CONFIG.priority.factorWeights;
      for (const [key, value] of Object.entries(weights)) {
        expect(value).toBeGreaterThan(0);
      }
    });

    test('urgencyCurve hours are in ascending order', () => {
      const curve = DEFAULT_INTELLIGENCE_CONFIG.priority.urgencyCurve;
      expect(curve.criticalHours).toBeLessThan(curve.highHours);
      expect(curve.highHours).toBeLessThan(curve.mediumHours);
    });

    test('urgencyCurve multipliers are in descending order', () => {
      const curve = DEFAULT_INTELLIGENCE_CONFIG.priority.urgencyCurve;
      expect(curve.criticalMultiplier).toBeGreaterThan(curve.highMultiplier);
      expect(curve.highMultiplier).toBeGreaterThan(curve.mediumMultiplier);
      expect(curve.mediumMultiplier).toBeGreaterThanOrEqual(curve.lowMultiplier);
    });

    test('riskThresholds are in descending order', () => {
      const rt = DEFAULT_INTELLIGENCE_CONFIG.priority.riskThresholds;
      expect(rt.criticalDropPercent).toBeGreaterThan(rt.highDropPercent);
      expect(rt.highDropPercent).toBeGreaterThan(rt.mediumDropPercent);
    });

    test('riskMultipliers increase with severity', () => {
      const rm = DEFAULT_INTELLIGENCE_CONFIG.priority.riskMultipliers;
      expect(rm.critical).toBeGreaterThan(rm.high);
      expect(rm.high).toBeGreaterThan(rm.medium);
      expect(rm.medium).toBeGreaterThan(rm.low);
    });

    test('policyEvaluator lateSubmissionPastCutoffAdjustment is negative', () => {
      expect(
        DEFAULT_INTELLIGENCE_CONFIG.policyEvaluator.lateSubmissionPastCutoffAdjustment
      ).toBeLessThan(0);
    });
  });

  describe('Type structure', () => {
    test('IntelligenceConfig has expected sections', () => {
      const config: IntelligenceConfig = DEFAULT_INTELLIGENCE_CONFIG;
      expect(config).toHaveProperty('priority');
      expect(config).toHaveProperty('policyEvaluator');
    });

    test('priority has all expected fields', () => {
      const p = DEFAULT_INTELLIGENCE_CONFIG.priority;
      expect(p).toHaveProperty('refreshTiers');
      expect(p).toHaveProperty('factorWeights');
      expect(p).toHaveProperty('urgencyCurve');
      expect(p).toHaveProperty('riskThresholds');
      expect(p).toHaveProperty('riskMultipliers');
      expect(p).toHaveProperty('urgencyBaseScoreMax');
    });
  });
});
