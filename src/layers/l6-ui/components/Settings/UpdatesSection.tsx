/**
 * UpdatesSection - App update preferences configuration UI
 *
 * Follows the exact shape of SyncSection / DataSection: wraps in Accordion.Item,
 * uses drag/order from useSettings(), and reads/writes a SQL-only preference
 * (`updatePreferences`) via IPC — NOT settingsManager/STORAGE_KEYS (those are
 * for localStorage-backed UI state). See CLAUDE.md §8 and the exportSchedule
 * precedent.
 *
 * Controls:
 * - Toggle: "Check for updates automatically" → updates:getPrefs / updates:setPrefs
 * - Interval select (enabled only when toggle is on): Daily / Weekly / On launch only
 * - "Check now" button → updates:checkNow; shows last-checked via formatTimeAgo
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { useSettings } from './SettingsContext';
import { Accordion } from '../primitives';
import { SettingRow, ToggleSwitch, SettingSelect } from '../primitives/SettingRow';
import { formatTimeAgo } from '../../constants/formatters';
import { SETTINGS_CATEGORIES } from '../../../l5-presentation/settings';
import { styles as modalStyles } from '../SettingsModalStyles';
import { createLogger } from '../../utils/rendererLogger';
import type { UpdatePreferences } from '../../../l5-presentation/types';

const logger = createLogger('UpdatesSection');

// =============================================================================
// CONSTANTS
// =============================================================================

const UPDATES_ICON = <Download size={18} />;

const INTERVAL_OPTIONS = [
  { value: '24', label: 'Daily' },
  { value: '168', label: 'Weekly' },
  // intervalHours=0 is interpreted by UpdateChecker as "check on launch only, no timer"
  { value: '0', label: 'On launch only' },
];

const DEFAULT_PREFS: UpdatePreferences = {
  enabled: false,
  intervalHours: 24,
  lastCheckedAt: null,
  skippedVersion: null,
};

// =============================================================================
// SECTION CONTENT (inner — state lives here)
// =============================================================================

function UpdatesSectionContent() {
  const { isSearching, shouldShowSetting } = useSettings();

  const [prefs, setPrefs] = useState<UpdatePreferences>(DEFAULT_PREFS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);

  // Load prefs on mount
  useEffect(() => {
    loadPrefs();
  }, []);

  const loadPrefs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.api.getUpdatePrefs?.();
      if (result?.success && result.data) {
        setPrefs({ ...DEFAULT_PREFS, ...result.data });
      }
    } catch (err) {
      setError('Failed to load update settings');
      logger.error('Failed to load update prefs', err instanceof Error ? err : undefined);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const savePrefs = useCallback(
    async (updates: Partial<UpdatePreferences>) => {
      const newPrefs = { ...prefs, ...updates };
      // Optimistic update
      setPrefs(newPrefs);
      setIsSaving(true);
      setError(null);
      try {
        const result = await window.api.setUpdatePrefs?.(newPrefs);
        if (!result?.success) {
          setError(result?.error ?? 'Failed to save update settings');
          // Revert on error
          setPrefs(prefs);
        }
      } catch (err) {
        setError('Failed to save update settings');
        logger.error(
          'Failed to save update prefs',
          err instanceof Error ? err : undefined
        );
        setPrefs(prefs);
      } finally {
        setIsSaving(false);
      }
    },
    [prefs]
  );

  const handleCheckNow = useCallback(async () => {
    setIsChecking(true);
    setCheckMessage(null);
    setError(null);
    try {
      const result = await window.api.checkForUpdatesNow?.();
      if (result?.success) {
        // Generic message: checkNow() may have debounced (no HTTP call) or run a full
        // check — we don't distinguish here, so avoid claiming "complete / up to date".
        setCheckMessage(
          'Checked for updates. You will be notified if a new version is found.'
        );
        // Refresh to pick up the updated lastCheckedAt timestamp
        await loadPrefs();
      } else {
        setError(result?.error ?? 'Check failed');
      }
    } catch (err) {
      setError('Failed to check for updates');
      logger.error('Failed to check for updates', err instanceof Error ? err : undefined);
    } finally {
      setIsChecking(false);
    }
  }, [loadPrefs]);

  if (isLoading) {
    return (
      <div style={innerStyles.loadingContainer}>
        <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
        <span>Loading update settings...</span>
      </div>
    );
  }

  return (
    <div style={innerStyles.container}>
      {!isSearching && (
        <p style={modalStyles.sectionDesc}>{SETTINGS_CATEGORIES.updates.description}</p>
      )}

      {error && <div style={innerStyles.errorMessage}>{error}</div>}
      {checkMessage && <div style={innerStyles.successMessage}>{checkMessage}</div>}

      {/* Enable toggle */}
      {shouldShowSetting('updatePreferences.enabled') && (
        <SettingRow
          settingKey="updatePreferences.enabled"
          label="Check for updates automatically"
          description="Periodically check GitHub Releases for a newer version of the app"
        >
          <ToggleSwitch
            checked={prefs.enabled}
            onChange={(enabled) => savePrefs({ enabled })}
            disabled={isSaving}
          />
        </SettingRow>
      )}

      {/* Interval — only shown when automatic checks are on */}
      {prefs.enabled && shouldShowSetting('updatePreferences.intervalHours') && (
        <SettingRow
          settingKey="updatePreferences.intervalHours"
          label="Check interval"
          description="How often to poll for updates in the background"
        >
          <SettingSelect
            value={String(prefs.intervalHours)}
            onChange={(value) => savePrefs({ intervalHours: Number(value) })}
            options={INTERVAL_OPTIONS}
            disabled={isSaving}
          />
        </SettingRow>
      )}

      {/* Status card: last-checked + Check now button */}
      <div style={innerStyles.statusCard}>
        <div style={innerStyles.statusRow}>
          <Download size={14} />
          <span style={innerStyles.statusLabel}>Last checked:</span>
          <span style={innerStyles.statusValue}>
            {prefs.lastCheckedAt ? formatTimeAgo(prefs.lastCheckedAt) : 'Never'}
          </span>
        </div>

        {/* Skipped version — allow clearing so the checker re-notifies */}
        {prefs.skippedVersion && (
          <div style={innerStyles.statusRow}>
            <span style={innerStyles.statusLabel}>Skipped version:</span>
            <span style={innerStyles.statusValue}>v{prefs.skippedVersion}</span>
            <button
              style={innerStyles.clearSkipButton}
              onClick={() => savePrefs({ skippedVersion: null })}
              disabled={isSaving}
            >
              Clear
            </button>
          </div>
        )}

        <button
          style={{
            ...innerStyles.checkNowButton,
            opacity: isChecking || isSaving ? 0.6 : 1,
          }}
          onClick={handleCheckNow}
          disabled={isChecking || isSaving}
        >
          <RefreshCw
            size={14}
            style={isChecking ? { animation: 'spin 1s linear infinite' } : undefined}
          />
          {isChecking ? 'Checking...' : 'Check now'}
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// SECTION WRAPPER (Accordion.Item + drag — mirrors SyncSection / DataSection)
// =============================================================================

