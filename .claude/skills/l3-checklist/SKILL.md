---
name: l3-checklist
description: Pre-flight checklist before modifying any L3 intelligence service (GradeCalculationService, SubmissionStatusService, DataCompletenessAnalyzer, content-analysis, data-quality). Enforces the extra-strict rules from `CLAUDE.md` §7 "L3 Intelligence Layer Specific Rules" — read existing tests first, capture baseline, verify ServiceRegistry init, check IPC contract. Use BEFORE touching anything under `src/layers/l3-intelligence/` or when the user says "modify l3", "change the grade calculator", "touch l3 intelligence", "edit submission status", or similar.
---

# L3 modification pre-flight checklist

L3 feeds grades, submission status, and data-completeness analysis
directly to the UI. Mistakes here are USER-VISIBLE and HIGH-IMPACT
(wrong grades, missing assignments showing as submitted, etc.). The
extra rules in `CLAUDE.md` §7:

> 1. NEVER modify L3 without reading existing tests first
> 2. ALWAYS run `npm test -- --testPathPattern=l3-intelligence` before AND after changes
> 3. VERIFY ServiceRegistry initializes L3 services correctly
> 4. CHECK IPC contract if adding/removing L3 exports

## When to use

- ANY change under `src/layers/l3-intelligence/`.
- The user says any of the trigger phrases.
- Even small refactors / renames — L3 is in scope.

## Do not use when

- Working in any other layer.
- Reading L3 code (no risk).
- The change is so narrow (e.g. updating a comment) that it can't break behaviour.

## Steps

### 1. Read existing tests for affected files FIRST

For each file you're about to modify, locate the test:

```
src/layers/l3-intelligence/<file>.ts
→ tests/l3-intelligence/<file>.test.ts          (most common)
→ tests/l3-intelligence/domain/<file>.test.ts   (for pure-function domain helpers)
```

Read the test file. Understand the contract being tested. Only then
look at the implementation.

If no test exists for the file you're about to modify, that's a red
flag — `CLAUDE.md` §7 lists missing L3 tests as required follow-up
work. Either write the test first or surface this to the user.

### 2. Capture the baseline

Run via the `layer-test` skill OR directly:

```bash
npm test -- --testPathPattern=l3-intelligence
```

Record:

- Test suites: N passed
- Tests: X passed, Y failed, Z skipped
- Any tests already failing? (start from a known state)

### 3. Make the change

(Outside this skill — the actual work.)

### 4. Verify build + tests

```bash
npm run build                                           # MUST succeed (§7)
npm test -- --testPathPattern=l3-intelligence           # Failures MUST NOT increase
npm test                                                # Full suite before commit
```

If failures grew, fix them or revert. Do NOT commit failing tests.

### 5. Verify ServiceRegistry initialization

L3 services are registered in `src/layers/l0-utilities/ServiceRegistry.ts`
(or similar — check the file). If you added/renamed an L3 service:

- Confirm it's registered in `ServiceRegistry`.
- Confirm any consumers (other L3 services, L4 commands, IPC handlers)
  can resolve it.
- Run a smoke launch via the `manual-test-launch` skill — confirm the
  app actually starts (a missing registry entry usually crashes at
  startup).

### 6. Check IPC contract

If you added or removed an L3 method that's exposed to the renderer:

- Update `src/shared/ipc-contract.ts` with the new/removed schema.
- Update `src/preload.ts` with the new/removed binding.
- Update the L4 command (if applicable) that dispatches to it.
- Update the L5 store action (if applicable) that calls it.
- The end-to-end chain must compile. `npm run build` will surface
  most type mismatches.

### 7. Write/update tests for the change

Per `CLAUDE.md` §7:

- New public method → MUST write unit test.
- Bug fix → MUST write regression test.
- Behaviour change → MUST update existing tests.

Coverage targets for L3:

- Domain services (pure functions): **90% branch coverage**.
- Orchestrators / controllers: 70%.

## L3 file map (quick reference)

```
src/layers/l3-intelligence/
  domain/                       # Pure functions — high coverage target
  GradeCalculationService.ts
  SubmissionStatusService.ts
  content-analysis/
  data-quality/
  submission/
  (+ orchestrators / index files)
```

Tests mirror src under `tests/l3-intelligence/`. Pure-function helpers
tested under `tests/l3-intelligence/domain/`.

## ADR pointer

Significant L3 changes (e.g. removing or replacing a service) likely
warrant an ADR per `CLAUDE.md` §9. See `docs/adr/0003-l3-removal.md`
for the precedent (the broader L3-intelligence removal documented there).
