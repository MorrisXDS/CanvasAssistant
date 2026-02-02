/**
 * L3 Intelligence - Priority Configuration
 *
 * Tunable parameters for the priority calculation system.
 * All thresholds and weights can be adjusted without code changes.
 */

import { EventEmitter } from 'events';

/**
 * Refresh tier configuration
 */
export interface RefreshTier {
  /** Minimum hours until deadline to use this tier */
  minHoursUntilDue: number;
  /** How often to refresh (in milliseconds) */
  refreshIntervalMs: number;
  /** Human-readable name */
  name: string;
}

/**
 * Weight configuration for priority factors
 */
export interface FactorWeights {
  /** Weight for time urgency factor */
  urgency: number;
  /** Weight for task weight/points factor */
  taskWeight: number;
  /** Weight for course gap to target factor */
  courseGap: number;
  /** Weight for policy adjustments */
  policyAdjustment: number;
  /** Weight for dependency blocking */
  dependencyBlocking: number;
  /** Weight for partial credit potential (overdue) */
  partialCredit: number;
  /** Weight for failure risk (overdue) */
  failureRisk: number;
}

/**
 * Urgency curve configuration
 */
export interface UrgencyCurve {
  /** Hours threshold for "critical" urgency */
  criticalHours: number;
  /** Hours threshold for "high" urgency */
  highHours: number;
  /** Hours threshold for "medium" urgency */
  mediumHours: number;
  /** Multiplier for critical urgency */
  criticalMultiplier: number;
  /** Multiplier for high urgency */
  highMultiplier: number;
  /** Multiplier for medium urgency */
  mediumMultiplier: number;
  /** Multiplier for low urgency */
  lowMultiplier: number;
}

/**
 * Risk level thresholds
 */
export interface RiskThresholds {
  /** Grade drop percentage for critical risk */
  criticalDropPercent: number;
  /** Grade drop percentage for high risk */
  highDropPercent: number;
  /** Grade drop percentage for medium risk */
  mediumDropPercent: number;
}

/**
 * Complete priority configuration
 */
export interface PriorityConfigData {
  /** Refresh tier configuration */
  refreshTiers: RefreshTier[];
  /** Factor weights for score calculation */
  factorWeights: FactorWeights;
  /** Urgency curve parameters */
  urgencyCurve: UrgencyCurve;
  /** Risk level thresholds */
  riskThresholds: RiskThresholds;
  /** Default target grade if not set */
  defaultTargetGrade: number;
  /** Hours to consider task as "submitted" after deadline if no submission data */
  assumeSubmittedAfterHours: number;
  /** Whether to include 0-weight tasks in active queue */
  includeZeroWeightInActive: boolean;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: PriorityConfigData = {
  refreshTiers: [
    { minHoursUntilDue: 72, refreshIntervalMs: 24 * 60 * 60 * 1000, name: 'daily' }, // > 3 days
    { minHoursUntilDue: 24, refreshIntervalMs: 6 * 60 * 60 * 1000, name: 'sixHourly' }, // 1-3 days
    { minHoursUntilDue: 0, refreshIntervalMs: 30 * 60 * 1000, name: 'halfHourly' }, // < 24 hours
  ],
  factorWeights: {
    urgency: 1.0,
    taskWeight: 1.0,
    courseGap: 0.8,
    policyAdjustment: 1.0,
    dependencyBlocking: 1.5,
    partialCredit: 0.7,
    failureRisk: 1.2,
  },
  urgencyCurve: {
    criticalHours: 6,
    highHours: 24,
    mediumHours: 72,
    criticalMultiplier: 3.0,
    highMultiplier: 2.0,
    mediumMultiplier: 1.5,
    lowMultiplier: 1.0,
  },
  riskThresholds: {
    criticalDropPercent: 10,
    highDropPercent: 5,
    mediumDropPercent: 2,
  },
  defaultTargetGrade: 85,
  assumeSubmittedAfterHours: 48,
  includeZeroWeightInActive: true,
};

/**
 * Priority Configuration Manager
 *
 * Manages tunable parameters for the priority system.
 * Supports runtime updates and persistence.
 */
export class PriorityConfig extends EventEmitter {
  private config: PriorityConfigData;

