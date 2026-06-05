# 0006 — Modal-stack-aware hotkey suppression

Status: Accepted

## Context

`react-hotkeys-hook` (`useHotkeys`) attaches its listeners at the **document** level. When
a modal mounts above a page that has its own `useHotkeys` calls, pressing a key inside the
modal also fires the underlying page's handler. Concrete bug surfaced in PR #16: pressing
`Q` in the duplicate-warning Customize child modal also cycled CourseDetail's section
focus _behind_ the modal.

The fix in that PR was local — `gateState == null` checks in `CanvasUpdatesSection`'s four
`useHotkeys` calls, plus an `onModalStateChange` callback that lets `CanvasUpdatesSection`
report modal state up to `CourseDetail`'s own `useKeymap`. That works for one modal/page
pair, but doesn't scale: every new modal would need every underlying page to wire up its
own gate.

Audit of the codebase (May 2026):

- `useHotkeys` — **67 sites across 15 files**. Largest concentrations: `UnifiedTaskList`
  (16), `DuplicateWarningModal` (14, safely inside the modal), `CoursesPage` (10),
  `useAppShortcuts` hook (5).
- `useKeymap` (the custom scope-aware hook in `src/layers/l6-ui/hooks/useKeymap.ts`) —
  11 sites. **Already has a `when?: () => boolean` option** documented for exactly this
  purpose ("When false, all shortcuts are suppressed (e.g. when a modal is open)"). It
  just isn't wired to any global signal yet.
