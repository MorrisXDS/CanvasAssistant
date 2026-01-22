/**
 * PriorityList Component
 * Displays tasks ranked by ROI/priority score
 */

import React from 'react';
import { PartyPopper } from 'lucide-react';
import { Card, Badge, BadgeVariant } from '../shared';
import type { PriorityItem } from '../../../l5-presentation/types';

export interface PriorityListProps {
  items: PriorityItem[];
  onTaskClick?: (taskId: number) => void;
  maxItems?: number;
}

function urgencyToVariant(urgency: PriorityItem['urgencyLevel']): BadgeVariant {
  return urgency;
}

function formatDueDate(dueAt: string | null, daysUntilDue: number | null): string {
  if (!dueAt) return 'No due date';

  if (daysUntilDue === null) return 'No due date';
  if (daysUntilDue < 0) return `${Math.abs(daysUntilDue)}d overdue`;
  if (daysUntilDue === 0) return 'Due today';
  if (daysUntilDue === 1) return 'Due tomorrow';
  if (daysUntilDue <= 7) return `Due in ${daysUntilDue} days`;

  const date = new Date(dueAt);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function PriorityList({
  items,
  onTaskClick,
  maxItems = 10,
}: PriorityListProps) {
  const displayItems = items.slice(0, maxItems);

  return (
    <Card
      title="Priority Queue"
      headerAction={
        items.length > maxItems && (
          <span style={styles.viewAll}>View all ({items.length})</span>
        )
      }
      padding="md"
    >
      {displayItems.length === 0 ? (
        <div style={styles.emptyState}>
          <PartyPopper size={32} color="var(--color-success)" style={{ marginBottom: 'var(--space-2)' }} />
          <span style={styles.emptyText}>All caught up!</span>
          <span style={styles.emptySubtext}>No pending tasks</span>
        </div>
      ) : (
        <div style={styles.list}>
          {displayItems.map((item, index) => (
            <div
              key={item.task.id}
              style={{
                ...styles.listItem,
                borderTop: index === 0 ? 'none' : '1px solid var(--border-light)',
              }}
              onClick={() => onTaskClick?.(item.task.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onTaskClick?.(item.task.id);
                }
              }}
              role="button"
              tabIndex={0}
            >
              {/* Priority indicator bar */}
              <div
                style={{
                  ...styles.priorityBar,
                  backgroundColor:
                    item.urgencyLevel === 'critical'
                      ? 'var(--color-critical)'
                      : item.urgencyLevel === 'high'
                      ? 'var(--color-high)'
                      : item.urgencyLevel === 'medium'
                      ? 'var(--color-medium)'
                      : 'var(--color-low)',
                }}
              />

              {/* Content */}
              <div style={styles.content}>
                <div style={styles.topRow}>
                  <span style={styles.courseCode}>{item.course.code}</span>
                  <Badge variant={urgencyToVariant(item.urgencyLevel)} size="sm">
                    {item.urgencyLevel}
                  </Badge>
                </div>
                <div style={styles.title}>{item.task.title}</div>
                <div style={styles.bottomRow}>
                  <span style={styles.dueDate}>
                    {formatDueDate(item.task.dueAt, item.daysUntilDue)}
                  </span>
                  {item.task.weight > 0 && (
                    <span style={styles.weight}>{item.task.weight}% weight</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

const styles: Record<string, React.CSSProperties> = {
  list: {
    display: 'flex',
    flexDirection: 'column',
    margin: '0 calc(-1 * var(--space-5))',
    marginBottom: 'calc(-1 * var(--space-5))',
  },

  listItem: {
    display: 'flex',
    padding: 'var(--space-3) var(--space-5)',
    cursor: 'pointer',
    transition: 'background-color var(--transition-fast)',
    position: 'relative',
  },

  priorityBar: {
    width: '4px',
    borderRadius: '2px',
    marginRight: 'var(--space-3)',
    flexShrink: 0,
  },

  content: {
    flex: 1,
    minWidth: 0,
  },

  topRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-1)',
  },

  courseCode: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--color-navy)',
    textTransform: 'uppercase',
    letterSpacing: '0.025em',
  },

  title: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-1)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  bottomRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },

  dueDate: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
  },

  weight: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  viewAll: {
    fontSize: 'var(--text-xs)',
    color: 'var(--color-blue)',
    cursor: 'pointer',
  },

  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-4)',
    textAlign: 'center',
  },

  emptyIcon: {
    fontSize: '2.5rem',
    marginBottom: 'var(--space-3)',
  },

  emptyText: {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
  },

  emptySubtext: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    marginTop: 'var(--space-1)',
  },
};

export default PriorityList;
