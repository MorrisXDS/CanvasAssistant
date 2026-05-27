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

import { useState, useEffect, useRef, useCallback, useContext } from 'react';
import {
  ModalIdContext,
  useIsAnyModalOpen,
  useModalStack,
} from '../contexts/ModalStackContext';

type KeyHandler = (e: KeyboardEvent) => void;

export interface KeymapOptions<S extends string> {
  initialScope: S;
  /**
   * Caller-supplied gate. AND-composed with the default modal-stack gate
   * (see `escapeStackGate` below) — your `when` callback runs alongside,
   * not in place of, the stack gate. Use for scope-internal conditions
   * like "fire only when editing a task" (e.g. `editingTaskId !== null`).
   */
  when?: () => boolean;
  /** Allow shortcuts to fire even when an input/textarea/select has focus. Default false. */
  enableOnFormTags?: boolean;
  /**
   * Opt out of the default modal-stack gate. By default, useKeymap suppresses
   * all shortcuts while a modal is open above the current scope (or, if this
   * useKeymap call is inside a modal, while a child modal is on top of it).
   * Pass `escapeStackGate: true` only for genuinely global hotkeys that MUST
   * fire over modals — e.g. the `?` help opener, `mod+1..5` page navigation.
   * See [docs/adr/0006-modal-stack-aware-hotkey-suppression.md](../../../docs/adr/0006-modal-stack-aware-hotkey-suppression.md).
   */
  escapeStackGate?: boolean;
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

  // Subscribe to the modal stack so the listener closure can gate itself.
  // These hooks re-run on every stack push/pop, re-rendering the consumer —
  // acceptable cost; modals open/close infrequently.
  const isAnyModalOpen = useIsAnyModalOpen();
  const { topmostId } = useModalStack();
  const myModalId = useContext(ModalIdContext);

  // Compose the default modal-stack gate. AND-combined with caller's `when`
  // (see ADR-0006 — REPLACE / OR would drop scope-internal logic like
  // CourseDetail's `editingTaskId !== null` guard on the `edit` scope).
  const stackGate = useCallback((): boolean => {
    if (options.escapeStackGate) return true;
    if (myModalId !== null) {
      // Inside a modal — fire only when *this* modal is the topmost.
      return myModalId === topmostId;
    }
    // Under modals — fire only when the stack is empty.
    return !isAnyModalOpen;
  }, [options.escapeStackGate, myModalId, topmostId, isAnyModalOpen]);

  const composedWhen = useCallback((): boolean => {
    if (!stackGate()) return false;
    if (options.when && !options.when()) return false;
    return true;
  }, [stackGate, options]);

  // The options object the listener reads at fire time, with `when` replaced
  // by the composed gate. Caller's other options (enableOnFormTags etc.) pass
  // through unchanged.
  const composedOptions: KeymapOptions<S> = { ...options, when: composedWhen };

  // Refs so the listener closure always reads the latest values without re-registering
  const scopeRef = useRef<S>(scope);
  const keymapsRef = useRef(keymaps);
  const optionsRef = useRef<KeymapOptions<S>>(composedOptions);
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
    optionsRef.current = composedOptions;
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
