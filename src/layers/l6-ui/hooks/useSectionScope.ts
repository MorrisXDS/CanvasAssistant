/**
 * useSectionScope — reusable in-page section-navigation hook.
 *
 * Gives a page a uniform "sections" keyboard scheme (ADR-0010):
 *   - `Q` cycles backward, `E` cycles forward through the AVAILABLE sections.
 *   - `Alt+1..N` jumps directly to the Nth AVAILABLE section (1-based slot among
 *     available sections only — unavailable sections get no slot).
 *   - If the active section becomes unavailable, focus auto-advances to the
 *     first available section.
 *   - The available sections (with their `Alt+<index1>` slots) are broadcast to
 *     `KeyboardScopeContext` so the `?` help modal can list them.
 *
 * All key bindings register through `useStackAwareHotkeys`, so they inherit
 * ADR-0006 modal-stack gating for free (they never fire while a modal is open).
 *
 * This is FOUNDATION infrastructure: as of Phase 0 no page consumes it. It
 * mirrors the existing ad-hoc cycle/re-scope logic in `CourseDetail.tsx` so
 * pages can migrate onto it in later phases.
 *
 * @example
 *   const { active, cycle, goTo, sections } = useSectionScope(
 *     [
 *       { id: 'tasks', label: 'Tasks' },
 *       { id: 'queue', label: 'Queue', available: queueAvailable },
 *       { id: 'prefs', label: 'Preferences', available: showSettings },
 *     ],
 *     { suppressForwardCycleInSection: 'tasks' }
 *   );
 */

import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { HotkeyCallback } from 'react-hotkeys-hook';
import { useStackAwareHotkeys } from './useStackAwareHotkeys';
import {
  KeyboardScopeContext,
  type ActiveSectionInfo,
} from '../contexts/KeyboardScopeContext';

/**
 * Resolve the pressed digit 1..9. Fast-path `e.key` (covers standard QWERTY).
 * Fall back to the PHYSICAL key via `e.code` when Option/Alt composed a glyph
 * (macOS / international layouts make `e.key` a glyph → `parseInt` → NaN). `e.code`
 * is layout-independent: `Digit1` / `Numpad1` fire regardless of the composed glyph.
 */
function digitFromEvent(e: KeyboardEvent): number | null {
  const k = parseInt(e.key, 10);
  if (k >= 1 && k <= 9) return k; // fast path — e.key is a digit
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code); // fallback — physical key
  return m ? Number(m[1]) : null;
}

/** A page-declared section. `available` defaults to `true` when omitted. */
export interface SectionDef<Id extends string = string> {
  id: Id;
  /** Human label shown in the indicator + help modal. Falls back to `id`. */
  label?: string;
  /** When `false`, the section gets no slot and is omitted from the indicator. */
  available?: boolean;
}

/** A section augmented with its availability + 1-based `Alt` slot (B1). */
export interface SectionState<Id extends string = string> {
  id: Id;
  label: string;
  isAvailable: boolean;
  /** 1-based slot among AVAILABLE sections, or `null` when unavailable. */
  index1: number | null;
}

export interface UseSectionScopeOptions<Id extends string = string> {
  /** Section to start on. Falls back to the first available section. */
  initial?: Id;
  /** Enable the `Q`/`E` cycle bindings. Default `true`. */
  enableCycle?: boolean;
  /** Enable the `Alt+1..N` direct-jump bindings. Default `true` (ADR-0010). */
  enableDirectJump?: boolean;
  /**
   * Suppress the hook's forward-cycle (`E`) ONLY while this section is active,
   * so the page's own `E` handler (e.g. "edit task") owns the key there. `Q` is
   * never suppressed. Implemented via the `E` binding's `enabled` flag so it
   * composes with the page handler + the modal-stack gate (ADR-0006).
   */
  suppressForwardCycleInSection?: Id;
}

export interface UseSectionScopeResult<Id extends string = string> {
  /** The currently-active section id. */
  active: Id;
  /** Cycle through available sections (`1` forward, `-1` backward). */
  cycle: (dir: 1 | -1) => void;
  /** Jump to a section by id. No-op if the section is unavailable. */
  goTo: (id: Id) => void;
  /** The full ordered section list augmented with availability + slot. */
  sections: SectionState<Id>[];
}

/** Highest direct-jump digit we register (Alt+1 .. Alt+9). */
const MAX_DIRECT_JUMP = 9;
const ALT_DIGIT_KEYS = Array.from(
  { length: MAX_DIRECT_JUMP },
  (_, i) => `alt+${i + 1}`
).join(',');

