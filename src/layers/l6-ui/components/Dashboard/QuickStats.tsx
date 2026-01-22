/**
 * QuickStats Component
 * Displays key metrics in compact stat cards
 */

import React from 'react';
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
}

const iconMap: Record<string, LucideIcon> = {
  courses: BookOpen,
  tasks: FileText,
  overdue: AlertTriangle,
  grade: BarChart3,
};

export interface QuickStatsProps {
  stats: StatItem[];
}

export function QuickStats({ stats }: QuickStatsProps) {
  return (
    <div style={styles.container}>
      {stats.map((stat, index) => {
        const Icon = iconMap[stat.icon] || BarChart3;
        return (
          <Card key={index} padding="md" className="stat-card">
            <div style={styles.statContent}>
              <div style={styles.iconWrapper}>
                <Icon size={24} color="var(--color-navy)" />
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

  statContent: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },

  iconWrapper: {
    width: '48px',
    height: '48px',
    borderRadius: 'var(--radius-lg)',
    backgroundColor: 'var(--color-gray-100)',
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
