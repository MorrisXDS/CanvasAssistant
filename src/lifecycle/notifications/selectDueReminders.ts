/**
 * selectDueReminders — pure, injectable due-date reminder selection (ADR-0016).
 *
 * Given a set of candidate tasks (the manager supplies ONLY visible-course
 * tasks, per the course-visibility invariant), the current time, a lead-time
 * window, and the set of already-notified dedup keys, return the tasks that
 * qualify for a due-date reminder.
 *
 * A task qualifies when ALL hold:
 *  - it is not completed;
 *  - it has a `due_at`;
 *  - the due time is still in the future (`now < due_at`); and
 *  - it falls inside the lead window (`due_at - now <= leadTimeMs`); and
 *  - its dedup key (`taskId|due_at`) is not in `alreadyNotified` — so a task is
 *    notified once per (task, due-date) pair, and a due-date change re-arms it.
 *
 * Pure: time + dedup set are injected, no DB / Electron access.
 */

export interface ReminderTaskInput {
  id: number;
  title: string;
  course_id: number;
  due_at: string | null;
  is_completed: number;
}

export interface ReminderCandidate {
  taskId: number;
  courseId: number;
  title: string;
  dueAt: string;
  /** Stable dedup key: `${taskId}|${due_at}` — re-arms if the due date moves. */
  dedupKey: string;
}

/** Build the dedup key for a task + its due date. */
export function reminderDedupKey(taskId: number, dueAt: string): string {
  return `${taskId}|${dueAt}`;
}

export function selectDueReminders(
  tasks: readonly ReminderTaskInput[],
  now: number,
  leadTimeMs: number,
  alreadyNotified: ReadonlySet<string>
): ReminderCandidate[] {
  const candidates: ReminderCandidate[] = [];

  for (const task of tasks) {
    if (task.is_completed) continue;
    if (!task.due_at) continue;

    const dueMs = new Date(task.due_at).getTime();
    if (Number.isNaN(dueMs)) continue;

    // Must be in the future and within the lead window.
    const delta = dueMs - now;
    if (delta <= 0) continue;
    if (delta > leadTimeMs) continue;

    const dedupKey = reminderDedupKey(task.id, task.due_at);
    if (alreadyNotified.has(dedupKey)) continue;

    candidates.push({
      taskId: task.id,
      courseId: task.course_id,
      title: task.title,
      dueAt: task.due_at,
      dedupKey,
    });
  }

  return candidates;
}
