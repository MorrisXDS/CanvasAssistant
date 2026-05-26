/**
 * KeyboardShortcutsModal — scope-aware two-tab help modal.
 *
 * Tab 1 (default): shortcuts for the currently active keyboard scope
 *   (e.g. "Calendar — Filter Panel" when the filter panel is open).
 * Tab 2: global shortcuts (Navigation, General, Selection).
 *
 * Left/Right arrow keys switch tabs when focus is on the tab bar.
 * ? or Ctrl+? re-opens; Ctrl+? pre-selects the Global tab.
 */

import React, { useState, useEffect, useContext, useCallback } from 'react';
import { Keyboard } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Modal } from '../primitives/Modal';
import {
  KEYBOARD_SHORTCUTS,
  getScopeForPath,
  type ShortcutCategory,
} from '../../constants/keyboardShortcuts';
import { KeyboardScopeContext } from '../../contexts/KeyboardScopeContext';

export interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Force-open on the Global tab (used when triggered with Ctrl+?). Default: page tab. */
  forceGlobal?: boolean;
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
    case 'Delete':
      return isMac ? '⌫' : 'Del';
    case 'Space':
      return '␣';
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
  forceGlobal = false,
}: KeyboardShortcutsModalProps) {
  const location = useLocation();
  const { activeSubscope } = useContext(KeyboardScopeContext);
  const currentPageScope = getScopeForPath(location.pathname);

  // Resolve which category to show in Tab 1
  const pageCategory: ShortcutCategory | null = (() => {
    if (!currentPageScope) return null;
    const pageCategories = KEYBOARD_SHORTCUTS.filter((c) => c.scope === currentPageScope);
    if (pageCategories.length === 0) return null;
    // Try to find the subscope-matching one first
    if (activeSubscope) {
      const match = pageCategories.find((c) => c.subscope === activeSubscope);
      if (match) return match;
    }
    // Fall back to first category without a subscope, or just the first one
    return pageCategories.find((c) => !c.subscope) ?? pageCategories[0];
  })();

  const globalCategories = KEYBOARD_SHORTCUTS.filter((c) => !c.scope);

  type TabId = 'page' | 'global';
  const [activeTab, setActiveTab] = useState<TabId>(
    forceGlobal || !pageCategory ? 'global' : 'page'
  );

  // Reset tab when modal opens or forceGlobal changes
  useEffect(() => {
    if (isOpen) {
      setActiveTab(forceGlobal || !pageCategory ? 'global' : 'page');
    }
  }, [isOpen, forceGlobal, pageCategory]);

  const handleTabKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      setActiveTab((t) => (t === 'page' ? 'global' : 'page'));
    }
  }, []);

  const showTabs = pageCategory !== null;
  const tab1Label = pageCategory?.title ?? 'Page';
  const modKey = isMac ? '⌘' : 'Ctrl';

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <Modal.Header
        title="Keyboard Shortcuts"
        icon={<Keyboard size={20} />}
        onClose={onClose}
      />
      <Modal.Content>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Tab bar */}
          {showTabs && (
            <div
              role="tablist"
              aria-label="Shortcut categories"
              style={styles.tabBar}
              onKeyDown={handleTabKeyDown}
            >
              <button
                role="tab"
                aria-selected={activeTab === 'page'}
                style={{
                  ...styles.tab,
                  ...(activeTab === 'page' ? styles.tabActive : {}),
                }}
                onClick={() => setActiveTab('page')}
              >
                {tab1Label}
              </button>
              <button
                role="tab"
                aria-selected={activeTab === 'global'}
                style={{
                  ...styles.tab,
                  ...(activeTab === 'global' ? styles.tabActive : {}),
                }}
                onClick={() => setActiveTab('global')}
              >
                Global
              </button>
            </div>
          )}

          {/* Content */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {activeTab === 'page' && pageCategory && (
              <ShortcutList category={pageCategory} />
            )}
            {activeTab === 'global' &&
              (globalCategories.length > 0 ? (
                globalCategories.map((cat) => (
                  <ShortcutList key={cat.title} category={cat} />
                ))
              ) : (
                <div style={styles.emptyState}>No global shortcuts defined</div>
              ))}
          </div>

          {/* Hint */}
          <div style={styles.hint}>
            {showTabs
              ? `← → switch tabs · ${modKey}+? for global · ? for page scope`
              : `Press ${modKey}+? for page shortcuts`}
          </div>
        </div>
      </Modal.Content>
    </Modal>
  );
}

const styles: Record<string, React.CSSProperties> = {
  tabBar: {
    display: 'flex',
    gap: '4px',
    borderBottom: '1px solid var(--border-default)',
    paddingBottom: '8px',
  },
  tab: {
    padding: '6px 14px',
    fontSize: '13px',
    fontWeight: 500,
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-app)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  tabActive: {
    backgroundColor: 'var(--color-primary)',
    color: 'white',
    borderColor: 'var(--color-primary)',
  },
  categoryTitle: {
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'var(--text-muted)',
    paddingBottom: '8px',
    borderBottom: '1px solid var(--border-light)',
    marginBottom: '4px',
  },
  shortcutList: {
    display: 'flex',
    flexDirection: 'column' as const,
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
    fontStyle: 'italic' as const,
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
    textAlign: 'center' as const,
    fontStyle: 'italic' as const,
  },
  emptyState: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    textAlign: 'center' as const,
    padding: '20px 0',
  },
};

export default KeyboardShortcutsModal;
