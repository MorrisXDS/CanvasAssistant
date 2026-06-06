/**
 * UpdateAvailableModal (ADR-0012)
 *
 * Shows when a newer version of Canvas Assistant is available. The modal's
 * `isOpen` is derived entirely from the Zustand store (SSOT — no local
 * `useState` for this domain data):
 *
 *   const update = useStore(selectors.pendingUpdate);
 *   isOpen = update !== null
 *
 * Footer actions:
 *   Download        — opens the GitHub release page in the OS browser after
 *                     validating the URL starts with https://github.com/.
 *                     (Security guard: htmlUrl comes from the GitHub API but we
 *                     validate before handing it to shell.openExternal to prevent
 *                     any hypothetical redirect attack surface.)
 *   Skip this version — calls skipUpdateVersion (persists to SQL via IPC so the
 *                     checker won't re-emit for this version after restart).
 *   Later           — calls dismissUpdateAvailable (session-only, store clears).
 *
 * ADR-0006 compliance: outer renders <Modal>, inner (UpdateAvailableModalInner)
 * calls useModalHotkeys inside the Modal's ModalIdContext provider so that Esc
 * is stack-aware and does not leak to the underlying page.
 */

import React from 'react';
import { Download, AlertTriangle, Info, ArrowRight } from 'lucide-react';
import { Modal } from '../primitives/Modal';
import { useModalHotkeys } from '../../hooks/useStackAwareHotkeys';
import { useStore } from '../../../l5-presentation/store';
import { selectors } from '../../../l5-presentation/store/storeSelectors';
import { Z_INDEX } from '../../constants';

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Validate that a URL is a GitHub release URL before passing it to
 * shell.openExternal. The htmlUrl field comes from the GitHub API response
 * but an extra guard here is defense-in-depth against any hypothetical SSRF
 * or redirect attack surface.
 */
function isValidGitHubReleaseUrl(url: string): boolean {
  return url.startsWith('https://github.com/');
}

// =============================================================================
// INNER COMPONENT (inside the Modal's ModalIdContext — may call useModalHotkeys)
// =============================================================================

interface UpdateAvailableModalInnerProps {
  version: string;
  htmlUrl: string;
  level: 'safe' | 'caution' | 'breaking';
  reason: string;
  onDownload: () => void;
  onSkip: () => void;
  onLater: () => void;
}

function UpdateAvailableModalInner({
  version,
  htmlUrl: _htmlUrl,
  level,
  reason,
  onDownload,
  onSkip,
  onLater,
}: UpdateAvailableModalInnerProps) {
  // ADR-0006: stack-aware hotkeys inside the modal (useModalHotkeys fires only
  // when this modal is topmost on the stack).
  useModalHotkeys('escape', onLater);

  const isBreaking = level === 'breaking';
  const isCaution = level === 'caution';

  return (
    <>
      <Modal.Content>
        <div style={styles.content}>
          {/* Version badge */}
          <div style={styles.versionBadge}>
            <span style={styles.versionLabel}>Available</span>
            <span style={styles.versionNumber}>v{version}</span>
          </div>

          {/* Compatibility verdict chip */}
          {(isBreaking || isCaution) && (
            <div
              style={{
                ...styles.verdictChip,
                backgroundColor: isBreaking
                  ? 'var(--color-error-bg)'
                  : 'var(--color-warning-bg, rgba(234,179,8,0.12))',
                borderColor: isBreaking ? 'var(--color-error)' : 'var(--color-warning)',
                color: isBreaking ? 'var(--color-error)' : 'var(--color-warning)',
              }}
            >
              {isBreaking ? (
                <AlertTriangle size={14} style={{ flexShrink: 0 }} />
              ) : (
                <Info size={14} style={{ flexShrink: 0 }} />
              )}
              <span>{reason}</span>
            </div>
          )}

          {level === 'safe' && <p style={styles.safeNote}>{reason}</p>}

          <p style={styles.description}>
            A new version of Canvas Assistant is ready to download. Your database and
            settings will not change until you run the installer.
          </p>
        </div>
      </Modal.Content>

      <Modal.Footer align="between">
        {/* Left side: Skip this version */}
        <button style={styles.skipButton} onClick={onSkip}>
          Skip v{version}
        </button>

        {/* Right side: Later + Download */}
        <div style={styles.primaryActions}>
          <button style={styles.laterButton} onClick={onLater}>
            Later
          </button>
          <button style={styles.downloadButton} onClick={onDownload}>
            <Download size={14} />
            Download
            <ArrowRight size={14} />
          </button>
        </div>
      </Modal.Footer>
    </>
  );
}

// =============================================================================
// OUTER COMPONENT (reads store, renders <Modal>)
// =============================================================================

export function UpdateAvailableModal() {
  const update = useStore(selectors.pendingUpdate);
  const { skipUpdateVersion, dismissUpdateAvailable } = useStore();

  // isOpen derives from the store — no local useState (SSOT invariant)
  const isOpen = update !== null;

  const handleDownload = () => {
    if (!update) return;
    // Security guard: validate the URL is a GitHub URL before calling openExternal.
    // htmlUrl comes from the GitHub API (trusted), but validate anyway as
    // defense-in-depth against any hypothetical redirect attack surface.
    if (!isValidGitHubReleaseUrl(update.htmlUrl)) {
      return;
    }
    window.api.openExternal?.(update.htmlUrl);
  };

  const handleSkip = () => {
    if (!update) return;
    // skipUpdateVersion persists skippedVersion to SQL via IPC so the
    // UpdateChecker will not re-emit for this version after app restart.
    skipUpdateVersion(update.version);
  };

  const handleLater = () => {
    // dismissUpdateAvailable clears the store (session-only — no SQL write).
    dismissUpdateAvailable();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleLater}
      size="md"
      zIndex={Z_INDEX.modal}
      // The inner component handles Escape via useModalHotkeys, so we let the
      // Modal's own closeOnEscape also work as a fallback (both call handleLater).
    >
      <Modal.Header
        title="Update Available"
        icon={<Download size={20} />}
        onClose={handleLater}
      />
      {update && (
        <UpdateAvailableModalInner
          version={update.version}
          htmlUrl={update.htmlUrl}
          level={update.level}
          reason={update.reason}
          onDownload={handleDownload}
          onSkip={handleSkip}
          onLater={handleLater}
        />
      )}
    </Modal>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles: Record<string, React.CSSProperties> = {
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },

  versionBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-1) var(--space-3)',
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-full, 9999px)',
    alignSelf: 'flex-start',
  },

  versionLabel: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },

  versionNumber: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--color-navy)',
    fontFamily: 'var(--font-mono)',
  },

  verdictChip: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid',
    fontSize: 'var(--text-sm)',
    lineHeight: 1.5,
  },

  safeNote: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    margin: 0,
  },

  description: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    margin: 0,
    lineHeight: 1.5,
  },

  primaryActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  skipButton: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-tertiary)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 'var(--space-1) var(--space-2)',
    borderRadius: 'var(--radius-sm)',
  },

  laterButton: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    background: 'none',
    border: '1px solid var(--border-default)',
    cursor: 'pointer',
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
  },

  downloadButton: {
    display: 'flex',
    alignItems: 'center',
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
  },
};

export default UpdateAvailableModal;