- All 9 previously-handwritten active-use modals are now on the shared `<Modal>` primitive
  (per FOLLOWUPS — handwritten-modal cleanup, completed in PRs #20 / #22 / #23). This
  makes the primitive the natural place for centralised modal-state tracking.

## Decision

Introduce a `ModalStackContext` (React context) that tracks the currently-open modal
stack with two layers of awareness: **any-modal-open** (for suppressing page-level
handlers under modals) and **topmost-modal** (for suppressing parent-modal handlers
when a child modal is on top of them). The `<Modal>` primitive auto-pushes on
mount-with-`isOpen=true` and pops on unmount or `isOpen → false`, and exposes its own
stack id to its children via a separate inner context. Modals may optionally register
a `ShortcutCategory` so the `KeyboardShortcutsModal` (the `?` help menu) can display
the topmost modal's keyboard interface instead of the underlying page's.

### API shape

```ts
// src/layers/l6-ui/contexts/ModalStackContext.tsx
interface StackEntry {
  readonly id: string;
  readonly shortcuts?: ShortcutCategory;
}

interface ModalStackContextValue {
  readonly stack: ReadonlyArray<StackEntry>;
  readonly depth: number;
  readonly isAnyOpen: boolean;
  readonly topmostId: string | null;
  readonly topmostShortcuts: ShortcutCategory | null;
  push(entry: StackEntry): void;
  pop(id: string): void;
}
export function useModalStack(): ModalStackContextValue;
export function useIsAnyModalOpen(): boolean;
export function useTopmostShortcuts(): ShortcutCategory | null;

// Separate context exposing the *current* modal's id to its children.
// Used by useModalHotkeys to know "which modal am I inside."
export const ModalIdContext = createContext<string | null>(null);
```

### Modal primitive integration

```tsx
function Modal({ isOpen, shortcuts, children, ... }) {
  const stackId = useId();
  const { push, pop } = useModalStack();

  useEffect(() => {
    if (!isOpen) return;
    push({ id: stackId, shortcuts });
    return () => pop(stackId);
  }, [isOpen, push, pop, stackId, shortcuts]);

  if (!isOpen) return null;
  return (
    <ModalIdContext.Provider value={stackId}>
      {/* existing backdrop + dialog chrome */}
      {children}
    </ModalIdContext.Provider>
  );
}
```

### Consumer patterns (three flavours, one per location)

| Where the handler lives                                                | Hook to use                                                                                               | Gate semantics                            |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Underneath modals (pages, sections inside pages)                       | `useStackAwareHotkeys` / `useKeymap` (default-gated)                                                      | Fires only when stack is empty            |
| Inside a modal                                                         | `useModalHotkeys`                                                                                         | Fires only when this modal is the topmost |
| Truly global (must fire over modals — `?` help opener, `mod+1..5` nav) | plain `useHotkeys` with `escapeStackGate: true` opt-out (or just plain `useHotkeys` since it's not gated) | Fires always                              |

Implementations:

```ts
// Page-level hotkeys — gated when ANY modal is open.
// Takes options as a single object (no dep-array overload — see below).
export function useStackAwareHotkeys(
  keys: Keys,
  callback: HotkeyCallback,
  options?: OptionsType // Options object only, not Array<dep>
) {
  const isAnyOpen = useIsAnyModalOpen();
  return useHotkeys(keys, callback, {
    ...options,
    enabled: !isAnyOpen && (options?.enabled ?? true),
  });
}

// In-modal hotkeys — gated when this modal is NOT the topmost.
// THROWS if called outside a <Modal> provider (ModalIdContext is null).
// For page-level handlers, use useStackAwareHotkeys instead.
export function useModalHotkeys(
  keys: Keys,
  callback: HotkeyCallback,
  options?: OptionsType
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
  return useHotkeys(keys, callback, {
    ...options,
    enabled: isTopmost && (options?.enabled ?? true),
  });
}
```

**Design choices in this signature:**

- **No dep-array overload.** `react-hotkeys-hook` accepts an options object OR
  a dep array in the third position. Our wrappers require the options object
  form. Cost: a handful of callers (audit pending) may need to wrap their
  bare dep arrays as `{ enabled: true }, [deps]`. Benefit: the wrapper code is
  half the size, and the call shape becomes uniform across the codebase. Worth
  the small migration cost.
- **`useModalHotkeys` throws on null context, not falls back.** The error fires
  at hook init (development time), not at fire time — surfaces misuse immediately.
  Silent fallback to "enabled when stack empty" would mask the misuse and could
  introduce its own bug class. Strict contract pairs naturally with the two-hook
  split.

`useKeymap` gets the same treatment internally. **Critical:** the default gate
composes via **AND** with the caller's existing `when`, never replaces it. This
is the only safe semantics:

- `CourseDetail.tsx`'s `edit`-scope keymap uses `when: () => editingTaskId !== null`
  (scope-internal logic — "fire only when editing"). REPLACE would drop the editing
  guard and let `mod+Enter` fire `handleSaveTask` with no task being edited. OR
  would loosen the guard the other direction. Only AND preserves intent: fire
  only when editing AND no modal is open above.
- Same reasoning for the `prefs`-scope keymap.

```ts
// useKeymap consumes the stack context and ANDs its default gate with any
// user-supplied `when`. Callers can pass `escapeStackGate: true` to opt out
// (rare — e.g. a true global panic hotkey).
function useKeymap<S>(keymaps, options) {
  const isAnyOpen = useIsAnyModalOpen();
  const myModalId = useContext(ModalIdContext);
  const { topmostId } = useModalStack();

  const stackGate = () => {
    if (options.escapeStackGate) return true;
    if (myModalId !== null) {
      // Inside a modal — fire only when this modal is topmost
      return myModalId === topmostId;
    }
    // Below modals — fire only when stack is empty
    return !isAnyOpen;
  };

  // AND with user's existing `when` (if any), preserving scope-internal logic.
  const composedWhen = options.when ? () => options.when!() && stackGate() : stackGate;

  // ... existing implementation, using `composedWhen` in place of `options.when` ...
  // (enableOnFormTags and other options pass through unchanged)
}
```

After this lands, three current callers shed manual gating:

- `Calendar/index.tsx` deletes its `isAnyModalOpenRef` + the `when: () => !isAnyModalOpenRef.current` line.
- `CourseDetail.tsx:673` (`nav`) deletes the `when: () => !queueModalOpen` line, and `queueModalOpen` state + `onModalStateChange` callback wiring in `CanvasUpdatesSection` go with it.
- The 11 useKeymap sites and 67 useHotkeys sites all benefit, but only these
  three have explicit modal-gating to clean up.

### Help menu integration

Modals with their own keyboard interface declare their shortcuts via the new
`shortcuts?` prop on `<Modal>`:

```tsx
<Modal isOpen={isOpen} shortcuts={DUPLICATE_WARNING_SHORTCUTS}>
  {/* ... */}
</Modal>
```

Modal `ShortcutCategory` constants are centralised in
`src/layers/l6-ui/constants/modalShortcuts.ts` (one file, mirroring the existing
`keyboardShortcuts.ts` page-scope hub). Modal callers import from there; the file
is the single audit point for "what shortcuts does this modal expose."

The `ShortcutCategory` type is **reused as-is** — modal entries simply omit the
`scope` and `subscope` fields (they're route-related, meaningless for modals).
The `<ShortcutList>` renderer treats both kinds identically. Setting `scope` on
a modal category is an inert mistake (no rendering path consumes it).

Crucial subtlety: when the user presses `?` while `DuplicateWarningModal` is on
top, the help modal _itself_ opens above it. The help modal is now the topmost,
so a naïve `useTopmostShortcuts()` would return the help modal's own shortcuts —
wrong; the user wants to see what shortcuts apply to the thing they were just
looking at.

The help modal solves this **locally** — it reads `useModalStack().stack`
and walks back to find the topmost OTHER modal:

```tsx
// Inside KeyboardShortcutsModal
const { stack } = useModalStack();
// Find the topmost OTHER modal (the help itself is on top).
const myStackEntryId = useContext(ModalIdContext); // help's own id
const targetEntry = [...stack]
  .reverse()
  .find((e) => e.id !== myStackEntryId && e.shortcuts);
const tab1Category = targetEntry?.shortcuts ?? pageCategory;
```

This keeps the special-casing inside the one component that needs it —
`useTopmostShortcuts()` remains a clean "topmost shortcuts including help" hook
for any other caller, and the help modal applies the "skip self" filter where
the asymmetry actually exists.

### Scope of in-this-PR migration

1. **Foundation:** introduce `ModalStackContext` + `ModalIdContext` + `Modal` primitive
   integration + `useStackAwareHotkeys` + `useModalHotkeys` + default-gate `useKeymap`.
2. **Help menu:** wire `KeyboardShortcutsModal` to consult `useTopmostShortcuts()` with
   the "one below myself in the stack" lookup.
3. **Migrate page-level sites** (highest leverage; provides the proof):
   - `UnifiedTaskList` (16 `useHotkeys` sites)
   - `CoursesPage` (10 sites)
   - `Dashboard` cards (~8 sites combined)
   - `CanvasUpdatesSection` (4 sites — replaces the existing local `gateState == null`
     gate; net behavior unchanged).
4. **Migrate in-modal sites with their own keymap + register `shortcuts`:**
   - `DuplicateWarningModal` (14 sites → `useModalHotkeys`; existing `editingItem == null`
     manual gates removed since `useModalHotkeys` auto-handles topmost-check).
   - `TaskDetailModal` (own E/G/X/Del keymap).
   - `ConfirmDialog` (Y/N) — register shortcuts so the help shows them.
   - `CorruptionDialog` — register shortcuts for the recovery options.
5. **Global hotkeys** (`useAppShortcuts` — `?` opener, `mod+1..5` nav) — explicit
   `escapeStackGate: true` (they must fire above modals).

Remaining vulnerable sites migrate opportunistically per
`feedback_opportunistic-migration` — touch them when their file is otherwise edited.

### Explicitly deferred from this PR

- **List-keyboard hooks** `useMultiSelect.ts` (2 sites) and `useFocusedItem.ts`
  (2 sites). Consumers may or may not gate them transitively. Plan documented in
  `feedback_evaluate-list-keyboard-hooks-later` — revisit after this PR ships
  and a real list-keyboard leak surfaces (or when either hook file is next
  edited).
- **Consumer modals** (the 5 still-handwritten ones: `EventFormModal`,
  `ImportConfirmationModal`, `SettingsModal`, `SyncConflictModal`,
  `ExportDialog`) — these don't use the `<Modal>` primitive, so they won't
  auto-push. Their underlying-page hotkeys will still leak when these modals
  are open until they migrate (per `docs/FOLLOWUPS.md` "handwritten-modal
  cleanup"). If a caller notices the leak before migration, manual
  `useModalStack().push(id)` from inside the handwritten modal is a stopgap.

## Consequences

### Positive

- All 9 active-use modals participate for free (they use `<Modal>`).
- New modals built via the primitive participate automatically.
- The bug class "keys leak from modal to underlying page" goes from "every new modal
  needs every underlying page to wire up its own gate" to "wrap your hotkey hook once."
- `useKeymap` callers that were already wired up correctly (`CourseDetail`'s
  `useKeymap<'nav'>` with explicit `when`) get the same protection automatically.

### Negative

- New rule to add to CLAUDE.md §2: page-level keyboard hooks MUST consume the modal-stack
  signal (via `useStackAwareHotkeys` or `useKeymap`'s built-in gate).
- One-line addition for new sites; one-line fix for existing vulnerable sites.
- Behavior change for any site that _deliberately_ wanted to fire its handler over a
  modal — these need to opt out explicitly (`escapeStackGate: true` or stay on plain
  `useHotkeys`). Audit will surface any such sites; expect zero or very few.
- Modal primitive adds a `useId` + `useEffect` per mount. Negligible perf cost.

### Neutral

- Handwritten modals that haven't migrated to the primitive (the 5 deferred consumer
  modals: `EventFormModal`, `ImportConfirmationModal`, `SettingsModal`, `SyncConflictModal`,
  `ExportDialog`) won't participate until they migrate. Their underlying-page hotkeys will
  still leak when these modals are open. The opportunistic migration policy covers this —
  they migrate when their `.styles.ts` is otherwise touched. Until then, callers who
  notice leaks can manually call `useModalStack().push(id)` from inside the handwritten
  modal as a stopgap.

## Alternatives considered

### Migrate all `useHotkeys → useKeymap` with global flag

(The "option 2" in the FOLLOWUPS entry.) Consolidates onto one keyboard primitive. More
invasive — 15 files, 67 sites, and `useKeymap` doesn't have parity with all of
`react-hotkeys-hook`'s features (e.g. `enableOnFormTags`, sequence support). Rejected
because the consolidation cost outweighs the marginal cleanliness gain. The
`useStackAwareHotkeys` wrapper achieves the same stack-awareness goal without forcing the
migration.

### Per-site `gateState` callbacks (status quo)

Doesn't scale: every new modal/page pair re-derives the wiring, missing sites stay
vulnerable. The existing wiring in `CanvasUpdatesSection ↔ CourseDetail` would also be
deleted by this ADR's PR (replaced by the auto-pushed signal).

### Binary `isAnyOpen` only, defer topmost-modal awareness

Skip the `useModalHotkeys` hook and the `topmostId` tracking, relying on the
existing per-modal manual gates (`editingItem == null` in `DuplicateWarningModal`,
`closeOnEscape={false}` on parent + Y/N-only child in `TaskDetailModal`). Smaller
v1, faster ship. Rejected because the codebase already has three nested-modal
sites with hand-rolled gating, the additional design surface is ~50 lines, and the
status-quo policy means every new nested-modal site needs to remember the manual
pattern — same trap CanvasUpdatesSection's `gateState == null` was before this ADR.

### Topmost-modal awareness without help-menu integration

Add `useModalHotkeys` and `topmostId` but skip the `shortcuts` registration + help
menu wiring. Leaves the existing UX gap unresolved: pressing `?` while
`DuplicateWarningModal` is open shows CourseDetail's shortcuts, not the modal's
L/S/A/↑↓/Q/E interface. Rejected: ~30 of the additional 50 lines are the help-menu
wiring; deferring means we ship a structurally-correct gate while leaving the
"help is misleading when modals are open" issue open. The B+ design closes both
bug classes in one PR.

## Rationale

Three forces aligned to make this the right moment:

1. **All active-use modals are on the primitive.** ModalStackContext piggybacked onto the
   primitive captures the entire surface automatically. If half the modals were still
   handwritten, this PR would only solve half the problem.
2. **`useKeymap` already exposes the gating mechanism.** Its `when` callback is
   purpose-built; we just need a global signal to feed it.
3. **The bug class is real.** We've already shipped per-site fixes for two instances
   (PR #16 + #17). A third will surface eventually; the cost of a structural fix is
   roughly the cost of the _next_ per-site fix.

## Migration plan

1. **This PR:** introduce context + primitive integration + helper hook + default-gate
   `useKeymap`. Migrate `UnifiedTaskList`, `CoursesPage`, `CanvasUpdatesSection` (replacing
   local gate), and Dashboard cards.
2. **Opportunistic (per `feedback_opportunistic-migration`):** every remaining `useHotkeys`
   site migrates to `useStackAwareHotkeys` the next time its file is edited.
3. **DONE (2026-06-04)** — a CI fitness function flags new raw `useHotkeys`. Implemented as
   `tests/integration/no-raw-usehotkeys.test.ts` (a regex-based guard matching the project's
   two precedent fitness functions — `no-handwritten-modals` / `no-stray-high-zindex` — rather
   than a custom ESLint rule). It fails the suite if any file under `src/layers/l6-ui/**`
   imports `useHotkeys` as a VALUE from `react-hotkeys-hook` outside a tiny `why:`-justified
   allowlist (`useStackAwareHotkeys.ts` — the wrapper; `useAppShortcuts.ts` — the
   intentional-global `Mod+1..5`). Type-only imports are not flagged. See CLAUDE.md §2
   "Stack-aware hotkeys for page/modal keyboard (ADR-0006)".
