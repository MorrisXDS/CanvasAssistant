/**
 * @jest-environment jsdom
 *
 * useSectionScope — the section-navigation foundation hook (ADR-0010, Phase 0).
 *
 * Behaviour pinned here:
 *   - Q/E cycle forward/backward through AVAILABLE sections (wraps); no-op with
 *     ≤1 available; cycle skips unavailable sections.
 *   - goTo jumps to an available section; no-ops on an unavailable id.
 *   - Alt+N maps a digit to the Nth AVAILABLE section (B1: unavailable get no
 *     slot → Alt+2 lands on the 2nd available, not the 2nd defined).
 *   - re-scope auto-advances when the active section becomes unavailable.
 *   - sections[] returns isAvailable + 1-based index1 (null for unavailable).
 *   - broadcasts the available {id,label,index1} list to KeyboardScopeContext on
 *     mount + on sections-change, and clears (null) on unmount.
 *   - CRITICAL (R2): suppressForwardCycleInSection disables the hook's E binding
 *     (enabled:false) ONLY while that section is active, so the page's own E
 *     handler wins; Q still fires.
 *   - modal-stack gate (ADR-0006): Q/E/Alt+N suppressed while a modal is open.
 *   - enableDirectJump:false / enableCycle:false escape hatches.
 *
 * The hook's bindings register through `useStackAwareHotkeys`, which reads the
 * REAL `ModalStackContext` — so these tests drive the gate with a real
 * `ModalStackProvider` (push an entry to flip `isAnyOpen`) and dispatch real
 * keydown events on `document`, the same idiom as
 * `tests/l6-ui/AnnouncementDetail.keyboard.test.tsx`.
 */

import React from 'react';
import { render, renderHook, act } from '@testing-library/react';
import {
  useSectionScope,
  type SectionDef,
  type UseSectionScopeOptions,
} from '../../../src/layers/l6-ui/hooks/useSectionScope';
import {
  KeyboardScopeProvider,
  KeyboardScopeContext,
  type ActiveSectionInfo,
} from '../../../src/layers/l6-ui/contexts/KeyboardScopeContext';
import {
  ModalStackProvider,
  useModalStack,
} from '../../../src/layers/l6-ui/contexts/ModalStackContext';

/** Dispatch a real keydown on `document` so useHotkeys' listener sees it. */
function pressKey(key: string, opts: { altKey?: boolean } = {}) {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key,
        altKey: opts.altKey ?? false,
        bubbles: true,
        cancelable: true,
      })
    );
  });
}

/**
 * A handle a test can use to push/pop a modal entry on the real stack (flips
 * `isAnyOpen`, which `useStackAwareHotkeys` reads to gate). Captured via a probe
 * component rendered inside the provider tree.
 */
let modalStackHandle: ReturnType<typeof useModalStack> | null = null;
function StackProbe() {
  modalStackHandle = useModalStack();
  return null;
}

/**
 * A handle on the live `activeSections` broadcast value, captured from context.
 */
let broadcastHandle: ActiveSectionInfo[] | null | undefined;
function BroadcastProbe() {
  broadcastHandle = React.useContext(KeyboardScopeContext).activeSections;
  return null;
}

/** Wrapper: ModalStackProvider > KeyboardScopeProvider > probes + hook. */
function makeWrapper() {
  return ({ children }: { children: React.ReactNode }) => (
    <ModalStackProvider>
      <KeyboardScopeProvider>
        <StackProbe />
        <BroadcastProbe />
        {children}
      </KeyboardScopeProvider>
    </ModalStackProvider>
  );
}

function renderScope<Id extends string = string>(
  defs: SectionDef<Id>[],
  options?: UseSectionScopeOptions<Id>
) {
  return renderHook(({ d, o }) => useSectionScope<Id>(d, o), {
    wrapper: makeWrapper(),
    initialProps: { d: defs, o: options },
  });
}

beforeEach(() => {
  modalStackHandle = null;
  broadcastHandle = undefined;
});

