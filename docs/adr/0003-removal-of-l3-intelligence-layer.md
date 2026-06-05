# 0003 — Removal of the L3 "intelligence" layer

Status: Accepted

## Context

An earlier version of CID shipped a large L3 "intelligence" subsystem: a **PriorityEngine**
with an **ROI scoring formula**, a **course policy / grace-token system**, and
**recommendation, insight, workload, behavior-analytics, and adaptive-learning**
orchestrators. Much of the original design documentation (e.g. the old `ROI_FORMULA_SPEC`,
`POLICY_SYSTEM_SPEC`, and the v4 implementation plan) describes this subsystem in detail.

This _priority/scoring_ machinery was subsequently **removed** — but the L3 layer itself
remains. L3 still contains grade calculation + grade **simulation** ("what-if"),
**content analysis** (text extraction from syllabus/pages), **data-quality analysis**, and
**submission-status**; only the priority/recommendation systems were cut. The removal is
stated explicitly in `src/lifecycle/ipc-handlers/intelligenceHandlers.ts`:

> "Priority, recommendation, insight, workload, behavior, and adaptive learning systems
> have been removed. Only simulation handlers remain."

## Decision

Treat the **priority / ROI / policy / recommendation / insight / workload / behavior /
adaptive-learning** subsystem as **intentionally removed**. L3 still supports grade
calculation, grade simulation, content analysis, data-quality, and submission-status. The
associated IPC channels (`priorities:*`, `intelligence:*`) were also removed from
`preload.ts` and the IPC contract.

## Consequences

- **Many older docs are now misleading** — they describe removed features as if live. This
  is the project's main source of documentation drift; the obsolete specs were pruned and
  this ADR preserves the "it was removed, don't resurrect it" signal.
- Do **not** re-wire `priorities:*` / `intelligence:*` channels or re-add ROI scoring
  expecting the old backend — it's gone.
- The exported result _schemas_ (e.g. `PriorityItemSchema`) were intentionally kept because
  renderer types still reference them; only the channel wiring was removed.

## Rationale

The L3 intelligence subsystem was **not realistic for the target device**. Its priority
scoring, analytics, and adaptive-learning work imposed compute/memory cost that didn't fit
the resource budget of the hardware CID targets (an offline-first desktop app held to a
strict footprint — see the <300MB RSS target in `CLAUDE.md`). The feature was cut to keep
the app within that budget on the target machine.

Treat this as **rejected under the current target constraints**, not merely deferred: it
should only be revisited if the target platform/resource envelope changes. Do not
reintroduce ROI scoring or the intelligence orchestrators expecting them to fit the
existing footprint.
