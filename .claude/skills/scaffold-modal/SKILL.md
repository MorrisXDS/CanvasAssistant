---
name: scaffold-modal
description: Generate a new modal/dialog component that uses the shared `<Modal>` primitive correctly per `CLAUDE.md` §2 "Use the Modal primitive for all dialogs". Stops at the design phase to confirm shape (compact prompt vs sectioned content modal), then writes the file with the right `Modal.Header` / `Modal.Content` / `Modal.Footer` composition, z-index, and Esc handling. Use when the user says "scaffold a modal", "create a new dialog", "new modal component", or asks to add any new dialog UI.
---

# Scaffold modal

Bootstrap a new modal component using the `<Modal>` primitive at
`src/layers/l6-ui/components/primitives/Modal.tsx`. Eliminates the
"every new modal handwrites its own backdrop/dialog/footer with inline
styles" anti-pattern that produced the flexbox-shrink / clipped-button
bug class we just spent a PR fixing.

## When to use

- Adding any new modal / dialog / confirmation prompt UI.
- The user says any of the trigger phrases.

## Do not use when

- Modifying an existing modal (just edit it; don't scaffold a new one).
- The "modal" is actually a tooltip, popover, or inline expander — those
  aren't modals.

## Decide the shape first

Two patterns, pick one before writing code:

### Pattern A — Sectioned content modal

Use when the modal has clear header + scrollable body + action footer
structure (e.g. `DuplicateWarningModal`, a settings panel, a multi-step
form). The dividers between sections HELP visually organize content.

```tsx
<Modal isOpen onClose={onCancel} size="lg" zIndex={1100} closeOnEscape={false}>
  <Modal.Header
    title="..."
    subtitle="..."
    icon={<SomeIcon size={20} />}
    onClose={onCancel}
  />
  <Modal.Content>{/* body — scrolls if taller than viewport */}</Modal.Content>
  <Modal.Footer align="end">
    <button onClick={onCancel}>Cancel</button>
    <button onClick={onConfirm}>Confirm</button>
  </Modal.Footer>
</Modal>
```

### Pattern B — Compact prompt (no internal dividers)

Use when the modal is a tight confirmation / alert / single-question
prompt (e.g. `ConfirmDialog`). The `Modal.Header` / `Modal.Footer`
dividers look heavy here — skip them, render as a single padded block.

```tsx
<Modal isOpen onClose={onCancel} size="md" zIndex={1100} closeOnEscape={false}>
  <div style={{ padding: '24px' }}>
    {/* icon */}
    <div style={iconCircleStyle}>{icon}</div>
    {/* title + message */}
    <h3>{title}</h3>
    <p>{message}</p>
    {/* actions */}
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
      <button onClick={onCancel}>Cancel</button>
      <button onClick={onConfirm}>Confirm</button>
    </div>
  </div>
</Modal>
```

## Rules — never skip

- **`var(--color-primary)` does NOT exist.** Use `var(--color-navy)` for
  primary CTAs, `var(--color-error)` for danger. Other defined colors:
  `--color-info`, `--color-success`, `--color-warning`, `--color-critical`,
  `--color-high`, `--color-medium`, `--color-low` (each with a `*-bg`
  light tint variant).
- **z-index stacking:** if your modal can layer above another modal,
  give it a higher `zIndex` (existing layering: ConfirmDialog 1100,
  DuplicateWarningModal 1100, Customize child 1200). Increment by 100.
- **Esc handling:** if you want to stack on top of another modal and
  have Esc dismiss only YOUR modal, pass `closeOnEscape={false}` to the
  primitive and add a capture-phase listener with
  `e.stopPropagation()`. See `ConfirmDialog.tsx` for the pattern.
- **Don't put `flex: 1 0 100%` siblings inside `Modal.Footer`.** The
  primitive's footer is `flexWrap: wrap` — a 100%-basis sibling forces
  buttons to a new row and they can get clipped at certain widths.
  Either put the auxiliary content (e.g. a keyboard hint bar) OUTSIDE
  the footer (as a sibling of `Modal.Content`/`Modal.Footer`), or use
  a manual right-aligned footer div with `text-align: right`.
- **NEVER write a backdrop yourself.** No `position: 'fixed' + rgba(0,0,0,0.5)`
  — that's the anti-pattern that triggers gitleaks-style review flags
  and re-derives bugs we already solved.

## Steps

1. **Ask the user** which pattern (A vs B) unless it's obvious from
   the request.
2. **Confirm location**: `src/layers/l6-ui/components/<Section>/<Name>.tsx`.
3. **Write the file** with the template above filled in for the
   specific props/state.
4. **Wire it into the parent** that renders it (open/close state +
   `<NewModal isOpen={...} onClose={...} />`).
5. **Build** to confirm no compile errors.
6. **Tell the user how to manually verify** (open the modal via UI,
   confirm header/body/footer render, Esc/backdrop close, Enter
   confirms if applicable).
