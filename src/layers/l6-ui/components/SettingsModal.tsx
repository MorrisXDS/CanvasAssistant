/**
 * SettingsModal Component - Refactored
 *
 * Thin wrapper that provides SettingsProvider and renders SettingsModalContent.
 * All state management is now in SettingsContext, and all sections are
 * separate components in the Settings/ folder.
 */

import React, { useEffect } from 'react';
import { SettingsProvider, SettingsModalContent } from './Settings';
import { Modal } from './primitives/Modal';
import { styles } from './SettingsModalStyles';
import { Z_INDEX } from '../constants';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isFullPage?: boolean;
}

export function SettingsModal({
  isOpen,
  onClose,
  isFullPage = false,
}: SettingsModalProps) {
  // Full-page branch renders a plain <div> (NOT the Modal primitive) and so has
  // no built-in Esc handling — keep this hand-rolled listener, but ONLY for that
  // branch. In the overlay branch the primitive's closeOnEscape (default true)
  // already closes on Escape, so registering this listener there too would
  // double-fire onClose.
  useEffect(() => {
    if (!isOpen || !isFullPage) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, isFullPage, onClose]);

  if (!isOpen) return null;

  const content = (
    <SettingsProvider isOpen={isOpen} onClose={onClose} isFullPage={isFullPage}>
      <SettingsModalContent />
    </SettingsProvider>
  );

  // Full-page embed (SettingsPage route) — plain div, NO Modal primitive. Unchanged.
  if (isFullPage) {
    return <div style={styles.fullPage}>{content}</div>;
  }

  // Overlay modal — the primitive owns backdrop / Esc / body-scroll-lock /
  // centering / z-index. SettingsModalContent renders its OWN header + search +
  // scrollable content + footer (a flex column), so we wrap it in a bare
  // Modal.Content with padded={false} (the content blocks self-pad) and
  // scrollable={false} (the inner styles.content div owns the scroll, flex:1).
  // No Modal.Header / Modal.Footer — the content already has them.
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" zIndex={Z_INDEX.modal}>
      <Modal.Content padded={false} scrollable={false}>
        {content}
      </Modal.Content>
    </Modal>
  );
}

export default SettingsModal;
