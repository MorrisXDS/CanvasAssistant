/**
 * HealthIndicator Component
 * System health status widget
 */

import React from 'react';
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { Card } from '../shared';

export type HealthState = 'healthy' | 'degraded' | 'unhealthy';

export interface HealthIndicatorProps {
  status: HealthState;
  lastSyncedAt?: string | null;
  dbSize?: string;
}

const statusConfig: Record<
  HealthState,
  { color: string; bg: string; label: string; Icon: typeof CheckCircle }
> = {
  healthy: {
    color: 'var(--color-success)',
    bg: 'var(--color-success-bg)',
    label: 'All Systems Operational',
    Icon: CheckCircle,
  },
  degraded: {
    color: 'var(--color-warning)',
    bg: 'var(--color-warning-bg)',
    label: 'Partial Outage',
    Icon: AlertTriangle,
  },
  unhealthy: {
    color: 'var(--color-error)',
    bg: 'var(--color-error-bg)',
    label: 'Service Disruption',
    Icon: XCircle,
  },
};

export function HealthIndicator({
  status,
  lastSyncedAt,
  dbSize,
}: HealthIndicatorProps) {
  const config = statusConfig[status];

  const formatLastSync = (dateStr: string | null | undefined): string => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const StatusIcon = config.Icon;

  return (
    <Card padding="md" title="System Health">
      <div style={styles.container}>
        {/* Status Badge */}
        <div
          style={{
            ...styles.statusBadge,
            backgroundColor: config.bg,
            color: config.color,
            borderColor: config.color,
          }}
        >
          <StatusIcon size={16} />
          <span style={styles.statusLabel}>{config.label}</span>
        </div>

        {/* Details */}
        <div style={styles.details}>
          <div style={styles.detailItem}>
            <span style={styles.detailLabel}>Last Sync</span>
            <span style={styles.detailValue}>{formatLastSync(lastSyncedAt)}</span>
          </div>
          {dbSize && (
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>Database</span>
              <span style={styles.detailValue}>{dbSize}</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },

  statusBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid',
    fontWeight: 'var(--font-medium)',
    fontSize: 'var(--text-sm)',
  },

  statusIcon: {
    fontWeight: 'var(--font-bold)',
  },

  statusLabel: {
    flex: 1,
  },

  details: {
    display: 'flex',
    gap: 'var(--space-4)',
  },

  detailItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },

  detailLabel: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },

  detailValue: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
  },
};

export default HealthIndicator;
