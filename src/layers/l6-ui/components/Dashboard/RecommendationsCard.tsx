/**
 * RecommendationsCard - Displays AI-generated recommendations
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Play,
  Clock,
  Coffee,
  BookOpen,
  ArrowRight,
  X,
  Check,
  RefreshCw,
  Inbox,
} from 'lucide-react';
import { Card } from '../shared';
import type { Recommendation } from '../../../../shared/ipc-contract';

interface RecommendationsCardProps {
  maxItems?: number;
}

type PriorityLevel = 'critical' | 'high' | 'medium' | 'low';

/**
 * Convert priority score to priority level
 * Score ranges: Critical: 80+, High: 60-79, Medium: 40-59, Low: <40
 */
function getPriorityLevel(score: number): PriorityLevel {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

const PRIORITY_LABELS: Record<PriorityLevel, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const PRIORITY_COLORS: Record<PriorityLevel, string> = {
  critical: '#dc2626', // red-600
  high: '#ea580c', // orange-600
  medium: '#ca8a04', // yellow-600
  low: '#16a34a', // green-600
};

const RECOMMENDATION_ICONS: Record<string, React.ReactNode> = {
  work_now: <Play size={14} />,
  start_early: <Clock size={14} />,
  take_break: <Coffee size={14} />,
  course_focus: <BookOpen size={14} />,
  redistribute: <ArrowRight size={14} />,
};

const RECOMMENDATION_COLORS: Record<string, string> = {
  work_now: 'var(--color-danger)',
  start_early: 'var(--color-warning)',
  take_break: 'var(--color-success)',
  course_focus: 'var(--color-info)',
  redistribute: 'var(--color-gray-600)',
};

export function RecommendationsCard({ maxItems = 3 }: RecommendationsCardProps) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRecommendations = useCallback(async () => {
    try {
      setLoading(true);
      const data = await window.api.getActiveRecommendations();
      // Sort by priority score (highest first)
      const sorted = [...data].sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));
      setRecommendations(sorted.slice(0, maxItems));
    } catch (err) {
      console.error('Failed to fetch recommendations:', err);
    } finally {
      setLoading(false);
    }
  }, [maxItems]);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  const handleDismiss = async (id: number | undefined) => {
    if (!id) return;
    try {
      await window.api.dismissRecommendation(id);
      setRecommendations((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error('Failed to dismiss recommendation:', err);
    }
  };

  const handleAct = async (id: number | undefined) => {
    if (!id) return;
    try {
      await window.api.actOnRecommendation(id);
      setRecommendations((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error('Failed to act on recommendation:', err);
    }
  };

  return (
    <Card
      title="Recommendations"
      headerAction={
        <button
          style={styles.refreshButton}
          onClick={fetchRecommendations}
          title="Refresh recommendations"
        >
          <RefreshCw size={12} />
        </button>
      }
      padding="md"
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      {loading ? (
        <div style={styles.emptyState}>
          <span style={styles.emptyText}>Loading...</span>
        </div>
      ) : recommendations.length === 0 ? (
        <div style={styles.emptyState}>
          <Inbox size={28} color="var(--text-muted)" style={{ marginBottom: 'var(--space-2)' }} />
          <span style={styles.emptyText}>No recommendations</span>
        </div>
      ) : (
        <div style={styles.list}>
          {recommendations.map((rec, index) => (
            <div
              key={rec.id}
              style={{
                ...styles.item,
                borderTop: index === 0 ? 'none' : '1px solid var(--border-light)',
              }}
            >
              <div
                style={{
                  ...styles.itemIcon,
                  backgroundColor: `${RECOMMENDATION_COLORS[rec.type]}15`,
                  color: RECOMMENDATION_COLORS[rec.type],
                }}
              >
                {RECOMMENDATION_ICONS[rec.type] || <Clock size={14} />}
              </div>
              <div style={styles.itemContent}>
                <div style={styles.itemTitleRow}>
                  <div style={styles.itemTitle}>{rec.title}</div>
                  {rec.priorityScore !== undefined && (
                    <span
                      style={{
                        ...styles.priorityBadge,
                        backgroundColor: `${PRIORITY_COLORS[getPriorityLevel(rec.priorityScore)]}15`,
                        color: PRIORITY_COLORS[getPriorityLevel(rec.priorityScore)],
                      }}
                    >
                      {PRIORITY_LABELS[getPriorityLevel(rec.priorityScore)]}
                    </span>
                  )}
                </div>
                <div style={styles.itemDescription}>{rec.description}</div>
              </div>
              <div style={styles.itemActions}>
                <button
                  style={styles.actionButton}
                  onClick={() => handleAct(rec.id)}
                  title="Mark as done"
                >
                  <Check size={14} />
                </button>
                <button
                  style={styles.dismissButton}
                  onClick={() => handleDismiss(rec.id)}
                  title="Dismiss"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

const styles: Record<string, React.CSSProperties> = {
  refreshButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    padding: 0,
    background: 'none',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'var(--text-muted)',
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

  itemTitleRow: {
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
  },

  priorityBadge: {
    fontSize: '10px',
    fontWeight: 'var(--font-semibold)',
    padding: '2px 6px',
    borderRadius: 'var(--radius-sm)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.03em',
    flexShrink: 0,
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

  actionButton: {
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
    color: 'var(--color-success)',
    opacity: 0.7,
    transition: 'opacity var(--transition-fast)',
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
  },
};

export default RecommendationsCard;
