/**
 * @jest-environment jsdom
 *
 * useFocusedItem — keyboard-driven list focus navigation hook.
 *
 * Behaviour pinned here (FOLLOWUPS 5.4 — the `bindBothNavAxes` additive mode):
 *   - Default (no flag / verticalNav:false): prev = Left/J, next = Right/K;
 *     W/S/↑/↓ do NOTHING (guards the contract of the 11 horizontal/default callers).
 *   - verticalNav:true: prev = Up/W, next = Down/S; J/K/←/→ do NOTHING.
 *   - bindBothNavAxes:true (the NEW mode): ALL of J, W, ↑(ArrowUp), ←(ArrowLeft)
 *     move PREV; ALL of K, S, ↓(ArrowDown), →(ArrowRight) move NEXT. Same focus,
 *     same direction — this is the core of FOLLOWUPS 5.4 (keep J/K, add app-wide
 *     W/S + arrows on the Updates page).
 *   - Wrap-around still holds in the new mode (prev at 0 → last; next at last → 0).
 *   - preventDefault is called for ↑/↓ in the new mode (no browser scroll).
 *   - Modal-stack gate (ADR-0006): bindings ride `useStackAwareHotkeys`, so nav is
 *     suppressed while any modal is open.
 *
 * The hook's prev/next movement is INDEX-based (movePrev/moveNext mutate
 * `focusedIndex`; the DOM is only touched for scroll-into-view, which is a no-op
 * here because no [data-focus-index] elements are rendered). So we assert on
 * `result.current.focusedIndex` directly. Bindings register through
 * `useStackAwareHotkeys`, which reads the REAL `ModalStackContext` — so we drive
 * the gate with a real `ModalStackProvider` and dispatch real keydown events on
 * `document`, the same idiom as `useSectionScope.test.tsx`.
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import {
  useFocusedItem,
  type UseFocusedItemOptions,
} from '../../../src/layers/l6-ui/hooks/useFocusedItem';
import {
  ModalStackProvider,
  useModalStack,
} from '../../../src/layers/l6-ui/contexts/ModalStackContext';

/**
 * Dispatch a real keydown on `document` so react-hotkeys-hook's listener sees it.
 * Returns the event so callers can assert on `defaultPrevented`.
 *
 * NOTE (harness fidelity): react-hotkeys-hook v4 matches ARROW keys via
 * `event.code` ('ArrowUp' etc.), NOT `event.key`. jsdom's `KeyboardEvent` only
 * populates `code` when you pass it explicitly, so for an `Arrow*` key we set
 * BOTH `key` and `code` (exactly what a real browser sends). Letter keys (j/k/w/s)
 * match on `key`, so they don't need `code`. This is why a bare
 * `new KeyboardEvent('keydown', { key: 'ArrowUp' })` silently fails to fire the
 * hotkey in jsdom — the arrow never reaches react-hotkeys-hook's matcher.
 */
function pressKey(key: string): KeyboardEvent {
  const isArrow = key.startsWith('Arrow');
  const ev = new KeyboardEvent('keydown', {
    key,
    // `code` for an arrow is the same literal as `key` ('ArrowUp' → 'ArrowUp').
    ...(isArrow ? { code: key } : {}),
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    document.dispatchEvent(ev);
  });
  return ev;
}

/** Handle to push/pop a modal entry on the real stack (flips `isAnyOpen`). */
let modalStackHandle: ReturnType<typeof useModalStack> | null = null;
function StackProbe() {
  modalStackHandle = useModalStack();
  return null;
}

function makeWrapper() {
  return ({ children }: { children: React.ReactNode }) => (
    <ModalStackProvider>
      <StackProbe />
      {children}
    </ModalStackProvider>
  );
}

const ITEMS = ['a', 'b', 'c', 'd'] as const;

function renderFocused(options?: UseFocusedItemOptions) {
  return renderHook(({ o }) => useFocusedItem([...ITEMS], o), {
    wrapper: makeWrapper(),
    initialProps: { o: options },
  });
}

beforeEach(() => {
  modalStackHandle = null;
  // Clear any persisted focus from a prior test (the hook reads sessionStorage on init).
  sessionStorage.clear();
});

