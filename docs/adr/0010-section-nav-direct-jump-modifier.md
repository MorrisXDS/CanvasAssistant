# 0010 — Section-navigation direct-jump modifier (uniform Alt+1..N)

Status: Accepted

## Context

Several pages in CID have two or more in-page **sections** the user can move focus
between:

- **CourseDetail** — tasks / queue / announcements / preferences.
- **Calendar** — calendar grid (events) / filter panel.
- **CoursesPage** — courses grid / filter panel.

Today only CourseDetail has any keyboard section navigation, and it is non-uniform:

- It cycles with `Q` (backward) / `E` (forward), with **no visual indicator** of which
  section is active or how many there are.
- It carries a surprising override — `E` is **blocked while the tasks section is active**,
  because the tasks section already binds `E` to "edit task". A user pressing `E` to cycle
  forward in tasks gets nothing, with no on-screen explanation.
- There is no direct-jump ("go to section N") affordance at all.

We want a single, uniform in-page section-navigation scheme across every page that has
sections, including a discoverable visual indicator. The open design question is which
modifier the direct-jump ("jump straight to section N") chord should use.

Constraints on the modifier:

- `Mod+1..5` (Cmd/Ctrl) is already taken for **global page navigation** (`useAppShortcuts`).
- `Alt+<letter>` is already the established **same-scope disambiguation** family
  (CourseDetail's edit/prefs field-jumps). `Alt+<digit>` is the natural sibling for
  "jump to the Nth section".
- The one collision: **Calendar already binds `Alt+1-9`** to toggle a course filter by
  index (`Calendar/index.tsx`, raw `document` keydown listener).

## Decision

1. **In-page section direct-jump uses `Alt+1..N`, UNIFORM on every page including
   Calendar.** Same chord, same meaning, everywhere — consistent muscle memory.
2. **Slots follow AVAILABLE sections only** (1-based index among currently-available
   sections). An unavailable section gets no slot and is omitted from the indicator. As
   availability changes, the slot numbers re-pack so `Alt+1..N` always maps densely onto
   what is actually on screen.
3. **Calendar's existing `Alt+1-9` course-filter toggle moves to `Alt+Shift+1-9`** to free
   `Alt+1-9` for section jump. **(Planned for Phase 2; NOT done in the foundation PR.)**
4. The foundation hook `useSectionScope` exposes an `enableDirectJump` option (**default
   `true`**) purely as a flexibility escape hatch. The decided scheme passes `true`
   everywhere; the flag exists so a page with an unavoidable conflict can opt out without
   forking the hook.
5. **`Q` (backward) / `E` (forward) cycle remains.** A page may suppress the hook's `E`
   while a named section is active (`suppressForwardCycleInSection`) when that section owns
   `E` for its own purpose (CourseDetail's tasks section = edit). `Q` is never suppressed.
   The suppression is implemented by toggling the `E` binding's `enabled` flag, so it
   composes cleanly with the page's own `E` handler and with ADR-0006 modal-stack gating.

## Consequences

### Positive

- Consistent section-navigation muscle memory across every page that has sections.
- The `SectionBar` indicator removes the discoverability gap of the suppressed `E` — the
  user can see the available sections, the active one, and the `Alt+<N>` slot for each.
- The hook inherits ADR-0006 modal-stack gating for free (it registers Q/E/Alt+N via
  `useStackAwareHotkeys`), so section nav never fires while a modal is open.

### Negative

- Calendar users must relearn the course-filter chord (`Alt+1-9` → `Alt+Shift+1-9`). This
  is a one-time relearn, documented in the CHANGELOG and the help modal at Phase 2.
- The foundation PR ships a hook + primitive + help-modal plumbing that nothing consumes
  yet (a true no-op until pages are migrated in later phases).

### Neutral

- Phase 0 (this foundation PR) is a no-op: no page imports the hook or the primitive, and
  the Calendar `Alt+1-9` listener is left untouched. The ADR documents the **target**
  scheme that the later phases implement.

## Alternatives considered

### Calendar opt-out (`enableDirectJump: false` on Calendar)

The research originally proposed exempting Calendar from `Alt+1..N` direct-jump because of
its `Alt+1-9` filter collision, keeping the filter chord as-is. **Rejected by the user**,
who wanted full uniformity. The `enableDirectJump` flag survives as a per-page escape
hatch but the decided scheme uses `true` everywhere, with Calendar's filter rebound to
`Alt+Shift+1-9` instead.

### `Mod+Alt+1..N` three-key chord

A three-key chord avoids every existing collision outright but imposes a real cognitive and
ergonomic cost for an action meant to be fast and frequent. Rejected.

### `Shift+1..N` punctuation

`Shift+1` is `!`, `Shift+2` is `@`, etc. — a form-field hazard (typing punctuation would
jump sections) and undiscoverable as a "section N" affordance. Rejected.

## Note

Phase 0 is a no-op foundation: it ships `useSectionScope`, the `SectionBar` primitive, the
`activeSections` extension to `KeyboardScopeContext`, and the help-modal "This page's
sections" block — but wires none of them into a page and does not touch the Calendar
`Alt+1-9` listener. This ADR documents the target scheme that Phases 1–4 implement; the
Calendar `Alt+1-9` → `Alt+Shift+1-9` rebind lands in Phase 2.

**Status flipped to Accepted (2026-06-03):** the target scheme is now the realized scheme,
implemented across all three sectioned pages. Landed phases: foundation #112 (no-op hook +
primitive); CourseDetail #113 (persistent sections); Calendar #114 (toggle-filter + bridge,
with the `Alt+1-9` → `Alt+Shift+1-9` course-filter rebind); CoursesPage (this PR — toggle-
filter + bridge, `enableDirectJump: true` with no rebind needed). The §2 "Section navigation
for multi-section pages" invariant in CLAUDE.md codifies the pattern for new pages.
