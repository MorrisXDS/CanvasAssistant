/**
 * skipGuard.reporter.ts — fail the e2e run if any test SKIPS unexpectedly.
 *
 * After the deterministic seed (ADR-0011) every entity is guaranteed present, so
 * the suite must run with ZERO skips. Any `test.skip(...)` that fires (a future
 * seed-coverage erosion, or a stray skip someone adds) makes the run RED with a
 * clear message naming each skipped test + its location. This is the regression
 * net that stops seed-driven coverage from silently eroding.
 *
 * Preferred over globalTeardown because a reporter receives per-test results
 * (status + location), so it can print exactly which spec skipped and allow-list
 * legitimately environment-gated ones. The allow-list is empty by design — the
 * whole point is 0 skips. To add an entry, mirror the `no-raw-usehotkeys`
 * allow-list pattern: a `{ titlePath, why }` with a justification.
 */
import type {
  Reporter,
  TestCase,
  TestResult,
  FullResult,
} from '@playwright/test/reporter';

interface AllowEntry {
  /** Substring matched against the test's full title (describe › test). */
  titleContains: string;
  /** Justification — why this skip is legitimately allowed. */
  why: string;
}

// Intentionally empty: the deterministic seed guarantees every entity, so no
// data-tolerant skips remain. Add an entry ONLY for a genuinely environment-gated
// skip, with a why:.
const ALLOW_LIST: AllowEntry[] = [];

export default class SkipGuardReporter implements Reporter {
  private readonly skipped: Array<{ title: string; location: string }> = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status !== 'skipped') return;
    const title = test.titlePath().filter(Boolean).join(' › ');
    const loc = `${test.location.file}:${test.location.line}`;
    this.skipped.push({ title, location: loc });
  }

  async onEnd(result: FullResult): Promise<{ status: FullResult['status'] } | void> {
    const unexpected = this.skipped.filter(
      (s) => !ALLOW_LIST.some((a) => s.title.includes(a.titleContains))
    );
    if (unexpected.length === 0) {
      // eslint-disable-next-line no-console -- reporter user-facing output
      console.log('\n[skip-guard] OK — 0 unexpected skips.');
      return;
    }

    console.error(
      `\n[skip-guard] FAIL — ${unexpected.length} unexpected skip(s):\n` +
        unexpected.map((s) => `  • ${s.title}\n      at ${s.location}`).join('\n') +
        `\n\nThe deterministic seed (ADR-0011) should make every entity present, so the\n` +
        `suite must run with 0 skips. Either restore the seeded data the spec needs, or\n` +
        `add a justified entry to ALLOW_LIST in e2e/skipGuard.reporter.ts.`
    );
    // Force the overall run to fail even if every executed test passed.
    return { status: result.status === 'passed' ? 'failed' : result.status };
  }
}
