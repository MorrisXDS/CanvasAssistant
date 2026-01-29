/**
 * PriorityList Component
 * Displays tasks ranked by ROI/priority score
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PartyPopper, CheckCircle, Circle } from 'lucide-react';
import { Card, Badge, BadgeVariant } from '../shared';
import { formatDueDate } from '../../constants';
import type { PriorityItem } from '../../../l5-presentation/types';
import type { Task } from '../../../l5-presentation/types';

export interface PriorityListProps {
  items: PriorityItem[];
  totalPendingTasks?: number;
  onTaskClick?: (taskId: number) => void;
  onTaskDoubleClick?: (taskId: number) => void;
  onTaskContextMenu?: (e: React.MouseEvent, task: Task) => void;
  onToggleComplete?: (taskId: number, isCompleted: boolean) => void;
  maxItems?: number;
  /** Whether to show urgency badges (only when priority sorting is enabled) */
  showUrgencyBadges?: boolean;
}

function urgencyToVariant(urgency: PriorityItem['urgencyLevel']): BadgeVariant {
  return urgency;
}

export function PriorityList({
  items,
  totalPendingTasks,
  onTaskClick,
  onTaskDoubleClick,
  onTaskContextMenu,
  onToggleComplete,
  maxItems = 10,
  showUrgencyBadges = true,
}: PriorityListProps) {
  const navigate = useNavigate();
  const displayItems = items.slice(0, maxItems);
  // Use totalPendingTasks if provided, otherwise fall back to items length
  const hasPendingTasks =
    totalPendingTasks !== undefined ? totalPendingTasks > 0 : items.length > 0;

  // Handle double-click to navigate and expand
  const handleDoubleClick = (taskId: number) => {
    if (onTaskDoubleClick) {
      onTaskDoubleClick(taskId);
    } else if (onTaskClick) {
      onTaskClick(taskId);
    }
  };

  // Handle context menu
  const handleContextMenu = (e: React.MouseEvent, task: Task) => {
    e.preventDefault();
    if (onTaskContextMenu) {
      onTaskContextMenu(e, task);
    }
  };

  return (
    <Card
      padding="md"
      title="Upcoming Courseworks"
      headerAction={
        items.length > 0 && (
          <button style={styles.viewAll} onClick={() => navigate('/tasks')}>
            View all ({totalPendingTasks ?? items.length})
          </button>
        )
      }
      style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
    >
      {!hasPendingTasks ? (
        <div style={styles.emptyState}>
          <PartyPopper
            size={32}
            color="var(--color-success)"
            style={{ marginBottom: 'var(--space-2)' }}
          />
          <span style={styles.emptyText}>All caught up!</span>
          <span style={styles.emptySubtext}>No pending tasks</span>
        </div>
      ) : displayItems.length === 0 ? (
        <div style={styles.emptyState}>
          <span style={styles.emptyText}>Loading tasks...</span>
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
              onDoubleClick={() => handleDoubleClick(item.task.id)}
              onContextMenu={(e) => handleContextMenu(e, item.task)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleDoubleClick(item.task.id);
                }
              }}
              role="button"
              tabIndex={0}
            >
              {/* Priority indicator bar */}
              <div
                style={{
                  ...styles.priorityBar,
                  backgroundColor: item.task.isCompleted
                    ? 'var(--color-success)'
                    : item.urgencyLevel === 'critical'
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
                  {showUrgencyBadges && (
                    <Badge variant={urgencyToVariant(item.urgencyLevel)} size="sm">
                      {item.urgencyLevel}
                    </Badge>
                  )}
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

              {/* Checkbox - right side */}
              {onToggleComplete && (
                <button
                  style={styles.checkbox}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleComplete(item.task.id, item.task.isCompleted);
                  }}
                  aria-label={item.task.isCompleted ? 'Mark incomplete' : 'Mark complete'}
                >
                  {item.task.isCompleted ? (
                    <CheckCircle size={24} color="var(--color-success)" />
                  ) : (
                    <Circle size={24} color="var(--text-muted)" />
                  )}
                </button>
              )}
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
    margin: '0 -24px -24px -24px',
  },

  listItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) 24px',
    cursor: 'pointer',
    transition: 'background-color var(--transition-fast)',
    position: 'relative',
  },

  checkbox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    marginLeft: 'var(--space-3)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    flexShrink: 0,
    alignSelf: 'center',
  },

  priorityBar: {
    width: '4px',
    alignSelf: 'stretch',
    borderRadius: 'var(--radius-sm)',
    flexShrink: 0,
  },

  content: {
    flex: 1,
    minWidth: 0,
    paddingTop: 'var(--space-1)', // Visual optical adjustment
    paddingBottom: 'var(--space-1)',
  },

  topRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-2)',
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
    marginBottom: 'var(--space-2)',
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
    background: 'none',
    border: 'none',
    padding: 0,
    fontFamily: 'inherit',
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

// Memoized for performance - prevents re-renders when parent updates unrelated state
export default React.memo(PriorityList);
