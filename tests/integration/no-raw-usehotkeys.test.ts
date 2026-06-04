/**
 * Architectural fitness function: no new raw `useHotkeys` in L6 UI (ADR-0006).
 *
 * ADR-0006 ("modal-stack-aware hotkey suppression") established that every
 * page/modal keyboard consumer MUST route through a modal-stack-aware wrapper —
 * `useStackAwareHotkeys` / `useModalHotkeys` (the sanctioned wrappers) or
 * `useKeymap` — so a keystroke never leaks past an open modal to the page
 * underneath. Plain `useHotkeys` from `react-hotkeys-hook` registers a
 * document-level listener with NO stack awareness; a new raw call re-opens the
 * keystroke-leak vulnerability class the ADR closed.
 *
 * This guard scans `src/layers/l6-ui/**\/*.{ts,tsx}` (excluding test files) and
 * FAILS if any file imports `useHotkeys` as a VALUE from `react-hotkeys-hook`
 * unless it is on the justified allowlist below (the two files that legitimately
 * call raw `useHotkeys`). It realizes ADR-0006's deferred "Migration plan" step 3
 * ("consider a CI lint rule that flags new `useHotkeys` outside the wrappers").
 *
 * Detector = the IMPORT, not the call site: the import is the single choke point
 * (renderer is ESM, no `require`), so gating the value import gates every call,
 * and it's far more robust than excluding comment/doc mentions of `useHotkeys(`.
 * A VALUE import is required — a type-only `import type { HotkeyCallback } from
 * 'react-hotkeys-hook'` (e.g. `useSectionScope.ts`) is harmless and NOT flagged,
 * which is why that file needs no allowlist entry.
 *
 * This is a pragmatic TRIPWIRE, not a proof — detection over completeness,
 * mirroring `no-handwritten-modals` / `no-stray-high-zindex`. Known false
 * NEGATIVES it deliberately does NOT catch (the human ADR-0006 reviewer-checklist
 * stays the backstop for these):
 *   - Re-export / alias MODULE: `export { useHotkeys as useKeys } from
 *     'react-hotkeys-hook'` then importing `useKeys` from THAT module — the
 *     second import isn't from `react-hotkeys-hook`, so it's invisible. (None today.)
 *     Note: the alias form via the package directly —
 *     `import { useHotkeys as raw } from 'react-hotkeys-hook'` — IS caught
 *     (`useHotkeys` is named before the `as`).
 *   - Namespace import: `import * as RHH from 'react-hotkeys-hook'; RHH.useHotkeys(...)`
 *     — the named-import scan won't see it. (None exist today; human-reviewer backstop.)
 *   - Dynamic import: `const { useHotkeys } = await import('react-hotkeys-hook')`
 *     — a static-`import … from` string scan won't match. (None exist; a renderer
 *     hook can't come from an async import anyway.)
 *   - Non-L6 import: a `react-hotkeys-hook` value import outside
 *     `src/layers/l6-ui/**` is out of scope (and would itself be a layering
 *     violation flagged elsewhere — the package has no business outside L6).
 *   - `require()` form: the CJS main process never imports this renderer-only
 *     package; not scanned.
 * Broadening the heuristic to catch these risks false positives, so we don't.
 *
 * Modelled on `tests/integration/no-stray-high-zindex.test.ts` (borrowed
 * `stripComments()` + `toPosixRelative()`) and
 * `tests/integration/no-handwritten-modals.test.ts` (allowlist-with-`why:` shape
 * + test-of-the-test).
 */

import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCAN_DIR = path.join(REPO_ROOT, 'src', 'layers', 'l6-ui');

