/**
 * KeyboardShortcutsModal - Displays all available keyboard shortcuts
 *
 * Opened with the "?" key. Shows shortcuts grouped by category
 * with platform-aware modifier labels (⌘ on macOS, Ctrl elsewhere).
 */

import React from 'react';
import { Keyboard } from 'lucide-react';
import { Modal } from '../primitives/Modal';
import { KEYBOARD_SHORTCUTS } from '../../constants/keyboardShortcuts';

export interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const isMac = window.api?.platform === 'darwin';

function resolveKeyLabel(key: string): string {
  switch (key) {
    case 'mod':
      return isMac ? '⌘' : 'Ctrl';
    case 'Escape':
      return 'Esc';
    case 'Shift':
      return '⇧';
    default:
      return key;
  }
}

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <Modal.Header
        title="Keyboard Shortcuts"
        icon={<Keyboard size={20} />}
        onClose={onClose}
      />
      <Modal.Content>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {KEYBOARD_SHORTCUTS.map((category) => (
            <div key={category.title}>
              <div style={styles.categoryTitle}>{category.title}</div>
              <div style={styles.shortcutList}>
                {category.shortcuts.map((shortcut) => (
                  <div key={shortcut.label} style={styles.shortcutRow}>
                    <span style={styles.label}>{shortcut.label}</span>
                    <span style={styles.keys}>
                      {shortcut.keys.map((key, i) => (
                        <React.Fragment key={key}>
                          {i > 0 && <span style={styles.separator}>+</span>}
                          <kbd style={styles.kbd}>{resolveKeyLabel(key)}</kbd>
                        </React.Fragment>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Modal.Content>
    </Modal>
  );
}

const styles: Record<string, React.CSSProperties> = {
  categoryTitle: {
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--text-muted)',
    paddingBottom: '8px',
    borderBottom: '1px solid var(--border-light)',
    marginBottom: '4px',
  },
  shortcutList: {
    display: 'flex',
    flexDirection: 'column',
  },
  shortcutRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 0',
  },
  label: {
    fontSize: '13px',
    color: 'var(--text-primary)',
  },
  keys: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  separator: {
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  kbd: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '24px',
    height: '24px',
    padding: '0 6px',
    fontSize: '12px',
    fontFamily: 'inherit',
    fontWeight: 500,
    color: 'var(--text-secondary)',
    backgroundColor: 'var(--bg-app)',
    border: '1px solid var(--border-default)',
    borderRadius: '6px',
    boxShadow: '0 1px 0 var(--border-default)',
  },
};
