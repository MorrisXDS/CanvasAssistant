/**
 * EmptyState - Empty state display component
 *
 * A consistent component for showing empty states with:
 * - Icon
 * - Title
 * - Description
 * - Optional action button
 *
 * @example
 * <EmptyState
 *   icon={<Inbox />}
 *   title="No items"
 *   description="Create your first item to get started"
 *   action={{ label: "Create Item", onClick: handleCreate }}
 * />
 */

import React from 'react';
import { Inbox } from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

interface EmptyStateAction {
  /** Button label */
  label: string;
  /** Click handler */
  onClick: () => void;
  /** Button variant (default: 'primary') */
  variant?: 'primary' | 'secondary';
}

interface EmptyStateProps {
  /** Icon to display (default: Inbox) */
  icon?: React.ReactNode;
  /** Title text */
  title: string;
  /** Description text */
  description?: string;
  /** Optional action button */
  action?: EmptyStateAction;
  /** Additional actions */
  secondaryAction?: EmptyStateAction;
  /** Size variant (default: 'md') */
  size?: 'sm' | 'md' | 'lg';
  /** Custom className */
  className?: string;
}

// =============================================================================
// EMPTY STATE COMPONENT
// =============================================================================

export function EmptyState({
  icon = <Inbox size={48} />,
  title,
  description,
  action,
  secondaryAction,
  size = 'md',
  className,
}: EmptyStateProps) {
  const sizeStyles = sizes[size];

  return (
    <div className={className} style={styles.container}>
      {/* Icon */}
      <div
        style={{
          ...styles.iconWrapper,
          width: sizeStyles.iconSize,
          height: sizeStyles.iconSize,
        }}
      >
        {React.isValidElement(icon)
          ? React.cloneElement(icon as React.ReactElement, {
              size: sizeStyles.iconInnerSize,
            })
          : icon}
      </div>

      {/* Title */}
      <h3
        style={{
          ...styles.title,
          fontSize: sizeStyles.titleSize,
        }}
      >
        {title}
      </h3>

      {/* Description */}
      {description && (
        <p
          style={{
            ...styles.description,
            fontSize: sizeStyles.descriptionSize,
          }}
        >
          {description}
        </p>
      )}

      {/* Actions */}
      {(action || secondaryAction) && (
        <div style={styles.actions}>
          {action && (
            <button
              style={{
                ...styles.button,
                ...(action.variant === 'secondary'
                  ? styles.buttonSecondary
                  : styles.buttonPrimary),
              }}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              style={{
                ...styles.button,
                ...styles.buttonSecondary,
              }}
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// SIZE CONFIGURATION
// =============================================================================

const sizes = {
  sm: {
    iconSize: 48,
    iconInnerSize: 24,
    titleSize: '14px',
    descriptionSize: '12px',
  },
  md: {
    iconSize: 64,
    iconInnerSize: 32,
    titleSize: '16px',
    descriptionSize: '14px',
  },
  lg: {
    iconSize: 80,
    iconInnerSize: 40,
    titleSize: '18px',
    descriptionSize: '14px',
  },
};

// =============================================================================
// STYLES
// =============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '32px 24px',
    minHeight: '200px',
  },

  iconWrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    backgroundColor: 'var(--bg-elevated)',
    color: 'var(--text-tertiary)',
    marginBottom: '16px',
  },

  title: {
    fontWeight: '600',
    color: 'var(--text-primary)',
    margin: '0 0 8px 0',
  },

  description: {
    color: 'var(--text-secondary)',
    margin: 0,
    maxWidth: '300px',
    lineHeight: 1.5,
  },

  actions: {
    display: 'flex',
    gap: '8px',
    marginTop: '20px',
  },

  button: {
    height: '36px',
    padding: '0 16px',
    fontSize: '14px',
    fontWeight: '500',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'all 150ms ease',
    border: 'none',
  },

  buttonPrimary: {
    backgroundColor: 'var(--color-navy)',
    color: 'white',
  },

  buttonSecondary: {
    backgroundColor: 'var(--bg-app)',
    border: '1px solid var(--border-default)',
    color: 'var(--text-secondary)',
  },
};

export default EmptyState;
