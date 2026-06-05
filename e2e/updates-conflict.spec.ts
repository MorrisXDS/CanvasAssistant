/**
 * Updates-page conflict surface (nice-to-have, Batch 3).
 *
 * The SyncConflictModal is disabled (Layout.tsx) — the ONLY observable conflict
 * UI is the `ConflictItem` rendered in the Updates page's "needs review" column,
 * fed by `sync_updates` rows with entity_type='conflict' AND resolved_at IS NULL
 * (NOT pending_sync_conflicts, which only surfaces during a live sync).
 *
 * The deterministic seed (ADR-0011) inserts exactly ONE such conflict row on
 * Course A (external_id 'E2E_CONFLICT_1', conflict_field 'dueAt', old/new value
 * JSON dates). This spec asserts the ConflictItem renders that conflict with its
 * Local-vs-Canvas values and the resolve controls present.
 *
 * Isolation: conflicts are grouped into `needsReviewByCourse[].conflicts` and do
 * NOT enter `flatActionTasks` (the `updates-page` keyboard focus scope, built
 * only from non-conflict action tasks). So this row does not change the
 * focusable-row count page-keyboard.spec.ts relies on — verified by the full
 * suite staying green with it.
 *
 * Signals: role/text presence (heading, conflict title, "Local Value"/"Canvas
 * Value" labels, "Keep Local"/"Use Canvas" resolve buttons). No focus-walk, no
 * test.skip (the conflict row is seed-guaranteed).
 */

import { test, expect } from './fixtures/app';

test.describe('Updates page — conflict surface', () => {
  test('a seeded conflict update renders a ConflictItem with resolve controls', async ({
    page,
  }) => {
    await page.evaluate(() => {
      location.hash = '#/updates';
    });

    // The seeded conflict's title is unique — wait on it as the "conflict
    // rendered" signal (text-only, deterministic).
    await expect(page.getByText('E2E Conflicted Task', { exact: false })).toBeVisible({
      timeout: 8000,
    });

    // ConflictItem renders the Local vs Canvas value boxes + their resolve
    // buttons. Their labels are deterministic role/text observables.
    await expect(page.getByText('Local Value', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Canvas Value', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Keep Local' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use Canvas' }).first()).toBeVisible();
  });
});