describe('useFocusedItem — default (horizontal) mode unchanged', () => {
  test('Left/J move prev, Right/K move next; W/S/arrows-up/down do nothing', () => {
    const { result } = renderFocused();
    expect(result.current.focusedIndex).toBe(-1);

    // Right/K = next (from -1, moveNext: prev(-1) < len-1 → 0).
    pressKey('k');
    expect(result.current.focusedIndex).toBe(0);
    pressKey('ArrowRight');
    expect(result.current.focusedIndex).toBe(1);

    // Left/J = prev.
    pressKey('j');
    expect(result.current.focusedIndex).toBe(0);
    pressKey('ArrowLeft');
    expect(result.current.focusedIndex).toBe(3); // wrap to end

    // Vertical-family keys are NOT bound in default mode → no movement.
    const before = result.current.focusedIndex;
    pressKey('w');
    pressKey('s');
    pressKey('ArrowUp');
    pressKey('ArrowDown');
    expect(result.current.focusedIndex).toBe(before);
  });
});

describe('useFocusedItem — verticalNav:true mode unchanged', () => {
  test('Up/W move prev, Down/S move next; J/K/arrows-left/right do nothing', () => {
    const { result } = renderFocused({ verticalNav: true });
    expect(result.current.focusedIndex).toBe(-1);

    // Down/S = next.
    pressKey('s');
    expect(result.current.focusedIndex).toBe(0);
    pressKey('ArrowDown');
    expect(result.current.focusedIndex).toBe(1);

    // Up/W = prev.
    pressKey('w');
    expect(result.current.focusedIndex).toBe(0);
    pressKey('ArrowUp');
    expect(result.current.focusedIndex).toBe(3); // wrap to end

    // Horizontal-family keys are NOT bound in vertical mode → no movement.
    const before = result.current.focusedIndex;
    pressKey('j');
    pressKey('k');
    pressKey('ArrowLeft');
    pressKey('ArrowRight');
    expect(result.current.focusedIndex).toBe(before);
  });
});

describe('useFocusedItem — bindBothNavAxes:true (FOLLOWUPS 5.4 new mode)', () => {
  test('every prev key (J, W, ↑, ←) moves to previous, same direction', () => {
    const { result } = renderFocused({ bindBothNavAxes: true });
    // Seed focus at index 2 so prev steps down without wrapping first.
    act(() => result.current.setFocusedIndex(2));
    expect(result.current.focusedIndex).toBe(2);

    pressKey('j');
    expect(result.current.focusedIndex).toBe(1);
    pressKey('w');
    expect(result.current.focusedIndex).toBe(0);
    pressKey('ArrowUp');
    expect(result.current.focusedIndex).toBe(3); // wrap 0 → last
    pressKey('ArrowLeft');
    expect(result.current.focusedIndex).toBe(2);
  });

  test('every next key (K, S, ↓, →) moves to next, same direction', () => {
    const { result } = renderFocused({ bindBothNavAxes: true });
    act(() => result.current.setFocusedIndex(1));
    expect(result.current.focusedIndex).toBe(1);

    pressKey('k');
    expect(result.current.focusedIndex).toBe(2);
    pressKey('s');
    expect(result.current.focusedIndex).toBe(3);
    pressKey('ArrowDown');
    expect(result.current.focusedIndex).toBe(0); // wrap last → 0
    pressKey('ArrowRight');
    expect(result.current.focusedIndex).toBe(1);
  });

  test('wrap-around: prev at index 0 → last; next at last → 0', () => {
    const { result } = renderFocused({ bindBothNavAxes: true });
    act(() => result.current.setFocusedIndex(0));

    pressKey('w'); // prev at 0 wraps to last
    expect(result.current.focusedIndex).toBe(ITEMS.length - 1);

    pressKey('s'); // next at last wraps to 0
    expect(result.current.focusedIndex).toBe(0);
  });

  test('preventDefault is called for ↑/↓ (no browser scroll)', () => {
    const { result } = renderFocused({ bindBothNavAxes: true });
    act(() => result.current.setFocusedIndex(1));

    const up = pressKey('ArrowUp');
    expect(up.defaultPrevented).toBe(true);

    const down = pressKey('ArrowDown');
    expect(down.defaultPrevented).toBe(true);
  });
});

describe('useFocusedItem — modal-stack gating (ADR-0006)', () => {
  test('nav is suppressed while a modal is open, and resumes after it closes', () => {
    const { result } = renderFocused({ bindBothNavAxes: true });
    act(() => result.current.setFocusedIndex(1));

    // Open a modal → useStackAwareHotkeys gates the nav off.
    act(() => modalStackHandle!.push({ id: 'm1' }));

    pressKey('w');
    pressKey('s');
    pressKey('j');
    pressKey('k');
    pressKey('ArrowUp');
    pressKey('ArrowDown');
    pressKey('ArrowLeft');
    pressKey('ArrowRight');
    expect(result.current.focusedIndex).toBe(1); // nothing fired

    // Close the modal → handlers resume.
    act(() => modalStackHandle!.pop('m1'));
    pressKey('s');
    expect(result.current.focusedIndex).toBe(2);
  });
});
