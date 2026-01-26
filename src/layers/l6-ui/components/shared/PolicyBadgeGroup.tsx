/**
 * PolicyBadgeGroup Component
 * Container for displaying multiple policy badges for a task
 */

import React from 'react';
import { PolicyBadge } from './PolicyBadge';
import type { PolicyBadgeData } from './PolicyBadge';
import { getTaskPolicyInfo } from '../../../l5-presentation/selectors';
import type { Task, Policy } from '../../../l5-presentation/types';

export interface PolicyBadgeGroupProps {
  /** The task to show policies for */
  task: Task;
  /** All policies (filtered internally by course) */
  policies: Policy[];
  /** Maximum number of badges to show before collapsing */
  maxBadges?: number;
  /** Size of badges */
  size?: 'sm' | 'md';
  /** Additional className */
  className?: string;
}

export function PolicyBadgeGroup({
  task,
  policies,
  maxBadges = 3,
  size = 'sm',
  className = '',
}: PolicyBadgeGroupProps) {
  const policyInfo = getTaskPolicyInfo(task, policies);

  if (policyInfo.badges.length === 0) {
    return null;
  }

  const visibleBadges = policyInfo.badges.slice(0, maxBadges);
  const hiddenCount = policyInfo.badges.length - maxBadges;

  return (
    <div className={`policy-badge-group ${className}`} style={styles.container}>
      {visibleBadges.map((badge: PolicyBadgeData) => (
        <PolicyBadge
          key={badge.policyId}
          policyType={badge.policyType}
          label={badge.label}
          tooltip={badge.tooltip}
          variant={badge.variant}
          size={size}
        />
      ))}
      {hiddenCount > 0 && (
        <span style={styles.moreIndicator}>+{hiddenCount}</span>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 'var(--space-1)',
  },
  moreIndicator: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    fontWeight: 'var(--font-medium)',
    padding: '0 var(--space-1)',
  },
};

export default PolicyBadgeGroup;
