---
name: session-handoff
description: Capture the current session's work, decisions, and open threads into a dedicated `docs/SESSION-HANDOFF.md`, which `CLAUDE.md` auto-loads via an `@SESSION-HANDOFF.md` import — so a fresh Claude session picks up where this one left off WITHOUT the handoff content living inline in CLAUDE.md. Also keeps a one-line pointer in MEMORY.md. Use when the user says "session handoff", "end of session", "save context for next time", "I'm starting a fresh session", "carry over context", or at the end of a multi-PR work block before the user steps away.
---

# Session handoff

Carry-forward context for the next session is written to a **separate
document, `docs/SESSION-HANDOFF.md`** — never inlined into `CLAUDE.md`.
`CLAUDE.md` only holds a one-line `@SESSION-HANDOFF.md` import that pulls
that document into context at session start, so the handoff still
auto-loads but stays out of the main rules file.

## Where things go (three files, distinct roles)

| File                                                                                  | Role                                                                                                                                                           | Auto-loads next session?                |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| **`docs/SESSION-HANDOFF.md`**                                                         | The full handoff (the rich "why we did X" content). Prepend the newest session; keep ~1–2 most recent, prune older. **This is the document the skill writes.** | Yes — via the CLAUDE.md `@import` below |
| **`docs/CLAUDE.md`**                                                                  | Holds ONLY a pointer section with `@SESSION-HANDOFF.md`. Added once (idempotent). **Never inline handoff content here.**                                       | Yes (it's the project memory)           |
| **`MEMORY.md`** (`C:\Users\ROG\.claude\projects\E--CanvasAssistant\memory\MEMORY.md`) | A single index pointer line to the handoff doc (belt-and-suspenders; this file lives outside the repo and auto-loads independently).                           | Yes                                     |

> Why a separate doc + `@import` instead of writing into CLAUDE.md: keeps
> CLAUDE.md lean (Claude Code targets <200 lines) and keeps durable
> architectural rules separate from transient session context, while still
> auto-loading the handoff. The `@import` syntax is a documented Claude Code
> feature; imported files load at launch alongside the file that references them.

## When to use

- End of a multi-PR work block; the user is about to start a fresh session or step away.
- The user says any of the trigger phrases.
- A non-trivial decision was made worth preserving ("we tried X but went with Y because Z") that wouldn't survive in commit messages alone.

## Do not use when

- The work is trivial / one-off (a typo fix doesn't deserve a handoff entry).
- The information is already captured in `CLAUDE.md` (durable rules), `docs/FOLLOWUPS.md` (cleanup items), `CHANGELOG.md` (user-facing changes), git history with descriptive commits, or a plan file under `~/.claude/plans/`. Duplicate captures go stale — worse than no capture.

## What auto-loads already (don't re-state)

| Source                             | Contents                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `.claude/skills/`                  | Every project skill + its trigger phrases                                   |
| `CLAUDE.md` + `.claude/rules/*.md` | Architectural rules (path-scoped rules load when working in matching paths) |
| `MEMORY.md`                        | Durable cross-session index                                                 |
| `docs/FOLLOWUPS.md`                | Open audit / cleanup work items                                             |
| `CHANGELOG.md [Unreleased]`        | Recent user-facing changes                                                  |
| `git log`                          | Commit messages                                                             |

`SESSION-HANDOFF.md` is for **conversational context that doesn't fit elsewhere.**

## What to capture

Skip anything covered by the auto-loaded sources above. The remaining signal:

1. **Recent PRs by number with a one-line "why"** — git log has the commits; a brief tying-together orients a fresh agent fast.
2. **Codified rules added this session** — point to the `CLAUDE.md` / `.claude/rules/` section by name (don't restate the rule).
3. **Open follow-ups by name** — point to `docs/FOLLOWUPS.md` sections; note which to pick up first.
4. **Key gotchas / decisions** — the "we tried X but went with Y" stuff that lives only in conversation.

## Write it conservatively

- **Be terse.** `SESSION-HANDOFF.md` is auto-loaded into every future session — bloat costs context window. ~50 lines per session entry is plenty.
- **Don't restate** anything in CLAUDE.md / FOLLOWUPS.md / CHANGELOG.md / git log.
- **Point, don't paste.** "See PR #16 / CLAUDE.md §2 / FOLLOWUPS.md 'state-duplication cleanup'" beats inlining.
- **Prune** older session sections from `SESSION-HANDOFF.md` (keep ~1–2 most recent). Because the file auto-loads in full, it must not grow unbounded.

## Steps

1. Read `docs/SESSION-HANDOFF.md` (if it exists) and `MEMORY.md` to see current state + the shape of existing entries.
2. Identify what to capture per the criteria above. **Ask the user** if unsure whether a specific item is worth keeping.
3. **Write the handoff to `docs/SESSION-HANDOFF.md`** — prepend a new dated section, then prune sections older than the ~1–2 most recent. Section shape:

   ```md
   ## Session handoff — YYYY-MM-DD (<short slug>)

   <one-paragraph "what we did this session, top-level">

   ### PRs landed

   - **#N** (`<hash>`) — one line of _why_, not what.

   ### Codified rules added

   - New SOP in CLAUDE.md §N / `.claude/rules/<file>` — point, don't restate.

   ### Open follow-ups

   - Section name in docs/FOLLOWUPS.md — one line on next-step bias.

   ### Key gotchas

   - Single-bullet items not obvious from the codebase.
   ```

4. **Ensure `docs/CLAUDE.md` points to it (idempotent).** If `docs/CLAUDE.md` does **not** already contain `@SESSION-HANDOFF.md`, append this section at the very end:

   ```md
   ## Session handoff (auto-loaded)

   > Latest cross-session working context lives in its own file, imported here so
   > it loads at session start without bloating this file. Maintained by the
   > `session-handoff` skill.

   @SESSION-HANDOFF.md
   ```

   - Edit **`docs/CLAUDE.md`** directly — the repo-root `CLAUDE.md` is a symlink to it and refuses symlink writes.
   - The import path is a **sibling**: `SESSION-HANDOFF.md` lives next to `CLAUDE.md` in `docs/`, and `@import` resolves relative to the real file's location.
   - If the section already exists, leave it — never duplicate the import or inline the handoff content into CLAUDE.md.

5. **Keep MEMORY.md in the loop (belt-and-suspenders).** Add/update a single pointer line in `MEMORY.md` (don't paste the full handoff there): e.g. under its index, `- Latest session handoff → docs/SESSION-HANDOFF.md (YYYY-MM-DD — <slug>)`.

## After saving

Tell the user:

- The handoff is in **`docs/SESSION-HANDOFF.md`**, auto-loaded next session via the `@SESSION-HANDOFF.md` import in `CLAUDE.md`.
- `MEMORY.md` has a one-line pointer.
- One sentence on any urgent open thread (e.g. "PR #N is still open and waiting on CI").

**Never inline handoff content into `CLAUDE.md`** — it gets only the `@import` pointer. `docs/` and `MEMORY.md` are private/local-only (gitignored / outside the repo); push/share at handoff per CLAUDE.md §9 if a fresh clone needs them.
