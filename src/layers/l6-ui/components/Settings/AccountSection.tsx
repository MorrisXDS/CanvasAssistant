/**
 * AccountSection - Account & Connection settings
 *
 * Contains:
 * - Canvas connection management
 * - Sync preferences
 * - Window behavior settings
 */

import React from 'react';
import { Link, Check, AlertCircle, Loader2, ShieldCheck, Key } from 'lucide-react';
import { useSettings } from './SettingsContext';
import { Accordion, SettingRow, ToggleSwitch, SettingSelect } from '../primitives';
import { styles } from '../SettingsModalStyles';
import { SETTINGS_LABELS } from '../../constants';
import {
  SETTINGS_CATEGORIES,
  DEFAULT_SYNC_PREFERENCES,
} from '../../../l5-presentation/settings';

// Category icon for account
const ACCOUNT_ICON = <Link size={18} />;

interface AccountSectionProps {
  sectionRef: React.RefObject<HTMLDivElement>;
}

export function AccountSection({ sectionRef }: AccountSectionProps) {
  const {
    // Search
    isSearching,
    shouldShowSetting,

    // Drag and drop
    sectionOrder,
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
    handleReconnect,

    // Token validation
    isValidatingToken,
    tokenValidationResult,
    handleValidateToken,
    handleOpenTokenReplace,

    // Confirmation
    setShowDisconnectConfirm,

    // Sync preferences
    syncPrefs,
    updateSyncPrefs,

    // Window behavior
    windowBehavior,
    updateWindowBehavior,

    // Modified count
    accountModifiedCount,
  } = useSettings();

  const ModifiedBadge = ({ count }: { count: number }) =>
    count > 0 ? <span style={styles.modifiedBadge}>{count} modified</span> : null;

  return (
    <div
      ref={sectionRef}
      draggable
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
                  <Link size={18} style={{ color: 'var(--color-primary)' }} />
                  <span style={styles.connectionTitle}>
                    {SETTINGS_LABELS.sections.canvasConnection}
                  </span>
                </div>
                {isConnected ? (
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

            {!isSearching && <div style={styles.divider} />}

            {/* Sync Settings */}
            {shouldShowSetting('syncPrefs.autoSyncInterval') && (
              <SettingRow
                settingKey="syncPrefs.autoSyncInterval"
                label="Auto-sync interval"
                description="How often to automatically sync data from Canvas"
                isModified={
                  syncPrefs.autoSyncInterval !== DEFAULT_SYNC_PREFERENCES.autoSyncInterval
                }
                onReset={() =>
                  updateSyncPrefs({
                    autoSyncInterval: DEFAULT_SYNC_PREFERENCES.autoSyncInterval,
                    autoSyncEnabled: DEFAULT_SYNC_PREFERENCES.autoSyncEnabled,
                  })
                }
              >
                <SettingSelect
                  value={String(syncPrefs.autoSyncInterval)}
                  onChange={(v) => {
                    const interval = Number(v);
                    updateSyncPrefs({
                      autoSyncInterval: interval,
                      autoSyncEnabled: interval > 0,
                    });
                  }}
                  options={[
                    { value: '0', label: SETTINGS_LABELS.options.syncInterval.never },
                    {
                      value: '15',
                      label: SETTINGS_LABELS.options.syncInterval.minutes15,
                    },
                    {
                      value: '30',
                      label: SETTINGS_LABELS.options.syncInterval.minutes30,
                    },
                    { value: '60', label: SETTINGS_LABELS.options.syncInterval.hour1 },
                    { value: '120', label: SETTINGS_LABELS.options.syncInterval.hours2 },
                  ]}
                />
              </SettingRow>
            )}

            {shouldShowSetting('syncPrefs.syncFiles') && (
              <SettingRow
                settingKey="syncPrefs.syncFiles"
                label="Sync files"
                description="Include course files and folders in sync"
                isModified={syncPrefs.syncFiles !== DEFAULT_SYNC_PREFERENCES.syncFiles}
                onReset={() =>
                  updateSyncPrefs({ syncFiles: DEFAULT_SYNC_PREFERENCES.syncFiles })
                }
              >
                <ToggleSwitch
                  checked={syncPrefs.syncFiles}
                  onChange={(checked) => updateSyncPrefs({ syncFiles: checked })}
                />
              </SettingRow>
            )}

            {shouldShowSetting('syncPrefs.syncAnnouncements') && (
              <SettingRow
                settingKey="syncPrefs.syncAnnouncements"
                label="Sync announcements"
                description="Include course announcements in sync"
                isModified={
                  syncPrefs.syncAnnouncements !==
                  DEFAULT_SYNC_PREFERENCES.syncAnnouncements
                }
                onReset={() =>
                  updateSyncPrefs({
                    syncAnnouncements: DEFAULT_SYNC_PREFERENCES.syncAnnouncements,
                  })
                }
              >
                <ToggleSwitch
                  checked={syncPrefs.syncAnnouncements}
                  onChange={(checked) => updateSyncPrefs({ syncAnnouncements: checked })}
                />
              </SettingRow>
            )}

            {!isSearching && <div style={styles.divider} />}

            {/* Window Behavior */}
            {shouldShowSetting('windowBehavior.closeAction') && (
              <SettingRow
                settingKey="windowBehavior.closeAction"
                label="Close button behavior"
                description="What happens when you click the close button"
                isModified={windowBehavior.closeAction !== null}
                onReset={() => updateWindowBehavior({ closeAction: null })}
              >
                <SettingSelect
                  value={windowBehavior.closeAction ?? ''}
                  onChange={(v) =>
                    updateWindowBehavior({
                      closeAction: v === '' ? null : (v as 'quit' | 'minimize-to-tray'),
                    })
                  }
                  options={[
                    { value: '', label: SETTINGS_LABELS.options.closeAction.ask },
                    {
                      value: 'minimize-to-tray',
                      label: SETTINGS_LABELS.options.closeAction.minimize,
                    },
                    { value: 'quit', label: SETTINGS_LABELS.options.closeAction.quit },
                  ]}
                />
              </SettingRow>
            )}
          </div>
        </Accordion.Content>
      </Accordion.Item>
    </div>
  );
}
