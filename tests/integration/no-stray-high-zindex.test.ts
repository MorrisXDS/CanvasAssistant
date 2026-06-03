/**
 * Architectural fitness function: no stray high z-index literals in L6 UI.
 *
 * After the `Z_INDEX` centralization, every modal-tier stacking value
 * (>= `Z_INDEX.modal` === 1100) MUST be referenced through the `Z_INDEX`
 * constant — never written as a raw literal. A raw `zIndex: 9999` /
 * `zIndex={1100}` re-introduces the occlusion-bug class this PR fixed (an
 * element that can paint over a modal, including the always-on-top Help).
 *
 * This guard scans `src/layers/l6-ui/**\/*.{ts,tsx}` (excluding `zIndex.ts`
 * itself and test files) and FAILS if any raw `zIndex` literal >= 1100 exists.
 * After this PR it is a hard-zero gate — every such literal was converted to
 * `Z_INDEX.*`.
 *
 * Scope / known limits (deliberate, mirrors the ADR-0007 `no-raw-sql` guard):
 *  - Only `.ts`/`.tsx` are scanned. `.css` / `*.module.css` z-indexes cannot
 *    import a TS const and are excluded; they are all sub-modal anyway.
 *  - Sub-1100 in-grid / in-component literals (`1/2/10/19/20/40/99/100`/etc.)
 *    are intentionally LEFT as literals (the migration cut line) and are NOT
 *    flagged — they never approach the modal tier.
 *  - Comments are stripped before scanning, so a doc-comment that *mentions*
 *    `zIndex={1100}` (e.g. a reviewer note) does not trip the guard.
 *
 * Modelled on `tests/integration/ipc-handlers-no-raw-sql.test.ts`.
 */

import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCAN_DIR = path.join(REPO_ROOT, 'src', 'layers', 'l6-ui');

// The centralized scale module itself is allowed to contain the literals.
const MODULE_PATH = path.join(SCAN_DIR, 'constants', 'zIndex.ts');

// The modal-tier floor. Anything at or above this MUST go through `Z_INDEX.*`.
const MODAL_TIER_FLOOR = 1100;

// Matches `zIndex: 9999` (style object) and `zIndex={1100}` (JSX prop).
const ZINDEX_LITERAL = /zIndex\s*[:=]\s*\{?\s*(\d+)\s*\}?/g;

/**
 * Strip comments so a doc-comment mentioning `zIndex={1100}` doesn't trip the
 * scan. Handles `//` line comments AND `/* ... *​/` block comments (incl. the
 * JSX `{/* ... *​/}` form, whose continuation lines don't start with a comment
 * marker). Pragmatic, not a full parser — but covers the realistic cases:
 * z-index literals never legitimately live inside a string that contains a
 * comment delimiter. Block comments are removed first (multi-line), then any
 * remaining `//` to end-of-line.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments (multi-line), incl. JSX {/* */}
    .replace(/\/\/[^\n]*/g, ''); // line comments
}

/** All raw `zIndex` literals >= MODAL_TIER_FLOOR found in (comment-stripped) source. */
function findStrayZIndexLiterals(source: string): number[] {
  const code = stripComments(source);
  const found: number[] = [];
  // Fresh regex per call so `.lastIndex` never desyncs across files.
  const re = new RegExp(ZINDEX_LITERAL.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const value = Number(m[1]);
    if (value >= MODAL_TIER_FLOOR) found.push(value);
  }
  return found;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx')
    ) {
      out.push(full);
    }
  }
  return out;
}

function toPosixRelative(absPath: string): string {
  return path.relative(REPO_ROOT, absPath).split(path.sep).join('/');
}