// --- Detection heuristic ------------------------------------------------------
//
// Condition: an ES import statement that pulls `useHotkeys` as a VALUE from the
// package. The `(?!type\b)` negative lookahead after `import` excludes the
// whole-clause type-only form (`import type { … } from 'react-hotkeys-hook'`),
// and `\buseHotkeys\b` must appear in the clause so an inline mixed type-only
// import (`import { type HotkeyCallback } from …`) doesn't match.
//
// Matches:   import { useHotkeys } from 'react-hotkeys-hook';
//            import { useHotkeys, type Keys } from 'react-hotkeys-hook';
//            import { useHotkeys as raw } from "react-hotkeys-hook";
//            import {\n  useHotkeys,\n  type HotkeyCallback,\n} from 'react-hotkeys-hook';
// Does NOT match:
//            import type { HotkeyCallback } from 'react-hotkeys-hook';   // type-only clause
//            import { type HotkeyCallback } from 'react-hotkeys-hook';   // useHotkeys not named
//            import { isHotkeyPressed } from 'react-hotkeys-hook';       // different value
const USEHOTKEYS_VALUE_IMPORT =
  /import\s+(?!type\b)(?:[\s\S]*?\buseHotkeys\b[\s\S]*?)\bfrom\s+['"]react-hotkeys-hook['"]/;

/**
 * Files that legitimately call raw `useHotkeys` and are NOT page/modal consumers
 * that must route through the wrappers. Each entry MUST carry a one-line `why:` —
 * a silent ignore defeats the guard. Keep this list TINY; prefer routing a new
 * consumer through `useStackAwareHotkeys`/`useModalHotkeys`/`useKeymap` over
 * allowlisting it.
 */
const ALLOWLIST: ReadonlyArray<{ path: string; why: string }> = [
  {
    path: 'src/layers/l6-ui/hooks/useStackAwareHotkeys.ts',
    why:
      'The sanctioned wrapper — defines useStackAwareHotkeys + useModalHotkeys, ' +
      'which legitimately call raw useHotkeys internally with the ADR-0006 stack ' +
      'gate. This file IS the gate every other consumer routes through.',
  },
  {
    path: 'src/layers/l6-ui/hooks/useAppShortcuts.ts',
    why:
      'ADR-0006 intentional-global exemption — the Mod+1..5 page-nav must fire ' +
      'even over an open modal, so it deliberately uses raw useHotkeys, not the ' +
      'stack-gated wrapper.',
  },
];

/**
 * Strip comments so a doc-comment mentioning the `useHotkeys` import (e.g. the
 * `useStackAwareHotkeys` header's prose references, or this very heuristic quoted
 * in a header) doesn't trip the scan. Handles `//` line comments AND
 * `/* ... *\/` block comments (incl. the JSX `{/* ... *\/}` form, whose
 * continuation lines don't start with a comment marker). Pragmatic, not a full
 * parser — but an import statement never legitimately lives inside a string that
 * contains a comment delimiter. Block comments are removed first (multi-line),
 * then any remaining `//` to end-of-line. Ported from `no-stray-high-zindex`.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments (multi-line), incl. JSX {/* */}
    .replace(/\/\/[^\n]*/g, ''); // line comments
}

