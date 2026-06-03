/**
 * ReAuthModal — mandatory re-authentication modal when the Canvas token
 * expires or is revoked.
 *
 * Migrated to the shared `<Modal>` primitive. Public API unchanged.
 *
 * Shape: sectioned modal with header (icon + title + subtitle showing the
 * reason if provided), scrollable content (token input + status banners),
 * and a footer with the primary action (Validate -> Reconnect) and a
 * disconnect "escape hatch".
 *
 * Esc handling: `closeOnEscape={false}` and `closeOnBackdropClick={false}` —
 * this modal is shown when the app cannot continue without a valid token,
 * so the user must either reconnect or explicitly disconnect. There's no
 * implicit "cancel". The header's close button is also hidden.
 *
 * z-index: 1100 — same tier as CorruptionDialog. If both somehow trigger
 * the visual order reflects mount order; either is recoverable.
 */

import React, { useState } from 'react';
import { AlertTriangle, Key, Loader2, Check, XCircle, LogOut } from 'lucide-react';
import { STORAGE_KEYS } from '../../../l5-presentation/settings';
import { createLogger } from '../../utils/rendererLogger';
import { Modal } from '../primitives/Modal';
import { Z_INDEX } from '../../constants';

const logger = createLogger('ReAuthModal');

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
      logger.error('Failed to disconnect', e instanceof Error ? e : undefined);
    }
  };

  const subtitle = reason
    ? `Your Canvas access token has expired or been revoked. Reason: ${reason}`
    : 'Your Canvas access token has expired or been revoked. Please enter a new token to continue using the app.';

  return (
    <Modal
      isOpen
      closeOnEscape={false}
      closeOnBackdropClick={false}
      size="md"
      zIndex={Z_INDEX.modal}
    >
      <Modal.Header
        title="Canvas Token Expired"
        subtitle={subtitle}
        icon={<AlertTriangle size={24} />}
        showCloseButton={false}
      />

      <Modal.Content>
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
      </Modal.Content>

      <Modal.Footer align="between">
        <button style={styles.disconnectButton} onClick={handleDisconnect}>
          <LogOut size={14} />
          Disconnect from Canvas
        </button>

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
      </Modal.Footer>
    </Modal>
  );
}

const styles: Record<string, React.CSSProperties> = {
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

  disconnectButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
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
