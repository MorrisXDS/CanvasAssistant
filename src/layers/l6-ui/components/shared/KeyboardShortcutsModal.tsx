/**
 * KeyboardShortcutsModal — scope-aware two-tab help modal.
 *
 * Tab 1 (default): shortcuts for the currently active keyboard scope:
 *   - If a modal is open above the help, show that modal's shortcuts
 *     (from `<Modal shortcuts={...}>` registration, see ADR-0006).
 *   - Otherwise show the page-route scope (e.g. "Calendar — Filter Panel").
 * Tab 2: global shortcuts (Navigation, General, Selection).
 *
 * Left/Right arrow keys switch tabs when focus is on the tab bar.
 * ? or Ctrl+? re-opens; Ctrl+? pre-selects the Global tab.
 *
 * The component is split into an outer shell (renders `<Modal>`) and an
 * inner content component (runs INSIDE the Modal so it can read its own
 * `ModalIdContext` value via `useContext`). This is required because
 * `useContext(ModalIdContext)` only returns the Modal's id from within the
 * Modal's JSX subtree, not from the component that *renders* the Modal.
 */

import React, { useState, useEffect, useContext, useCallback } from 'react';
import { Keyboard } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Modal } from '../primitives/Modal';
import { Z_INDEX } from '../../constants';
import {
  KEYBOARD_SHORTCUTS,
  getScopeForPath,
  type ShortcutCategory,
} from '../../constants/keyboardShortcuts';
import {
  KeyboardScopeContext,
  type ActiveSectionInfo,
} from '../../contexts/KeyboardScopeContext';
import { ModalIdContext, useModalStack } from '../../contexts/ModalStackContext';

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
    case 'alt':
      return isMac ? '⌥' : 'Alt';
    default:
      return key;
  }
}

/**
 * "This page's sections" block — lists the active page's in-page sections
 * (broadcast by `useSectionScope` to `KeyboardScopeContext`) with their
 * `Alt+<index1>` direct-jump slots. Dormant until a page sets `activeSections`.
 */
function SectionsList({ sections }: { sections: ActiveSectionInfo[] }) {
  return (
    <div>
      <div style={styles.categoryTitle}>This page&apos;s sections</div>
      <div style={styles.shortcutList}>
        {sections.map((section) => (
          <div key={section.id} style={styles.shortcutRow}>
            <span style={styles.label}>{section.label}</span>
            <span style={styles.keys}>
              <kbd style={styles.kbd}>{resolveKeyLabel('alt')}</kbd>
              <span style={styles.separator}>+</span>
              <kbd style={styles.kbd}>{section.index1}</kbd>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
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

/**
 * Outer shell — thin wrapper that mounts `<Modal>`. The inner component runs
 * inside the Modal's JSX subtree so it can read `ModalIdContext` and walk the
 * stack to find shortcuts for the modal that was on top BEFORE the help
 * opened.
 */
export function KeyboardShortcutsModal({
  isOpen,
  onClose,
  forceGlobal = false,
}: KeyboardShortcutsModalProps) {
  return (
    // Z_INDEX.help (1500) so the help always sits above any other modal:
    // DuplicateWarningModal=modal, its Customize child=modalChild,
    // ConfirmDialog=modal, TaskLinkDialog=modal. Help is the ceiling band.
    <Modal isOpen={isOpen} onClose={onClose} size="md" zIndex={Z_INDEX.help}>
      <KeyboardShortcutsContent forceGlobal={forceGlobal} onClose={onClose} />
    </Modal>
  );
}

interface KeyboardShortcutsContentProps {
  forceGlobal: boolean;
  onClose: () => void;
}

function KeyboardShortcutsContent({
  forceGlobal,
  onClose,
}: KeyboardShortcutsContentProps) {
  const location = useLocation();
  const { activeSubscope, activeSections } = useContext(KeyboardScopeContext);
  const currentPageScope = getScopeForPath(location.pathname);

  // Read my own modal stack id (the help modal itself) so we can skip it when
  // looking for "the topmost OTHER modal" — the one the user was looking at
  // before they pressed `?` to open this help.
  const myStackId = useContext(ModalIdContext);
  const { stack } = useModalStack();

  // Walk the stack from the top down, skipping our own entry. The first
  // earlier entry that registered `shortcuts` wins; if none, fall back to the
  // page-route category. This is the "help modal walks stack manually" pattern
  // described in ADR-0006 — kept local to this component rather than baked
  // into `useTopmostShortcuts()` because only the help has the self-skip
  // asymmetry.
  const modalCategoryFromStack: ShortcutCategory | null = (() => {
    for (let i = stack.length - 1; i >= 0; i--) {
      const entry = stack[i];
      if (entry.id === myStackId) continue; // skip ourselves
      if (entry.shortcuts) return entry.shortcuts;
    }
    return null;
  })();

  // Page-route category — same logic as before, falls back when no modal
  // category is available.
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

  // Modal shortcuts (if any) override page shortcuts for Tab 1.
  const tab1Category: ShortcutCategory | null = modalCategoryFromStack ?? pageCategory;

  // The active page's in-page sections (ADR-0010), shown in Tab 1 below the
  // shortcut list. A modal's shortcuts take precedence: when a modal owns Tab 1
  // (modalCategoryFromStack), don't show the underlying page's sections.
  const showSections =
    modalCategoryFromStack === null &&
    activeSections !== null &&
    activeSections.length > 0;

  // Tab 1 ("page") is offered whenever there's a category OR a sections block.
  const hasPageTab = tab1Category !== null || showSections;

  const globalCategories = KEYBOARD_SHORTCUTS.filter((c) => !c.scope);

  type TabId = 'page' | 'global';
  const [activeTab, setActiveTab] = useState<TabId>(
    forceGlobal || !hasPageTab ? 'global' : 'page'
  );

  // Re-evaluate the default tab when forceGlobal or the resolved page-tab
  // availability changes (which happens if a modal opens/closes underneath us
  // mid-session, though that's rare).
  useEffect(() => {
    setActiveTab(forceGlobal || !hasPageTab ? 'global' : 'page');
  }, [forceGlobal, hasPageTab]);

  const handleTabKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      setActiveTab((t) => (t === 'page' ? 'global' : 'page'));
    }
  }, []);

  const showTabs = hasPageTab;
  const tab1Label = tab1Category?.title ?? 'Page';
  const modKey = isMac ? '⌘' : 'Ctrl';

  return (
    <>
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
            {activeTab === 'page' && tab1Category && (
              <ShortcutList category={tab1Category} />
            )}
            {activeTab === 'page' && showSections && activeSections && (
              <SectionsList sections={activeSections} />
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
    </>
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
