/**
 * Centralized z-index scale for all L6 UI stacking.
 *
 * INVARIANT: base < raised < elevated < stickyHeader < sidebar < overlayChrome
 *            < modal < modalChild < titleBar < infoTrigger < help
 * Nothing non-modal may sit at/above `modal` — with ONE deliberate exception:
 * `titleBar` (window chrome must stay grabbable above modals). Nothing may sit
 * above `help` (the always-on-top ceiling).
 *
 * Bands are spaced so new layers can slot between without a global renumber.
 * Values are plain numbers passed to `style.zIndex` or `<Modal zIndex>`.
 */
export const Z_INDEX = {
  // --- in-page content stacking (single stacking context, low values) ---
  base: 1, // default stacked card/cell (CourseGridCard, CourseListItem, calendar event default)
  raised: 10, // hovered/focused calendar event, dashboard section header, dock collapsed
  elevated: 20, // focused calendar event, sticky-ish in-grid layers
  stickyHeader: 100, // sticky table/grid headers, in-page dropdown menus, settings dock/rows

  // --- app chrome (above page content, below the sidebar/overlays) ---
  sidebar: 500, // left sidebar + its profile dropdown
  overlayChrome: 1000, // FABs, toasts, banners, context menus, color-picker popup, course-detail sticky bar, dropdowns, tooltips, first-run overlay

  // --- modal tier (UNCHANGED from the modal-cleanup convention) ---
  modal: 1100, // standard modals / dialogs (ConfirmDialog, ReAuthModal, SettingsModal, …)
  modalChild: 1200, // a modal stacked above a parent modal (ExportDialog child, DuplicateWarningModal child)
  titleBar: 1300, // window chrome — must stay grabbable above modals; below infoTrigger/help
  infoTrigger: 1400, // InfoTrigger's click-to-open detail MODAL
  help: 1500, // KeyboardShortcuts / Help — always-on-top, the ceiling
} as const;

export type ZIndexBand = keyof typeof Z_INDEX;