function formatOffenders(offenders: Array<{ file: string; values: number[] }>): string {
  const report = offenders.map((o) => `  ${o.file}: ${o.values.join(', ')}`).join('\n');
  return (
    `Stray raw z-index literal(s) >= ${MODAL_TIER_FLOOR} found in L6 UI:\n${report}\n\n` +
    `Modal-tier and above MUST go through the Z_INDEX constant ` +
    `(src/layers/l6-ui/constants/zIndex.ts), never a raw literal — a raw high ` +
    `z-index can paint over a modal (incl. the always-on-top Help).\n` +
    `Replace with Z_INDEX.modal / .modalChild / .titleBar / .infoTrigger / .help.`
  );
}

describe('no stray high z-index literals in L6 UI', () => {
  test('every zIndex literal >= 1100 goes through Z_INDEX (hard zero)', () => {
    const offenders: Array<{ file: string; values: number[] }> = [];
    for (const abs of walk(SCAN_DIR)) {
      if (abs === MODULE_PATH) continue; // the scale module is the source of truth
      const text = fs.readFileSync(abs, 'utf8');
      const values = findStrayZIndexLiterals(text);
      if (values.length > 0) {
        offenders.push({ file: toPosixRelative(abs), values });
      }
    }

    if (offenders.length > 0) {
      throw new Error(formatOffenders(offenders));
    }
  });

  // Test-of-the-test: the detector + formatter exercised on synthetic strings,
  // independent of the live tree, so the guard's own logic stays covered and
  // meaningful even when the repo is clean.
  test('detector catches a planted stray and ignores legitimate cases', () => {
    // POSITIVE — style-object literal (the ImportantWorksFilter `10000` case).
    expect(findStrayZIndexLiterals(`tooltip: { zIndex: 9999 }`)).toEqual([9999]);
    // POSITIVE — JSX prop literal (a `<Modal zIndex={1100}>` regression).
    expect(findStrayZIndexLiterals(`<Modal zIndex={1100}>`)).toEqual([1100]);
    // POSITIVE — exactly at the floor and the old strays.
    expect(findStrayZIndexLiterals(`zIndex: 10000`)).toEqual([10000]);

    // NEGATIVE — sub-modal literals are left as-is (the cut line).
    expect(findStrayZIndexLiterals(`zIndex: 100`)).toEqual([]);
    expect(findStrayZIndexLiterals(`zIndex={20}`)).toEqual([]);
    expect(findStrayZIndexLiterals(`zIndex: 1`)).toEqual([]);

    // NEGATIVE — going through the constant is invisible to the literal scan.
    expect(findStrayZIndexLiterals(`zIndex: Z_INDEX.modal`)).toEqual([]);
    expect(findStrayZIndexLiterals(`<Modal zIndex={Z_INDEX.help}>`)).toEqual([]);

    // NEGATIVE — a comment mentioning the literal must NOT trip the guard
    // (the TaskDetailModal / DuplicateWarningModal / ExportDialog doc-comment case).
    expect(findStrayZIndexLiterals(`// ConfirmDialog uses zIndex={1100} here`)).toEqual(
      []
    );
    // Trailing `//` comment on a code line is stripped, code is still scanned.
    expect(findStrayZIndexLiterals(`zIndex: 100, // not zIndex={9999}`)).toEqual([]);
    // Multi-line JSX block comment — the exact DuplicateWarningModal shape whose
    // CONTINUATION line carries the literal and does NOT start with a comment marker.
    expect(
      findStrayZIndexLiterals(
        `{/* Child modal — opened from Customize.\n` +
          `   Layered above the parent via zIndex=1200 (parent uses 1100). */}\n` +
          `<Modal zIndex={Z_INDEX.modalChild}>`
      )
    ).toEqual([]);

    // formatOffenders includes the path AND points at the Z_INDEX module.
    const msg = formatOffenders([
      { file: 'src/layers/l6-ui/components/Foo.tsx', values: [9999] },
    ]);
    expect(msg).toContain('src/layers/l6-ui/components/Foo.tsx');
    expect(msg).toContain('9999');
    expect(msg).toContain('Z_INDEX');
  });
});
