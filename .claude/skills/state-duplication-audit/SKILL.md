---
name: state-duplication-audit
description: Find places where page-level components hold domain data (queue items, tasks, courses, notifications, sync updates, calendar events, files, resources) in local React `useState` instead of reading from the Zustand store — the anti-pattern codified in `CLAUDE.md` §2 "Single source of truth for domain data". Triages each finding into convert / leave / project-from-store, and (on request) converts one as a starting point. Use when the user says "find state duplication", "audit useState", "state duplication audit", or wants to clean up the open follow-up in `docs/FOLLOWUPS.md`.
---

# State-duplication audit

The bug class: a page holds `useState<DomainType>` for data that ALSO
lives in the Zustand store, and the two copies silently desync the
moment any code path writes via the store without going through that
specific component's setter. Classic symptom: a click does nothing
(store updates, local copy doesn't, UI shows stale state).

Codified in `CLAUDE.md` §2 _Single source of truth for domain data_ and
tracked as an open audit in `docs/FOLLOWUPS.md`.

## When to use

- The user asks for the state-duplication audit.
- Working a section of the open follow-up.
- Reviewing a new page-level component to confirm it's compliant.

## Domain types to grep for

These all live in the Zustand store — any `useState<...>` of one of
these in a page-level component is a candidate for conversion:

```
QueuedTask | Task | Course | CourseDetailData | Notification | SyncUpdate
| CalendarEvent | Resource
```

Plus filtered/projected types built from any of the above
(e.g. `CourseRow`, `TaskRow`).

## Steps

### 1. Grep page-level files

```bash
grep -rnE "useState<(QueuedTask|Task|Course|CourseDetailData|Notification|SyncUpdate|CalendarEvent|Resource)" \
  src/layers/l6-ui/components/pages \
  src/layers/l6-ui/components/CourseDetail \
  src/layers/l6-ui/components/Dashboard \
  src/layers/l6-ui/components/Calendar \
  src/layers/l6-ui/components/Files \
  src/layers/l6-ui/components/Queue \
  src/layers/l6-ui/components/shared
```

Also look for the `[X, setX] = useState<Y[]>` patterns (arrays of
domain types are the common shape).

### 2. Triage each finding

For each match, open the file and decide:

| Status                                         | Action                                                  |
| ---------------------------------------------- | ------------------------------------------------------- |
| **Data is in the store** (duplication)         | Convert to `useStore(selector)` + `useMemo` if filtered |
| **Data is only used locally** (no duplication) | Leave it — keep local state                             |
| **Data needs filter/projection from store**    | `useStore(s => s.x)` + `useMemo` filtered/mapped        |

Verify "data is in the store" by grepping the store slices:

```bash
grep -rn "<DomainType>\[\]" src/layers/l5-presentation/store/
```

### 3. Convert pattern (when status = duplication)

The cleanest conversion — used in `CourseDetail.tsx` for `queuedTasks`:

```tsx
// Before
const [queuedTasks, setQueuedTasks] = useState<QueuedTask[]>([]);
useEffect(() => {
  api.getTaskQueueForCourse(courseId).then(setQueuedTasks);
}, [courseId]);

// In handlers:
const result = await acceptQueuedTask(queueId);
if (result.success) {
  setQueuedTasks((prev) => prev.filter((q) => q.id !== queueId)); // ← desync trap
}

// After
const taskQueue = useStore((s) => s.taskQueue);
const fetchTaskQueue = useStore((s) => s.fetchTaskQueue);
const queuedTasks = useMemo(
  () => taskQueue.filter((q) => q.courseId === courseId),
  [taskQueue, courseId]
);
useEffect(() => {
  void fetchTaskQueue({ courseId });
}, [courseId, fetchTaskQueue]);

// In handlers — just call the store action, nothing else needed:
const result = await acceptQueuedTask(queueId);
// (store action removes from state.taskQueue on success; selector re-derives)
```

### 4. Test the conversion

Run the layer tests via the `layer-test` skill for `l6-ui`. If touching
multiple layers, run the full suite. Then manually verify: the click
that previously did nothing should now work on the first try.

### 5. Update `docs/FOLLOWUPS.md`

When all suspects in a known section are cleared, delete that section
in the same PR (commit msg: `docs: close FOLLOWUPS — <section name>`).

## Reporting

After the grep + triage, show the user:

| File:Line                  | Domain type    | Triage                                      |
| -------------------------- | -------------- | ------------------------------------------- |
| `pages/CoursesPage.tsx:42` | `Course[]`     | convert (in store as `s.courses`)           |
| `pages/Foo.tsx:18`         | `Task[]`       | filtered projection (`s.tasks.filter(...)`) |
| `Bar/Baz.tsx:9`            | `LocalShape[]` | leave (not a store domain type)             |

Then ask the user which to convert (one per PR is the recommended cadence).
