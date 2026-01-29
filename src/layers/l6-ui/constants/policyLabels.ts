/**
 * Policy Labels - Centralized policy type names and descriptions
 *
 * This module contains all user-facing strings for course policies.
 * Centralizing these strings makes it easier to:
 * - Maintain consistency across the application
 * - Update copy in one place
 * - Prepare for future internationalization (i18n)
 */

export const POLICY_LABELS = {
  // Policy type names and descriptions
  types: {
    grace_tokens: {
      label: 'Grace Tokens',
      description: 'Extend deadlines using tokens',
    },
    late_penalty: {
      label: 'Late Penalty',
      description: 'Deduct points for late work',
    },
    drop_lowest: {
      label: 'Drop Lowest',
      description: 'Drop lowest grade(s)',
    },
    weight_transfer: {
      label: 'Weight Transfer',
      description: 'Move weight between tasks',
    },
    grade_replacement: {
      label: 'Grade Replacement',
      description: 'Replace with higher grade',
    },
  },

  // Policy configuration labels
  config: {
    tokenCount: 'Number of tokens',
    extensionDays: 'Extension days per token',
    penaltyPercent: 'Penalty percentage per day',
    maxPenalty: 'Maximum penalty',
    dropCount: 'Number to drop',
    sourceCategory: 'Source category',
    targetCategory: 'Target category',
    transferPercent: 'Transfer percentage',
  },

  // Policy status labels
  status: {
    active: 'Active',
    inactive: 'Inactive',
    applied: 'Applied',
    available: 'Available',
    used: 'Used',
    remaining: 'Remaining',
  },
} as const;

// Type helper for accessing policy labels
export type PolicyLabels = typeof POLICY_LABELS;
