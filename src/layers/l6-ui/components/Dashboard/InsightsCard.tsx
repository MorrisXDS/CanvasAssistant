/**
 * InsightsCard - Displays behavioral insights and alerts
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  AlertTriangle,
  AlertCircle,
  Info,
  Zap,
  Target,
  Calendar,
  Award,
  X,
  CheckCircle,
  Inbox,
  FileWarning,
  EyeOff,
} from 'lucide-react';
import { Card } from '../shared';
import { INSIGHT_LABELS, CARD_TITLES } from '../../constants';
import type {
  Insight,
  InsightSeverity,
  InsightType,
} from '../../../../shared/ipc-contract';

/**
 * Insight types that should navigate to CourseDetail when clicked
 * These are course-specific insights (not general analysis/trends)
 */
const NAVIGABLE_INSIGHT_TYPES: InsightType[] = [
  'workload_warning',
  'course_struggle',
  'grade_at_risk',
  'crunch_period',
];

interface InsightsCardProps {
  maxItems?: number;
}

const INSIGHT_ICONS: Record<InsightType, React.ReactNode> = {
  deadline_pattern: <Calendar size={14} />,
  course_struggle: <Target size={14} />,
  productivity_window: <Zap size={14} />,
  workload_warning: <AlertTriangle size={14} />,
  streak: <Award size={14} />,
  improvement: <TrendingUp size={14} />,
  data_completeness: <FileWarning size={14} />,
  grade_at_risk: <AlertCircle size={14} />,
  grade_trend: <TrendingUp size={14} />,
  crunch_period: <AlertTriangle size={14} />,
  unset_weight: <FileWarning size={14} />,
  guessed_due_date: <Calendar size={14} />,
};

const SEVERITY_COLORS: Record<InsightSeverity, string> = {
  critical: 'var(--color-danger)',
  warning: 'var(--color-warning)',
  info: 'var(--color-info)',
};

// Map insight types to categories using centralized labels
type InsightCategory = keyof typeof INSIGHT_LABELS.categories;

const INSIGHT_CATEGORIES: Record<InsightType, InsightCategory> = {
  deadline_pattern: 'deadline',
  workload_warning: 'workload',
  course_struggle: 'performance',
  improvement: 'performance',
  productivity_window: 'productivity',
  streak: 'achievement',
  data_completeness: 'setup',
  grade_at_risk: 'performance',
  grade_trend: 'performance',
  crunch_period: 'workload',
  unset_weight: 'setup',
  guessed_due_date: 'setup',
};

const CATEGORY_COLORS: Record<InsightCategory, string> = {
  deadline: '#dc2626', // red
  workload: '#ea580c', // orange
  performance: '#7c3aed', // purple
  productivity: '#0891b2', // cyan
  achievement: '#16a34a', // green
  setup: '#6b7280', // gray
};

/**
 * Extract course code from insight data if present
 */
function getCourseCode(insight: Insight): string | null {
  if (!insight.data) return null;
  const data = insight.data as Record<string, unknown>;
  if (typeof data.courseCode === 'string') {
    return data.courseCode;
  }
  return null;
}

/**
 * Extract course ID from insight data if present
 */
function getCourseId(insight: Insight): number | null {
  if (!insight.data) return null;
  const data = insight.data as Record<string, unknown>;
  if (typeof data.courseId === 'number') {
    return data.courseId;
  }
  return null;
}

