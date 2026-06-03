/**
 * CI guard against new handwritten modals (CLAUDE.md §2 "Use the Modal primitive
 * for all dialogs").
 *
 * Architectural fitness function: NO file under
 * `src/layers/l6-ui/components/**` may introduce the handwritten full-screen
 * modal-backdrop signature — a `position: 'fixed'` element filled with a
 * black `rgba(0, 0, 0, α)` scrim (α >= 0.3) — without being on the justified
 * allowlist below. Every dialog MUST instead use the shared `<Modal>` primitive
 * (`src/layers/l6-ui/components/primitives/Modal.tsx`), which owns the canonical
 * backdrop, escape handling, body-scroll-lock, sizing, and z-index stacking.
 *
 * This is a pragmatic TRIPWIRE, not a proof — detection over completeness. It
 * targets the exact documented anti-pattern signature. Known false NEGATIVES
 * it deliberately does NOT catch (the human §2 reviewer-checklist line stays the
 * backstop for these):
 *   - a backdrop using a non-black rgba, a hex+opacity, or a CSS variable,
 *   - `inset: 0` without a literal `position: 'fixed'`,
 *   - a class-based / Tailwind overlay.
 * Broadening the heuristic to catch these risks false positives, so we don't.
 *
 * Modelled directly on `tests/integration/ipc-handlers-no-raw-sql.test.ts`
 * (recursive `walk()`, no glob dependency, formatted-offender throw).
 */

import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const COMPONENTS_DIR = path.join(REPO_ROOT, 'src', 'layers', 'l6-ui', 'components');
const MODAL_PRIMITIVE = 'src/layers/l6-ui/components/primitives/Modal.tsx';

// --- Detection heuristic (the two load-bearing cues) -------------------------
//
// Condition 1: fixed positioning present anywhere in the file.
const FIXED_POS = /position\s*:\s*['"]fixed['"]/;
//
// Condition 2: a scrim-alpha black backdrop FILL — `background`/`backgroundColor`
// set to `rgba(0, 0, 0, α)` with α >= 0.3. The alpha floor is the single cheap
// discriminator that excludes every false-positive surface in the tree:
//   - low-alpha hover tints (TitleBar 0.05, ColorPicker 0.2 swatch overlay),
//   - shadows / borders / text-shadows (property isn't `background`).
// Both genuine handwritten backdrops AND the <Modal> primitive sit at 0.5.
const BLACK_BACKDROP =
  /\bbackground(Color)?\s*:\s*['"]?\s*rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*(?:0?\.[3-9]\d*|[1-9]\d*(?:\.\d+)?)\s*\)/i;

/**
 * Files that legitimately contain a fixed-position black backdrop and are NOT
 * handwritten dialogs that must use the <Modal> primitive. Each entry MUST carry
 * a one-line `why:` — a silent ignore defeats the guard. Keep this list TINY;
 * prefer migrating a real modal to the primitive over allowlisting it.
 */
const ALLOWLIST: ReadonlyArray<{ path: string; why: string }> = [
  {
    path: MODAL_PRIMITIVE,
    why: 'The Modal primitive itself — it owns the backdrop fill every dialog must reuse.',
  },
];

/**
 * Drop whole-line comments before scanning so a doc-comment that *mentions* the
 * pattern (e.g. a reviewer note, or this very heuristic quoted in a header)
 * doesn't trip the detector. Pragmatic line-prefix stripping, not a full parser
 * — block comments are rare in style/component files and the realistic cases
 * (`//`, `*`, `/*` line starts) are covered.
 */
function stripLineComments(src: string): string {
  return src
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart();
      return !(
        trimmed.startsWith('//') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('/*')
      );
    })
    .join('\n');
}

/** True if `source` contains the handwritten full-screen black backdrop signature. */
function hasHandwrittenBackdrop(source: string): boolean {
  const code = stripLineComments(source);
  // FIXED_POS / BLACK_BACKDROP are non-global, so repeated `.test()` calls are safe.
  return FIXED_POS.test(code) && BLACK_BACKDROP.test(code);
}

