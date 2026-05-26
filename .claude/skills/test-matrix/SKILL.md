---
name: test-matrix
description: Generate a manual-test matrix (Markdown table of concrete triggers + falsifiable expected outcomes) for one or more PRs, a branch diff, or the current uncommitted changes. This is the *planning* artifact you produce BEFORE launching the app — sister to `/milestone-check` (diff-vs-intent alignment) and `/verify` / `/manual-test-launch` (which actually run the app). Use whenever the user says "test matrix", "manual test plan", "what should I verify here", "what should I manually test", "test plan for PR #N", "test plan for the current diff", "checklist of triggers and expected outcomes", or wants to combine multiple PRs into one test session before launching the test env. Use even when the user has not explicitly named the skill — if they just opened a PR and ask how to verify it manually, this is the right tool.
---

# Test matrix

The output is a Markdown table. Triggers are concrete user actions; expected outcomes are **falsifiable** (something you can fail by observing the DOM, console, store, or filesystem). The table is meant to be pasted into a PR comment or carried into a `/verify` session.

## When to use

- The user opened a PR (or several) and asks what to manually verify.
- The user is about to run `/verify` or `/manual-test-launch` and wants a checklist first.
- The user says "test matrix for ..." or any trigger in the description.
- After `/milestone-check` confirms intent alignment and the next step is human eyeball.

## When NOT to use

- The user wants `npm test` / automated unit tests run → use `/layer-test` or `npm test` directly.
- The user wants correctness review of the code itself → `/code-review`.
- The user wants a security review → `/security-review`.
- The user wants you to actually launch the app and observe → `/verify` or `/manual-test-launch`. This skill _plans_ the test; those skills _execute_ it.

## Inputs

Resolve the input in this order:

1. **Explicit PR numbers** in args (e.g. "PR #20", "#20 #21") → for each PR:
   `gh pr view <N> --json number,title,body,files,headRefName,baseRefName`.
   Files give you the diff scope. The body may already contain a "Test plan" / "Manual test" checklist — include those rows verbatim and add anything the diff implies that the author missed.
2. **Branch / SHA range** (e.g. "the modal-cleanup branch", "from main") → `git diff --name-only <base>..<head>` plus `git log <base>..<head> --oneline`.
3. **No args** → the current uncommitted diff. `git diff --name-only HEAD` + `git status -s` for untracked.

If the input is ambiguous (e.g. user says "this PR" with no number and no branch context), ask once.

## Procedure

1. **Gather** the changed-file list + commit messages + PR body (if any). Read each file's actual diff for non-trivial cases — file-name alone often isn't enough to know what changed.
2. **Classify** each file (or hunk) into one or more behavior classes. The taxonomy below is the starting point; extend if the change genuinely doesn't fit.
3. **Derive 1–4 test rows per file** at the granularity of a user action. Each row has the columns **#**, **Trigger**, **Watch**, **Expected outcome**.
4. **Group rows by PR** (one `### PR #N — <title>` section per PR). If the input was a single diff with no PR, use `### Diff — <branch or SHA>`.
5. **Append a "Cross-cutting smoke" section** at the bottom — applies to any change touching the app shell.

## Behavior-class taxonomy

For each class, the _trigger_ describes the user action and the _expected_ column anchors to a falsifiable observation. CLAUDE.md §2 already codifies the "correct" behavior for several of these — cite/borrow from it rather than restating.

