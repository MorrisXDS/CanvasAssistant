/**
 * UninstallModal - In-app uninstall preparation dialog
 *
 * Provides a cross-platform interface for users to:
 * 1. Select what data to clean up before uninstalling
 * 2. Confirm the action by typing "UNINSTALL"
 * 3. View platform-specific instructions for completing the uninstall
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Trash2,
  AlertTriangle,
  Key,
  Database,
  FolderOpen,
  Loader2,
  Check,
  Copy,
} from 'lucide-react';
import { Modal } from '../primitives/Modal';

// ============================================================================
// TYPES
// ============================================================================

interface UninstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type UninstallPhase = 'options' | 'confirm' | 'cleaning' | 'instructions';

// ============================================================================
// COMPONENT
// ============================================================================

export function UninstallModal({ isOpen, onClose }: UninstallModalProps) {
  // Options state
  const [deleteCredentials, setDeleteCredentials] = useState(true);
  const [deleteAppData, setDeleteAppData] = useState(true);
  const [deleteDownloads, setDeleteDownloads] = useState(false);

  // Confirmation state
  const [confirmText, setConfirmText] = useState('');
  const [phase, setPhase] = useState<UninstallPhase>('options');

  // Platform state
  const [platform, setPlatform] = useState<string>('');
  const [linuxCommand, setLinuxCommand] = useState<string>('');
  const [linuxType, setLinuxType] = useState<
    'appimage' | 'deb' | 'rpm' | 'pacman' | 'unknown'
  >('appimage');
  const [copied, setCopied] = useState(false);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setPhase('options');
      setConfirmText('');
      setDeleteCredentials(true);
      setDeleteAppData(true);
      setDeleteDownloads(false);
      setError(null);
      setCopied(false);

      // Get platform info
      window.api.getPlatform().then(setPlatform);
    }
  }, [isOpen]);

  // Get Linux command when reaching instructions phase
  useEffect(() => {
    if (phase === 'instructions' && platform === 'linux') {
      window.api.getLinuxUninstallCommand().then((result) => {
        setLinuxCommand(result.command);
        setLinuxType(result.type);
      });
    }
  }, [phase, platform]);

  const handleProceedToConfirm = useCallback(() => {
    setPhase('confirm');
  }, []);

  // Just validate and show instructions - cleanup happens when user clicks platform action
  const handleProceedToInstructions = useCallback(() => {
    if (confirmText !== 'UNINSTALL') {
      return;
    }
    setPhase('instructions');
  }, [confirmText]);

  // Run cleanup then perform platform action
  const runCleanupAndAction = useCallback(
    async (action: () => Promise<void>) => {
      setPhase('cleaning');
      setError(null);

      try {
        const result = await window.api.prepareUninstall({
          deleteCredentials,
          deleteAppData,
          deleteDownloads,
        });

        if (!result.success) {
          setError(result.error || 'Cleanup failed');
          setPhase('instructions');
          return;
        }

        // Run the platform-specific action
        await action();
      } catch (err) {
        setError(String(err));
        setPhase('instructions');
      }
    },
    [deleteCredentials, deleteAppData, deleteDownloads]
  );

  const handleLaunchUninstaller = useCallback(async () => {
    await runCleanupAndAction(async () => {
      const result = await window.api.launchUninstaller();
      if (!result.success) {
        setError(result.error || 'Failed to launch uninstaller');
        setPhase('instructions');
      }
      // App will quit after launching uninstaller
    });
  }, [runCleanupAndAction]);

  const handleShowInFinder = useCallback(async () => {
    await runCleanupAndAction(async () => {
      await window.api.openAppLocation();
      // Close the modal after showing in Finder - user will drag to trash
      // Don't quit the app so user can see the location
    });
  }, [runCleanupAndAction]);

  const handleLinuxCleanupAndClose = useCallback(async () => {
    await runCleanupAndAction(async () => {
      // On Linux, just open file manager and let user run the command manually
      await window.api.openAppLocation();
    });
  }, [runCleanupAndAction]);

  const handleCopyCommand = useCallback(() => {
    navigator.clipboard.writeText(linuxCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [linuxCommand]);

  const isConfirmValid = confirmText === 'UNINSTALL';
  const hasAnySelection = deleteCredentials || deleteAppData || deleteDownloads;

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const renderOptionsPhase = () => (
    <>
      <Modal.Content>
        <div style={styles.warningBanner}>
          <AlertTriangle size={20} />
          <div>
            <strong>Preparing to uninstall Canvas Assistant</strong>
            <p style={styles.warningText}>
              Select the data you want to remove before uninstalling. This action cannot
              be undone.
            </p>
          </div>
        </div>

        <div style={styles.optionsContainer}>
          <label style={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={deleteCredentials}
              onChange={(e) => setDeleteCredentials(e.target.checked)}
              style={styles.checkbox}
            />
            <Key size={18} style={styles.optionIcon} />
            <div style={styles.optionText}>
              <strong>Canvas API credentials</strong>
              <span style={styles.optionDesc}>
                Remove stored API token from secure storage
              </span>
            </div>
          </label>

          <label style={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={deleteAppData}
              onChange={(e) => setDeleteAppData(e.target.checked)}
              style={styles.checkbox}
            />
            <Database size={18} style={styles.optionIcon} />
            <div style={styles.optionText}>
              <strong>Application data</strong>
              <span style={styles.optionDesc}>
                Settings, database, logs, and preferences
              </span>
            </div>
          </label>

          <label style={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={deleteDownloads}
              onChange={(e) => setDeleteDownloads(e.target.checked)}
              style={styles.checkbox}
            />
            <FolderOpen size={18} style={styles.optionIcon} />
            <div style={styles.optionText}>
              <strong>Downloaded course files</strong>
              <span style={styles.optionDesc}>Files saved to your Documents folder</span>
            </div>
          </label>
        </div>

        <p style={styles.tip}>
          Tip: Uncheck all options to keep your data for future reinstalls.
        </p>
      </Modal.Content>

      <Modal.Footer>
        <button style={styles.cancelButton} onClick={onClose}>
          Cancel
        </button>
        <button
          style={{
            ...styles.dangerButton,
            opacity: hasAnySelection ? 1 : 0.5,
            cursor: hasAnySelection ? 'pointer' : 'not-allowed',
          }}
          onClick={handleProceedToConfirm}
          disabled={!hasAnySelection}
        >
          Continue
        </button>
      </Modal.Footer>
    </>
  );

  const renderConfirmPhase = () => (
    <>
      <Modal.Content>
        <div style={styles.confirmContainer}>
          <AlertTriangle size={48} style={styles.confirmIcon} />
          <h3 style={styles.confirmTitle}>Confirm Uninstall</h3>
          <p style={styles.confirmDesc}>
            This will permanently delete the selected data. Type{' '}
            <strong>UNINSTALL</strong> to confirm.
          </p>

          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type UNINSTALL to confirm"
            style={styles.confirmInput}
            autoFocus
          />

          {error && (
            <div style={styles.errorMessage}>
              <AlertTriangle size={14} />
              {error}
            </div>
          )}
        </div>
      </Modal.Content>

      <Modal.Footer>
        <button style={styles.cancelButton} onClick={() => setPhase('options')}>
          Back
        </button>
        <button
          style={{
            ...styles.dangerButton,
            opacity: isConfirmValid ? 1 : 0.5,
            cursor: isConfirmValid ? 'pointer' : 'not-allowed',
          }}
          onClick={handleProceedToInstructions}
          disabled={!isConfirmValid}
        >
          <Trash2 size={16} />
          Continue
        </button>
      </Modal.Footer>
    </>
  );

  const renderCleaningPhase = () => (
    <Modal.Content>
      <div style={styles.cleaningContainer}>
        <Loader2 size={48} style={styles.spinner} />
        <h3 style={styles.cleaningTitle}>Cleaning up...</h3>
        <p style={styles.cleaningDesc}>Removing selected data. Please wait.</p>
      </div>
    </Modal.Content>
  );

  const renderInstructionsPhase = () => (
    <>
      <Modal.Content>
        <div style={styles.instructionsContainer}>
          {platform === 'win32' && (
            <>
              <h3 style={styles.instructionsTitle}>Ready to Uninstall</h3>
              <p style={styles.instructionsDesc}>
                Click below to remove your selected data and launch the Windows
                uninstaller.
              </p>
              <button style={styles.dangerButton} onClick={handleLaunchUninstaller}>
                <Trash2 size={16} />
                Remove Data & Uninstall
              </button>
            </>
          )}

          {platform === 'darwin' && (
            <>
              <h3 style={styles.instructionsTitle}>Ready to Uninstall</h3>
              <p style={styles.instructionsDesc}>
                Click below to remove your selected data, then drag Canvas Assistant to
                Trash.
              </p>
              <button style={styles.dangerButton} onClick={handleShowInFinder}>
                <Trash2 size={16} />
                Remove Data & Show in Finder
              </button>
            </>
          )}

          {platform === 'linux' && (
            <>
              <h3 style={styles.instructionsTitle}>Ready to Uninstall</h3>
              <p style={styles.instructionsDesc}>
                {linuxType === 'appimage'
                  ? 'Copy the command below, then click the button to remove data and show the file location:'
                  : 'Copy the command below to run after removing data:'}
              </p>
              <div style={styles.commandBox}>
                <code style={styles.commandText}>{linuxCommand}</code>
                <button
                  style={styles.copyButton}
                  onClick={handleCopyCommand}
                  title="Copy to clipboard"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <button style={styles.dangerButton} onClick={handleLinuxCleanupAndClose}>
                <Trash2 size={16} />
                Remove Data & Show Location
              </button>
            </>
          )}

          {error && (
            <div style={styles.errorMessage}>
              <AlertTriangle size={14} />
              {error}
            </div>
          )}
        </div>
      </Modal.Content>

      <Modal.Footer>
        <button style={styles.cancelButton} onClick={onClose}>
          Cancel
        </button>
      </Modal.Footer>
    </>
  );

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      closeOnEscape={phase !== 'cleaning'}
    >
      <Modal.Header
        title="Uninstall Canvas Assistant"
        icon={<Trash2 size={20} />}
        showCloseButton={phase !== 'cleaning'}
      />

      {phase === 'options' && renderOptionsPhase()}
      {phase === 'confirm' && renderConfirmPhase()}
      {phase === 'cleaning' && renderCleaningPhase()}
      {phase === 'instructions' && renderInstructionsPhase()}
    </Modal>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  warningBanner: {
    display: 'flex',
    gap: '12px',
    padding: '16px',
    backgroundColor: 'rgba(234, 179, 8, 0.1)',
    border: '1px solid var(--color-warning)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-warning)',
    marginBottom: '20px',
  },

  warningText: {
    margin: '4px 0 0 0',
    fontSize: '14px',
    color: 'var(--text-secondary)',
  },

  optionsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },

  checkboxRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '12px 16px',
    backgroundColor: 'var(--bg-app)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'all 150ms ease',
  },

  checkbox: {
    width: '18px',
    height: '18px',
    marginTop: '2px',
    cursor: 'pointer',
    flexShrink: 0,
  },

  optionIcon: {
    color: 'var(--text-secondary)',
    marginTop: '2px',
    flexShrink: 0,
  },

  optionText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },

  optionDesc: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
  },

  tip: {
    marginTop: '16px',
    fontSize: '13px',
    color: 'var(--text-muted)',
    fontStyle: 'italic',
  },

  confirmContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    padding: '20px 0',
  },

  confirmIcon: {
    color: 'var(--color-error)',
    marginBottom: '16px',
  },

  confirmTitle: {
    margin: '0 0 8px 0',
    fontSize: '18px',
    fontWeight: '600',
    color: 'var(--text-primary)',
  },

  confirmDesc: {
    margin: '0 0 20px 0',
    fontSize: '14px',
    color: 'var(--text-secondary)',
    maxWidth: '300px',
  },

  confirmInput: {
    width: '100%',
    maxWidth: '280px',
    padding: '12px 16px',
    fontSize: '16px',
    textAlign: 'center',
    border: '2px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    outline: 'none',
    transition: 'border-color 150ms ease',
  },

  cleaningContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    padding: '40px 0',
  },

  spinner: {
    color: 'var(--color-navy)',
    animation: 'spin 1s linear infinite',
    marginBottom: '16px',
  },

  cleaningTitle: {
    margin: '0 0 8px 0',
    fontSize: '18px',
    fontWeight: '600',
    color: 'var(--text-primary)',
  },

  cleaningDesc: {
    margin: 0,
    fontSize: '14px',
    color: 'var(--text-secondary)',
  },

  successBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    backgroundColor: 'var(--color-success-bg)',
    color: 'var(--color-success)',
    borderRadius: 'var(--radius-md)',
    marginBottom: '20px',
    fontWeight: '500',
  },

  instructionsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },

  instructionsTitle: {
    margin: 0,
    fontSize: '16px',
    fontWeight: '600',
    color: 'var(--text-primary)',
  },

  instructionsDesc: {
    margin: 0,
    fontSize: '14px',
    color: 'var(--text-secondary)',
    lineHeight: '1.5',
  },

  commandBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    backgroundColor: 'var(--bg-app)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontFamily: 'var(--font-mono)',
  },

  commandText: {
    flex: 1,
    fontSize: '13px',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  copyButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all 150ms ease',
  },

  errorMessage: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    backgroundColor: 'var(--color-error-bg)',
    border: '1px solid var(--color-error)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-error)',
    fontSize: '14px',
  },

  cancelButton: {
    padding: '10px 20px',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: '14px',
    fontWeight: '500',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all 150ms ease',
  },

  dangerButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    backgroundColor: 'var(--color-error)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: '14px',
    fontWeight: '500',
    color: 'white',
    cursor: 'pointer',
    transition: 'all 150ms ease',
  },

  primaryButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: '100%',
    padding: '12px 20px',
    backgroundColor: 'var(--color-navy)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: '14px',
    fontWeight: '500',
    color: 'white',
    cursor: 'pointer',
    transition: 'all 150ms ease',
  },

  secondaryButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: '100%',
    padding: '12px 20px',
    backgroundColor: 'var(--bg-app)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: '14px',
    fontWeight: '500',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    transition: 'all 150ms ease',
  },
};

export default UninstallModal;
