/**
 * Pure helper for the sidebar's sync-status indicator.
 *
 * Extracted so the "have we ever synced?" decision is unit-testable without
 * rendering the whole Sidebar.
 */

/**
 * The effective "last synced" time shown in the sidebar: the most recent of the
 * store-level `lastSyncedAt` and any (visible) course's `lastSyncedAt`. Returns
 * `null` ONLY when nothing has ever synced.
 *
 * Why both sources: the store holds only VISIBLE courses, so a successful sync
 * can leave the visible-course list empty (e.g. every course is hidden or
 * archived — common after graduating) while still setting the store-level
 * `lastSyncedAt`. Deriving status from courses alone then falsely shows
 * "Not Synced"; honoring the store-level time fixes that. Per-course times are
 * still consulted as a floor, since the store value can lag behind a partial
 * sync.
 */
export function resolveLastSync(
  courses: ReadonlyArray<{ lastSyncedAt?: string | null }>,
  storeLastSyncedAt: string | null
): string | null {
  let latest: string | null = storeLastSyncedAt ?? null;
  for (const c of courses) {
    const t = c.lastSyncedAt ?? null;
    if (t && (latest === null || t > latest)) {
      latest = t;
    }
  }
  return latest;
}
