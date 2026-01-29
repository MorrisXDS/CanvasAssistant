/**
 * Insight Labels - Centralized insight category names and labels
 *
 * This module contains all user-facing strings for insights and analytics.
 * Centralizing these strings makes it easier to:
 * - Maintain consistency across the application
 * - Update copy in one place
 * - Prepare for future internationalization (i18n)
 */

export const INSIGHT_LABELS = {
  // Insight category names
  categories: {
    deadline: 'Deadline',
    performance: 'Performance',
    productivity: 'Productivity',
    achievement: 'Achievement',
    workload: 'Workload',
    setup: 'Setup',
  },

  // Insight severity labels
  severity: {
    critical: 'Critical',
    warning: 'Warning',
    info: 'Info',
  },

  // Insight action labels
  actions: {
    acknowledge: 'Acknowledge',
    acknowledgeAll: 'Acknowledge all',
    clearAll: 'Clear all',
    neverShowAgain: 'Never show again',
    viewDetails: 'View Details',
    dismiss: 'Dismiss',
  },

  // Empty states
  empty: {
    title: 'No Insights',
    description: 'No insights available',
    loading: 'Loading...',
  },
} as const;

// Type helper for accessing insight labels
export type InsightLabels = typeof INSIGHT_LABELS;
