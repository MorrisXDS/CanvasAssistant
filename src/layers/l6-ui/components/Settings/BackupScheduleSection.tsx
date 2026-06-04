/**
 * BackupScheduleSection - Scheduled backup configuration UI
 *
 * Allows users to configure automatic database backups with:
 * - Enable/disable toggle
 * - Frequency selection (daily, weekly, monthly)
 * - Time and day configuration
 * - Maximum backups to keep
 * - Optional encryption with password
 * - Status display and backup history
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  Calendar,
  Shield,
  CheckCircle,
  XCircle,
  Lock,
  RefreshCw,
  HardDrive,
} from 'lucide-react';
import {
  SettingRow,
  ToggleSwitch,
  SettingSelect,
  SettingSlider,
  SettingInput,
} from '../primitives/SettingRow';
import { formatFileSize, formatTimeAgo } from '../../constants/formatters';
import { createLogger } from '../../utils/rendererLogger';

const logger = createLogger('BackupSchedule');

// =============================================================================
// TYPES
// =============================================================================

interface BackupSchedule {
  enabled: boolean;
  frequency: 'never' | 'daily' | 'weekly' | 'monthly';
  time?: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  maxBackups: number;
  encrypt: boolean;
  lastRun?: string;
  nextRun?: string;
}

interface BackupHistoryItem {
  id: number;
  file_path: string | null;
  file_size: number | null;
  status: string;
  error_message: string | null;
  created_at: string;
  exists: boolean;
  encrypted: boolean;
}

interface DirectoryInfo {
  path: string;
  totalSize: number;
  fileCount: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const FREQUENCY_OPTIONS = [
  { value: 'never', label: 'Never' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const TIME_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: `${String(i).padStart(2, '0')}:00`,
  label: `${i === 0 ? 12 : i > 12 ? i - 12 : i}:00 ${i < 12 ? 'AM' : 'PM'}`,
}));

const DAY_OF_WEEK_OPTIONS = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
];

const DAY_OF_MONTH_OPTIONS = Array.from({ length: 28 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

const DEFAULT_SCHEDULE: BackupSchedule = {
  enabled: false,
  frequency: 'never',
  time: '03:00',
  dayOfWeek: 0,
  dayOfMonth: 1,
  maxBackups: 5,
  encrypt: false,
};

// =============================================================================
// COMPONENT
// =============================================================================

export function BackupScheduleSection() {
  const [schedule, setSchedule] = useState<BackupSchedule>(DEFAULT_SCHEDULE);
  const [history, setHistory] = useState<BackupHistoryItem[]>([]);
  const [directoryInfo, setDirectoryInfo] = useState<DirectoryInfo | null>(null);
  const [encryptionPassword, setEncryptionPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load schedule and history on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [scheduleResult, historyResult, dirResult] = await Promise.all([
        window.api.getBackupSchedule(),
        window.api.getBackupHistory(10),
        window.api.getBackupDirectoryInfo(),
      ]);

      if (scheduleResult.success && scheduleResult.data) {
        setSchedule({ ...DEFAULT_SCHEDULE, ...scheduleResult.data });
      }

      if (historyResult.success && historyResult.data) {
        setHistory(historyResult.data);
      }

      if (dirResult.success && dirResult.data) {
        setDirectoryInfo(dirResult.data);
      }
    } catch (err) {
      setError('Failed to load backup settings');
      logger.error(
        'Failed to load backup settings',
        err instanceof Error ? err : undefined
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Save schedule when it changes
  const saveSchedule = useCallback(
    async (updates: Partial<BackupSchedule>) => {
      const newSchedule = { ...schedule, ...updates };
      setSchedule(newSchedule);
      setIsSaving(true);
      setError(null);

      try {
        // Include password if encryption is being enabled
        const scheduleToSave: BackupSchedule & { encryptionPassword?: string } = {
          ...newSchedule,
        };

        if (newSchedule.encrypt && encryptionPassword) {
          scheduleToSave.encryptionPassword = encryptionPassword;
        }

        const result = await window.api.setBackupSchedule(scheduleToSave);

        if (!result.success) {
          setError(result.error || 'Failed to save schedule');
          // Revert on error
          setSchedule(schedule);
        }
      } catch (err) {
        setError('Failed to save schedule');
        logger.error(
          'Failed to save backup schedule',
          err instanceof Error ? err : undefined
        );
        setSchedule(schedule);
      } finally {
        setIsSaving(false);
      }
    },
    [schedule, encryptionPassword]
  );

  // Handle encryption toggle
  const handleEncryptionToggle = (enabled: boolean) => {
    if (!enabled) {
      // Clearing encryption
      setEncryptionPassword('');
      setConfirmPassword('');
      saveSchedule({ encrypt: false });
    } else {
      // Just update local state, don't save until password is set
      setSchedule((prev) => ({ ...prev, encrypt: true }));
    }
  };

  // Save password when both fields match
  const handleSavePassword = () => {
    if (encryptionPassword && encryptionPassword === confirmPassword) {
      saveSchedule({ encrypt: true });
    }
  };

  const passwordsMatch =
    encryptionPassword === confirmPassword && encryptionPassword.length >= 8;
  const showPasswordError =
    confirmPassword.length > 0 && encryptionPassword !== confirmPassword;
  const showLengthError = encryptionPassword.length > 0 && encryptionPassword.length < 8;

  if (isLoading) {
    return (
      <div style={styles.loadingContainer}>
        <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
        <span>Loading backup settings...</span>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {error && <div style={styles.errorMessage}>{error}</div>}

      {/* Enable Toggle */}
      <SettingRow
        label="Automatic backups"
        description="Automatically back up your database on a schedule"
      >
        <ToggleSwitch
          checked={schedule.enabled}
          onChange={(enabled) => {
            // When enabling, also set a default frequency if it's 'never'
            if (enabled && schedule.frequency === 'never') {
              saveSchedule({ enabled, frequency: 'daily' });
            } else if (!enabled) {
              // When disabling, set frequency to 'never'
              saveSchedule({ enabled, frequency: 'never' });
            } else {
              saveSchedule({ enabled });
            }
          }}
          disabled={isSaving}
        />
      </SettingRow>

      {/* Frequency - only shown when automatic backups are enabled */}
      {schedule.enabled && (
        <SettingRow label="Frequency" description="How often to create backups">
          <SettingSelect
            value={schedule.frequency}
            onChange={(value) =>
              saveSchedule({
                frequency: value as BackupSchedule['frequency'],
              })
            }
            options={FREQUENCY_OPTIONS.filter((opt) => opt.value !== 'never')}
            disabled={isSaving}
          />
        </SettingRow>
      )}

      {/* Time - shown when enabled and frequency is set */}
      {schedule.enabled && schedule.frequency !== 'never' && (
        <SettingRow label="Time" description="Time of day to run the backup">
          <SettingSelect
            value={schedule.time || '03:00'}
            onChange={(value) => saveSchedule({ time: value })}
            options={TIME_OPTIONS}
            disabled={isSaving}
          />
        </SettingRow>
      )}

      {/* Day of Week - shown for weekly */}
      {schedule.enabled && schedule.frequency === 'weekly' && (
        <SettingRow label="Day of week" description="Which day to run the weekly backup">
          <SettingSelect
            value={String(schedule.dayOfWeek ?? 0)}
            onChange={(value) => saveSchedule({ dayOfWeek: parseInt(value, 10) })}
            options={DAY_OF_WEEK_OPTIONS}
            disabled={isSaving}
          />
        </SettingRow>
      )}

      {/* Day of Month - shown for monthly */}
      {schedule.enabled && schedule.frequency === 'monthly' && (
        <SettingRow
          label="Day of month"
          description="Which day to run the monthly backup"
        >
          <SettingSelect
            value={String(schedule.dayOfMonth ?? 1)}
            onChange={(value) => saveSchedule({ dayOfMonth: parseInt(value, 10) })}
            options={DAY_OF_MONTH_OPTIONS}
            disabled={isSaving}
          />
        </SettingRow>
      )}

      {/* Max Backups */}
      {schedule.enabled && schedule.frequency !== 'never' && (
        <SettingRow label="Keep backups" description="Maximum number of backups to keep">
          <SettingSlider
            value={schedule.maxBackups}
            onChange={(value) => saveSchedule({ maxBackups: value })}
            min={1}
            max={30}
            disabled={isSaving}
          />
        </SettingRow>
      )}

      {/* Encryption Toggle */}
      {schedule.enabled && schedule.frequency !== 'never' && (
        <>
          <SettingRow
            label="Encrypt backups"
            description="Password-protect backup files with AES-256 encryption"
          >
            <ToggleSwitch
              checked={schedule.encrypt}
              onChange={handleEncryptionToggle}
              disabled={isSaving}
            />
          </SettingRow>

          {/* Password fields - shown when encryption is enabled */}
          {schedule.encrypt && (
            <div style={styles.passwordSection}>
              <div style={styles.passwordField}>
                <label style={styles.passwordLabel}>Backup password</label>
                <SettingInput
                  type="password"
                  value={encryptionPassword}
                  onChange={setEncryptionPassword}
                  placeholder="Enter password (min 8 characters)"
                />
                {showLengthError && (
                  <span style={styles.passwordHint}>
                    Password must be at least 8 characters
                  </span>
                )}
              </div>
              <div style={styles.passwordField}>
                <label style={styles.passwordLabel}>Confirm password</label>
                <SettingInput
                  type="password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="Confirm password"
                />
                {showPasswordError && (
                  <span style={styles.passwordError}>Passwords do not match</span>
                )}
              </div>
              {encryptionPassword && confirmPassword && passwordsMatch && (
                <button style={styles.savePasswordButton} onClick={handleSavePassword}>
                  <Shield size={14} />
                  Save encryption password
                </button>
              )}
              <p style={styles.passwordWarning}>
                <Lock size={12} />
                Store this password safely. You will need it to restore encrypted backups.
              </p>
            </div>
          )}
        </>
      )}

      {/* Status Card */}
      {schedule.enabled && schedule.frequency !== 'never' && (
        <div style={styles.statusCard}>
          <div style={styles.statusRow}>
            <Clock size={14} />
            <span style={styles.statusLabel}>Next backup:</span>
            <span style={styles.statusValue}>
              {schedule.nextRun ? formatNextBackup(schedule.nextRun) : 'Not scheduled'}
            </span>
          </div>
          <div style={styles.statusRow}>
            <Calendar size={14} />
            <span style={styles.statusLabel}>Last backup:</span>
            <span style={styles.statusValue}>
              {schedule.lastRun ? formatTimeAgo(schedule.lastRun) : 'Never'}
            </span>
          </div>
          <div style={styles.statusRow}>
            <HardDrive size={14} />
            <span style={styles.statusLabel}>Storage:</span>
            <span style={styles.statusValue}>
              {directoryInfo
                ? `${formatFileSize(directoryInfo.totalSize)} (${directoryInfo.fileCount} backups)`
                : 'Unknown'}
            </span>
          </div>
          {schedule.encrypt && (
            <div style={styles.statusRow}>
              <Lock size={14} />
              <span style={styles.statusLabel}>Encryption:</span>
              <span style={{ ...styles.statusValue, color: 'var(--color-success)' }}>
                Enabled
              </span>
            </div>
          )}
        </div>
      )}

      {/* Backup History */}
      {history.length > 0 && (
        <div style={styles.historySection}>
          <h4 style={styles.historyTitle}>Recent Backups</h4>
          <div style={styles.historyList}>
            {history.map((item) => (
              <div key={item.id} style={styles.historyItem}>
                <div style={styles.historyLeft}>
                  {item.encrypted && <Lock size={12} style={styles.historyIcon} />}
                  {item.status === 'completed' ? (
                    <CheckCircle size={14} style={{ color: 'var(--color-success)' }} />
                  ) : (
                    <XCircle size={14} style={{ color: 'var(--color-error)' }} />
                  )}
                  <span style={styles.historyTime}>{formatTimeAgo(item.created_at)}</span>
                </div>
                <div style={styles.historyRight}>
                  {item.status === 'completed' && item.file_size ? (
                    <span style={styles.historySize}>
                      {formatFileSize(item.file_size)}
                    </span>
                  ) : (
                    <span style={styles.historyError}>
                      {item.error_message || 'Failed'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// HELPERS
// =============================================================================

function formatNextBackup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 0) {
    return 'Overdue';
  }
  if (diffHours < 1) {
    return 'Within the hour';
  }
  if (diffHours < 24) {
    return `In ${diffHours} hours`;
  }
  if (diffDays === 1) {
    return 'Tomorrow';
  }
  if (diffDays < 7) {
    return `In ${diffDays} days`;
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// =============================================================================
// STYLES
// =============================================================================

const styles: Record<string, React.CSSProperties> = {
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

  passwordSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--bg-app)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    marginTop: 'var(--space-2)',
  },

  passwordField: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
  },

  passwordLabel: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },

  passwordHint: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  passwordError: {
    fontSize: 'var(--text-xs)',
    color: 'var(--color-error)',
  },

  passwordWarning: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    margin: 0,
    padding: 'var(--space-2)',
    backgroundColor: 'rgba(234, 179, 8, 0.1)',
    borderRadius: 'var(--radius-sm)',
  },

  savePasswordButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'var(--color-blue)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  historySection: {
    marginTop: 'var(--space-4)',
  },

  historyTitle: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--text-secondary)',
    margin: '0 0 var(--space-2) 0',
  },

  historyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
  },

  historyItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--bg-card)',
    borderBottom: '1px solid var(--border-subtle)',
  },

  historyLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  historyIcon: {
    color: 'var(--text-muted)',
  },

  historyTime: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
  },

  historyRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  historySize: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-mono)',
  },

  historyError: {
    fontSize: 'var(--text-sm)',
    color: 'var(--color-error)',
  },
};

export default BackupScheduleSection;
