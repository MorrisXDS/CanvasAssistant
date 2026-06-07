/**
 * Settings UI-actuation — drive the REAL on-screen Settings controls (not the
 * IPC API directly) and assert a persisted + visible behavior change.
 *
 * Complement to `mutation-setting.spec.ts` (which proves the IPC round-trip for
 * a non-deterministic slider). Here we actuate deterministic controls — the
 * ToggleSwitch (`role="switch"`), SettingButtonGroup (labelled `<button>`),
 * native `<select>` / SettingSelect (`combobox`) — exactly as a user would, then
 * verify the effect persisted (getter / localStorage) or is visible in the DOM.
 *
 * Controls live inside collapsed-or-open Accordion sections; `expandSection`
 * clicks the section's `Accordion.Trigger` (a `<button>` whose text is the
 * category label) only if it is not already expanded, then waits for a control
 * inside to appear. Kept local per the helpers.ts "adopt opportunistically"
 * posture — promote to helpers.ts only when a second spec needs it.
 */
import { test, expect } from './fixtures/app';
import { gotoHash } from './helpers';
import type { Page } from '@playwright/test';

/** Expand a settings Accordion section by its category label if collapsed.
 * Scope to accordion triggers only (`button[aria-expanded]`) + match by visible
 * text — short labels like "Academic"/"Updates" otherwise collide with other
 * buttons via getByRole's case-insensitive substring name match. */
async function expandSection(page: Page, label: string): Promise<void> {
  const trigger = page
    .locator('button[aria-expanded]')
    .filter({ hasText: label })
    .first();
  await trigger.waitFor({ state: 'visible' });
  const expanded = await trigger.getAttribute('aria-expanded');
  if (expanded !== 'true') {
    await trigger.click();
  }
  // Wait for the expand animation/measure to settle.
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
}

async function openSettings(page: Page): Promise<void> {
  await gotoHash(page, '#/settings');
  await expect(page.getByRole('heading', { name: 'Settings', level: 2 })).toBeVisible();
}

