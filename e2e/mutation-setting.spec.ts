/**
 * Mutation flow — edit a setting, proving persistence through IPC.
 *
 * Target: the academic "Default target grade", which has a clean read-back
 * pair (`setDefaultTargetGrade`/`getDefaultTargetGrade`). Note the getter
 * returns `{ defaultTargetGrade: number }`, not a bare number. In the UI it is a
 * `SettingSlider` (range input) inside the Academic accordion section — driving
 * a range input to an exact value deterministically is flaky, so per the
 * architect plan we assert the IPC round-trip directly (which is what the spec
 * actually proves: the write+read persistence path). We still navigate to the
 * Settings page first to prove it renders.
 */
import { test, expect } from './fixtures/app';
import { gotoHash } from './helpers';

test.describe('Mutation — setting (default target grade)', () => {
  test('setDefaultTargetGrade persists and reads back', async ({ page }) => {
    await gotoHash(page, '#/settings');
    await expect(page.getByRole('heading', { name: 'Settings', level: 2 })).toBeVisible();

    // Pick a value distinct from the current one so the assertion is meaningful.
    const current = await page.evaluate(async () => {
      const api = (
        window as unknown as {
          api: {
            getDefaultTargetGrade: () => Promise<{ defaultTargetGrade: number }>;
          };
        }
      ).api;
      return (await api.getDefaultTargetGrade()).defaultTargetGrade;
    });
    const next = current === 88 ? 92 : 88;

    // IPC-driven write (UI slider is non-deterministic to drive exactly; the
    // round-trip below proves the persistence path the spec exists to verify).
    await page.evaluate(async (value) => {
      const api = (
        window as unknown as {
          api: { setDefaultTargetGrade: (v: number) => Promise<unknown> };
        }
      ).api;
      await api.setDefaultTargetGrade(value);
    }, next);

    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const api = (
              window as unknown as {
                api: {
                  getDefaultTargetGrade: () => Promise<{ defaultTargetGrade: number }>;
                };
              }
            ).api;
            return (await api.getDefaultTargetGrade()).defaultTargetGrade;
          }),
        { timeout: 5000 }
      )
      .toBe(next);
  });
});
