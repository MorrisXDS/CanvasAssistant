/**
 * MessageFrequencyConfig - Centralized Configuration for Message Display Frequency
 *
 * This file defines all frequency/grounding settings for recommendations and insights.
 * Modify values here to adjust how often messages repeat across the entire app.
 *
 * ALGORITHM:
 * - 1st occurrence: Show immediately
 * - 2nd occurrence: Ground for baseGroundingHours
 * - 3rd occurrence: Ground for baseGroundingHours * 2
 * - 4th occurrence: Ground for baseGroundingHours * 4
 * - nth occurrence: Ground for min(baseGroundingHours * 2^(n-2), maxGroundingHours)
 * - After quietPeriodHours without showing: Reset occurrence count to 0
 */

import type { RecommendationType, InsightType } from '../types';

/**
 * Configuration for a single message type's frequency behavior
 */
export interface MessageFrequencySettings {
  /** Base grounding time in hours after second occurrence */
  baseGroundingHours: number;
  /** Maximum grounding time in hours (cap for exponential backoff) */
  maxGroundingHours: number;
  /** Hours without showing before resetting occurrence count */
  quietPeriodHours: number;
}

/**
 * Default fallback settings (used if type-specific config not found)
 */
export const DEFAULT_FREQUENCY_SETTINGS: MessageFrequencySettings = {
  baseGroundingHours: 24,
  maxGroundingHours: 168, // 1 week
  quietPeriodHours: 168, // 1 week
};

// =============================================================================
// RECOMMENDATION FREQUENCY SETTINGS
// =============================================================================

/**
 * Type-specific frequency settings for recommendations
 *
 * | Type             | Base    | Max      | Quiet    | Rationale                          |
 * |------------------|---------|----------|----------|------------------------------------|
 * | work_now         | 12 hrs  | 72 hrs   | 72 hrs   | Urgent, need reminders not spam    |
 * | start_early      | 24 hrs  | 168 hrs  | 168 hrs  | Planning, daily check-in enough    |
 * | take_break       | 48 hrs  | 168 hrs  | 336 hrs  | Health reminder, avoid nagging     |
 * | course_focus     | 24 hrs  | 168 hrs  | 168 hrs  | Course attention, daily sufficient |
 * | redistribute     | 48 hrs  | 336 hrs  | 336 hrs  | General advice, less frequent      |
 * | preemptive_start | 24 hrs  | 168 hrs  | 168 hrs  | Similar to start_early             |
 * | focus_at_risk    | 24 hrs  | 168 hrs  | 168 hrs  | Course needs attention             |
 */
export const RECOMMENDATION_FREQUENCY: Record<
  RecommendationType,
  MessageFrequencySettings
> = {
  work_now: {
    baseGroundingHours: 12,
    maxGroundingHours: 72, // 3 days
    quietPeriodHours: 72, // 3 days
  },
  start_early: {
    baseGroundingHours: 24,
    maxGroundingHours: 168, // 1 week
    quietPeriodHours: 168, // 1 week
  },
  take_break: {
    baseGroundingHours: 48, // 2 days
    maxGroundingHours: 168, // 1 week
    quietPeriodHours: 336, // 2 weeks
  },
  course_focus: {
    baseGroundingHours: 24,
    maxGroundingHours: 168, // 1 week
    quietPeriodHours: 168, // 1 week
  },
  redistribute: {
    baseGroundingHours: 48,
    maxGroundingHours: 336, // 2 weeks
    quietPeriodHours: 336, // 2 weeks
  },
  preemptive_start: {
    baseGroundingHours: 24,
    maxGroundingHours: 168, // 1 week
    quietPeriodHours: 168, // 1 week
  },
  focus_at_risk: {
    baseGroundingHours: 24,
    maxGroundingHours: 168, // 1 week
    quietPeriodHours: 168, // 1 week
  },
};

// =============================================================================
// INSIGHT FREQUENCY SETTINGS
// =============================================================================

