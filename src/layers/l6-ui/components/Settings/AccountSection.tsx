/**
 * AccountSection - Account settings
 *
 * Contains:
 * - Canvas connection management (URL, token, test, disconnect)
 */

import React from 'react';
import {
  Link,
  Check,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Key,
  WifiOff,
  RefreshCw,
} from 'lucide-react';
import { useSettings } from './SettingsContext';
import { Accordion } from '../primitives';
import { styles } from '../SettingsModalStyles';
import { SETTINGS_LABELS, formatTimeAgo } from '../../constants';
import { SETTINGS_CATEGORIES } from '../../../l5-presentation/settings';
import { useStore } from '../../../l5-presentation/store';

// Category icon for account
const ACCOUNT_ICON = <Link size={18} />;

interface AccountSectionProps {
  sectionRef: React.RefObject<HTMLDivElement>;
}

export function AccountSection({ sectionRef }: AccountSectionProps) {
  const {
    // Search
    isSearching,

    // Drag and drop
    sectionOrder,
    handleMouseDown,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    getDragWrapperStyle,

    // Canvas connection
    canvasUrl,
    setCanvasUrl,
    isConnected,
    isConnecting,
    connectionError,
    tokenValidity,
    lastCheckedAt,
    handleReconnect,

    // Token validation
    isValidatingToken,
    tokenValidationResult,
    handleValidateToken,
    handleOpenTokenReplace,

    // Confirmation
    setShowDisconnectConfirm,

    // Modified count
    accountModifiedCount,
  } = useSettings();

  // ADR-0013: re-open the ReAuthModal from the "Token Expired" CTA.
  const reopenReauth = useStore((s) => s.reopenReauth);

  const ModifiedBadge = ({ count }: { count: number }) =>
    count > 0 ? <span style={styles.modifiedBadge}>{count} modified</span> : null;

  // Three-state connection badge (ADR-0013):
  //   token expired (401/403) -> error badge + Reconnect CTA
  //   offline (unknown)        -> muted badge with last-checked
  //   valid / unverified       -> green Connected
  const showTokenExpired = isConnected && tokenValidity === 'invalid';
  const showOffline = isConnected && tokenValidity === 'unknown';

  return (
    <div
      ref={sectionRef}
      draggable
      onMouseDown={handleMouseDown}
      onDragStart={(e) => handleDragStart(e, 'account')}
      onDragEnd={handleDragEnd}
      onDragOver={(e) => handleDragOver(e, 'account')}
      onDragLeave={handleDragLeave}
      onDrop={(e) => handleDrop(e, 'account')}
      style={{
        ...getDragWrapperStyle('account'),
        order: sectionOrder.indexOf('account'),
      }}
    >
      <Accordion.Item value="account">
        <Accordion.Trigger
          icon={ACCOUNT_ICON}
          badge={<ModifiedBadge count={accountModifiedCount} />}
        >
          {SETTINGS_CATEGORIES.account.label}
        </Accordion.Trigger>
        <Accordion.Content>
          <div style={styles.section}>
            {!isSearching && (
              <p style={styles.sectionDesc}>{SETTINGS_CATEGORIES.account.description}</p>
            )}

            {/* Canvas Connection Card */}
            <div style={styles.connectionCard}>
              {/* Connection Header with Status Badge */}
              <div style={styles.connectionHeader}>
                <div style={styles.connectionTitleRow}>
                  <Link size={18} style={{ color: 'var(--color-navy)' }} />
                  <span style={styles.connectionTitle}>
                    {SETTINGS_LABELS.sections.canvasConnection}
                  </span>
                </div>
                {showTokenExpired ? (
                  <span style={styles.statusBadgeDisconnected}>
                    <AlertCircle size={12} /> {SETTINGS_LABELS.status.tokenExpired}
                  </span>
                ) : showOffline ? (
                  <span style={accountBadgeStyles.offline}>
                    <WifiOff size={12} /> {SETTINGS_LABELS.status.offline}
                    {lastCheckedAt && ` · ${formatTimeAgo(lastCheckedAt)}`}
                  </span>
                ) : isConnected ? (
                  <span style={styles.statusBadgeConnected}>
                    <Check size={12} /> {SETTINGS_LABELS.status.connected}
                  </span>
                ) : (
                  <span style={styles.statusBadgeDisconnected}>
                    <AlertCircle size={12} /> {SETTINGS_LABELS.status.notConnected}
                  </span>
                )}
              </div>

              {/* URL Display/Input */}
              <div style={styles.urlSection}>
                <label style={styles.urlLabel}>Canvas URL</label>
                {isConnected ? (
                  <div style={styles.urlDisplay}>
                    <span style={styles.urlText}>{canvasUrl}</span>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={canvasUrl}
                    onChange={(e) => setCanvasUrl(e.target.value)}
                    placeholder={SETTINGS_LABELS.placeholders.canvasUrl}
                    style={styles.urlInput}
                  />
                )}
              </div>

              {/* Error/Validation Messages */}
              {connectionError && (
                <div style={styles.connectionError}>
                  <AlertCircle size={14} />
                  {connectionError}
                </div>
              )}

              {tokenValidationResult.status && (
                <div
                  style={{
                    ...styles.validationMessage,
                    backgroundColor:
                      tokenValidationResult.status === 'success'
                        ? 'var(--color-success-bg)'
                        : 'var(--color-error-bg)',
                    color:
                      tokenValidationResult.status === 'success'
                        ? 'var(--color-success)'
                        : 'var(--color-error)',
                  }}
                >
                  {tokenValidationResult.status === 'success' ? (
                    <Check size={14} />
                  ) : (
                    <AlertCircle size={14} />
                  )}
                  {tokenValidationResult.message}
                </div>
              )}

              {/* ADR-0013: Token-expired Reconnect CTA — re-opens ReAuthModal */}
              {showTokenExpired && (
                <button
                  style={accountBadgeStyles.reconnectCta}
                  onClick={reopenReauth}
                  title={SETTINGS_LABELS.status.tokenExpired}
                >
                  <RefreshCw size={14} />
                  {SETTINGS_LABELS.buttons.reconnect}
                </button>
              )}

              {/* Action Buttons */}
              <div style={styles.connectionActions}>
                {isConnected ? (
                  <>
                    <div style={styles.tokenActions}>
                      <button
                        style={{
                          ...styles.tokenButton,
                          opacity: isValidatingToken ? 0.6 : 1,
                        }}
                        onClick={handleValidateToken}
                        disabled={isValidatingToken}
                      >
                        {isValidatingToken ? (
                          <>
                            <Loader2
                              size={14}
                              style={{ animation: 'spin 1s linear infinite' }}
                            />
                            {SETTINGS_LABELS.buttons.testing}
                          </>
                        ) : (
                          <>
                            <ShieldCheck size={14} />
                            {SETTINGS_LABELS.buttons.testConnection}
                          </>
                        )}
                      </button>
                      <button style={styles.tokenButton} onClick={handleOpenTokenReplace}>
                        <Key size={14} />
                        {SETTINGS_LABELS.buttons.updateToken}
                      </button>
                    </div>
                    <button
                      style={styles.disconnectButton}
                      onClick={() => setShowDisconnectConfirm(true)}
                    >
                      {SETTINGS_LABELS.buttons.removeConnection}
                    </button>
                  </>
                ) : (
                  <button
                    style={{
                      ...styles.connectButton,
                      opacity: isConnecting || !canvasUrl ? 0.6 : 1,
                    }}
                    onClick={handleReconnect}
                    disabled={isConnecting || !canvasUrl}
                  >
                    {isConnecting ? (
                      <>
                        <Loader2
                          size={16}
                          style={{ animation: 'spin 1s linear infinite' }}
                        />
                        {SETTINGS_LABELS.buttons.connecting}
                      </>
                    ) : (
                      <>
                        <Link size={16} />
                        {SETTINGS_LABELS.buttons.connectToCanvas}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </Accordion.Content>
      </Accordion.Item>
    </div>
  );
}

// ADR-0013: local badge/CTA styles for the three-state account status. Uses
// existing theme tokens only (var(--color-primary) does NOT exist — never use it).
const accountBadgeStyles: Record<string, React.CSSProperties> = {
  offline: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-1) var(--space-2)',
    backgroundColor: 'var(--color-warning-bg)',
    color: 'var(--color-warning)',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
  },
  reconnectCta: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-3)',
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'var(--color-navy)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
  },
};
