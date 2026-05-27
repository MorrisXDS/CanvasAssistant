/**
 * ModalStackContext — tracks the currently-open modal stack so keyboard
 * shortcuts, scroll locks, and the help menu can be context-aware.
 *
 * Design — see [docs/adr/0006-modal-stack-aware-hotkey-suppression.md](../../../../docs/adr/0006-modal-stack-aware-hotkey-suppression.md).
 *
 * Two layers of awareness:
 *   - `isAnyOpen` — true while any modal is mounted. Page-level handlers
 *     consult this to suppress themselves under modals.
 *   - `topmostId` — the most recently pushed entry. In-modal handlers consult
 *     `myId === topmostId` to suppress themselves when a child modal is above
 *     them.
 *
 * The `<Modal>` primitive auto-pushes on mount-with-`isOpen=true` and pops on
 * unmount or `isOpen → false`. Modals may register a `ShortcutCategory` so
 * `KeyboardShortcutsModal` (the `?` help) can display the topmost modal's
 * keyboard interface instead of the underlying page's.
 *
 * Sibling context `ModalIdContext` lets a modal expose its own stack id to its
 * children without prop-drilling, so `useModalHotkeys` knows "which modal am
 * I inside" without the consumer providing the id manually.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ShortcutCategory } from '../constants/keyboardShortcuts';

export interface StackEntry {
  readonly id: string;
  readonly shortcuts?: ShortcutCategory;
}

export interface ModalStackContextValue {
  readonly stack: ReadonlyArray<StackEntry>;
  readonly depth: number;
  readonly isAnyOpen: boolean;
  readonly topmostId: string | null;
  readonly topmostShortcuts: ShortcutCategory | null;
  push(entry: StackEntry): void;
  pop(id: string): void;
}

const DEFAULT_VALUE: ModalStackContextValue = {
  stack: [],
  depth: 0,
  isAnyOpen: false,
  topmostId: null,
  topmostShortcuts: null,
  push: () => {
    /* no-op outside provider */
  },
  pop: () => {
    /* no-op outside provider */
  },
};

const ModalStackContext = createContext<ModalStackContextValue>(DEFAULT_VALUE);

/**
 * Provides the modal stack to its descendants. Mount once at the app root
 * (above `<RouterProvider>` and `<Layout>`).
 */
export function ModalStackProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<ReadonlyArray<StackEntry>>([]);

  const push = useCallback((entry: StackEntry) => {
    setStack((prev) => {
      // Defensive: don't double-push the same id (a re-render quirk shouldn't
      // grow the stack unbounded).
      if (prev.some((e) => e.id === entry.id)) return prev;
      return [...prev, entry];
    });
  }, []);

  const pop = useCallback((id: string) => {
    setStack((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const value = useMemo<ModalStackContextValue>(() => {
    const topmost = stack.length > 0 ? stack[stack.length - 1] : null;
    return {
      stack,
      depth: stack.length,
      isAnyOpen: stack.length > 0,
      topmostId: topmost?.id ?? null,
      topmostShortcuts: topmost?.shortcuts ?? null,
      push,
      pop,
    };
  }, [stack, push, pop]);

  // Suppress the browser's default arrow / Page / Home / End scroll behavior
  // while ANY modal is open. `useStackAwareHotkeys` + `useModalHotkeys` already
  // gate our JS handlers, but the browser's built-in scroll-by-arrow is a
  // separate concern — without this, pressing ↑/↓ in a modal also scrolls the
  // scrollable container that owns whatever element happens to currently hold
  // focus (typically the modal's parent — e.g. the [⚙ Customize] button left
  // focused on the parent modal after the child opened, causing the parent's
  // scrollable list to scroll instead of nothing).
  //
  // We DON'T narrow this to "only when target is outside a modal" because
  // focus often legitimately sits inside one modal while the user is acting on
  // another (parent left focused on a button, child handles the actual keys).
  // Modal keymap handlers (`useModalHotkeys`) attach at the document level and
  // fire independently of focus, so suppressing the browser's scroll default
  // doesn't break any modal's intended keyboard behavior.
  //
  // Two exceptions:
  //   - Editable fields (INPUT / TEXTAREA / SELECT / contentEditable) keep
  //     native text-cursor arrow nav and Home/End line nav.
  //   - When no modal is open, we don't run at all (early return below).
  //
  // Uses the capture phase so we win the race against any focused element's
  // own keydown listener that might also trigger scrolling.
  const stackIsOpen = stack.length > 0;
  useEffect(() => {
    if (!stackIsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const key = e.key;
      if (
        key !== 'ArrowUp' &&
        key !== 'ArrowDown' &&
        key !== 'ArrowLeft' &&
        key !== 'ArrowRight' &&
        key !== 'PageUp' &&
        key !== 'PageDown' &&
        key !== 'Home' &&
        key !== 'End'
      ) {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Preserve native text-cursor / line nav inside editable fields.
      const tag = target.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [stackIsOpen]);

  return (
    <ModalStackContext.Provider value={value}>{children}</ModalStackContext.Provider>
  );
}

export function useModalStack(): ModalStackContextValue {
  return useContext(ModalStackContext);
}

/** Convenience: `true` while any modal is mounted. */
export function useIsAnyModalOpen(): boolean {
  return useContext(ModalStackContext).isAnyOpen;
}

/**
 * Returns the topmost modal's registered shortcuts, or `null` if no modal is
 * open or the topmost modal didn't register any. Used by
 * `KeyboardShortcutsModal` to surface modal-specific keyboard interfaces.
 *
 * IMPORTANT: when the help modal itself is open, the topmost entry IS the
 * help modal. To get "the topmost modal *underneath* me", the help modal
 * walks the stack manually — see its implementation.
 */
export function useTopmostShortcuts(): ShortcutCategory | null {
  return useContext(ModalStackContext).topmostShortcuts;
}

/**
 * Separate context exposing a single modal's stack id to its children. The
 * `<Modal>` primitive wraps its children in `<ModalIdContext.Provider>` so
 * `useModalHotkeys` can read it without the consumer providing the id.
 *
 * `null` outside a modal — that's how page-level callers detect they're
 * underneath modals rather than inside one.
 */
export const ModalIdContext = createContext<string | null>(null);
