/**
 * Store Helpers
 * Optimistic update tracking and commit debouncing utilities
 */

/**
 * Track recent optimistic updates to skip unnecessary db:commit refreshes.
 * When a command succeeds, we increment the counter for its table.
 * When db:commit arrives, we decrement and skip refresh if counter > 0.
 * This handles concurrent commands correctly (multiple updates = multiple skips).
 */
const recentOptimisticUpdates = new Map<string, number>();
// Track timeout IDs for cleanup to prevent memory leaks
const optimisticUpdateTimeouts = new Map<string, Set<ReturnType<typeof setTimeout>>>();
const OPTIMISTIC_UPDATE_WINDOW_MS = 1000; // Auto-cleanup window

/**
 * Mark an optimistic update for a table
 * The update will be automatically cleaned up after OPTIMISTIC_UPDATE_WINDOW_MS
 */
export function markOptimisticUpdate(table: string): void {
  const current = recentOptimisticUpdates.get(table) || 0;
  recentOptimisticUpdates.set(table, current + 1);

  // Track timeout for this table
  if (!optimisticUpdateTimeouts.has(table)) {
    optimisticUpdateTimeouts.set(table, new Set());
  }

  // Auto-decrement after window expires in case db:commit never arrives
  // This prevents memory leaks and stale skip state
  const timeoutId = setTimeout(() => {
    const count = recentOptimisticUpdates.get(table) || 0;
    if (count > 0) {
      recentOptimisticUpdates.set(table, count - 1);
    }
    if (recentOptimisticUpdates.get(table) === 0) {
      recentOptimisticUpdates.delete(table);
    }
    // Clean up timeout reference
    const timeouts = optimisticUpdateTimeouts.get(table);
    if (timeouts) {
      timeouts.delete(timeoutId);
      if (timeouts.size === 0) {
        optimisticUpdateTimeouts.delete(table);
      }
    }
  }, OPTIMISTIC_UPDATE_WINDOW_MS);

  // Store timeout ID for potential cleanup
  optimisticUpdateTimeouts.get(table)!.add(timeoutId);
}

/**
 * Check if we should skip refresh for a table (due to recent optimistic update)
 * Decrements the counter when returning true
 */
export function shouldSkipRefresh(table: string): boolean {
  const count = recentOptimisticUpdates.get(table) || 0;
  if (count <= 0) return false;

  // Decrement counter - one skip per optimistic update
  recentOptimisticUpdates.set(table, count - 1);
  if (count - 1 <= 0) {
    recentOptimisticUpdates.delete(table);
  }
  return true;
}

/**
 * Debounced db:commit handling to prevent UI freezing during sync.
 * Batches commits by table and processes them after a delay.
 */
const pendingCommits = new Set<string>();
let commitDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const COMMIT_DEBOUNCE_MS = 500; // Wait 500ms after last commit before refreshing

/**
 * Queue a table for refresh with debouncing
 */
export function queueCommitRefresh(table: string, processCommits: () => void): void {
  pendingCommits.add(table);

  if (commitDebounceTimer) {
    clearTimeout(commitDebounceTimer);
  }

  commitDebounceTimer = setTimeout(() => {
    commitDebounceTimer = null;
    processCommits();
  }, COMMIT_DEBOUNCE_MS);
}

/**
 * Get pending commits and clear the queue
 */
export function getPendingCommitsAndClear(): Set<string> {
  const tables = new Set(pendingCommits);
  pendingCommits.clear();
  return tables;
}

/**
 * Add a table to pending commits without triggering debounce
 */
export function addPendingCommit(table: string): void {
  pendingCommits.add(table);
}

/**
 * Process pending commits by calling the appropriate fetch functions
 */
export function processPendingCommits(
  fetchCourses: () => void,
  fetchTasks: () => void,
  fetchNotifications: () => void,
  fetchPolicies: () => void,
  fetchImportedCalendars: () => void,
  refreshAll: () => void
): void {
  const tables = getPendingCommitsAndClear();
  if (tables.size === 0) return;

  // If too many different tables changed, just refresh all
  // Increased from 5 to 10 tables to reduce unnecessary full refreshes (#24)
  if (tables.size > 10) {
    refreshAll();
    return;
  }

  // Refresh each affected table once
  if (tables.has('courses')) fetchCourses();
  if (tables.has('tasks')) fetchTasks();
  if (tables.has('notifications')) fetchNotifications();
  if (tables.has('course_policies')) fetchPolicies();
  if (tables.has('imported_calendars') || tables.has('calendar_events')) {
    fetchImportedCalendars();
  }
}