interface UpdatesSectionProps {
  sectionRef: React.RefObject<HTMLDivElement>;
}

export function UpdatesSection({ sectionRef }: UpdatesSectionProps) {
  const {
    sectionOrder,
    handleMouseDown,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    getDragWrapperStyle,
  } = useSettings();

  return (
    <div
      ref={sectionRef}
      draggable
      onMouseDown={handleMouseDown}
      onDragStart={(e) => handleDragStart(e, 'updates')}
      onDragEnd={handleDragEnd}
      onDragOver={(e) => handleDragOver(e, 'updates')}
      onDragLeave={handleDragLeave}
      onDrop={(e) => handleDrop(e, 'updates')}
      style={{
        ...getDragWrapperStyle('updates'),
        order: sectionOrder.indexOf('updates'),
      }}
    >
      <Accordion.Item value="updates">
        <Accordion.Trigger icon={UPDATES_ICON}>
          {SETTINGS_CATEGORIES.updates.label}
        </Accordion.Trigger>
        <Accordion.Content>
          <div style={modalStyles.section}>
            <UpdatesSectionContent />
          </div>
        </Accordion.Content>
      </Accordion.Item>
    </div>
  );
}

// =============================================================================
// INNER STYLES
// =============================================================================

const innerStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
  },

  loadingContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-4)',
    color: 'var(--text-secondary)',
    fontSize: 'var(--text-sm)',
  },

  errorMessage: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-error-bg)',
    border: '1px solid var(--color-error)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-error)',
    marginBottom: 'var(--space-2)',
  },

  successMessage: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-success-bg)',
    border: '1px solid var(--color-success)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-success)',
    marginBottom: 'var(--space-2)',
  },

  statusCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--bg-app)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    marginTop: 'var(--space-2)',
  },

  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    color: 'var(--text-secondary)',
    fontSize: 'var(--text-sm)',
  },

  statusLabel: {
    flex: 1,
  },

  statusValue: {
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
  },

  clearSkipButton: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    background: 'none',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    padding: '2px 6px',
    cursor: 'pointer',
  },

  checkNowButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'var(--color-navy)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    marginTop: 'var(--space-1)',
    alignSelf: 'flex-start',
  },
};

export default UpdatesSection;
