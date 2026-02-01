/**
 * SettingsModal Component - Refactored
 *
 * Thin wrapper that provides SettingsProvider and renders SettingsModalContent.
 * All state management is now in SettingsContext, and all sections are
 * separate components in the Settings/ folder.
 */

import React from 'react';
import { SettingsProvider, SettingsModalContent } from './Settings';
import { styles } from './SettingsModalStyles';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isFullPage?: boolean;
}

export function SettingsModal({ isOpen, onClose, isFullPage = false }: SettingsModalProps) {
  if (!isOpen) return null;

  const content = (
    <SettingsProvider isOpen={isOpen} onClose={onClose} isFullPage={isFullPage}>
      <SettingsModalContent />
    </SettingsProvider>
  );

  if (isFullPage) {
    return <div style={styles.fullPage}>{content}</div>;
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {content}
      </div>
    </div>
  );
}

export default SettingsModal;
