/**
 * Architectural fitness function: no bare (fallback-less) `var(--color-primary*)`
 * in L6 UI.
 *
 * `--color-primary` (and its `-dark` / `-bg` siblings) is NOT defined in
 * `theme.css` — the project's primary accent variable is `--color-navy`
 * (documented gotcha). A bare `var(--color-primary)` with no fallback is
 * therefore an *invalid* CSS value at runtime: the property silently falls
 * back to its inherited/initial value, so the element renders with NO accent
 * (e.g. the KeyboardShortcutsModal active tab had no highlight; the FilesPage
 * "content changed" button was white-on-transparent → invisible).
 *
 * This guard scans `src/layers/l6-ui/**\/*.{ts,tsx,css}` and FAILS if any file
 * references `--color-primary*` WITHOUT a fallback (i.e. the `var(...)` closes
 * immediately after the variable name, with no `, <fallback>`). After the
 * `--color-primary → --color-navy` sweep it is a hard-zero gate.
 *
 * Scope / deliberate limits:
 *  - The `var(--color-primary*, <fallback>)` *fallback* form is ALLOWED — it
 *    renders the fallback, so it is not the invisible-element bug this guard
 *    targets. A handful of those remain (Updates tints, ErrorBoundary) and are
 *    intentionally left; converting them is a cosmetic call, not a bug fix.
 *  - Comments are stripped first, so a doc-comment that *mentions* the bare
 *    form (like this reviewer note) does not trip the guard.
 *
 * Modelled on `tests/integration/no-stray-high-zindex.test.ts`.
 */

import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCAN_DIR = path.join(REPO_ROOT, 'src', 'layers', 'l6-ui');

// Bare `var(--color-primary)` / `var(--color-primary-dark)` etc. — the var name
// is immediately followed by `)`, with NO `, <fallback>`. The fallback form
// `var(--color-primary, #fff)` has a comma before the close paren and is NOT
// matched (and is intentionally allowed).
const BARE_COLOR_PRIMARY = /var\(\s*--color-primary[a-z-]*\s*\)/g;

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments (multi-line), incl. JSX {/* */} and CSS
    .replace(/\/\/[^\n]*/g, ''); // line comments
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
    } else if (/\.(ts|tsx|css)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

describe('no bare var(--color-primary*) in L6 UI', () => {
  it('every --color-primary reference has a fallback (bare form is invisible at runtime)', () => {
    const offenders: string[] = [];

    for (const file of walk(SCAN_DIR)) {
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      const matches = code.match(BARE_COLOR_PRIMARY);
      if (matches) {
        const rel = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
        offenders.push(`${rel}: ${[...new Set(matches)].join(', ')}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('the detector matches the bare form but not the fallback form (test of the test)', () => {
    expect('var(--color-primary)'.match(BARE_COLOR_PRIMARY)).not.toBeNull();
    expect('var(--color-primary-dark)'.match(BARE_COLOR_PRIMARY)).not.toBeNull();
    expect('var(--color-primary, #3b82f6)'.match(BARE_COLOR_PRIMARY)).toBeNull();
    expect('var(--color-primary-bg, #dbeafe)'.match(BARE_COLOR_PRIMARY)).toBeNull();
    expect('var(--color-navy)'.match(BARE_COLOR_PRIMARY)).toBeNull();
  });
});