| Class                                                                                                                                          | Typical triggers                                                                                                                                   | Falsifiable expected outcome                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Modal / dialog** (anything that imports `<Modal>`, `Modal.tsx`, `ConfirmDialog`, or adds a `position: 'fixed'` + `rgba` backdrop)            | Open the flow that mounts it. Press Esc. Click backdrop. Resize window narrow (~600 px). Stack it above another modal if the design allows.        | Backdrop renders; Esc behavior matches the rule (CLAUDE.md §2 — non-dismiss modals must keep `closeOnEscape={false}`); footer doesn't clip; z-index correct (parent 1100 / child 1200); body scroll-locked behind the modal.                       |
| **State / store (Zustand)** (`useState<DomainType>` → `useStore`; new selector; new store action)                                              | Open the view that displays the data. Then, _from a different code path_, cause a write to the same store slice. Switch back to the original view. | UI reflects the new state **without reload or navigation**. This is the whole reason for the conversion — if it doesn't reactively update, the conversion failed. (CLAUDE.md §2 "Single source of truth for domain data".)                         |
| **IPC handler** (new / changed `ipcMain.handle` in `main.ts`, new `preload.ts` bridge, new `window.api.*` method)                              | Invoke from the renderer (the affected UI flow). Also invoke against an archived / hidden course if applicable.                                    | Payload shape matches contract. Visibility filter respected (CLAUDE.md §8 — archived / hidden / term-filtered courses excluded). Error path returns a typed result, not throws.                                                                    |
| **Sync / data fetch** (`SyncEngine`, `CanvasClient`, `RateLimiter`, `CircuitBreaker`)                                                          | Trigger a sync (Cmd-R / sync button). Trigger two in quick succession. Toggle network off mid-sync.                                                | Rate limit honored (no >3 concurrent). No duplicate writes (check row count delta). Archived courses skipped from intelligence orchestrators (not SyncEngine itself — it discovers all). Circuit breaker opens on repeated 5xx and closes cleanly. |
| **L3 intelligence** (`GradeCalculationService`, `SubmissionStatusService`, `DataCompletenessAnalyzer`, `content-analysis/*`, `data-quality/*`) | Open course detail → Grades / Status panel for a course with edge data (zero submissions, all dropped, one ungraded).                              | Numbers match baseline; no NaN, no `Infinity`, no division-by-zero artifact. ServiceRegistry init logs cleanly. IPC contract unchanged unless the PR explicitly adds/removes an export.                                                            |
| **Hotkey / keyboard** (`useHotkeys`, `useKeymap`, key bindings in modals)                                                                      | Press the new / changed key in: the host component, a child modal above it, and a sibling page.                                                    | Fires only in the intended scope. If a modal is mounted above, the underlying handler stays silent (modal-stack-aware — the open follow-up in `docs/FOLLOWUPS.md`).                                                                                |
| **UI-only / cosmetic** (pure styling / layout / copy — no logic change)                                                                        | Open the affected screen at narrow + wide widths, light + dark theme if applicable, with both empty and populated data.                            | No clipping, contrast acceptable, focus order is keyboard-navigable. No console warnings about invalid CSS variables (`var(--color-primary)` is **not defined** in this codebase — common mistake; use `--color-navy`).                            |
| **Build / tooling / docs only**                                                                                                                | n/a                                                                                                                                                | Skip — no manual test needed. List under "No-test (build/docs)".                                                                                                                                                                                   |

## Falsifiable expected outcomes

"Looks right" is not an expected outcome. The reader of the matrix should be able to fail a row by a specific observation. Examples of the same row, refactored:

- ❌ "Modal opens correctly." → ✅ "Modal mounts with backdrop visible; Esc keypress produces no DOM mutation; pressing the close X removes the modal."
- ❌ "Announcements show up." → ✅ "After firing a sync that inserts a `notifications` row with `kind='announcement'` for the current course, the Announcements panel re-renders with the new entry within ~500 ms — no manual navigation required."
- ❌ "Layout is fine at narrow widths." → ✅ "At 600 px viewport, footer buttons remain on a single row (no wrap) and the close X is reachable without horizontal scroll."

## When to mark a row "unreachable"

If the diff adds a code path you can't justify a user-visible trigger for (e.g. a defensive branch, a new IPC error class with no UI yet, an internal helper), don't invent one. Write the row as:

> `(currently unreachable from UI — would need <X>; consider mcp__ccd_session__spawn_task to wire it up.)`

This is more honest than a fake trigger and surfaces follow-up work cleanly.

## Output format

Plain Markdown, printed to the response. No file write by default. Structure:

```md
### PR #20 — Migrate shared modals to Modal primitive

| #   | Trigger           | Watch           | Expected outcome |
| --- | ----------------- | --------------- | ---------------- |
| M1  | <concrete action> | <where to look> | <falsifiable>    |
| M2  | ...               | ...             | ...              |

### PR #21 — Fix state-duplication in CourseDetail

| #   | Trigger | Watch | Expected outcome |
| --- | ------- | ----- | ---------------- |
| S1  | ...     | ...   | ...              |

### Cross-cutting smoke

| #   | Trigger                                | Expected outcome                                  |
| --- | -------------------------------------- | ------------------------------------------------- |
| X1  | Cold launch → home page                | App boots, store hydrates, no new console errors. |
| X2  | DevTools console during all rows above | No new warnings introduced by these PRs.          |

### No-test (refactor only)

- `src/.../foo.ts` — pure variable rename, no behavior change.
```

If the user asks to save it: write to `docs/test-matrix-<short-slug>.md`. Mention that `docs/` is gitignored / local-only per CLAUDE.md §9.

## Canonical example

The table generated for PRs #20 + #21 earlier in the project (modal-primitive migrations + CourseDetail state-duplication conversion) is the reference. Match its level of specificity. A few concrete cues from that example:

- **Modal rows** named non-dismissibility explicitly: "Esc does **nothing**. Click outside does **nothing**." — not just "won't close".
- **State row S2** named the _cross-path write_ that proves reactivity: "fire a sync that lands a new `notifications` row of `kind='announcement'`" — not just "trigger an update".
- **Regression rows** (S5, S6) were kept even though those branches were intentionally left local — confirming "we _didn't_ break what we didn't change" is part of the matrix.

## Anti-use

- Code-correctness review → `/code-review`.
- Security review → `/security-review`.
- Automated test runs → `/layer-test`, `npm test`.
- Actually opening the app and clicking through → `/verify` or `/manual-test-launch`.

This skill is the **plan**, not the run.