  constructor(initialConfig?: Partial<PriorityConfigData>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...initialConfig };
  }

  /**
   * Get the full configuration
   */
  getConfig(): Readonly<PriorityConfigData> {
    return this.config;
  }

  /**
   * Get refresh tiers
   */
  getRefreshTiers(): readonly RefreshTier[] {
    return this.config.refreshTiers;
  }

  /**
   * Get the appropriate refresh interval for a task based on hours until due
   */
  getRefreshIntervalForTask(hoursUntilDue: number): number {
    // Sort tiers by minHoursUntilDue descending to find the right tier
    const sortedTiers = [...this.config.refreshTiers].sort(
      (a, b) => b.minHoursUntilDue - a.minHoursUntilDue
    );

    for (const tier of sortedTiers) {
      if (hoursUntilDue >= tier.minHoursUntilDue) {
        return tier.refreshIntervalMs;
      }
    }

    // Default to most frequent refresh
    return this.config.refreshTiers[this.config.refreshTiers.length - 1]
      .refreshIntervalMs;
  }

  /**
   * Get factor weights
   */
  getFactorWeights(): Readonly<FactorWeights> {
    return this.config.factorWeights;
  }

  /**
   * Get urgency curve parameters
   */
  getUrgencyCurve(): Readonly<UrgencyCurve> {
    return this.config.urgencyCurve;
  }

  /**
   * Get risk thresholds
   */
  getRiskThresholds(): Readonly<RiskThresholds> {
    return this.config.riskThresholds;
  }

  /**
   * Get default target grade
   */
  getDefaultTargetGrade(): number {
    return this.config.defaultTargetGrade;
  }

  /**
   * Calculate urgency multiplier based on hours until due
   */
  calculateUrgencyMultiplier(hoursUntilDue: number): number {
    const curve = this.config.urgencyCurve;

    if (hoursUntilDue <= 0) {
      // Overdue - handled separately
      return 0;
    }
    if (hoursUntilDue <= curve.criticalHours) {
      return curve.criticalMultiplier;
    }
    if (hoursUntilDue <= curve.highHours) {
      return curve.highMultiplier;
    }
    if (hoursUntilDue <= curve.mediumHours) {
      return curve.mediumMultiplier;
    }
    return curve.lowMultiplier;
  }

  /**
   * Determine risk level based on grade drop
   */
  calculateRiskLevel(gradeDropPercent: number): 'low' | 'medium' | 'high' | 'critical' {
    const thresholds = this.config.riskThresholds;

    if (gradeDropPercent >= thresholds.criticalDropPercent) {
      return 'critical';
    }
    if (gradeDropPercent >= thresholds.highDropPercent) {
      return 'high';
    }
    if (gradeDropPercent >= thresholds.mediumDropPercent) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<PriorityConfigData>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...updates };
    this.emit('config-changed', { oldConfig, newConfig: this.config });
  }

  /**
   * Update a specific refresh tier
   */
  updateRefreshTier(tierName: string, updates: Partial<RefreshTier>): void {
    const tierIndex = this.config.refreshTiers.findIndex((t) => t.name === tierName);
    if (tierIndex >= 0) {
      this.config.refreshTiers[tierIndex] = {
        ...this.config.refreshTiers[tierIndex],
        ...updates,
      };
      this.emit('refresh-tier-changed', { tierName, updates });
    }
  }

  /**
   * Update factor weights
   */
  updateFactorWeights(updates: Partial<FactorWeights>): void {
    this.config.factorWeights = { ...this.config.factorWeights, ...updates };
    this.emit('weights-changed', { weights: this.config.factorWeights });
  }

  /**
   * Reset to default configuration
   */
  resetToDefaults(): void {
    this.config = { ...DEFAULT_CONFIG };
    this.emit('config-reset');
  }

  /**
   * Export configuration as JSON (for persistence)
   */
  exportConfig(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Import configuration from JSON
   */
  importConfig(json: string): void {
    try {
      const imported = JSON.parse(json) as Partial<PriorityConfigData>;
      this.updateConfig(imported);
    } catch (error) {
      throw new Error(`Invalid configuration JSON: ${error}`);
    }
  }
}