export function useSectionScope<Id extends string = string>(
  defs: SectionDef<Id>[],
  options: UseSectionScopeOptions<Id> = {}
): UseSectionScopeResult<Id> {
  const {
    initial,
    enableCycle = true,
    enableDirectJump = true,
    suppressForwardCycleInSection,
  } = options;

  // Augment each def with availability + its 1-based slot among available
  // sections (B1: unavailable sections get index1 === null).
  const sections = useMemo<SectionState<Id>[]>(() => {
    let slot = 0;
    return defs.map((d) => {
      const isAvailable = d.available !== false;
      return {
        id: d.id,
        label: d.label ?? d.id,
        isAvailable,
        index1: isAvailable ? ++slot : null,
      };
    });
  }, [defs]);

  const availableIds = useMemo(
    () => sections.filter((s) => s.isAvailable).map((s) => s.id),
    [sections]
  );

  // Seed active from `initial` (when available) else the first available id.
  const [active, setActive] = useState<Id>(() => {
    if (initial && defs.some((d) => d.id === initial && d.available !== false)) {
      return initial;
    }
    return availableIds[0] ?? defs[0]?.id;
  });

  const goTo = useCallback(
    (id: Id) => {
      // No-op when the target is not currently available.
      if (!availableIds.includes(id)) return;
      setActive(id);
    },
    [availableIds]
  );

  const cycle = useCallback(
    (dir: 1 | -1) => {
      if (availableIds.length <= 1) return;
      const idx = availableIds.indexOf(active);
      const next =
        (idx === -1 ? 0 : idx + dir + availableIds.length) % availableIds.length;
      setActive(availableIds[next]);
    },
    [availableIds, active]
  );

  // Re-scope: if the active section is no longer available, advance to the
  // first available section (mirrors CourseDetail's existing re-scope effect).
  useEffect(() => {
    if (!availableIds.includes(active) && availableIds.length > 0) {
      setActive(availableIds[0]);
    }
  }, [active, availableIds]);

  // Q — backward cycle (never suppressed).
  useStackAwareHotkeys(
    'q',
    (e) => {
      e.preventDefault();
      cycle(-1);
    },
    { enabled: enableCycle },
    [cycle, enableCycle]
  );

  // E — forward cycle. Suppressed (enabled:false) while the named section is
  // active, so the page's own `E` handler receives the key there. The disable
  // is the binding's `enabled` flag, not an in-handler early-return, so it
  // composes with the page handler + the ADR-0006 modal-stack gate.
  const forwardCycleEnabled =
    enableCycle &&
    (suppressForwardCycleInSection === undefined ||
      active !== suppressForwardCycleInSection);
  useStackAwareHotkeys(
    'e',
    (e) => {
      e.preventDefault();
      cycle(1);
    },
    { enabled: forwardCycleEnabled },
    [cycle, forwardCycleEnabled]
  );

  // Alt+1..9 — direct jump. ONE fixed-set registration (rules-of-hooks: a
  // per-section hook would vary in count across renders). Resolve the pressed
  // digit at fire time → jump to the Nth AVAILABLE section; no-op out of range.
  const onDirectJump = useCallback<HotkeyCallback>(
    (e) => {
      const digit = digitFromEvent(e);
      if (digit === null) return;
      const target = availableIds[digit - 1];
      if (target === undefined) return; // out of range → no-op
      e.preventDefault();
      setActive(target);
    },
    [availableIds]
  );
  useStackAwareHotkeys(ALT_DIGIT_KEYS, onDirectJump, { enabled: enableDirectJump }, [
    onDirectJump,
    enableDirectJump,
  ]);

  // Broadcast the available sections (with their slots) to the help modal.
  // Clear on unmount.
  const { setActiveSections } = useContext(KeyboardScopeContext);
  const broadcast = useMemo<ActiveSectionInfo[]>(
    () =>
      sections
        .filter((s): s is SectionState<Id> & { index1: number } => s.index1 !== null)
        .map((s) => ({ id: s.id, label: s.label, index1: s.index1 })),
    [sections]
  );
  // Depend on the VALUE of the broadcast (a stable string key), NOT the array
  // identity. Callers pass `defs` as an inline literal (see the docstring
  // example), so `sections`/`broadcast` get a fresh identity every render — if
  // the effect keyed on `broadcast` identity it would fire on every render,
  // call `setActiveSections` (shared context), re-render every consumer
  // including the consuming page, which re-creates the inline `defs` → infinite
  // update loop. Keying on the serialized content fires only on real change.
  const broadcastKey = useMemo(() => JSON.stringify(broadcast), [broadcast]);
  useEffect(() => {
    setActiveSections(broadcast.length > 0 ? broadcast : null);
    // `broadcast` is intentionally excluded from the deps — `broadcastKey` is
    // its value-identity, so the effect re-runs only on real content change
    // (not on the fresh array identity every render).
  }, [broadcastKey, setActiveSections]);
  useEffect(() => {
    return () => setActiveSections(null);
  }, [setActiveSections]);

  return { active, cycle, goTo, sections };
}
