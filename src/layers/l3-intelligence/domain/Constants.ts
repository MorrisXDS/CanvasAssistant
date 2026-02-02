/**
 * Constants - Centralized Business Logic Constants
 *
 * Single source of truth for all magic numbers, thresholds, and defaults
 * used across the L3 Intelligence layer.
 *
 * IMPORTANT: When adding new constants, consider which category they belong to
 * and add them here instead of in individual services.
 */

// =============================================================================
// TIME CONSTANTS
// =============================================================================

/**
 * Common hour durations
 */
export const HOURS = {
  ONE_HOUR: 1,
  TWO_HOURS: 2,
  FOUR_HOURS: 4,
  SIX_HOURS: 6,
  TWELVE_HOURS: 12,
  ONE_DAY: 24,
  TWO_DAYS: 48,
  THREE_DAYS: 72,
  ONE_WEEK: 168,
  TWO_WEEKS: 336,
  FOUR_WEEKS: 672,
} as const;

/**
 * Millisecond conversions
 */
export const MS = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
} as const;

// =============================================================================
// DAY NAMES (Single Source of Truth)
// =============================================================================

/**
 * Day names indexed by getDay() (0 = Sunday)
 */
export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

// =============================================================================
// EFFORT ESTIMATION
// =============================================================================

/**
 * Default effort estimates in minutes by task type
 * Based on typical academic task durations
 */
export const DEFAULT_EFFORT_MINUTES: Record<string, number> = {
  final: 480, // 8 hours
  midterm: 360, // 6 hours
  exam: 240, // 4 hours
  project: 300, // 5 hours
  assignment: 90, // 1.5 hours
  lab: 120, // 2 hours
  quiz: 30, // 30 minutes
  discussion: 20, // 20 minutes
  attendance: 5, // 5 minutes
  other: 60, // 1 hour
};

/**
 * Points-to-effort ratio (minutes per point)
 * Used when points are available to adjust estimates
 */
export const MINUTES_PER_POINT: Record<string, number> = {
  final: 4.0,
  midterm: 3.5,
  exam: 3.0,
  project: 3.0,
  assignment: 1.5,
  lab: 2.0,
  quiz: 1.0,
  discussion: 0.5,
  attendance: 0.1,
  other: 1.0,
};

/**
 * Effort estimation thresholds
 */
export const EFFORT_THRESHOLDS = {
  /** Clamp range for course multiplier */
  MULTIPLIER_MIN: 0.5,
  MULTIPLIER_MAX: 2.0,
  /** Points-based effort clamp range (multiplier of default) */
  POINTS_BASED_MIN_FACTOR: 0.5,
  POINTS_BASED_MAX_FACTOR: 3.0,
  /** Minimum sample sizes for historical calculations */
  MIN_COURSE_EVENTS: 5,
  MIN_TYPE_EVENTS: 2,
  MIN_HISTORICAL_EVENTS: 3,
  /** High confidence threshold */
  HIGH_CONFIDENCE_EVENTS: 5,
  /** Accuracy threshold (within 20% considered accurate) */
  ACCURACY_THRESHOLD: 0.2,
  /** Rounding interval in minutes */
  ROUNDING_INTERVAL: 5,
  /** Weight for historical data in hybrid calculation */
  HISTORICAL_WEIGHT_DIVISOR: 5,
  /** High effort threshold (minutes) */
  HIGH_EFFORT: 180,
  /** Significant effort threshold (minutes) */
  SIGNIFICANT_EFFORT: 120,
} as const;

// =============================================================================
// WORKLOAD THRESHOLDS
// =============================================================================

export const WORKLOAD_THRESHOLDS = {
  /** Daily hours considered significant */
  DAILY_HOURS_SIGNIFICANT: 4,
  /** Weekly hours for severity levels */
  WEEKLY_HOURS_CRUNCH: 30,
  WEEKLY_HOURS_HEAVY: 20,
  WEEKLY_HOURS_NORMAL: 10,
  /** Task count for severity levels */
  TASK_COUNT_CRUNCH: 7,
  TASK_COUNT_HEAVY: 5,
  TASK_COUNT_NORMAL: 3,
  /** Weight percentages for severity levels */
  WEIGHT_CRUNCH: 40,
  WEIGHT_HEAVY: 25,
  WEIGHT_NORMAL: 10,
  /** Clustering thresholds */
  DAILY_TASKS_FOR_CLUSTER: 3,
  CLUSTERING_SCORE_WARNING: 0.5,
  /** Crunch period thresholds */
  MIN_CRUNCH_TASKS: 3,
  MIN_CRUNCH_HOURS: 10,
  EXTREME_CRUNCH_HOURS: 30,
  EXTREME_CRUNCH_TASKS: 8,
  SEVERE_CRUNCH_HOURS: 20,
  SEVERE_CRUNCH_TASKS: 5,
  /** Default lookback/lookahead periods */
  DEFAULT_LOOKBACK_DAYS: 30,
  DEFAULT_WEEKS_AHEAD: 4,
} as const;

