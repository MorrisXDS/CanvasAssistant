/**
 * KeyboardScopeContext — lets page components broadcast which useKeymap subscope
 * is currently active so the help modal can pre-select the matching shortcuts tab.
 */

import { createContext, useContext, useState, useEffect } from 'react';
import React from 'react';

/**
 * One available section a page is currently exposing for in-page section
 * navigation (broadcast by `useSectionScope`). The help modal renders these as
 * the "This page's sections" block. `index1` is the 1-based `Alt+<index1>` slot
 * among available sections.
 */
export interface ActiveSectionInfo {
  id: string;
  label: string;
  index1: number;
}

interface KeyboardScopeContextValue {
  /** The active `subscope` value from keyboardShortcuts.ts, or null. */
  activeSubscope: string | null;
  setActiveSubscope: (subscope: string | null) => void;
  /**
   * The current page's available in-page sections (with their `Alt+<index1>`
   * slots), or null when the active page has none. Broadcast by
   * `useSectionScope`; read by `KeyboardShortcutsModal`.
   */
  activeSections: ActiveSectionInfo[] | null;
  setActiveSections: (sections: ActiveSectionInfo[] | null) => void;
}

export const KeyboardScopeContext = createContext<KeyboardScopeContextValue>({
  activeSubscope: null,
  setActiveSubscope: () => {},
  activeSections: null,
  setActiveSections: () => {},
});

export function KeyboardScopeProvider({ children }: { children: React.ReactNode }) {
  const [activeSubscope, setActiveSubscope] = useState<string | null>(null);
  const [activeSections, setActiveSections] = useState<ActiveSectionInfo[] | null>(null);
  return (
    <KeyboardScopeContext.Provider
      value={{ activeSubscope, setActiveSubscope, activeSections, setActiveSections }}
    >
      {children}
    </KeyboardScopeContext.Provider>
  );
}

/**
 * Call in any page that uses useKeymap with multiple scopes.
 * Maps each useKeymap scope to the matching `subscope` string in keyboardShortcuts.ts.
 *
 * Example:
 *   useRegisterSubscope(calScope, { events: 'events', filter: 'filter' });
 */
export function useRegisterSubscope<S extends string>(
  currentScope: S,
  scopeToSubscope: Partial<Record<S, string>>
) {
  const { setActiveSubscope } = useContext(KeyboardScopeContext);
  // Update on scope change. setActiveSubscope is stable (setState from useState).
  useEffect(() => {
    setActiveSubscope(scopeToSubscope[currentScope] ?? null);
  }, [currentScope, setActiveSubscope]); // scopeToSubscope is a static mapping literal — safe to omit
  // Clear on unmount
  useEffect(() => {
    return () => {
      setActiveSubscope(null);
    };
  }, [setActiveSubscope]);
}
