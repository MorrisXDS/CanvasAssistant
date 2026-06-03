/**
 * RecoveryBanner Component
 * Floating toast notification showing crash recovery status and safe mode information
 */

import React, { useEffect, useState } from 'react';
import { Button } from './Button';
import { Z_INDEX } from '../../constants';

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
  const [isVisible, setIsVisible] = useState(false);
  const isSafeMode = status.safeMode;

  // Animate in on mount
  useEffect(() => {
    if (status.safeMode || status.lastCrash) {
      // Small delay to trigger CSS transition
      const showTimer = setTimeout(() => setIsVisible(true), 50);
      return () => clearTimeout(showTimer);
    }
  }, [status.safeMode, status.lastCrash]);

  // Auto-dismiss crash recovery notification after 1.5 seconds (not for safe mode)
  useEffect(() => {
    if (!isSafeMode && status.lastCrash) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        // Wait for fade animation before calling onDismiss
        setTimeout(onDismiss, 300);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isSafeMode, status.lastCrash, onDismiss]);

  if (!status.safeMode && !status.lastCrash) {
    return null;
  }

  const getMessage = () => {
    if (status.message) {
      return status.message;
    }
    if (isSafeMode) {
      return 'Safe mode enabled. Auto-sync disabled.';
    }
    if (status.lastCrash) {
      return 'App recovered from previous crash.';
    }
    return '';
  };

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(onDismiss, 300);
  };

  const toastStyle: React.CSSProperties = {
    position: 'fixed',
    top: '60px',
    right: '20px',
    backgroundColor: isSafeMode ? 'var(--color-high-bg)' : 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-lg)',
    border: `1px solid ${isSafeMode ? 'var(--color-high-border)' : 'var(--border-default)'}`,
    minWidth: '240px',
    maxWidth: '320px',
    zIndex: Z_INDEX.overlayChrome,
    transition: 'all 0.3s ease',
    opacity: isVisible ? 1 : 0,
    transform: isVisible ? 'translateY(0)' : 'translateY(-20px)',
    pointerEvents: isVisible ? 'auto' : 'none',
  };

  const contentStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) var(--space-4)',
  };

  const iconStyle: React.CSSProperties = {
    fontSize: 'var(--text-lg)',
    lineHeight: 1,
    color: isSafeMode ? 'var(--color-high)' : 'var(--color-info)',
  };

  const textStyle: React.CSSProperties = {
    flex: 1,
    fontSize: 'var(--text-sm)',
    color: isSafeMode ? 'var(--color-high)' : 'var(--text-primary)',
  };

  const actionsStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: '0 var(--space-4) var(--space-3)',
  };

  return (
    <div style={toastStyle} role="alert" aria-live="polite">
      <div style={contentStyle}>
        <span style={iconStyle} aria-hidden="true">
          {isSafeMode ? '⚠' : 'ℹ'}
        </span>
        <span style={textStyle}>{getMessage()}</span>
      </div>
      {isSafeMode && (
        <div style={actionsStyle}>
          {onExitSafeMode && (
            <Button variant="secondary" size="sm" onClick={onExitSafeMode}>
              Exit Safe Mode
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            aria-label="Dismiss notification"
          >
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}

export default RecoveryBanner;
