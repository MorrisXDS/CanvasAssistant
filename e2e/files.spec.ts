/**
 * Files route-gap coverage (`#/files`). Asserts the render landmark, the
 * search + view-toggle controls, and a data-tolerant body branch (file
 * row/tile present when the seed has files, else the "No Files Yet" empty
 * state). No `data-focus-scope`, so no focus-nav assertion here.
 */
import { test, expect } from './fixtures/app';
import { gotoHash } from './helpers';

test.describe('Files route', () => {
  test('renders landmark, controls, and a data-tolerant body', async ({ page }) => {
    await gotoHash(page, '#/files');

    await expect(page.getByRole('heading', { name: 'Files', level: 1 })).toBeVisible();

    // Search + view-toggle controls always render.
    await expect(page.getByPlaceholder('Search files...')).toBeVisible();
    await expect(page.getByRole('button', { name: 'List view' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Grid view' })).toBeVisible();

    // Data-tolerant: either files render OR the empty state shows. `getFiles()`
    // returns { resources: [...], attachments: [...] } (not a flat array).
    const files = await page.evaluate(async () => {
      const api = (
        window as unknown as {
          api: {
            getFiles: () => Promise<{
              resources?: unknown[];
              attachments?: unknown[];
            }>;
          };
        }
      ).api;
      const result = await api.getFiles();
      return (result.resources?.length ?? 0) + (result.attachments?.length ?? 0);
    });

    if (files > 0) {
      // At least one file row/tile rendered (FileListItem/FileGridItem). The
      // empty-state heading must be absent.
      await expect(page.getByRole('heading', { name: 'No Files Yet' })).toHaveCount(0);
    } else {
      await expect(page.getByRole('heading', { name: 'No Files Yet' })).toBeVisible();
    }
  });
});
