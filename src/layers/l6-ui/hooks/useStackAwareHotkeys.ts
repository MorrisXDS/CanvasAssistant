/**
 * useStackAwareHotkeys / useModalHotkeys — thin wrappers around
 * `react-hotkeys-hook`'s `useHotkeys` that gate themselves based on the
 * `ModalStackContext`.
 *
 * Design — see [docs/adr/0006-modal-stack-aware-hotkey-suppression.md](../../../../docs/adr/0006-modal-stack-aware-hotkey-suppression.md).
 *
 * Pick by where your handler lives:
 *
 *   Page-level (under modals) → useStackAwareHotkeys
 *     Fires only when no modal is open. Prevents the classic bug where
 *     pressing a key inside a modal also fires the underlying page's
 *     handler.
 *
 *   Inside a modal → useModalHotkeys
 *     Fires only when *this* modal is the topmost on the stack. Prevents a
 *     parent modal's keymap from firing while the user is typing in a child
 *     modal stacked above it. THROWS if called outside a <Modal> provider —
 *     misuse fails loudly at hook init.
 *
 *   Truly global (must fire over modals — `?` help opener, `mod+1..5`
 *     navigation) → plain `useHotkeys` from `react-hotkeys-hook` (these
 *     aren't gated by the stack at all).
 *
 * NOTE on signature: these wrappers do NOT accept the dep-array overload that
 * `react-hotkeys-hook` provides. Pass options as an object only:
 *   useStackAwareHotkeys('q', fn, { enabled: true })   // ✓
 *   useStackAwareHotkeys('q', fn, [dep])               // ✗ — pass { ... } instead
 * This keeps the wrappers half their previous size and makes the call shape
 * uniform across the codebase.
 */

import { useContext } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import type { HotkeyCallback, Keys, Options as HotkeyOptions } from 'react-hotkeys-hook';
import {
  ModalIdContext,
  useIsAnyModalOpen,
  useModalStack,
} from '../contexts/ModalStackContext';

// `HotkeyOptions` is `Options` re-aliased from react-hotkeys-hook. Our wrappers
// accept this object form only (no dep-array overload — see file header).

/**
 * Page-level handler. Suppressed while any modal is open.
 *
 * Drop-in replacement for `useHotkeys` for any handler that lives under the
 * modal layer (pages, sections inside pages, hooks consumed by pages).
 *
 * Accepts the 4-arg form `(keys, callback, options, deps)` — same as
 * react-hotkeys-hook's main overload. The 3-arg-with-deps shorthand
 * `useHotkeys(keys, callback, [deps])` is NOT supported; pass options
 * explicitly: `useStackAwareHotkeys(keys, callback, {}, [deps])`.
 */
export function useStackAwareHotkeys(
  keys: Keys,
  callback: HotkeyCallback,
  options?: HotkeyOptions,
  deps?: unknown[]
) {
  const isAnyOpen = useIsAnyModalOpen();
  const userEnabled = options?.enabled ?? true;
  return useHotkeys(
    keys,
    callback,
    {
      ...options,
      enabled: !isAnyOpen && userEnabled,
    },
    deps
  );
}

/**
 * In-modal handler. Suppressed when this modal is not the topmost on the
 * stack. Reads the current modal id from `ModalIdContext` (provided by the
 * `<Modal>` primitive), so the consumer doesn't need to thread it manually.
 *
 * Throws if called outside a `<Modal>` provider — the strict contract
 * surfaces misuse immediately rather than silently falling back.
 */
export function useModalHotkeys(
  keys: Keys,
  callback: HotkeyCallback,
  options?: HotkeyOptions,
  deps?: unknown[]
) {
  const myId = useContext(ModalIdContext);
  if (myId === null) {
    throw new Error(
      'useModalHotkeys must be called inside a <Modal>. ' +
        'For page-level handlers, use useStackAwareHotkeys.'
    );
  }
  const { topmostId } = useModalStack();
  const isTopmost = myId === topmostId;
  const userEnabled = options?.enabled ?? true;
  return useHotkeys(
    keys,
    callback,
    {
      ...options,
      enabled: isTopmost && userEnabled,
    },
    deps
  );
}
