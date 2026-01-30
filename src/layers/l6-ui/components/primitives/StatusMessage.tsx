/**
 * StatusMessage - Alert/message display component
 *
 * A consistent component for showing status messages, alerts, and banners.
 *
 * @example
 * <StatusMessage type="error" icon={<AlertCircle />}>
 *   Token validation failed
 * </StatusMessage>
 *
 * <StatusMessage type="success" dismissible onDismiss={handleDismiss}>
 *   Settings saved successfully
 * </StatusMessage>
 */

import React from 'react';
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

export type StatusType = 'info' | 'success' | 'warning' | 'error';

interface StatusMessageProps {
  /** Message type determines color and default icon */
  type?: StatusType;
  /** Custom icon (overrides default) */
  icon?: React.ReactNode;
  /** Message content */
  children: React.ReactNode;
  /** Show dismiss button */
  dismissible?: boolean;
  /** Dismiss handler */
  onDismiss?: () => void;
  /** Title (optional, for more prominent messages) */
  title?: string;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Fill the container width */
  fullWidth?: boolean;
  /** Custom className */
  className?: string;
}

// =============================================================================
// TYPE CONFIGURATION
// =============================================================================

interface TypeConfig {
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
}

const typeConfig: Record<StatusType, TypeConfig> = {
  info: {
    icon: <Info size={18} />,
    color: 'var(--color-info)',
    bgColor: 'var(--color-info-bg)',
    borderColor: 'var(--color-info)',
  },
  success: {
    icon: <CheckCircle size={18} />,
    color: 'var(--color-success)',
    bgColor: 'var(--color-success-bg)',
    borderColor: 'var(--color-success)',
  },
  warning: {
    icon: <AlertTriangle size={18} />,
    color: 'var(--color-warning)',
    bgColor: 'var(--color-warning-bg)',
    borderColor: 'var(--color-warning)',
  },
  error: {
    icon: <AlertCircle size={18} />,
    color: 'var(--color-error)',
    bgColor: 'var(--color-error-bg)',
    borderColor: 'var(--color-error)',
  },
};

// =============================================================================
// STATUS MESSAGE COMPONENT
// =============================================================================

export function StatusMessage({
  type = 'info',
  icon,
  children,
  dismissible = false,
  onDismiss,
  title,
  size = 'md',
  fullWidth = true,
  className,
}: StatusMessageProps) {
  const config = typeConfig[type];
  const displayIcon = icon ?? config.icon;

  return (
    <div
      className={className}
      role="alert"
      style={{
        ...styles.container,
        backgroundColor: config.bgColor,
        borderColor: config.borderColor,
        padding: size === 'sm' ? '8px 12px' : '12px 16px',
        width: fullWidth ? '100%' : 'auto',
      }}
    >
      {/* Icon */}
      <div
        style={{
          ...styles.icon,
          color: config.color,
        }}
      >
        {displayIcon}
      </div>

      {/* Content */}
      <div style={styles.content}>
        {title && (
          <div
            style={{
              ...styles.title,
              color: config.color,
              fontSize: size === 'sm' ? '13px' : '14px',
            }}
          >
            {title}
          </div>
        )}
        <div
          style={{
            ...styles.message,
            fontSize: size === 'sm' ? '12px' : '14px',
          }}
        >
          {children}
        </div>
      </div>

      {/* Dismiss button */}
      {dismissible && (
        <button
          style={{
            ...styles.dismissButton,
            color: config.color,
          }}
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    borderRadius: 'var(--radius-md)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderLeftWidth: '4px',
  },

  icon: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    marginTop: '1px',
  },

  content: {
    flex: 1,
    minWidth: 0,
  },

  title: {
    fontWeight: '600',
    marginBottom: '2px',
  },

  message: {
    color: 'var(--text-primary)',
    lineHeight: 1.5,
  },

  dismissButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px',
    border: 'none',
    backgroundColor: 'transparent',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    opacity: 0.7,
    transition: 'opacity 150ms ease',
    flexShrink: 0,
  },
};

// =============================================================================
// CONVENIENCE COMPONENTS
// =============================================================================

interface SimpleStatusProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
}

export function InfoMessage(props: SimpleStatusProps) {
  return <StatusMessage type="info" {...props} />;
}

export function SuccessMessage(props: SimpleStatusProps) {
  return <StatusMessage type="success" {...props} />;
}

export function WarningMessage(props: SimpleStatusProps) {
  return <StatusMessage type="warning" {...props} />;
}

export function ErrorMessage(props: SimpleStatusProps) {
  return <StatusMessage type="error" {...props} />;
}

export default StatusMessage;