/** Build the multi-line failure message naming each offender + the fix target. */
function formatOffenders(offenders: string[]): string {
  const report = offenders.map((file) => `  ${file}`).join('\n');
  return (
    `Handwritten modal backdrop(s) detected (CLAUDE.md §2 — all dialogs MUST use the <Modal> primitive):\n${report}\n\n` +
    `A file under src/layers/l6-ui/components/** contains a fixed-position ` +
    `black rgba(0,0,0,α>=0.3) backdrop. Migrate the dialog to the shared ` +
    `<Modal> primitive (${MODAL_PRIMITIVE}) with its Modal.Header / Modal.Content / ` +
    `Modal.Footer slots — the primitive owns the backdrop, escape handling, ` +
    `scroll-lock, sizing, and z-index. If this is a legitimate non-dialog ` +
    `full-screen scrim, add it to the ALLOWLIST in this test with a one-line why:.`
  );
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))
    ) {
      // Both .ts AND .tsx: the backdrops live in `.styles.ts` files while the
      // JSX that renders them lives in sibling `.tsx` files. Catching the style
      // file is sufficient to block the PR.
      out.push(full);
    }
  }
  return out;
}

function toPosixRelative(absPath: string): string {
  return path.relative(REPO_ROOT, absPath).split(path.sep).join('/');
}

describe('CLAUDE.md §2 enforcement: no handwritten modal backdrops', () => {
  test('no fixed-position black backdrop outside the <Modal> primitive', () => {
    const allowed = new Set(ALLOWLIST.map((e) => e.path));
    const offenders: string[] = [];

    for (const abs of walk(COMPONENTS_DIR)) {
      const source = fs.readFileSync(abs, 'utf8');
      if (!hasHandwrittenBackdrop(source)) continue;
      const rel = toPosixRelative(abs);
      if (!allowed.has(rel)) {
        offenders.push(rel);
      }
    }

    if (offenders.length > 0) {
      throw new Error(formatOffenders(offenders));
    }
  });

  // --- Test-of-the-test: exercise the pure detector + formatter directly so the
  // guard's own logic stays meaningful (and diff-covered) even when the tree is
  // clean and no real offender exists.
  test('detector + formatter behave correctly on synthetic sources', () => {
    // POSITIVE: the canonical handwritten backdrop signature.
    expect(
      hasHandwrittenBackdrop(
        `const s = { overlay: { position: 'fixed', backgroundColor: 'rgba(0,0,0,0.5)' } };`
      )
    ).toBe(true);

    // POSITIVE variant: double-quoted fixed + `background` + `.4` shorthand + spaces.
    expect(
      hasHandwrittenBackdrop(
        `const s = { o: { position: "fixed", background: 'rgba(0, 0, 0, .4)' } };`
      )
    ).toBe(true);

    // NEGATIVE: fixed + only a boxShadow rgba (shadow != backdrop — Sidebar/FAB/layout case).
    expect(
      hasHandwrittenBackdrop(
        `const s = { bar: { position: 'fixed', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' } };`
      )
    ).toBe(false);

    // NEGATIVE: fixed + low-alpha background tint (TitleBar 0.05 — proves the alpha floor).
    expect(
      hasHandwrittenBackdrop(
        `const s = { btn: { position: 'fixed', backgroundColor: 'rgba(0,0,0,0.05)' } };`
      )
    ).toBe(false);

    // NEGATIVE: black backdrop but NOT fixed (absolute — proves condition 1).
    expect(
      hasHandwrittenBackdrop(
        `const s = { o: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.5)' } };`
      )
    ).toBe(false);

    // NEGATIVE: the signature lives only inside a comment (comment-stripping works).
    expect(
      hasHandwrittenBackdrop(
        `// position: 'fixed' with backgroundColor: 'rgba(0,0,0,0.5)' backdrop\nconst s = {};`
      )
    ).toBe(false);

    // formatOffenders names the path AND points at the <Modal> primitive.
    const msg = formatOffenders(['src/layers/l6-ui/components/foo/Bar.tsx']);
    expect(msg).toContain('src/layers/l6-ui/components/foo/Bar.tsx');
    expect(msg).toContain(MODAL_PRIMITIVE);
  });

  // Sanity: the allowlist stays honest — every entry carries a non-empty why:.
  test('every allowlist entry carries a why:', () => {
    for (const entry of ALLOWLIST) {
      expect(entry.why.trim().length).toBeGreaterThan(0);
    }
  });
});
