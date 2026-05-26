import { useState, useCallback, useMemo } from 'react';
import { useStore } from '../../../layers/l5-presentation/store';
import type { QueuedTask } from '../../../layers/l5-presentation/types';
import type { DuplicateCheckResult } from '../../../layers/l5-presentation/types';
import type { QueuedTaskEdits } from '../components/Queue/QueuedTaskCard';
import type { CanvasTaskDisplay } from '../components/shared/DuplicateWarningModal';
import type { FieldChoice } from '../components/shared/FieldMergeEditor';
import { createLogger } from '../utils/rendererLogger';

const log = createLogger('useDuplicateGate');

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

  /**
   * Intercept bulk accept.
   *
   * Two parallel responsibilities:
   *   1. Items WITH a duplicate match → land in the bulk modal for the user
   *      to review (link vs separate vs customize fields).
   *   2. Items WITHOUT a match → auto-accept silently.
   *
   * Critically, the modal opens FIRST, and the no-match auto-accepts then run
   * in parallel with Promise.allSettled. Sequential awaits used to block the
   * modal until every no-match item had finished its IPC roundtrip + state
   * update, leaving them visibly stuck in the queue behind the (not-yet-open)
   * modal. Now: matched items appear instantly; no-match items drop from the
   * queue list (rendered behind the modal) as their store updates land; and
   * a single failed accept doesn't strand its siblings.
   */
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

      // 1. Open the modal immediately so matched items get the user's
      //    attention without waiting on the auto-accept chain.
      if (withMatch.length > 0) {
        const taskMap = new Map(tasks.map((t) => [t.id, t]));
        setGateState({
          mode: 'bulk',
          items: withMatch,
          tasksByQueueId: taskMap,
        });
      }

      // 2. Fire all no-match accepts in parallel. Failures are logged but
      //    don't block the rest — and the store removes each successful one
      //    from `taskQueue` independently, so the queue list updates live.
      if (withoutMatch.length > 0) {
        const noMatchIds = new Set(withoutMatch.map((r) => r.queueId));
        const promises = tasks
          .filter((t) => noMatchIds.has(t.id))
          .map((t) =>
            acceptQueuedTask(t.id).catch((err: unknown) => {
              log.error(
                `Auto-accept failed for queueId=${t.id}`,
                err instanceof Error ? err : undefined
              );
            })
          );
        await Promise.allSettled(promises);
      }
    },
    [checkQueueDuplicates, acceptQueuedTask]
  );

  /**
   * Called when user confirms decisions in the modal.
   * - decisions: per-item choice — 'link' merges into existing, 'separate' accepts as new task.
   * - selected: queueIds the user actually checked (unchecked = skip for now).
   * - fieldChoicesByQueueId: per-item per-field 'canvas' | 'user' map. When
   *   the decision is 'link', this drives `keepFromUser` so the user gets
   *   the value they actually picked for each conflicting field. Notes are
   *   always preserved (`keepFromUser.notes = true`).
   */
  const confirmDecisions = useCallback(
    async (
      decisions: Map<number, 'link' | 'separate'>,
      selected: Set<number>,
      fieldChoicesByQueueId: Map<number, FieldChoice>
    ) => {
      if (!gateState) return;

      for (const item of gateState.items) {
        if (!selected.has(item.queueId)) continue;
        const decision = decisions.get(item.queueId) ?? 'separate';
        const task = gateState.tasksByQueueId.get(item.queueId);
        if (!task) continue;

        if (decision === 'link' && item.match) {
          const fc = fieldChoicesByQueueId.get(item.queueId);
          // `keepFromUser.<field> = true` means "keep the user's value";
          // `false` (or absent) means "use the Canvas value". Convert from
          // the FieldChoice 'canvas' | 'user' representation accordingly.
          await mergeQueuedTask({
            queueId: task.id,
            userTaskId: item.match.task.id,
            keepFromUser: {
              notes: true,
              title: fc?.title === 'user',
              dueAt: fc?.dueAt === 'user',
              taskType: fc?.taskType === 'user',
            },
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

  // Map of queueId → real Canvas-side display values for the modal.
  // Derived from the captured QueuedTask so the modal's left column shows
  // the actual incoming title/due/type instead of placeholders.
  const canvasTaskByQueueId = useMemo<Map<number, CanvasTaskDisplay>>(() => {
    const map = new Map<number, CanvasTaskDisplay>();
    if (!gateState) return map;
    for (const [queueId, t] of gateState.tasksByQueueId) {
      map.set(queueId, { title: t.title, dueAt: t.dueAt, taskType: t.taskType });
    }
    return map;
  }, [gateState]);

  return {
    gatedAccept,
    gatedBulkAccept,
    confirmDecisions,
    gateState,
    canvasTaskByQueueId,
    closeModal,
  };
}
