---
name: milestone-check
description: Verify that completed changes match what was discussed/planned for a small milestone AND scan for unexpected changes / side effects (dangling references, caller breakage, contract & shared-code ripple, regressions), then report an alignment index plus differences and risks. Use after finishing a milestone or chunk of work, or when the user says "verify alignment", "check the milestone", "did this match the plan", "check for side effects", "alignment index", or similar. Compares the agreed intent (conversation + any saved plan) against the actual uncommitted diff.
---

# Milestone Alignment Check

Verify that the work just completed on a small milestone actually matches what was
discussed and planned, **and that it didn't introduce unexpected changes or side effects**
— then quantify the match with an **alignment index** and list every difference and risk.
This guards against two failures: drift between intent and implementation, and changes that
match intent but quietly break something else.

This is the quantified, invokable form of the "Plan Verification Protocol" in CLAUDE.md.

## When to run

- Right after finishing a small milestone or a discrete chunk of work.
- When the user asks to verify alignment / check the milestone / "did this match what we agreed".

## Inputs

- **Intent (what was discussed)** — two sources, merged:
  1. The **current conversation**: the scope, decisions, and constraints the user and you
     agreed on for this milestone (including answers to clarifying questions, explicit
     "do X not Y" instructions, and items explicitly deferred/out-of-scope).
  2. Any **saved plan**: check `~/.claude/plans/*.md` (most recently modified first) and
     `docs/*PLAN*.md` / `DevDocs/*.md`. If a plan clearly corresponds to this milestone,
     fold its checklist items into the intent. If none applies, proceed with the
     conversation only and say so.
- **Implementation (what changed)** — by default the **uncommitted working-tree diff**.
  - Optional argument overrides the scope:
    - `milestone-check HEAD~3..HEAD` → a commit range
    - `milestone-check --staged` → staged changes only
    - `milestone-check path/to/file.ts path/to/other.tsx` → a specific file set

## Workflow

### Step 1 — Establish the intent checklist

Write an explicit, itemized list of what was agreed for this milestone. Each item is a
concrete, verifiable claim, e.g. "Add `O` / `Shift+Enter` to open the focused course in
Canvas". Pull from the conversation first, then merge matching saved-plan items.

Also capture two side-lists:

- **Out-of-scope / deferred** — things explicitly agreed NOT to do (so doing them counts
  as a deviation, not a bonus).
- **Constraints** — non-negotiables stated by the user or CLAUDE.md that the changes must
  respect (e.g. "use `VisibleDataProvider`", "no `console.log`", "report-only unless told").

If the intent is genuinely ambiguous, ask ONE clarifying question before scoring rather
than guessing — a wrong baseline makes the whole index meaningless.

### Step 2 — Capture the actual changes

Run in parallel (adapt to the scope argument):

- `git status`
- `git diff --stat` (and the same for `--staged` / the commit range as needed)
- `git diff` (and untracked files via `git status` — read new files with the Read tool)

Read the actual changed code, not just the stat. You are verifying behavior matches
intent, not that files were touched.

### Step 3 — Classify each intent item

For every item in the Step 1 checklist, assign one status by inspecting the real diff:

| Status       | Meaning                                                        | Score |
| ------------ | -------------------------------------------------------------- | ----- |
| **Done**     | Implemented as discussed; behavior matches intent              | 1.0   |
| **Partial**  | Started but incomplete, or only some sub-parts done            | 0.5   |
| **Deviated** | Implemented differently than agreed (different approach/shape) | 0.25  |
| **Missing**  | Discussed but no corresponding change found                    | 0.0   |

Assign an integer **weight** to each item reflecting its importance to the milestone
(default `1`; give core items `2`–`3`, trivial polish `1`). Note the evidence
(`file:line`) for each classification.

Separately flag:

- **Unplanned changes** — modifications in the diff that map to no intent item. Note each
  with `file:line` and a one-line description. (These don't lower the index directly but
  are reported as scope discipline issues — a deferred/out-of-scope item showing up here
  is a Deviation.)
- **Constraint violations** — any change that breaks a Step 1 constraint.

### Step 4 — Side-effect & blast-radius scan

Alignment with intent is not enough: a change can match what was discussed yet still break
something else. For **every changed, removed, or renamed symbol** in the diff, trace its
ripple effects and flag anything that could cause unexpected behavior outside the
milestone's intended scope.

Check each of these and cite `file:line` evidence:

- **Orphaned / dangling references** — a symbol (function, type, export, constant, channel,
  prop, CSS class) was removed or renamed but other code still references the old name.
  Grep the repo for the old identifier; any surviving hit is a break.
- **Caller impact** — for a modified function/signature/return shape, find its callers and
  confirm they still pass valid args and handle the new shape. New required params, changed
  return types, or new thrown errors are side effects.
- **Shared/cross-cutting code** — changes to anything imported widely (utils, hooks, store
  slices, `index.ts` re-exports, primitives, formatters, constants, IPC contract/preload).
  Edits here have a large blast radius; list the dependent features that could be affected.