export function InsightsCard({ maxItems = 3 }: InsightsCardProps) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  /**
   * Check if an insight is navigable (can click to go to CourseDetail)
   */
  const isNavigable = useCallback((insight: Insight): boolean => {
    return (
      NAVIGABLE_INSIGHT_TYPES.includes(insight.type) && getCourseId(insight) !== null
    );
  }, []);

  /**
   * Navigate to CourseDetail page for the insight's course
   */
  const handleNavigate = useCallback(
    (insight: Insight) => {
      if (!isNavigable(insight)) return;

      const courseId = getCourseId(insight);
      if (courseId) {
        navigate(`/course/${courseId}`);
      }
    },
    [navigate, isNavigable]
  );

  const fetchInsights = useCallback(async () => {
    try {
      setLoading(true);
      const data = await window.api.getActiveInsights();
      // Sort by severity (critical first, then warning, then info)
      const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
      const sorted = [...data].sort((a, b) => {
        return (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3);
      });
      setInsights(sorted.slice(0, maxItems));
    } catch (err) {
      console.error('Failed to fetch insights:', err);
    } finally {
      setLoading(false);
    }
  }, [maxItems]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const handleAcknowledge = async (id: number | undefined) => {
    if (!id) return;
    try {
      await window.api.acknowledgeInsight(id);
      setInsights((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      console.error('Failed to acknowledge insight:', err);
    }
  };

  const handleAcknowledgeAll = async () => {
    try {
      await window.api.acknowledgeAllInsights();
      setInsights([]);
    } catch (err) {
      console.error('Failed to acknowledge all insights:', err);
    }
  };

  const handleSuppress = async (id: number | undefined) => {
    if (!id) return;
    try {
      await window.api.suppressInsight(id);
      setInsights((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      console.error('Failed to suppress insight:', err);
    }
  };

  return (
    <Card
      title={CARD_TITLES.dashboard.insights}
      headerAction={
        insights.length > 1 && (
          <button
            style={styles.clearAllButton}
            onClick={handleAcknowledgeAll}
            title={INSIGHT_LABELS.actions.acknowledgeAll}
          >
            <CheckCircle size={12} />
            <span>{INSIGHT_LABELS.actions.clearAll}</span>
          </button>
        )
      }
      padding="md"
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      {loading ? (
        <div style={styles.emptyState}>
          <span style={styles.emptyText}>{INSIGHT_LABELS.empty.loading}</span>
        </div>
      ) : insights.length === 0 ? (
        <div style={styles.emptyState}>
          <Inbox
            size={28}
            color="var(--text-muted)"
            style={{ marginBottom: 'var(--space-2)' }}
          />
          <span style={styles.emptyText}>{INSIGHT_LABELS.empty.description}</span>
        </div>
      ) : (
        <div style={styles.list}>
          {insights.map((insight, index) => {
            const navigable = isNavigable(insight);
            return (
              <div
                key={insight.id}
                style={{
                  ...styles.item,
                  borderTop: index === 0 ? 'none' : '1px solid var(--border-light)',
                  borderLeftColor: SEVERITY_COLORS[insight.severity],
                  cursor: navigable ? 'pointer' : 'default',
                }}
                onClick={navigable ? () => handleNavigate(insight) : undefined}
                role={navigable ? 'button' : undefined}
                tabIndex={navigable ? 0 : undefined}
                onKeyDown={
                  navigable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleNavigate(insight);
                        }
                      }
                    : undefined
                }
              >
                <div
                  style={{
                    ...styles.itemIcon,
                    backgroundColor: `${SEVERITY_COLORS[insight.severity]}15`,
                    color: SEVERITY_COLORS[insight.severity],
                  }}
                >
                  {INSIGHT_ICONS[insight.type] || <Info size={14} />}
                </div>
                <div style={styles.itemContent}>
                  <div style={styles.itemHeader}>
                    <div style={styles.itemTitle}>{insight.title}</div>
                    <div style={styles.badgeContainer}>
                      {getCourseCode(insight) && (
                        <span style={styles.courseCodeBadge}>
                          {getCourseCode(insight)}
                        </span>
                      )}
                      <span
                        style={{
                          ...styles.categoryBadge,
                          backgroundColor: `${CATEGORY_COLORS[INSIGHT_CATEGORIES[insight.type]]}15`,
                          color: CATEGORY_COLORS[INSIGHT_CATEGORIES[insight.type]],
                        }}
                      >
                        {INSIGHT_LABELS.categories[INSIGHT_CATEGORIES[insight.type]]}
                      </span>
                      <span
                        style={{
                          ...styles.severityBadge,
                          backgroundColor: `${SEVERITY_COLORS[insight.severity]}15`,
                          color: SEVERITY_COLORS[insight.severity],
                        }}
                      >
                        {insight.severity}
                      </span>
                    </div>
                  </div>
                  <div style={styles.itemDescription}>{insight.description}</div>
                </div>
                <div style={styles.itemActions} onClick={(e) => e.stopPropagation()}>
                  <button
                    style={styles.dismissButton}
                    onClick={() => handleAcknowledge(insight.id)}
                    title={INSIGHT_LABELS.actions.acknowledge}
                  >
                    <X size={14} />
                  </button>
                  <button
                    style={styles.suppressButton}
                    onClick={() => handleSuppress(insight.id)}
                    title={INSIGHT_LABELS.actions.neverShowAgain}
                  >
                    <EyeOff size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

const styles: Record<string, React.CSSProperties> = {
  clearAllButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-1) var(--space-2)',
    background: 'none',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    fontSize: 'var(--text-xs)',
    transition: 'all var(--transition-fast)',
  },

  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-6)',
    textAlign: 'center',
    flex: 1,
    minHeight: '150px',
  },

  emptyText: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  list: {
    display: 'flex',
    flexDirection: 'column',
    margin: '0 -24px -24px -24px',
    flex: 1,
  },

  item: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) 24px',
    borderLeft: '3px solid transparent',
  },

  itemIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: 'var(--radius-md)',
    flexShrink: 0,
  },

  itemContent: {
    flex: 1,
    minWidth: 0,
  },

  itemHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginBottom: '2px',
  },

  itemTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },

  badgeContainer: {
    display: 'flex',
    gap: 'var(--space-1)',
    flexShrink: 0,
    alignItems: 'center',
  },

  courseCodeBadge: {
    fontSize: '10px',
    fontWeight: 'var(--font-bold)',
    padding: '2px 6px',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--color-blue)',
    color: 'white',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.03em',
  },

  categoryBadge: {
    fontSize: '10px',
    fontWeight: 'var(--font-semibold)',
    padding: '2px 6px',
    borderRadius: 'var(--radius-sm)',
    textTransform: 'capitalize' as const,
  },

  severityBadge: {
    fontSize: '10px',
    fontWeight: 'var(--font-semibold)',
    padding: '2px 6px',
    borderRadius: 'var(--radius-sm)',
    textTransform: 'capitalize' as const,
  },

  itemDescription: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    lineHeight: 'var(--leading-relaxed)',
  },

  itemActions: {
    display: 'flex',
    gap: 'var(--space-1)',
    flexShrink: 0,
  },

  dismissButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    padding: 0,
    background: 'none',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    opacity: 0.7,
    transition: 'opacity var(--transition-fast)',
    flexShrink: 0,
  },

  suppressButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    padding: 0,
    background: 'none',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    color: 'var(--color-warning)',
    opacity: 0.6,
    transition: 'opacity var(--transition-fast)',
    flexShrink: 0,
  },
};

export default InsightsCard;