// =============================================================================
// WEIGHT THRESHOLDS
// =============================================================================

export const WEIGHT_THRESHOLDS = {
  /** Weight percentages for boosts */
  SIGNIFICANT: 10,
  HIGH: 15,
  VERY_HIGH: 20,
  HIGH_VALUE: 50,
} as const;

// =============================================================================
// INSIGHT THRESHOLDS
// =============================================================================

export const INSIGHT_THRESHOLDS = {
  /** Late submission rate thresholds */
  LATE_RATE_PATTERN: 0.3, // 30% late rate triggers pattern insight
  LATE_RATE_HIGH: 0.4, // 40% late rate considered high risk
  /** Struggle score thresholds */
  STRUGGLE_WARNING: 50,
  STRUGGLE_CRITICAL: 70,
  /** Sample size requirements */
  MIN_EVENTS_FOR_PATTERN: 10,
  MIN_EVENTS_FOR_RHYTHM: 15,
  MIN_EVENTS_PER_DAY: 3,
  MIN_GRADED_EVENTS: 6,
  /** Streak thresholds */
  MIN_STREAK_LENGTH: 5,
  GREAT_STREAK: 10,
  AMAZING_STREAK: 20,
  /** Improvement threshold */
  IMPROVEMENT_MIN: 5, // 5% improvement to report
  /** Workload warning thresholds */
  MIN_TASKS_FOR_PEAK: 3,
  DAYS_UNTIL_PEAK_LIMIT: 7,
  CRITICAL_WORKLOAD_TASKS: 5,
  CRITICAL_WORKLOAD_DAYS: 2,
  WARNING_WORKLOAD_TASKS: 4,
} as const;

/**
 * Insight expiration in hours by type
 */
export const INSIGHT_EXPIRATION: Record<string, number> = {
  deadline_pattern: HOURS.ONE_WEEK,
  course_struggle: HOURS.ONE_WEEK,
  productivity_window: HOURS.TWO_WEEKS,
  workload_warning: HOURS.TWO_DAYS,
  streak: HOURS.ONE_DAY,
  improvement: HOURS.ONE_WEEK,
  data_completeness: HOURS.ONE_WEEK,
  grade_at_risk: HOURS.THREE_DAYS,
  grade_trend: HOURS.ONE_WEEK,
  crunch_period: HOURS.TWO_DAYS,
  unset_weight: HOURS.ONE_WEEK,
  guessed_due_date: HOURS.ONE_WEEK,
};

// =============================================================================
// RECOMMENDATION THRESHOLDS
// =============================================================================

export const RECOMMENDATION_THRESHOLDS = {
  /** Time pressure score boosts */
  TIME_PRESSURE_6H: 50,
  TIME_PRESSURE_12H: 40,
  TIME_PRESSURE_24H: 30,
  TIME_PRESSURE_48H: 20,
  TIME_PRESSURE_72H: 10,
  /** Effort fit boosts */
  EFFORT_FIT_BOOST: 20,
  EFFORT_FIT_BONUS: 10,
  /** Weight boosts */
  WEIGHT_10_BOOST: 15,
  WEIGHT_20_BONUS: 10,
  WEIGHT_15_BOOST: 25,
  /** Task type boosts */
  HIGH_PRIORITY_TYPE_BOOST: 10,
  HIGH_STAKES_TYPE_BOOST: 15,
  /** Struggle boosts */
  TYPE_STRUGGLE_BOOST: 20,
  COURSE_STRUGGLE_BOOST: 15,
  /** Effort boosts for start_early */
  HIGH_EFFORT_BOOST: 30,
  SIGNIFICANT_EFFORT_BOOST: 20,
  /** Minimum scores for recommendations */
  MIN_SCORE_WORK_NOW: 20,
  MIN_SCORE_START_EARLY: 30,
  /** Start early lookahead window (hours) */
  START_EARLY_MIN_HOURS: 72, // 3 days
  START_EARLY_MAX_HOURS: 168, // 7 days
  /** Break recommendation threshold (minutes) */
  BREAK_THRESHOLD_MINUTES: 180, // 3 hours
  /** Course focus lookback/ahead (days) */
  COURSE_FOCUS_LOOKBACK: 7,
  COURSE_FOCUS_LOOKAHEAD: 7,
  /** Preemptive start thresholds */
  PREEMPTIVE_HIGH_EFFORT: 120,
  PREEMPTIVE_HIGH_WEIGHT: 15,
  /** Crunch week window (days) */
  CRUNCH_WINDOW_MIN: 3,
  CRUNCH_WINDOW_MAX: 14,
} as const;