- **Contract / boundary changes** — IPC channels, exported public API, types consumed across
  layers, function signatures crossing the L5/L6 ↔ main boundary. A change on one side that
  the other side doesn't expect is a side effect.
- **State & event ripple** — changes to Zustand store shape/selectors, `EventEmitter`
  events, or React effect dependencies that could trigger extra renders, stale data, or
  missed updates.
- **Data & persistence** — new/edited SQL migrations, schema/row-type changes, or write
  paths. Flag anything that alters existing data, ordering, or is non-idempotent / not
  reversible.
- **Project-invariant regressions** — does the change accidentally bypass
  `VisibleDataProvider`, introduce `console.log`, use `fetch`/`sqlite3`, or otherwise break a
  CLAUDE.md rule as a _side effect_ of doing something else?
- **Behavioral regressions in adjacent features** — reason about what else exercises the
  touched code path; note any plausible regression and how to verify it.

Classify each finding by severity:

| Severity   | Meaning                                                              |
| ---------- | -------------------------------------------------------------------- |
| **High**   | Will break at compile/run time, or corrupts data (e.g. dangling ref) |
| **Medium** | Likely behavioral regression in an adjacent feature                  |
| **Low**    | Possible/unverified ripple worth a manual check                      |

Where cheap, **verify** rather than speculate: grep for the old identifier, run
`tsc --noEmit`, or read the caller. State what you verified vs. what remains a flagged risk.

### Step 5 — Compute the alignment index

```
Alignment Index = round( Σ(weightᵢ × scoreᵢ) / Σ(weightᵢ) × 100 )
```

Then apply penalties (report them explicitly, floor at 0):

- −15 per **High-severity side effect** (a confirmed break or data risk)
- −7 per **Medium-severity side effect** (likely adjacent regression)
- −2 per **Low-severity side effect** (unverified ripple)
- −5 per **constraint violation**
- −3 per **unplanned change** that touches behavior (cosmetic/formatting-only: −1)

Map the final number to a band for a quick read:

- **90–100 — Aligned**: ship it.
- **70–89 — Mostly aligned**: minor gaps/deviations to close.
- **50–69 — Partial**: meaningful scope missing or reshaped; review before moving on.
- **<50 — Misaligned**: implementation diverged from what was agreed; stop and reconcile.

**Hard gate:** if there is **any High-severity side effect**, the band is capped at
**Misaligned (<50)** regardless of the computed number — a milestone that breaks something
is not aligned, even if every intent item was delivered. Say this explicitly in the report.

### Step 6 — Report

Output in this exact shape:

```
# Milestone Alignment Report

**Alignment Index: 84% — Mostly aligned**
Intent source: conversation + plan `gleaming-orbiting-rose.md`
Change scope: uncommitted working tree (6 files)

## Per-item
| # | Item | Weight | Status | Score | Evidence |
|---|------|--------|--------|-------|----------|
| 1 | ... | 3 | Done | 1.0 | CoursesPage.tsx:142 |
| 2 | ... | 2 | Partial | 0.5 | CourseGridCard.tsx:30 — outline added, resize stride missing |
| 3 | ... | 2 | Missing | 0.0 | — no hotkey found |

Raw score: Σ(w·s)/Σw = 0.90 → 90%
Penalties: −7 (1 medium side effect), −3 (1 behavioral unplanned change) → 80%

## Side effects & risks
| Severity | Finding | Evidence | Verified? |
|----------|---------|----------|-----------|
| High | <e.g. removed export still imported> | foo.ts:12 imports gone Bar | grep: 1 hit |
| Medium | <adjacent feature regression> | store.ts:88 selector shape changed | not verified |
| Low | <possible ripple> | formatters.ts:also used by Calendar | not verified |

(If none: "No side effects detected — diff is self-contained.")

## Differences
- **Missing**: <item> — was discussed, not implemented.
- **Deviated**: <item> — agreed X, found Y at file:line.
- **Unplanned**: <change> at file:line — not in the agreed scope.
- **Constraint**: <violation> at file:line.

## Alignment (done as discussed)
- <item> — file:line
```

Keep evidence concrete (`file:line`). No praise padding. Lead the report with any
High-severity side effect — it matters more than the score.

### Step 7 — Offer fixes

After the report, if there are any side effects, Missing / Partial / Deviated items,
unplanned changes, or constraint violations, **offer to fix them** — list the specific
fixes you'd make and ask for approval. Prioritize High-severity side effects first. Do
**not** edit code as part of the check itself; the verification is read-only. Only proceed
with fixes once the user approves, and re-run the check afterward if asked.

## Notes

- "Discussed" includes things the user told you NOT to do — silently doing them is a
  Deviation, not initiative.
- A high index with many unplanned changes still signals a process problem; surface it.
- If there is no diff at all, report that nothing changed and ask whether the milestone's
  work landed elsewhere (different branch, already committed beyond the inspected scope).
