/**
 * Badge Component
 * Pill-shaped status indicator with priority variants
 */

import React from 'react';

export type BadgeVariant = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'success';

export interface BadgeProps {
  /** Visual variant based on priority/status */
  variant: BadgeVariant;
  /** Badge text content */
  children: React.ReactNode;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Additional CSS classes */
  className?: string;
}

const variantStyles: Record<BadgeVariant, React.CSSProperties> = {
  critical: {
    backgroundColor: 'var(--color-critical-bg)',
    color: 'var(--color-critical)',
    borderColor: 'var(--color-critical-border)',
  },
  high: {
    backgroundColor: 'var(--color-high-bg)',
    color: 'var(--color-high)',
    borderColor: 'var(--color-high-border)',
  },
  medium: {
    backgroundColor: 'var(--color-medium-bg)',
    color: 'var(--color-medium)',
    borderColor: 'var(--color-medium-border)',
  },
  low: {
    backgroundColor: 'var(--color-low-bg)',
    color: 'var(--color-low)',
    borderColor: 'var(--color-low-border)',
  },
  info: {
    backgroundColor: 'var(--color-info-bg)',
    color: 'var(--color-info)',
    borderColor: 'var(--color-blue)',
  },
  success: {
    backgroundColor: 'var(--color-success-bg)',
    color: 'var(--color-success)',
    borderColor: 'var(--color-medium-border)',
  },
};

const sizeStyles: Record<string, React.CSSProperties> = {
  sm: {
    fontSize: 'var(--text-xs)',
    padding: '0.125rem 0.5rem',
  },
  md: {
    fontSize: 'var(--text-sm)',
    padding: '0.25rem 0.625rem',
  },
};

export function Badge({ variant, children, size = 'sm', className = '' }: BadgeProps) {
  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    fontWeight: 'var(--font-medium)',
    borderRadius: 'var(--radius-full)',
    border: '1px solid',
    whiteSpace: 'nowrap',
    lineHeight: 1,
    ...sizeStyles[size],
    ...variantStyles[variant],
  };

  return (
    <span className={`badge badge--${variant} ${className}`} style={baseStyle}>
      {children}
    </span>
  );
}

/**
 * Map urgency level to badge variant
 */
export function urgencyToBadgeVariant(
  urgency: 'critical' | 'high' | 'medium' | 'low'
): BadgeVariant {
  return urgency;
}

/**
 * Format urgency for display
 */
export function formatUrgency(urgency: 'critical' | 'high' | 'medium' | 'low'): string {
  const labels: Record<string, string> = {
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
  };
  return labels[urgency] || urgency;
}

export default Badge;
