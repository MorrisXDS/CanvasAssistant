/**
 * sync-current-term.spec.ts
 *
 * Tests that a course can be pulled from Canvas (mocked) and classified as
 * "current" through the real auto-term predicate. Runs under the `sync`
 * Playwright project ONLY (`--project sync`), NOT in the default 40-spec suite.
 *
 * Requires env vars CID_E2E_MOCK_CANVAS=current-term-sync (mock serves Canvas
 * endpoints) and CID_E2E_SEED=current-term (seed uses the current-term variant
 * with term_selection='auto'). Set at module scope below so the caller just
 * runs:
 *   npx playwright test --config e2e/playwright.config.ts --project sync
 */

// Set env BEFORE any fixture import — the fixture chain reads these at
// mock-startup and seed-time, both of which happen during the `electronApp`
// fixture's setup (before any test body runs).
process.env.CID_E2E_MOCK_CANVAS = 'current-term-sync';
process.env.CID_E2E_SEED = 'current-term';

import { test, expect } from './fixtures/app';

test('pulls a mock Canvas course and classifies it as current via extended term', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const api = (
      window as unknown as {
        api: {
          syncCourses: () => Promise<{
            success: boolean;
            result?: {
              success: boolean;
              entity: string;
              count: number;
              errors: string[];
            };
            error?: string;
          }>;
          getCourses: () => Promise<Array<{ code: string; name: string }>>;
          getEnrollmentTerms: () => Promise<Array<{ name: string; endAt?: string }>>;
        };
      }
    ).api;

    const sync = await api.syncCourses();
    const terms = await api.getEnrollmentTerms();
    return { sync, terms };
  });

  expect(result.sync.success).toBe(true);
  expect(result.sync.result?.success).toBe(true);
  expect(result.sync.result?.entity).toBe('courses');
  expect(result.sync.result?.count).toBe(1);
  expect(result.sync.result?.errors).toEqual([]);

  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const api = (
            window as unknown as {
              api: { getCourses: () => Promise<Array<{ code: string; name: string }>> };
            }
          ).api;
          return (await api.getCourses()).map((c) => c.code);
        }),
      { timeout: 7000 }
    )
    .toContain('E2ESYNC');
  expect(result.terms.map((t) => t.name)).toContain('E2E Extended Current Term');
});