/**
 * Recommendation validity duration in hours by type
 */
export const RECOMMENDATION_VALIDITY: Record<string, number> = {
  work_now: HOURS.FOUR_HOURS,
  start_early: HOURS.ONE_DAY,
  take_break: HOURS.TWO_HOURS,
  course_focus: HOURS.TWELVE_HOURS,
  redistribute: HOURS.ONE_DAY,
  preemptive_start: HOURS.TWO_DAYS,
  focus_at_risk: HOURS.ONE_DAY,
};

// =============================================================================
// BEHAVIOR ANALYTICS THRESHOLDS
// =============================================================================

export const BEHAVIOR_THRESHOLDS = {
  /** Sample size for confidence calculation */
  FULL_CONFIDENCE_EVENTS: 50,
  /** Optimal timing minimum events */
  MIN_EVENTS_OPTIMAL_TIMING: 5,
  MIN_EVENTS_FALLBACK_TIMING: 3,
  /** Score threshold for successful completion */
  SUCCESS_SCORE_THRESHOLD: 0.7, // 70%
  /** Early vs last-minute threshold (days) */
  EARLY_VS_LAST_MINUTE_DAYS: 1,
  /** Last-minute rate threshold */
  LAST_MINUTE_RATE_HIGH: 0.5, // 50%
  /** Risk scoring weights */
  HIGH_PATTERN_RISK_WEIGHT: 40,
  MEDIUM_PATTERN_RISK_WEIGHT: 25,
  DUE_SOON_RISK_WEIGHT: 30, // <=2 days
  DUE_WEEK_RISK_WEIGHT: 15, // 2-5 days
  HIGH_WEIGHT_RISK_WEIGHT: 15, // >=20% weight
  SIGNIFICANT_WEIGHT_RISK_WEIGHT: 10, // >=10% weight
  COURSE_DIFFICULTY_RISK_WEIGHT: 15,
  /** Risk level thresholds */
  HIGH_RISK_SCORE: 60,
  MEDIUM_RISK_SCORE: 35,
  /** Days until due thresholds */
  DUE_SOON_DAYS: 2,
  DUE_MEDIUM_DAYS: 5,
} as const;

// =============================================================================
// HIGH-VALUE TASK TYPES
// =============================================================================

/**
 * Task types that should have weights set and get priority boosts
 */
export const HIGH_VALUE_TASK_TYPES = [
  'exam',
  'midterm',
  'final',
  'final_exam',
  'termtest',
  'project',
] as const;

/**
 * High-priority task types for recommendations
 */
export const HIGH_PRIORITY_TASK_TYPES = ['final', 'midterm', 'exam', 'project'] as const;

// =============================================================================
// ORCHESTRATOR DEFAULTS
// =============================================================================

export const ORCHESTRATOR_DEFAULTS = {
  PRIORITY: {
    refreshIntervalMs: 15 * MS.MINUTE,
    autoRefresh: true,
  },
  INSIGHT: {
    refreshIntervalMs: 6 * MS.HOUR,
    maxStoredInsights: 50,
    autoRefresh: true,
  },
  RECOMMENDATION: {
    refreshIntervalMs: 30 * MS.MINUTE,
    defaultAvailableMinutes: 120,
    maxStoredRecommendations: 100,
    autoRefresh: true,
  },
  WORKLOAD: {
    defaultAvailableHoursPerDay: 4,
    defaultLookAheadDays: 14,
  },
  BEHAVIOR_TRACKING: {
    refreshIntervalMs: 1 * MS.HOUR,
    maxEventAgeDays: 180,
    autoRefresh: true,
  },
  ADAPTIVE_LEARNING: {
    recalculateIntervalMs: 24 * MS.HOUR,
    minSampleSize: 10,
    maxLearningInputs: 500,
    autoRecalculate: true,
  },
  CONTENT_ANALYSIS: {
    policyConfidenceThreshold: 0.7,
    maxTextLength: 500000,
    autoCreatePolicies: true,
  },
  POLICY: {
    lowTokenWarningThreshold: 1,
  },
} as const;

// =============================================================================
// GRADE CALCULATION
// =============================================================================

export const GRADE_THRESHOLDS = {
  /** Gap from target that triggers at-risk warning */
  AT_RISK_GAP: 10,
  /** Significant grade decline */
  DECLINE_THRESHOLD: 5, // 5% decline
  /** GPA scale */
  GPA_SCALE: 4.0,
} as const;
