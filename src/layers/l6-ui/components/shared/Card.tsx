/**
 * Card Component
 * A clean container with optional title and header action
 */

import React from 'react';

export interface CardProps {
  /** Card title displayed in header */
  title?: string;
  /** Optional action element (button, link) for header */
  headerAction?: React.ReactNode;
  /** Card content */
  children: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Padding size */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Click handler for interactive cards */
  onClick?: () => void;
}

const paddingStyles: Record<string, string> = {
  none: '0',
  sm: 'var(--space-4)',
  md: 'var(--space-5)',
  lg: 'var(--space-6)',
};

export function Card({
  title,
  headerAction,
  children,
  className = '',
  padding = 'md',
  onClick,
}: CardProps) {
  const isInteractive = !!onClick;

  const cardStyle: React.CSSProperties = {
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--border-default)',
    boxShadow: 'var(--shadow-card)',
    overflow: 'hidden',
    transition: 'box-shadow var(--transition-fast), transform var(--transition-fast)',
    cursor: isInteractive ? 'pointer' : 'default',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '24px 24px var(--space-3) 24px',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };

  const bodyStyle: React.CSSProperties = {
    padding: title || headerAction
      ? '0 24px 24px 24px'
      : paddingStyles[padding],
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isInteractive && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick?.();
    }
  };

  return (
    <div
      className={`card ${className}`}
      style={cardStyle}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onMouseEnter={(e) => {
        if (isInteractive) {
          e.currentTarget.style.boxShadow = 'var(--shadow-md)';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }
      }}
      onMouseLeave={(e) => {
        if (isInteractive) {
          e.currentTarget.style.boxShadow = 'var(--shadow-card)';
          e.currentTarget.style.transform = 'translateY(0)';
        }
      }}
    >
      {(title || headerAction) && (
        <div style={headerStyle}>
          {title && <span style={titleStyle}>{title}</span>}
          {headerAction && <div>{headerAction}</div>}
        </div>
      )}
      <div style={bodyStyle}>{children}</div>
    </div>
  );
}

export default Card;
