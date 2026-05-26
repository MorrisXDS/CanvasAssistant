---
name: layer-test
description: Run Jest tests for a specific layer of the 7-layer architecture (L0-utilities through L6-ui) with baseline tracking per `CLAUDE.md` §7 "Mandatory Testing Protocol". Records "X passing, Y failing, Z skipped" before AND after a code change so regressions stand out immediately. Use when the user says "run l4 tests", "test the l3 layer", "run layer N tests", "test the daemon layer", "baseline tests", or before/after a non-trivial change to any one layer.
---

# Layer test

Run Jest scoped to one layer with baseline tracking, as required by
`CLAUDE.md` §7 "Mandatory Testing Protocol":

> Before ANY code change: Run baseline tests for affected layer. Record baseline.
> After code changes: Build must succeed. Failures MUST NOT increase.

This skill wraps that workflow so the baseline → change → re-run loop
is one command and the delta is obvious.

## When to use

- Before starting a change scoped to one layer (capture baseline).
- After a change (compare against baseline, fail loudly if failures grew).
- The user says any of the trigger phrases.

## Do not use when

- The user wants the **full** test suite (`npm test` directly).
- The change spans multiple layers — run baseline for each affected
  layer separately, or run the full suite.

## Layer → test directory mapping

| Layer           | Test path pattern |
| --------------- | ----------------- |
| L0 utilities    | `l0-utilities`    |
| L1 persistence  | `l1-persistence`  |
| L2 daemon       | `l2-daemon`       |
| L3 intelligence | `l3-intelligence` |
| L4 controller   | `l4-controller`   |
| L5 presentation | `l5-presentation` |
| L6 ui           | `l6-ui`           |

## Steps

### 1. Capture baseline (before any change)

```bash
npm test -- --testPathPattern=l{N}-{layer}
```

Parse the final summary line: `Tests: X passed, Y failed, Z skipped`.
Record those three numbers as the **baseline**.

If failures > 0 in the baseline, surface that — the user is starting
from a non-green state and should know.

### 2. Make the change

(Outside this skill — the user is doing their actual work.)

### 3. Re-run + compare

```bash
npm run build              # build must succeed first (§7 rule)
npm test -- --testPathPattern=l{N}-{layer}
```

Parse the new summary. Compare to baseline:

| Delta                                        | Action                                                          |
| -------------------------------------------- | --------------------------------------------------------------- |
| Failures unchanged or fewer                  | ✅ Pass — report the deltas                                     |
| Failures **increased**                       | ❌ Fail — list which new tests are failing                      |
| Passed count dropped without failures rising | ⚠️ Tests vanished (file deleted? skipped?) — surface for review |

## L3 special case

If layer is `l3`, **also** consult the `l3-checklist` skill before
making changes — L3 has additional rules in `CLAUDE.md` §7 ("L3
Intelligence Layer Specific Rules").

## Reporting

Always show:

- Baseline: `X / Y / Z`
- After: `X' / Y' / Z'`
- Delta: `±N passing, ±M failing, ±K skipped`
- Names of any newly-failing tests (so the user can act).
