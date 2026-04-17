/**
 * KeyboardShortcutsModal - Displays keyboard shortcuts
 *
 * Two modes:
 * - "global" (opened with ?): Shows global shortcuts (Navigation, General, Selection)
 * - "page" (opened with Shift+?): Shows only shortcuts for the current page
 */

import React from 'react';
import { Keyboard } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Modal } from '../primitives/Modal';
import {
  KEYBOARD_SHORTCUTS,
  getScopeForPath,
  type ShortcutCategory,
} from '../../constants/keyboardShortcuts';

export interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** "global" shows global shortcuts (?), "page" shows current page shortcuts (Shift+?) */
  mode?: 'global' | 'page';
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
    case '←':
      return '←';
    case '→':
      return '→';
    case 'Delete':
      return isMac ? '⌫' : 'Del';
    case 'Space':
      return '␣';
    case '/':
      return '/';
    default:
      return key;
  }
}

function ShortcutList({ category }: { category: ShortcutCategory }) {
  return (
    <div>
      <div style={styles.categoryTitle}>{category.title}</div>
      <div style={styles.shortcutList}>
        {category.shortcuts.map((shortcut) => (
          <div key={shortcut.label} style={styles.shortcutRow}>
            <span style={styles.label}>{shortcut.label}</span>
            <span style={styles.keys}>
              {shortcut.keys.map((key, i) => (
                <React.Fragment key={`${key}-${i}`}>
                  {i > 0 && key !== '/' && shortcut.keys[i - 1] !== '/' && (
                    <span style={styles.separator}>+</span>
                  )}
                  {key === '/' ? (
                    <span style={styles.orSeparator}>or</span>
                  ) : (
                    <kbd style={styles.kbd}>{resolveKeyLabel(key)}</kbd>
                  )}
                </React.Fragment>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function KeyboardShortcutsModal({
  isOpen,
  onClose,
  mode = 'global',
}: KeyboardShortcutsModalProps) {
  const location = useLocation();
  const currentScope = getScopeForPath(location.pathname);

  const globalCategories = KEYBOARD_SHORTCUTS.filter((c) => !c.scope);
  const pageCategories = KEYBOARD_SHORTCUTS.filter(
    (c) => c.scope && c.scope === currentScope
  );

  const isPageMode = mode === 'page';
  const categories = isPageMode ? pageCategories : globalCategories;
  const title = isPageMode
    ? `${pageCategories[0]?.title || 'Page'} Shortcuts`
    : 'Keyboard Shortcuts';
  const modKey = isMac ? '⌘' : 'Ctrl';
  const hint = isPageMode
    ? 'Press ? for global shortcuts'
    : `Press ${modKey}+? for page shortcuts`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <Modal.Header title={title} icon={<Keyboard size={20} />} onClose={onClose} />
      <Modal.Content>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {categories.length > 0 ? (
            categories.map((category) => (
              <ShortcutList key={category.title} category={category} />
            ))
          ) : (
            <div style={styles.emptyState}>No shortcuts available for this page</div>
          )}

          <div style={styles.hint}>{hint}</div>
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
  orSeparator: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    fontStyle: 'italic',
    padding: '0 2px',
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
  hint: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  emptyState: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    textAlign: 'center',
    padding: '20px 0',
  },
};
