/**
 * QuickStats Component
 * Displays key metrics in compact stat cards
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, FileText, AlertTriangle, BarChart3, type LucideIcon } from 'lucide-react';
import { Card } from '../shared';

export interface StatItem {
  label: string;
  value: string | number;
  icon: 'courses' | 'tasks' | 'overdue' | 'grade';
  trend?: {
    direction: 'up' | 'down' | 'neutral' | 'warning';
    value: string;
  };
  link?: string;
  /** Action key for modal/popup actions instead of navigation */
  action?: string;
}

const iconMap: Record<string, LucideIcon> = {
  courses: BookOpen,
  tasks: FileText,
  overdue: AlertTriangle,
  grade: BarChart3,
};

export interface QuickStatsProps {
  stats: StatItem[];
  /** Callback for action-based stats (modals/popups) */
  onAction?: (action: string) => void;
}

export function QuickStats({ stats, onAction }: QuickStatsProps) {
  const navigate = useNavigate();

  const handleCardClick = (stat: StatItem) => {
    if (stat.action && onAction) {
      onAction(stat.action);
    } else if (stat.link) {
      navigate(stat.link);
    }
  };

  return (
    <div style={styles.container}>
      {stats.map((stat, index) => {
        const Icon = iconMap[stat.icon] || BarChart3;
        const isClickable = Boolean(stat.link) || Boolean(stat.action);
        return (
          <Card
            key={index}
            padding="md"
            className="stat-card"
            style={isClickable ? styles.clickableCard : undefined}
            onClick={isClickable ? () => handleCardClick(stat) : undefined}
          >
            <div style={styles.statContent}>
              <div style={styles.iconWrapper}>
                <Icon size={24} color="var(--color-blue)" />
              </div>
            <div style={styles.textContent}>
              <div style={styles.value}>{stat.value}</div>
              <div style={styles.label}>{stat.label}</div>
            </div>
            {stat.trend && (
              <div
                style={{
                  ...styles.trend,
                  color:
                    stat.trend.direction === 'up'
                      ? 'var(--color-success)'
                      : stat.trend.direction === 'down'
                      ? 'var(--color-error)'
                      : stat.trend.direction === 'warning'
                      ? 'var(--color-error)'
                      : 'var(--text-muted)',
                }}
              >
                {stat.trend.direction === 'up' && '↑'}
                {stat.trend.direction === 'down' && '↓'}
                {stat.trend.direction === 'warning' && '⚠'}
                {stat.trend.value}
              </div>
            )}
          </div>
        </Card>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 'var(--space-4)',
  },

  clickableCard: {
    cursor: 'pointer',
    transition: 'transform var(--transition-fast), box-shadow var(--transition-fast)',
  },

  statContent: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },

  iconWrapper: {
    width: '48px',
    height: '48px',
    borderRadius: 'var(--radius-lg)',
    backgroundColor: 'var(--color-info-bg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  icon: {
    fontSize: 'var(--text-xl)',
  },

  textContent: {
    flex: 1,
    minWidth: 0,
  },

  value: {
    fontSize: 'var(--text-2xl)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
    lineHeight: 1.2,
  },

  label: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    marginTop: '2px',
  },

  trend: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
  },
};

export default QuickStats;
