/**
 * useKeymap — scope-aware keyboard shortcut manager.
 *
 * Replaces the ad-hoc pattern of multiple useHotkeys calls with competing `enabled` flags.
 * Define keymaps per scope once; the hook routes each keydown to the right handler based on
 * the currently active scope.
 *
 * Usage:
 *   const { scope, setScope } = useKeymap({
 *     main:   { 'w,ArrowUp': focusPrev, 's,ArrowDown': focusNext, 'f': openFilter },
 *     filter: { 'w,ArrowUp': prevSection, 's,ArrowDown': nextSection, 'escape': closeFilter },
 *   }, { initialScope: 'main' });
 *
 * Key combo format:
 *   - Plain key:   'w', 'Enter', 'Escape', 'Space', 'Delete', 'Tab', 'ArrowUp' etc.
 *   - With mod:    'mod+a' (Ctrl on Win, Cmd on Mac), 'alt+shift+d', 'shift+Tab'
 *   - Aliases:     'w,ArrowUp' fires the same handler for either key
 */

import { useState, useEffect, useRef, useCallback } from 'react';

type KeyHandler = (e: KeyboardEvent) => void;

export interface KeymapOptions<S extends string> {
  initialScope: S;
  /** When false, all shortcuts are suppressed (e.g. when a modal is open). */
  when?: () => boolean;
  /** Allow shortcuts to fire even when an input/textarea/select has focus. Default false. */
  enableOnFormTags?: boolean;
}

/** Normalise a KeyboardEvent into a combo string the keymap can look up. */
function buildCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('mod');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');

  // Normalise the key name
  const key = e.key;
  const normalised = key === ' ' ? 'Space' : key.length === 1 ? key.toLowerCase() : key; // ArrowUp, Enter, Escape, Tab, Delete, etc. kept as-is

  parts.push(normalised);
  return parts.join('+');
}

/** Expand comma-separated alias strings into an entry per alias. */
function expandAliases(raw: Record<string, KeyHandler>): Map<string, KeyHandler> {
  const map = new Map<string, KeyHandler>();
  for (const [keys, handler] of Object.entries(raw)) {
    for (const key of keys.split(',').map((k) => k.trim())) {
      if (key) map.set(key, handler);
    }
  }
  return map;
}

export function useKeymap<S extends string>(
  keymaps: Partial<Record<S, Record<string, KeyHandler>>>,
  options: KeymapOptions<S>
): { scope: S; setScope: (s: S) => void } {
  const [scope, setScope] = useState<S>(options.initialScope);

  // Refs so the listener closure always reads the latest values without re-registering
  const scopeRef = useRef<S>(scope);
  const keymapsRef = useRef(keymaps);
  const optionsRef = useRef(options);
  const expandedRef = useRef<Map<S, Map<string, KeyHandler>>>(new Map());

  useEffect(() => {
    scopeRef.current = scope;
  }, [scope]);

  // Re-expand keymaps whenever they change (stable between renders for static maps)
  useEffect(() => {
    keymapsRef.current = keymaps;
    const expanded = new Map<S, Map<string, KeyHandler>>();
    for (const [s, raw] of Object.entries(keymaps) as [S, Record<string, KeyHandler>][]) {
      if (raw) expanded.set(s, expandAliases(raw));
    }
    expandedRef.current = expanded;
  });

  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      const opts = optionsRef.current;

      // Guard — caller can suppress all keys (e.g. when a modal is open)
      if (opts.when && !opts.when()) return;

      // Skip form elements unless caller explicitly opts in
      if (!opts.enableOnFormTags) {
        const tag = (e.target as HTMLElement)?.tagName?.toUpperCase();
        const editable = (e.target as HTMLElement)?.isContentEditable;
        if (editable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      }

      const currentScope = scopeRef.current;
      const scopeMap = expandedRef.current.get(currentScope);
      if (!scopeMap) return;

      const combo = buildCombo(e);
      const handler = scopeMap.get(combo);
      if (handler) {
        handler(e);
      }
    };

    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, []); // mount once — all mutable state accessed via refs

  const setScopeStable = useCallback((s: S) => {
    setScope(s);
    scopeRef.current = s;
  }, []);

  return { scope, setScope: setScopeStable };
}
