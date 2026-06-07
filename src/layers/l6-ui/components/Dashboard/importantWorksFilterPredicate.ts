/**
 * importantWorksFilter — pure predicate for the Dashboard "Important Works" card.
 *
 * Extracted from `ImportantWorksCard` so the type/threshold filtering branches
 * are unit-testable without a React render or the Zustand store. The card calls
 * this for each task; this module owns the membership + threshold logic only.
 */

import type { ImportantWorksFilter } from '../../../l5-presentation/settings';

/** The subset of a Task this predicate inspects. */
export interface ImportantWorksTaskInput {
  isCompleted: boolean;
  taskType?: string | null;
  weight?: number | null;
}

/**
 * Returns true when the task should appear in the Important Works section under
 * the given filter.
 *
 * A task qualifies when ALL hold:
 *  - it is NOT completed;
 *  - it has a task type;
 *  - its type is enabled (an empty `enabledTypes` means "all types allowed");
 *  - its weight meets the applicable threshold (per-type threshold when
 *    `perTypeEnabled` AND a per-type value exists, otherwise the global one).
 */
export function taskPassesImportantWorksFilter(
  task: ImportantWorksTaskInput,
  filter: ImportantWorksFilter
): boolean {
  // Must not be completed.
  if (task.isCompleted) return false;

  // Must have a task type.
  const taskType = task.taskType;
  if (!taskType) return false;

  // Check if type is enabled (if no types enabled, show all).
  if (filter.enabledTypes.length > 0 && !filter.enabledTypes.includes(taskType)) {
    return false;
  }

  // Get applicable threshold.
  const threshold =
    filter.perTypeEnabled && filter.perTypeThresholds[taskType] !== undefined
      ? filter.perTypeThresholds[taskType]
      : filter.globalThreshold;

  // Must have weight above threshold.
  if (!task.weight || task.weight < threshold) return false;

  return true;
}