describe('useSectionScope — cycle (Q/E)', () => {
  test('cycle(1) advances forward and wraps; cycle(-1) goes backward and wraps', () => {
    const { result } = renderScope([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    expect(result.current.active).toBe('a');

    act(() => result.current.cycle(1));
    expect(result.current.active).toBe('b');
    act(() => result.current.cycle(1));
    expect(result.current.active).toBe('c');
    act(() => result.current.cycle(1)); // wraps
    expect(result.current.active).toBe('a');

    act(() => result.current.cycle(-1)); // wraps backward
    expect(result.current.active).toBe('c');
    act(() => result.current.cycle(-1));
    expect(result.current.active).toBe('b');
  });

  test('cycle skips unavailable sections', () => {
    const { result } = renderScope([
      { id: 'a' },
      { id: 'b', available: false },
      { id: 'c' },
    ]);
    expect(result.current.active).toBe('a');
    act(() => result.current.cycle(1));
    expect(result.current.active).toBe('c'); // skipped 'b'
    act(() => result.current.cycle(1)); // wraps back to 'a'
    expect(result.current.active).toBe('a');
  });

  test('cycle is a no-op with only one available section', () => {
    const { result } = renderScope([{ id: 'a' }, { id: 'b', available: false }]);
    expect(result.current.active).toBe('a');
    act(() => result.current.cycle(1));
    expect(result.current.active).toBe('a');
    act(() => result.current.cycle(-1));
    expect(result.current.active).toBe('a');
  });

  test('Q/E keys cycle backward/forward', () => {
    const { result } = renderScope([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    pressKey('e');
    expect(result.current.active).toBe('b');
    pressKey('e');
    expect(result.current.active).toBe('c');
    pressKey('q');
    expect(result.current.active).toBe('b');
  });
});

describe('useSectionScope — goTo', () => {
  test('goTo jumps to an available section', () => {
    const { result } = renderScope([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    act(() => result.current.goTo('c'));
    expect(result.current.active).toBe('c');
  });

  test('goTo is a no-op on an unavailable id', () => {
    const { result } = renderScope([
      { id: 'a' },
      { id: 'b', available: false },
      { id: 'c' },
    ]);
    expect(result.current.active).toBe('a');
    act(() => result.current.goTo('b')); // unavailable → no-op
    expect(result.current.active).toBe('a');
  });
});

describe('useSectionScope — sections[] (B1 slot numbering)', () => {
  test('index1 is the 1-based position among AVAILABLE only; unavailable → null', () => {
    const { result } = renderScope([
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta', available: false },
      { id: 'c', label: 'Gamma' },
    ]);
    const byId = Object.fromEntries(result.current.sections.map((s) => [s.id, s]));

    expect(byId.a).toMatchObject({ label: 'Alpha', isAvailable: true, index1: 1 });
    expect(byId.b).toMatchObject({ label: 'Beta', isAvailable: false, index1: null });
    expect(byId.c).toMatchObject({ label: 'Gamma', isAvailable: true, index1: 2 });
  });

  test('label falls back to id when omitted', () => {
    const { result } = renderScope([{ id: 'solo' }]);
    expect(result.current.sections[0]).toMatchObject({ id: 'solo', label: 'solo' });
  });
});

describe('useSectionScope — re-scope on unavailable', () => {
  test('auto-advances to first available when the active section becomes unavailable', () => {
    const { result, rerender } = renderScope([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    act(() => result.current.goTo('b'));
    expect(result.current.active).toBe('b');

    // Flip 'b' unavailable via a props rerender.
    act(() => {
      rerender({
        d: [{ id: 'a' }, { id: 'b', available: false }, { id: 'c' }],
        o: undefined,
      });
    });
    expect(result.current.active).toBe('a'); // advanced to first available
  });
});

describe('useSectionScope — direct jump (Alt+N, B1 available-only)', () => {
  test('Alt+2 lands on the 2nd AVAILABLE section (skips unavailable)', () => {
    // Definitions: a (avail), b (UNAVAIL), c (avail), d (avail).
    // Available order is [a, c, d] → Alt+2 = c (NOT the 2nd defined, b).
    const { result } = renderScope([
      { id: 'a' },
      { id: 'b', available: false },
      { id: 'c' },
      { id: 'd' },
    ]);
    pressKey('2', { altKey: true });
    expect(result.current.active).toBe('c');
    pressKey('3', { altKey: true });
    expect(result.current.active).toBe('d');
    pressKey('1', { altKey: true });
    expect(result.current.active).toBe('a');
  });

  test('Alt+<N beyond available count> is a no-op', () => {
    const { result } = renderScope([{ id: 'a' }, { id: 'b' }]);
    pressKey('5', { altKey: true }); // only 2 available → out of range
    expect(result.current.active).toBe('a');
  });

  test('enableDirectJump:false disables Alt+N but cycle/goTo still work', () => {
    const { result } = renderScope([{ id: 'a' }, { id: 'b' }], {
      enableDirectJump: false,
    });
    pressKey('2', { altKey: true });
    expect(result.current.active).toBe('a'); // Alt+N no-op

    act(() => result.current.cycle(1)); // imperative still works
    expect(result.current.active).toBe('b');
    act(() => result.current.goTo('a'));
    expect(result.current.active).toBe('a');
  });
});

describe('useSectionScope — suppressForwardCycleInSection (R2 composability)', () => {
  test('E no-ops while the suppressed section is active; Q still fires; E resumes elsewhere', () => {
    // 'tasks' owns E (e.g. "edit task") while active. Suppress the hook's E there.
    const { result } = renderScope([{ id: 'tasks' }, { id: 'queue' }, { id: 'prefs' }], {
      suppressForwardCycleInSection: 'tasks',
    });
    expect(result.current.active).toBe('tasks');

    // E is suppressed while 'tasks' active → no-op (page's own E would win).
    pressKey('e');
    expect(result.current.active).toBe('tasks');

    // Q is NEVER suppressed → still cycles (backward → wraps to 'prefs').
    pressKey('q');
    expect(result.current.active).toBe('prefs');

    // On a DIFFERENT section, E cycles forward normally (wraps to 'tasks').
    pressKey('e');
    expect(result.current.active).toBe('tasks');
  });

  test('enableCycle:false disables both Q and E', () => {
    const { result } = renderScope([{ id: 'a' }, { id: 'b' }], {
      enableCycle: false,
    });
    pressKey('e');
    expect(result.current.active).toBe('a');
    pressKey('q');
    expect(result.current.active).toBe('a');
  });
});

describe('useSectionScope — modal-stack gating (ADR-0006)', () => {
  test('Q/E/Alt+N are suppressed while a modal is open, and resume after it closes', () => {
    const { result } = renderScope([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);

    // Open a modal → useStackAwareHotkeys gates everything off.
    act(() => modalStackHandle!.push({ id: 'm1' }));

    pressKey('e');
    pressKey('q');
    pressKey('2', { altKey: true });
    expect(result.current.active).toBe('a'); // nothing fired

    // Close the modal → handlers resume.
    act(() => modalStackHandle!.pop('m1'));
    pressKey('e');
    expect(result.current.active).toBe('b');
  });
});

describe('useSectionScope — context broadcast', () => {
  test('broadcasts available {id,label,index1} on mount and clears (null) on unmount', () => {
    // The hook lives in a TOGGLEABLE child so we can unmount JUST the hook while
    // the BroadcastProbe + providers stay mounted to observe the post-unmount
    // clear. (renderHook's `unmount` tears down the whole tree, including the
    // probe, so it can't see the cleanup effect's `setActiveSections(null)`.)
    function HookChild() {
      useSectionScope([
        { id: 'a', label: 'Alpha' },
        { id: 'b', label: 'Beta', available: false },
        { id: 'c', label: 'Gamma' },
      ]);
      return null;
    }
    function Harness({ mountHook }: { mountHook: boolean }) {
      return (
        <ModalStackProvider>
          <KeyboardScopeProvider>
            <BroadcastProbe />
            {mountHook ? <HookChild /> : null}
          </KeyboardScopeProvider>
        </ModalStackProvider>
      );
    }

    const { rerender } = render(<Harness mountHook />);

    // Mount → available-only list, with B1 slots, in context.
    expect(broadcastHandle).toEqual([
      { id: 'a', label: 'Alpha', index1: 1 },
      { id: 'c', label: 'Gamma', index1: 2 },
    ]);

    // Unmount only the hook child; the probe + providers persist.
    act(() => rerender(<Harness mountHook={false} />));
    expect(broadcastHandle).toBeNull();
  });

  test('re-broadcasts when the available section list changes', () => {
    const { rerender } = renderScope<'a' | 'b'>([
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta', available: false },
    ]);
    expect(broadcastHandle).toEqual([{ id: 'a', label: 'Alpha', index1: 1 }]);

    act(() => {
      rerender({
        d: [
          { id: 'a', label: 'Alpha' },
          { id: 'b', label: 'Beta' }, // now available
        ],
        o: undefined,
      });
    });
    expect(broadcastHandle).toEqual([
      { id: 'a', label: 'Alpha', index1: 1 },
      { id: 'b', label: 'Beta', index1: 2 },
    ]);
  });
});