test.describe('Settings controls — UI actuation', () => {
  // ---- B1: Term selection (AcademicSection) — native <select> -------------
  // The default e2e seed forces term_selection='all' and seeds termless
  // courses, so switching to a SPECIFIC term id would hide every course
  // (VisibilityOracle). Assert the GETTER value and toggle only between the
  // term-independent 'all' and 'auto' static options — never a visible-count
  // delta.
  test('term selection: actuating the <select> changes getTermSelection()', async ({
    page,
  }) => {
    await openSettings(page);
    await expandSection(page, 'Academic');

    // The IPC getter returns { termSelection: value }, not a bare value.
    const getTerm = () =>
      page.evaluate(async () => {
        const res = await (
          window as unknown as {
            api: { getTermSelection: () => Promise<{ termSelection: unknown }> };
          }
        ).api.getTermSelection();
        return res.termSelection;
      });

    // Scope to the term <select> specifically — its 'auto' option is unique to
    // it (other Display-section selects render earlier on the page).
    const select = page
      .getByRole('combobox')
      .filter({ has: page.locator('option[value="auto"]') })
      .first();
    await select.selectOption('auto');
    await expect.poll(getTerm, { timeout: 5000 }).toBe('auto');

    await select.selectOption('all');
    await expect.poll(getTerm, { timeout: 5000 }).toBe('all');
  });

  // ---- B2: Update channel (UpdatesSection) — role="switch" + conditional --
  test('update channel: toggling the switch persists enabled and reveals the interval select', async ({
    page,
  }) => {
    await openSettings(page);
    await expandSection(page, 'Updates');

    const getEnabled = () =>
      page.evaluate(async () => {
        const res = await (
          window as unknown as {
            api: {
              getUpdatePrefs: () => Promise<{ data?: { enabled?: boolean } }>;
            };
          }
        ).api.getUpdatePrefs();
        return res?.data?.enabled ?? false;
      });

    // ToggleSwitch is <button role="switch"> with NO accessible name, so target
    // it via its SettingRow (the row containing the label + the switch).
    const toggle = page
      .locator('div')
      .filter({ hasText: 'Check for updates automatically' })
      .filter({ has: page.getByRole('switch') })
      .last()
      .getByRole('switch');
    // DEFAULT_PREFS.enabled is false → starts off; the interval Select is absent.
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    await toggle.click();

    // (a) persisted enabled === true
    await expect.poll(getEnabled, { timeout: 5000 }).toBe(true);
    // (b) visible behavior change — the interval combobox now renders. Scope to
    // it via its unique '168' (Weekly) option (other selects exist on the page).
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(
      page.getByRole('combobox').filter({ has: page.locator('option[value="168"]') })
    ).toBeVisible();
  });

  // ---- B3 (rescoped): a portable <select>-actuation case ------------------
  // Plan B3's original close-behavior control is win32-gated (it does NOT
  // render on Linux CI). Use the portable Files-section "Folder default state"
  // SettingSelect instead — a real <select> on every OS that persists to
  // localStorage (fileExplorerSettings) and survives reload.
  test('files folder-state <select>: selecting a value persists to localStorage', async ({
    page,
  }) => {
    await openSettings(page);
    await expandSection(page, 'Display & Layout');

    const folderSelect = page
      .getByRole('combobox')
      .filter({ has: page.locator('option[value="remember"]') })
      .first();
    await folderSelect.selectOption('expanded');

    const readState = () =>
      page.evaluate(() => {
        const raw = localStorage.getItem('fileExplorerSettings');
        return raw
          ? (JSON.parse(raw) as { defaultState?: string }).defaultState
          : undefined;
      });

    await expect.poll(readState, { timeout: 5000 }).toBe('expanded');

    // Survives a reload (localStorage-backed).
    await page.reload();
    await openSettings(page);
    expect(await readState()).toBe('expanded');
  });

  // ---- B4: Theme (DisplaySection) — SettingButtonGroup → DOM data-theme ---
  test('theme: clicking Dark/Light updates document data-theme', async ({ page }) => {
    await openSettings(page);
    await expandSection(page, 'Display & Layout');

    // Use explicit light/dark (system depends on prefers-color-scheme, which is
    // non-deterministic in headless CI).
    await page.getByRole('button', { name: 'Dark', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.getByRole('button', { name: 'Light', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  // ---- B5: Courses view-mode (DisplaySection) — persists across reload ----
  test('courses view-mode: List button persists to localStorage and survives reload', async ({
    page,
  }) => {
    await openSettings(page);
    await expandSection(page, 'Display & Layout');

    // The "Courses view" SettingButtonGroup renders grid/list buttons labelled
    // "Grid"/"List". There are multiple Grid/List groups in this section
    // (courses, files); scope to the Courses view row by its label.
    const coursesRow = page
      .locator('div')
      .filter({ hasText: 'Courses view' })
      .filter({ has: page.getByRole('button', { name: 'List', exact: true }) })
      .last();
    await coursesRow.getByRole('button', { name: 'List', exact: true }).click();

    const readViewMode = () =>
      page.evaluate(() => {
        const raw = localStorage.getItem('courseSettings');
        return raw
          ? (JSON.parse(raw) as { defaultViewMode?: string }).defaultViewMode
          : undefined;
      });

    await expect.poll(readViewMode, { timeout: 5000 }).toBe('list');

    // Persists across a reload (pure localStorage UI pref, no SQL).
    await page.reload();
    await openSettings(page);
    expect(await readViewMode()).toBe('list');
  });

  // ---- B-cal: Calendar view-mode (DisplaySection) — persists across reload --
  // The "Calendar view" SettingButtonGroup (Month/Week) writes calendarSettings
  // .defaultViewMode to localStorage (JSON). Default is 'month' → click Week.
  test('calendar view-mode: Week button persists to localStorage and survives reload', async ({
    page,
  }) => {
    await openSettings(page);
    await expandSection(page, 'Display & Layout');

    const calendarRow = page
      .locator('div')
      .filter({ hasText: 'Calendar view' })
      .filter({ has: page.getByRole('button', { name: 'Week', exact: true }) })
      .last();
    await calendarRow.getByRole('button', { name: 'Week', exact: true }).click();

    const readCalView = () =>
      page.evaluate(() => {
        const raw = localStorage.getItem('calendarSettings');
        return raw
          ? (JSON.parse(raw) as { defaultViewMode?: string }).defaultViewMode
          : undefined;
      });

    await expect.poll(readCalView, { timeout: 5000 }).toBe('week');

    await page.reload();
    await openSettings(page);
    expect(await readCalView()).toBe('week');
  });

  // ---- B-landing: Landing page (DisplaySection) — persists across reload ----
  // The "Landing page" SettingButtonGroup writes landingPage to localStorage as
  // a RAW string (not JSON — SettingsManager stores string primitives verbatim).
  // Default is '/' (Dashboard) → click Courses ('/courses').
  test('landing page: Courses button persists landingPage to localStorage and survives reload', async ({
    page,
  }) => {
    await openSettings(page);
    await expandSection(page, 'Display & Layout');

    const landingRow = page
      .locator('div')
      .filter({ hasText: 'Landing page' })
      .filter({ has: page.getByRole('button', { name: 'Courses', exact: true }) })
      .last();
    await landingRow.getByRole('button', { name: 'Courses', exact: true }).click();

    // landingPage is a string primitive → stored raw, not JSON-encoded.
    const readLanding = () => page.evaluate(() => localStorage.getItem('landingPage'));

    await expect.poll(readLanding, { timeout: 5000 }).toBe('/courses');

    await page.reload();
    await openSettings(page);
    expect(await readLanding()).toBe('/courses');
  });

  // ---- B-content: Link click behavior (FilesContentSection) — <select> ------
  // The "Link click behavior" SettingSelect writes contentSettings.linkBehavior
  // to localStorage (JSON). Default is 'always-external' → select 'prefer-local'.
  // (The actual link-open behavior is shell-mediated and not asserted in e2e;
  // we assert PERSISTENCE only — the load-bearing, portable effect.)
  test('link behavior: selecting Prefer-local persists contentSettings.linkBehavior across reload', async ({
    page,
  }) => {
    await openSettings(page);
    await expandSection(page, 'Files & Content');

    // Scope to the linkBehavior <select> via its unique 'prefer-local' option
    // (no other select on the page offers it).
    const linkSelect = page
      .getByRole('combobox')
      .filter({ has: page.locator('option[value="prefer-local"]') })
      .first();
    await linkSelect.selectOption('prefer-local');

    const readLinkBehavior = () =>
      page.evaluate(() => {
        const raw = localStorage.getItem('contentSettings');
        return raw
          ? (JSON.parse(raw) as { linkBehavior?: string }).linkBehavior
          : undefined;
      });

    await expect.poll(readLinkBehavior, { timeout: 5000 }).toBe('prefer-local');

    await page.reload();
    await openSettings(page);
    expect(await readLinkBehavior()).toBe('prefer-local');
  });

  // ---- B-sync: Sync files toggle (SyncSection) — role="switch" -------------
  // syncPrefs.syncFiles is behaviorally unwired (FOLLOWUPS: the persisted setting
  // never reaches the sync path), but the SWITCH → persist path is real and worth
  // a thin actuation: toggling writes syncPreferences.syncFiles to localStorage.
  // Default is true → toggle once → false.
  test('sync files toggle: persists syncPreferences.syncFiles across reload', async ({
    page,
  }) => {
    await openSettings(page);
    await expandSection(page, 'Sync');

    const toggle = page
      .locator('div')
      .filter({ hasText: 'Sync files' })
      .filter({ has: page.getByRole('switch') })
      .last()
      .getByRole('switch');
    // Default DEFAULT_SYNC_PREFERENCES.syncFiles is true.
    await expect(toggle).toHaveAttribute('aria-checked', 'true');

    await toggle.click();

    const readSyncFiles = () =>
      page.evaluate(() => {
        const raw = localStorage.getItem('syncPreferences');
        return raw ? (JSON.parse(raw) as { syncFiles?: boolean }).syncFiles : undefined;
      });

    await expect.poll(readSyncFiles, { timeout: 5000 }).toBe(false);
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    await page.reload();
    await openSettings(page);
    expect(await readSyncFiles()).toBe(false);
  });
});
