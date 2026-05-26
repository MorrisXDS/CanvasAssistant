/**
 * KeyboardScopeContext — lets page components broadcast which useKeymap subscope
 * is currently active so the help modal can pre-select the matching shortcuts tab.
 */

import { createContext, useContext, useState, useEffect } from 'react';
import React from 'react';

interface KeyboardScopeContextValue {
  /** The active `subscope` value from keyboardShortcuts.ts, or null. */
  activeSubscope: string | null;
  setActiveSubscope: (subscope: string | null) => void;
}

export const KeyboardScopeContext = createContext<KeyboardScopeContextValue>({
  activeSubscope: null,
  setActiveSubscope: () => {},
});

export function KeyboardScopeProvider({ children }: { children: React.ReactNode }) {
  const [activeSubscope, setActiveSubscope] = useState<string | null>(null);
  return (
    <KeyboardScopeContext.Provider value={{ activeSubscope, setActiveSubscope }}>
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