/**
 * Type-specific frequency settings for insights
 *
 * | Type               | Base     | Max      | Quiet    | Rationale                       |
 * |--------------------|----------|----------|----------|---------------------------------|
 * | workload_warning   | 12 hrs   | 72 hrs   | 72 hrs   | Time-sensitive, needs attention |
 * | course_struggle    | 48 hrs   | 336 hrs  | 336 hrs  | Don't nag about struggles       |
 * | grade_at_risk      | 24 hrs   | 168 hrs  | 168 hrs  | Important but not overwhelming  |
 * | deadline_pattern   | 168 hrs  | 672 hrs  | 672 hrs  | Trend analysis, show rarely     |
 * | productivity_window| 168 hrs  | 672 hrs  | 672 hrs  | Trend analysis, show rarely     |
 * | streak             | 72 hrs   | 336 hrs  | 336 hrs  | Achievement, don't over-repeat  |
 * | improvement        | 168 hrs  | 672 hrs  | 672 hrs  | Trend analysis, show rarely     |
 * | data_completeness  | 168 hrs  | 672 hrs  | 672 hrs  | Setup info, show rarely         |
 * | grade_trend        | 168 hrs  | 672 hrs  | 672 hrs  | Trend analysis, show rarely     |
 * | crunch_period      | 12 hrs   | 72 hrs   | 72 hrs   | Time-sensitive warning          |
 */
export const INSIGHT_FREQUENCY: Record<InsightType, MessageFrequencySettings> = {
  workload_warning: {
    baseGroundingHours: 12,
    maxGroundingHours: 72, // 3 days
    quietPeriodHours: 72, // 3 days
  },
  course_struggle: {
    baseGroundingHours: 48,
    maxGroundingHours: 336, // 2 weeks
    quietPeriodHours: 336, // 2 weeks
  },
  grade_at_risk: {
    baseGroundingHours: 24,
    maxGroundingHours: 168, // 1 week
    quietPeriodHours: 168, // 1 week
  },
  deadline_pattern: {
    baseGroundingHours: 168, // 1 week
    maxGroundingHours: 672, // 4 weeks
    quietPeriodHours: 672, // 4 weeks
  },
  productivity_window: {
    baseGroundingHours: 168, // 1 week
    maxGroundingHours: 672, // 4 weeks
    quietPeriodHours: 672, // 4 weeks
  },
  streak: {
    baseGroundingHours: 72, // 3 days
    maxGroundingHours: 336, // 2 weeks
    quietPeriodHours: 336, // 2 weeks
  },
  improvement: {
    baseGroundingHours: 168, // 1 week
    maxGroundingHours: 672, // 4 weeks
    quietPeriodHours: 672, // 4 weeks
  },
  data_completeness: {
    baseGroundingHours: 168, // 1 week
    maxGroundingHours: 672, // 4 weeks
    quietPeriodHours: 672, // 4 weeks
  },
  grade_trend: {
    baseGroundingHours: 168, // 1 week
    maxGroundingHours: 672, // 4 weeks
    quietPeriodHours: 672, // 4 weeks
  },
  crunch_period: {
    baseGroundingHours: 12,
    maxGroundingHours: 72, // 3 days
    quietPeriodHours: 72, // 3 days
  },
  unset_weight: {
    baseGroundingHours: 72, // 3 days
    maxGroundingHours: 336, // 2 weeks
    quietPeriodHours: 336, // 2 weeks
  },
  guessed_due_date: {
    baseGroundingHours: 48, // 2 days
    maxGroundingHours: 168, // 1 week
    quietPeriodHours: 168, // 1 week
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get frequency settings for a recommendation type
 */
export function getRecommendationFrequency(
  type: RecommendationType
): MessageFrequencySettings {
  return RECOMMENDATION_FREQUENCY[type] ?? DEFAULT_FREQUENCY_SETTINGS;
}

/**
 * Get frequency settings for an insight type
 */
export function getInsightFrequency(type: InsightType): MessageFrequencySettings {
  return INSIGHT_FREQUENCY[type] ?? DEFAULT_FREQUENCY_SETTINGS;
}

/**
 * Get frequency settings by message type and subtype
 */
export function getFrequencySettings(
  messageType: 'recommendation' | 'insight',
  subType: string
): MessageFrequencySettings {
  if (messageType === 'recommendation') {
    return getRecommendationFrequency(subType as RecommendationType);
  } else {
    return getInsightFrequency(subType as InsightType);
  }
}