/** True if `source` contains a VALUE import of `useHotkeys` from react-hotkeys-hook. */
function hasRawUseHotkeysImport(source: string): boolean {
  const code = stripComments(source);
  // Non-global regex, so repeated `.test()` calls are safe (no lastIndex desync).
  return USEHOTKEYS_VALUE_IMPORT.test(code);
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

/** Build the multi-line failure message naming each offender + the fix target. */
function formatOffenders(offenders: string[]): string {
  const report = offenders.map((file) => `  ${file}`).join('\n');
  return (
    `Raw \`useHotkeys\` import(s) detected (ADR-0006 — page/modal keyboard ` +
    `consumers MUST route through the stack-aware wrappers):\n${report}\n\n` +
    `A file under src/layers/l6-ui/** imports \`useHotkeys\` directly from ` +
    `react-hotkeys-hook. Plain useHotkeys has NO modal-stack awareness — a ` +
    `keystroke leaks past an open modal to the page underneath. Route the ` +
    `consumer through useStackAwareHotkeys / useModalHotkeys ` +
    `(src/layers/l6-ui/hooks/useStackAwareHotkeys.ts) or useKeymap instead.\n` +
    `If this is a genuine ADR-0006 intentional-global exemption (like the ` +
    `Mod+1..5 page-nav in useAppShortcuts.ts), add it to the ALLOWLIST in this ` +
    `test with a one-line why:. See docs/adr/0006-modal-stack-aware-hotkey-suppression.md.`
  );
}

describe('ADR-0006 enforcement: no raw useHotkeys in L6 UI', () => {
  test('no value import of useHotkeys outside the sanctioned allowlist (hard zero)', () => {
    const allowed = new Set(ALLOWLIST.map((e) => e.path));
    const offenders: string[] = [];

    for (const abs of walk(SCAN_DIR)) {
      const source = fs.readFileSync(abs, 'utf8');
      if (!hasRawUseHotkeysImport(source)) continue;
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
  test('detector fires on a value import and ignores legitimate cases', () => {
    // POSITIVE — the canonical value import (a planted "new component" offender).
    expect(
      hasRawUseHotkeysImport(`import { useHotkeys } from 'react-hotkeys-hook';`)
    ).toBe(true);

    // POSITIVE — multi-line braces + a mixed value/type import.
    expect(
      hasRawUseHotkeysImport(
        `import {\n  useHotkeys,\n  type Keys,\n} from 'react-hotkeys-hook';`
      )
    ).toBe(true);

    // POSITIVE — double quotes + aliased-via-package (useHotkeys named before `as`).
    expect(
      hasRawUseHotkeysImport(`import { useHotkeys as raw } from "react-hotkeys-hook";`)
    ).toBe(true);

    // NEGATIVE (load-bearing) — the exact useSectionScope.ts shape: a whole-clause
    // type-only import. The `(?!type\b)` guard skips it, so it needs no allowlist.
    expect(
      hasRawUseHotkeysImport(`import type { HotkeyCallback } from 'react-hotkeys-hook';`)
    ).toBe(false);

    // NEGATIVE — inline mixed type-only import (no value binding named).
    expect(
      hasRawUseHotkeysImport(`import { type HotkeyCallback } from 'react-hotkeys-hook';`)
    ).toBe(false);

    // NEGATIVE — a different value import from the package (not useHotkeys).
    expect(
      hasRawUseHotkeysImport(`import { isHotkeyPressed } from 'react-hotkeys-hook';`)
    ).toBe(false);

    // NEGATIVE — the signature lives only inside a comment (comment-stripping works).
    expect(
      hasRawUseHotkeysImport(`/* import { useHotkeys } from 'react-hotkeys-hook' */`)
    ).toBe(false);

    // NEGATIVE — an import from an unrelated package.
    expect(hasRawUseHotkeysImport(`import { useState } from 'react';`)).toBe(false);

    // formatOffenders names the path AND points at the wrappers / ADR-0006.
    const msg = formatOffenders(['src/layers/l6-ui/components/Foo.tsx']);
    expect(msg).toContain('src/layers/l6-ui/components/Foo.tsx');
    expect(msg).toContain('useStackAwareHotkeys');
    expect(msg).toContain('0006');
  });

  // Planted-offender: prove an allowlist-aware filter would SURFACE a new raw
  // site (i.e. the suite goes red on a real regression), without writing a brittle
  // temp file into the scanned tree.
  test('a planted new raw site is surfaced as an offender', () => {
    const allowed = new Set(ALLOWLIST.map((e) => e.path));
    const plantedPath = 'src/layers/l6-ui/components/NewlyAddedThing.tsx';
    const plantedSource = `import { useHotkeys } from 'react-hotkeys-hook';\nexport const x = 1;`;

    const offenders: string[] = [];
    if (hasRawUseHotkeysImport(plantedSource) && !allowed.has(plantedPath)) {
      offenders.push(plantedPath);
    }
    expect(offenders).toEqual([plantedPath]);
  });

  // Sanity: the allowlist stays honest — every entry carries a non-empty why:.
  test('every allowlist entry carries a why:', () => {
    for (const entry of ALLOWLIST) {
      expect(entry.why.trim().length).toBeGreaterThan(0);
    }
  });
});
