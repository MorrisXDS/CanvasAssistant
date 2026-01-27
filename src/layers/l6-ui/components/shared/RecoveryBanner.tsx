/**
 * RecoveryBanner Component
 * Dismissible banner showing crash recovery status and safe mode information
 */

import React from 'react';
import { Button } from './Button';

export interface RecoveryStatus {
  safeMode: boolean;
  lastCrash: { timestamp: string; reason: string } | null;
  message: string | null;
}

export interface RecoveryBannerProps {
  status: RecoveryStatus;
  onDismiss: () => void;
  onExitSafeMode?: () => void;
}

export function RecoveryBanner({
  status,
  onDismiss,
  onExitSafeMode,
}: RecoveryBannerProps) {
  if (!status.safeMode && !status.lastCrash) {
    return null;
  }

  const isSafeMode = status.safeMode;
  const variant = isSafeMode ? 'warning' : 'info';

  const bannerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) var(--space-4)',
    backgroundColor: isSafeMode ? 'var(--color-high-bg)' : 'var(--color-info-bg)',
    borderBottom: `1px solid ${isSafeMode ? 'var(--color-high-border)' : 'var(--color-blue)'}`,
    fontSize: 'var(--text-sm)',
    color: isSafeMode ? 'var(--color-high)' : 'var(--color-info)',
  };

  const contentStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    flex: 1,
  };

  const iconStyle: React.CSSProperties = {
    fontSize: 'var(--text-lg)',
    lineHeight: 1,
  };

  const textStyle: React.CSSProperties = {
    flex: 1,
  };

  const actionsStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  };

  const getIcon = () => {
    if (isSafeMode) {
      return '!'; // Warning indicator
    }
    return 'i'; // Info indicator
  };

  const getMessage = () => {
    if (status.message) {
      return status.message;
    }
    if (isSafeMode) {
      return 'Safe mode enabled due to repeated crashes. Auto-sync is disabled, but manual sync and all other features work normally.';
    }
    if (status.lastCrash) {
      return `App recovered from previous crash (${formatTimeAgo(status.lastCrash.timestamp)}).`;
    }
    return '';
  };

  return (
    <div style={bannerStyle} role="alert" aria-live="polite" data-variant={variant}>
      <div style={contentStyle}>
        <span style={iconStyle} aria-hidden="true">
          {getIcon()}
        </span>
        <span style={textStyle}>{getMessage()}</span>
      </div>
      <div style={actionsStyle}>
        {isSafeMode && onExitSafeMode && (
          <Button variant="secondary" size="sm" onClick={onExitSafeMode}>
            Exit Safe Mode
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          aria-label="Dismiss notification"
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}

/**
 * Format timestamp as relative time
 */
function formatTimeAgo(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default RecoveryBanner;
