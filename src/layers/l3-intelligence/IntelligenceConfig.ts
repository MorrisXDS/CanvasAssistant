/**
 * Layer 3: Intelligence Configuration
 *
 * Configuration types and defaults for the intelligence layer.
 */

export interface RefreshTierConfig {
  /** Minimum hours until deadline to use this tier */
  minHoursUntilDue: number;
  /** Refresh interval in ms */
  refreshIntervalMs: number;
  /** Human-readable name */
  name: string;
}

export interface FactorWeightsConfig {
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

export interface UrgencyCurveConfig {
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

export interface RiskThresholdsConfig {
  /** Grade drop percentage for critical risk */
  criticalDropPercent: number;
  /** Grade drop percentage for high risk */
  highDropPercent: number;
  /** Grade drop percentage for medium risk */
  mediumDropPercent: number;
}

export interface RiskMultipliersConfig {
  low: number;
  medium: number;
  high: number;
  critical: number;
}

export interface PriorityConfig {
  /** Refresh tier configuration */
  refreshTiers: RefreshTierConfig[];
  /** Factor weights for score calculation */
  factorWeights: FactorWeightsConfig;
  /** Urgency curve parameters */
  urgencyCurve: UrgencyCurveConfig;
  /** Risk level thresholds */
  riskThresholds: RiskThresholdsConfig;
  /** Risk multipliers for overdue calculation */
  riskMultipliers: RiskMultipliersConfig;
  /** Hours to assume task submitted after deadline */
  assumeSubmittedAfterHours: number;
  /** Whether to include 0-weight tasks in active queue */
  includeZeroWeightInActive: boolean;
  /** Base score for urgency calculation */
  urgencyBaseScoreMax: number;
  /** Course gap impact multiplier */
  courseGapImpactMultiplier: number;
  /** Course gap impact cap */
  courseGapImpactMax: number;
  /** Base risk impact score */
  riskBaseImpactScore: number;
  /** Default next refresh interval in ms */
  defaultNextRefreshIntervalMs: number;
  /** Default daily refresh interval in ms */
  defaultDailyRefreshIntervalMs: number;
}

export interface PolicyEvaluatorConfig {
  /** Grace token boost factor base */
  graceTokenBoostFactorBase: number;
  /** Grace token boost reduction per token */
  graceTokenBoostReductionPerToken: number;
  /** Grace token adjustment impact */
  graceTokenAdjustmentImpact: number;
  /** Grace token minor adjustment */
  graceTokenMinorAdjustment: number;
  /** Late submission urgent adjustment */
  lateSubmissionUrgentAdjustment: number;
  /** Late submission past cutoff adjustment */
  lateSubmissionPastCutoffAdjustment: number;
  /** Low penalty adjustment */
  lowPenaltyAdjustment: number;
  /** Drop lowest adjustment */
  dropLowestAdjustment: number;
  /** Weight transfer source adjustment */
  weightTransferSourceAdjustment: number;
  /** Weight transfer target adjustment */
  weightTransferTargetAdjustment: number;
}

export interface IntelligenceConfig {
  priority: PriorityConfig;
  policyEvaluator: PolicyEvaluatorConfig;
}

export const DEFAULT_INTELLIGENCE_CONFIG: IntelligenceConfig = {
  priority: {
    refreshTiers: [
      { minHoursUntilDue: 72, refreshIntervalMs: 24 * 60 * 60 * 1000, name: 'daily' },
      {
        minHoursUntilDue: 24,
        refreshIntervalMs: 6 * 60 * 60 * 1000,
        name: 'sixHourly',
      },
      { minHoursUntilDue: 0, refreshIntervalMs: 30 * 60 * 1000, name: 'halfHourly' },
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
    riskMultipliers: {
      low: 0.5,
      medium: 1.0,
      high: 1.5,
      critical: 2.0,
    },
    assumeSubmittedAfterHours: 48,
    includeZeroWeightInActive: true,
    urgencyBaseScoreMax: 100,
    courseGapImpactMultiplier: 1.5,
    courseGapImpactMax: 30,
    riskBaseImpactScore: 20,
    defaultNextRefreshIntervalMs: 30 * 60 * 1000,
    defaultDailyRefreshIntervalMs: 24 * 60 * 60 * 1000,
  },
  policyEvaluator: {
    graceTokenBoostFactorBase: 1.5,
    graceTokenBoostReductionPerToken: 0.1,
    graceTokenAdjustmentImpact: 20,
    graceTokenMinorAdjustment: 5,
    lateSubmissionUrgentAdjustment: 15,
    lateSubmissionPastCutoffAdjustment: -100,
    lowPenaltyAdjustment: -5,
    dropLowestAdjustment: -10,
    weightTransferSourceAdjustment: -8,
    weightTransferTargetAdjustment: 10,
  },
};
