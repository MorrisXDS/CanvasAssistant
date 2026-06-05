---
name: feature-delivery
description: Orchestrate the CanvasAssistant feature-delivery agent team end-to-end — architect → implementer → (test-engineer ‖ reviewer) → release-manager — driving any feature request or bug fix through CLAUDE.md §9's Propose → Make → Evaluate → Document → Push loop while enforcing the 7-layer invariants, course-visibility filtering, ADR-0007, and the §7 testing protocol. Use when the user asks to "build/implement/add" a feature, "fix" a bug, "take this to a PR", "run the team", "use the harness", or to "re-run / update / redo / improve / continue" a previous delivery. For trivial one-line edits, skip the team and just do it.
---

# Feature Delivery — CanvasAssistant orchestrator

Coordinate the five-agent feature-delivery team (defined in `.claude/agents/cid-*.md`) to
take ONE feature or bug fix from request to a merged PR, enforcing every CLAUDE.md invariant
along the way. You are the **team lead**: you create the team, assign tasks with
dependencies, monitor coordination, and synthesize the result.

This team is the **default execution mode** for non-trivial CanvasAssistant work. Use plain
inline edits only for trivial, unambiguous one-liners.

## Team (the "who")

| Agent                 | Phase (§9)      | Reuses skills                                                                  |
| --------------------- | --------------- | ------------------------------------------------------------------------------ |
| `cid-architect`       | Propose         | (reads CLAUDE.md/ADRs/codegraph)                                               |
| `cid-implementer`     | Make            | `scaffold-modal`, `scaffold-ipc-handler`, `l3-checklist`                       |
| `cid-test-engineer`   | Evaluate (test) | `layer-test`, `test-matrix`                                                    |
| `cid-reviewer`        | Evaluate (QA)   | `milestone-check`, `state-duplication-audit`, `secret-scan`                    |
| `cid-release-manager` | Document + Push | `commit-and-push`, `secret-scan`, `followups`, `wait-for-pr`, `branch-cleanup` |

Execution mode: **agent team** — members self-coordinate via `SendMessage` + a shared
`TaskCreate` list; structured artifacts pass through `_workspace/` files. All agents run
`model: "opus"`.

## Phase 0 — Context check (ALWAYS run first)

Confirm understanding per CLAUDE.md §0, then pick the run mode:

1. **Rephrase the request** back to the user ("Let me confirm my understanding: … Is this
   correct?") unless it's trivial and unambiguous. Wait for confirmation on anything with
   multiple interpretations or UI/UX impact.
2. Inspect `_workspace/`:
   - **absent** → **initial run** (full pipeline).
   - **present + user asks for a partial change** ("just redo the tests", "tweak the modal")
     → **partial re-run**: re-invoke only the affected agent(s), feeding the existing
     `_workspace/0*` reports as input.
   - **present + a genuinely new request** → **new run**: move `_workspace/` to
     `_workspace_prev/`, start fresh.
3. Confirm a git feature branch will be used (never `main`).

## Phase 1 — Plan (architect)

Create the team and assign the planning task to `cid-architect`. It writes
`_workspace/01_architect_plan.md` (intent, branch, touched layers/files, reuse, new
artifacts, ADR decision, test plan, risks, task breakdown).

**Gate:** if the architect flags a blocking ambiguity or an ADR-needed decision, surface it
to the user before proceeding (don't build through an unresolved decision).

## Phase 2 — Implement (implementer)

`cid-implementer` branches and codes the plan, running scaffold skills as directed, and
announces each cohesive **module** as it lands (to enable incremental QA). Writes
`_workspace/02_implementer_changes.md`. Must `npm run build` clean before handing off.

## Phase 3 — Evaluate (test-engineer ‖ reviewer, in parallel, incremental)

As each module is announced, `cid-test-engineer` and `cid-reviewer` evaluate it
concurrently:

- test-engineer: §7 protocol — baseline, build, layer + full suite, **diff-coverage**
  (`node scripts/diff-coverage-check.js`). Writes `_workspace/03_test_report.md`.
- reviewer: boundary-crossing QA + invariant gates + `milestone-check` side-effect scan.
  Writes `_workspace/04_review_report.md`.

Findings loop back to `cid-implementer`, who fixes and re-announces. **Gate to Phase 4:**
test-engineer GREEN **and** reviewer APPROVE.

## Phase 4 — Document + Push (release-manager)

`cid-release-manager` routes docs to the one right place (§9), updates `CHANGELOG.md`
(UTC), records FOLLOWUPS, runs `secret-scan` + `commit-and-push` (Conventional Commits;
protected-`main` → feature branch → PR), opens the PR, and `wait-for-pr` → confirms MERGED
before any `branch-cleanup`. Writes `_workspace/05_release_report.md`.

## Data flow & error handling

- **Workspace:** intermediate artifacts in `_workspace/{phase}_{agent}_{artifact}.md`
  (e.g. `01_architect_plan.md`). Preserve them after the run for audit; only the code +
  docs land in the repo.
- **Coordination:** `TaskCreate` for the dependency graph (Plan → Implement →
  {Test ‖ Review} → Release); `SendMessage` for findings/fix loops; files for the reports.
- **Errors:** one retry, then proceed without that result and **note the gap in the report**
  (don't silently drop it). Conflicting data → keep both, cite sources, never delete.
  A RED test suite or CHANGES-REQUESTED review **blocks** Phase 4 — no PR until resolved.
- **Native ABI:** dev builds flip `better-sqlite3` to Electron; `npm test` flips to Node.
  Expect the flip between implement and test phases.

## When NOT to use the team

Trivial, unambiguous edits (a typo, a one-line copy change, "run the tests") — just do them
inline. The team's coordination overhead is only worth it for real features/bug fixes that
cross layers or need the §7 gate.

## 테스트 시나리오 (Test scenarios)

**Normal flow:** "Add a 'Mark all as read' button to the notifications page."
→ Phase 0 rephrase + initial run → architect plans (L6 button → L5 action → L4 command →
L1 write via command; visibility-filtered; test plan) → implementer branches + codes +
`scaffold` if a modal → test-engineer adds command + store tests, diff-cov green → reviewer
confirms store-not-useState + visibility + no raw SQL → release-manager CHANGELOG line +
`feat(notifications): add mark-all-as-read` PR → merged.

**Error flow:** implementer's change drops global coverage below the floor and reviewer
finds a handwritten `position:'fixed'` modal. → test-engineer reports RED (diff-cov uncovered
lines), reviewer reports CHANGES-REQUESTED (use `Modal` primitive). Lead blocks Phase 4,
loops both findings to implementer, who fixes; re-evaluate → GREEN + APPROVE → Phase 4 proceeds.
