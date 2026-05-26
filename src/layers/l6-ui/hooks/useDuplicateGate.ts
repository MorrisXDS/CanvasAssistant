import { useState, useCallback } from 'react';
import { useStore } from '../../../layers/l5-presentation/store';
import type { QueuedTask } from '../../../layers/l5-presentation/types';
import type { DuplicateCheckResult } from '../../../layers/l5-presentation/types';
import type { QueuedTaskEdits } from '../components/Queue/QueuedTaskCard';

export interface DuplicateGateState {
  mode: 'single' | 'bulk';
  items: DuplicateCheckResult[];
  /** Original tasks keyed by queueId — needed to dispatch accept/merge */
  tasksByQueueId: Map<number, QueuedTask>;
  pendingEdits?: QueuedTaskEdits;
}

export function useDuplicateGate() {
  const checkQueueDuplicates = useStore((s) => s.checkQueueDuplicates);
  const acceptQueuedTask = useStore((s) => s.acceptQueuedTask);
  const mergeQueuedTask = useStore((s) => s.mergeQueuedTask);

  const [gateState, setGateState] = useState<DuplicateGateState | null>(null);

  const closeModal = useCallback(() => setGateState(null), []);

  /** Intercept a single accept. Shows modal if a duplicate exists, else accepts immediately. */
  const gatedAccept = useCallback(
    async (task: QueuedTask, edits?: QueuedTaskEdits) => {
      const results = await checkQueueDuplicates([
        {
          queueId: task.id,
          courseId: task.courseId,
          title: task.title,
          dueAt: task.dueAt,
          taskType: task.taskType,
        },
      ]);

      const result = results[0];
      if (!result || !result.match) {
        await acceptQueuedTask(task.id, edits);
        return;
      }

      setGateState({
        mode: 'single',
        items: results,
        tasksByQueueId: new Map([[task.id, task]]),
        pendingEdits: edits,
      });
    },
    [checkQueueDuplicates, acceptQueuedTask]
  );

  /** Intercept bulk accept. Items with no duplicate are accepted immediately; the rest show in modal. */
  const gatedBulkAccept = useCallback(
    async (tasks: QueuedTask[]) => {
      if (tasks.length === 0) return;

      const results = await checkQueueDuplicates(
        tasks.map((t) => ({
          queueId: t.id,
          courseId: t.courseId,
          title: t.title,
          dueAt: t.dueAt,
          taskType: t.taskType,
        }))
      );

      const withMatch = results.filter((r) => r.match !== null);
      const withoutMatch = results.filter((r) => r.match === null);

      // Auto-accept items with no duplicate
      if (withoutMatch.length > 0) {
        const noMatchIds = new Set(withoutMatch.map((r) => r.queueId));
        for (const task of tasks) {
          if (noMatchIds.has(task.id)) {
            await acceptQueuedTask(task.id);
          }
        }
      }

      if (withMatch.length === 0) return;

      const taskMap = new Map(tasks.map((t) => [t.id, t]));
      setGateState({
        mode: 'bulk',
        items: withMatch,
        tasksByQueueId: taskMap,
      });
    },
    [checkQueueDuplicates, acceptQueuedTask]
  );

  /**
   * Called when user confirms decisions in the modal.
   * decisions: per-item choice — 'link' merges into existing, 'separate' accepts as new task.
   * selected: queueIds the user actually checked (unchecked = skip for now).
   */
  const confirmDecisions = useCallback(
    async (decisions: Map<number, 'link' | 'separate'>, selected: Set<number>) => {
      if (!gateState) return;

      for (const item of gateState.items) {
        if (!selected.has(item.queueId)) continue;
        const decision = decisions.get(item.queueId) ?? 'separate';
        const task = gateState.tasksByQueueId.get(item.queueId);
        if (!task) continue;

        if (decision === 'link' && item.match) {
          await mergeQueuedTask({
            queueId: task.id,
            userTaskId: item.match.task.id,
            // Preserve user's due date and notes by default when linking
            keepFromUser: { notes: true, dueAt: !!item.match.task.dueAt },
          });
        } else {
          const edits = gateState.mode === 'single' ? gateState.pendingEdits : undefined;
          await acceptQueuedTask(task.id, edits);
        }
      }

      closeModal();
    },
    [gateState, mergeQueuedTask, acceptQueuedTask, closeModal]
  );

  return { gatedAccept, gatedBulkAccept, confirmDecisions, gateState, closeModal };
}
