/**
 * ReAuthModal - Mandatory re-authentication modal when Canvas token expires
 *
 * This modal blocks the entire UI and requires the user to re-authenticate
 * before they can continue using the app.
 */

import React, { useState } from 'react';
import { AlertTriangle, Key, Loader2, Check, XCircle, LogOut } from 'lucide-react';
import { STORAGE_KEYS } from '../../../l5-presentation/settings';

interface ReAuthModalProps {
  reason?: string;
  onReauthSuccess: () => void;
  onDisconnect: () => void;
}

export function ReAuthModal({ reason, onReauthSuccess, onDisconnect }: ReAuthModalProps) {
  const [token, setToken] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    userName: string | null;
  } | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Get the Canvas URL from localStorage
  const canvasUrl = localStorage.getItem(STORAGE_KEYS.CANVAS_URL) || '';

  const handleValidateToken = async () => {
    if (!token || !canvasUrl) return;

    setIsValidating(true);
    setError(null);
    setValidationResult(null);

    try {
      const result = await window.api.validateToken(token, canvasUrl);
      if (result.valid) {
        setValidationResult({
          valid: true,
          userName: result.user?.name || null,
        });
      } else {
        setError(result.error || 'Invalid token');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Validation failed');
    } finally {
      setIsValidating(false);
    }
  };

  const handleReconnect = async () => {
    if (!validationResult?.valid || !token) return;

    setIsReconnecting(true);
    setError(null);

    try {
      // Store the new token
      const storeResult = await window.api.storeCredential(token);
      if (!storeResult.success) {
        setError('Failed to store new token');
        setIsReconnecting(false);
        return;
      }

      // Reconnect with the new token
      const connectResult = await window.api.connectCanvas(canvasUrl);
      if (connectResult.success) {
        onReauthSuccess();
      } else {
        setError(connectResult.error || 'Failed to reconnect');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reconnection failed');
    } finally {
      setIsReconnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await window.api.deleteCredential();
      onDisconnect();
    } catch (e) {
      console.error('Failed to disconnect:', e);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Warning Icon */}
        <div style={styles.iconWrapper}>
          <AlertTriangle size={32} />
        </div>

        {/* Title */}
        <h2 style={styles.title}>Canvas Token Expired</h2>

        {/* Description */}
        <p style={styles.description}>
          Your Canvas access token has expired or been revoked.
          {reason && ` Reason: ${reason}`} Please enter a new token to continue using the
          app.
        </p>

        {/* Token Input */}
        <div style={styles.field}>
          <label style={styles.label}>New Access Token</label>
          <input
            type="password"
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              setError(null);
              setValidationResult(null);
            }}
            placeholder="Enter your Canvas access token"
            style={styles.input}
            autoFocus
          />
          <p style={styles.hint}>
            Generate a new token: Canvas → Account → Settings → New Access Token
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div style={styles.error}>
            <XCircle size={14} />
            {error}
          </div>
        )}

        {/* Success Message */}
        {validationResult?.valid && (
          <div style={styles.success}>
            <Check size={14} />
            Token valid{validationResult.userName && ` for ${validationResult.userName}`}
          </div>
        )}

        {/* Action Buttons */}
        <div style={styles.actions}>
          {!validationResult?.valid ? (
            <button
              style={{
                ...styles.primaryButton,
                opacity: isValidating || !token ? 0.6 : 1,
              }}
              onClick={handleValidateToken}
              disabled={isValidating || !token}
            >
              {isValidating ? (
                <>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  Validating...
                </>
              ) : (
                <>
                  <Key size={16} />
                  Validate Token
                </>
              )}
            </button>
          ) : (
            <button
              style={{
                ...styles.primaryButton,
                opacity: isReconnecting ? 0.6 : 1,
              }}
              onClick={handleReconnect}
              disabled={isReconnecting}
            >
              {isReconnecting ? (
                <>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  Reconnecting...
                </>
              ) : (
                <>
                  <Check size={16} />
                  Reconnect
                </>
              )}
            </button>
          )}
        </div>

        {/* Disconnect Option */}
        <div style={styles.divider} />
        <button style={styles.disconnectButton} onClick={handleDisconnect}>
          <LogOut size={14} />
          Disconnect from Canvas
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999, // Very high to block everything
  },

  modal: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-xl)',
    width: '100%',
    maxWidth: '450px',
    padding: 'var(--space-6)',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
  },

  iconWrapper: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-warning-bg)',
    color: 'var(--color-warning)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 'var(--space-4)',
  },

  title: {
    margin: '0 0 var(--space-2) 0',
    fontSize: 'var(--text-xl)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
  },

  description: {
    margin: '0 0 var(--space-5) 0',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    lineHeight: 'var(--leading-relaxed)',
  },

  field: {
    marginBottom: 'var(--space-4)',
  },

  label: {
    display: 'block',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-2)',
  },

  input: {
    width: '100%',
    padding: 'var(--space-3)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    outline: 'none',
    boxSizing: 'border-box',
  },

  hint: {
    margin: 'var(--space-2) 0 0 0',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    lineHeight: 'var(--leading-relaxed)',
  },

  error: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-error-bg)',
    color: 'var(--color-error)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    marginBottom: 'var(--space-3)',
  },

  success: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-success-bg)',
    color: 'var(--color-success)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    marginBottom: 'var(--space-3)',
  },

  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
  },

  primaryButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-5)',
    backgroundColor: 'var(--color-blue)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    transition: 'opacity var(--transition-fast)',
  },

  divider: {
    height: '1px',
    backgroundColor: 'var(--border-default)',
    margin: 'var(--space-4) 0',
  },

  disconnectButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    width: '100%',
    padding: 'var(--space-2)',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    transition: 'color var(--transition-fast)',
  },
};

export default ReAuthModal;
