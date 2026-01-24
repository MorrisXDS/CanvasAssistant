/**
 * SmartCard - Universal Information Container
 *
 * A standardized card component with:
 * - Optional header with title, subtitle, icon, and badge
 * - Flexible body content area
 * - Pinned footer that stays at bottom regardless of content height
 */

import React, { type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Badge, type BadgeVariant } from './Badge';

export interface SmartCardProps {
  /** Card title */
  title: string;
  /** Optional subtitle below the title */
  subtitle?: string;
  /** Optional icon displayed before title */
  icon?: ReactNode;
  /** Optional badge displayed after title */
  badge?: { label: string; variant: BadgeVariant };
  /** Main card content */
  children: ReactNode;
  /** Footer content - always pinned to bottom */
  footer?: ReactNode;
  /** Click handler for entire card */
  onClick?: () => void;
  /** Navigation href (makes card a link) */
  href?: string;
  /** Loading state */
  isLoading?: boolean;
  /** Additional className for card container */
  className?: string;
  /** Custom styles */
  style?: React.CSSProperties;
}

export function SmartCard({
  title,
  subtitle,
  icon,
  badge,
  children,
  footer,
  onClick,
  href,
  isLoading = false,
  className,
  style,
}: SmartCardProps) {
  const isInteractive = !!onClick || !!href;

  const cardContent = (
    <>
      {/* Header */}
      <div style={styles.header}>
        {icon && <div style={styles.icon}>{icon}</div>}
        <div style={styles.titleWrapper}>
          <div style={styles.titleRow}>
            <h3 style={styles.title}>{title}</h3>
            {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
          </div>
          {subtitle && <p style={styles.subtitle}>{subtitle}</p>}
        </div>
      </div>

      {/* Body */}
      <div style={styles.body}>
        {isLoading ? (
          <div style={styles.loadingContainer}>
            <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : (
          children
        )}
      </div>

      {/* Pinned Footer */}
      {footer && <div style={styles.footer}>{footer}</div>}
    </>
  );

  const cardStyles: React.CSSProperties = {
    ...styles.card,
    ...(isInteractive ? styles.interactive : {}),
    ...style,
  };

  // Render as link if href provided
  if (href) {
    return (
      <a href={href} style={cardStyles} className={className}>
        {cardContent}
      </a>
    );
  }

  // Render as button if onClick provided
  if (onClick) {
    return (
      <button onClick={onClick} style={cardStyles} className={className}>
        {cardContent}
      </button>
    );
  }

  // Render as div otherwise
  return (
    <div style={cardStyles} className={className}>
      {cardContent}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--border-default)',
    boxShadow: 'var(--shadow-card)',
    overflow: 'hidden',
    textAlign: 'left',
    textDecoration: 'none',
    color: 'inherit',
    width: '100%',
    padding: 0,
    font: 'inherit',
  },

  interactive: {
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-3)',
    padding: 'var(--space-4)',
    borderBottom: '1px solid var(--border-light)',
  },

  icon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-gray-100)',
    color: 'var(--text-secondary)',
    flexShrink: 0,
  },

  titleWrapper: {
    flex: 1,
    minWidth: 0,
  },

  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    flexWrap: 'wrap',
  },

  title: {
    fontSize: 'var(--text-base)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  subtitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    margin: 'var(--space-1) 0 0 0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  body: {
    flex: 1,
    padding: 'var(--space-4)',
    overflow: 'auto',
  },

  loadingContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '80px',
    color: 'var(--text-muted)',
  },

  footer: {
    marginTop: 'auto',
    padding: 'var(--space-3) var(--space-4)',
    borderTop: '1px solid var(--border-light)',
    backgroundColor: 'var(--color-gray-50)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },
};

export default SmartCard;
