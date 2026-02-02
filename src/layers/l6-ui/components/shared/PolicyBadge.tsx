/**
 * PolicyBadge Component
 * Displays a single policy as a pill badge with icon and tooltip
 */

import React, { useState, useRef, useEffect } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Ticket, Clock, TrendingDown, ArrowRightLeft, RefreshCw } from 'lucide-react';

export type PolicyType =
  | 'grace_tokens'
  | 'late_penalty'
  | 'drop_lowest'
  | 'weight_transfer'
  | 'grade_replacement';

export type PolicyBadgeVariant = 'info' | 'warning' | 'success' | 'default';

export interface PolicyBadgeData {
  policyId: number;
  policyType: PolicyType;
  label: string;
  tooltip: string;
  variant: PolicyBadgeVariant;
}

export interface PolicyBadgeProps {
  /** The policy type determines the icon */
  policyType: PolicyType;
  /** Short label to display */
  label: string;
  /** Detailed tooltip text on hover */
  tooltip: string;
  /** Visual variant */
  variant?: PolicyBadgeVariant;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Additional className */
  className?: string;
}

const POLICY_ICONS: Record<PolicyType, LucideIcon> = {
  grace_tokens: Ticket,
  late_penalty: Clock,
  drop_lowest: TrendingDown,
  weight_transfer: ArrowRightLeft,
  grade_replacement: RefreshCw,
};

const variantStyles: Record<PolicyBadgeVariant, React.CSSProperties> = {
  info: {
    backgroundColor: 'var(--color-info-bg)',
    color: 'var(--color-info)',
    borderColor: 'var(--color-blue)',
  },
  warning: {
    backgroundColor: 'var(--color-warning-bg)',
    color: 'var(--color-warning)',
    borderColor: 'var(--color-warning)',
  },
  success: {
    backgroundColor: 'var(--color-success-bg)',
    color: 'var(--color-success)',
    borderColor: 'var(--color-success)',
  },
  default: {
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    borderColor: 'var(--border-default)',
  },
};

const sizeStyles: Record<string, React.CSSProperties> = {
  sm: {
    fontSize: 'var(--text-xs)',
    padding: '0.125rem 0.375rem',
    gap: '0.25rem',
  },
  md: {
    fontSize: 'var(--text-sm)',
    padding: '0.25rem 0.5rem',
    gap: '0.375rem',
  },
};

export function PolicyBadge({
  policyType,
  label,
  tooltip,
  variant = 'default',
  size = 'sm',
  className = '',
}: PolicyBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const badgeRef = useRef<HTMLSpanElement>(null);

  const Icon = POLICY_ICONS[policyType];
  const iconSize = size === 'sm' ? 12 : 14;

  useEffect(() => {
    if (showTooltip && badgeRef.current) {
      const rect = badgeRef.current.getBoundingClientRect();
      setTooltipPosition({
        top: rect.top - 8, // Position above the badge
        left: rect.left + rect.width / 2,
      });
    }
  }, [showTooltip]);

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    fontWeight: 'var(--font-medium)',
    borderRadius: 'var(--radius-full)',
    border: '1px solid',
    whiteSpace: 'nowrap',
    lineHeight: 1,
    cursor: 'default',
    position: 'relative',
    ...sizeStyles[size],
    ...variantStyles[variant],
  };

  return (
    <>
      <span
        ref={badgeRef}
        className={`policy-badge policy-badge--${variant} ${className}`}
        style={baseStyle}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <Icon size={iconSize} />
        <span>{label}</span>
      </span>

      {/* Tooltip */}
      {showTooltip && (
        <div
          style={{
            ...styles.tooltip,
            top: tooltipPosition.top,
            left: tooltipPosition.left,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {tooltip}
          <div style={styles.tooltipArrow} />
        </div>
      )}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  tooltip: {
    position: 'fixed',
    backgroundColor: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-xs)',
    boxShadow: 'var(--shadow-md)',
    border: '1px solid var(--border-default)',
    zIndex: 10000,
    maxWidth: '280px',
    textAlign: 'center',
    lineHeight: 1.4,
    pointerEvents: 'none',
  },
  tooltipArrow: {
    position: 'absolute',
    bottom: '-6px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 0,
    height: 0,
    borderLeft: '6px solid transparent',
    borderRight: '6px solid transparent',
    borderTop: '6px solid var(--bg-elevated)',
  },
};

export default PolicyBadge;
