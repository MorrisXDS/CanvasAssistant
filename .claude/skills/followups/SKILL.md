---
name: followups
description: View, add, or close sections in `docs/FOLLOWUPS.md` — the per-repo durable home for cleanup work items scheduled after a PR lands. Section format is self-documented at the bottom of that file. Use when the user says "what's on the followup list", "show followups", "add a followup", "close followup", "tick off the modal cleanup", or wants to manage non-blocking work captured during a recent PR.
---

# Followups

`docs/FOLLOWUPS.md` is the **per-repo, cross-PR home** for cleanup work
items scheduled after a PR lands. Each `##` section is self-contained
(Source / Why / Rule / Action items) so any future agent can pick up
the work cold.

## When to use

- The user asks what's open.
- The user wants to add a new audit / cleanup pattern they noticed.
- A PR closed out part of an existing section — remove or amend it.
- During PR triage at the end of a piece of work, to capture work you
  noticed but didn't want to scope-creep the current PR.

## Layout reminder

The file is in the local-only `docs/` repo (gitignored from the main
project per the memory note). Each section follows this shape:

```md
## <Title — kebab/sentence case>

**Source:** <PR or session that originated it>

**Why this is a follow-up:** <one paragraph framing the bug class>

**Rule (codified in `CLAUDE.md` §N "<heading>"):** <pointer to the
codified rule, if any>

### Known suspects / Suspects to migrate / Action items

<file list, triage instructions, action steps>
```

Plus a "How to use this file" footer at the bottom that should NOT
be edited (it's the convention).

## Operations

### LIST — show what's open

```bash
grep -nE '^## ' docs/FOLLOWUPS.md
```

Skip `## How to use this file` (it's the footer, not a follow-up).
Report each section's title + line number. If the user asks for
detail, read the section.

### ADD — capture a new follow-up

Use this when a current PR notices a broader pattern but doesn't want
to expand scope. Stick to the layout above. Pin the description with:

1. **Source** — what PR / commit / session originated it (so a future
   agent can `git log` for context).
2. **Why this is a follow-up** — one paragraph framing the bug/rot
   pattern.
3. **Rule** (optional) — link to `CLAUDE.md` §N if the rule has been
   codified.
4. **Known suspects** — concrete file/path list. The more specific,
   the more pick-up-able by a future agent.
5. **Action items** — numbered, executable steps.

Insert before the `## How to use this file` footer. Use the existing
sections as templates.

### CLOSE — remove a completed section

When a PR finishes a follow-up section's work:

1. Verify all action items are actually complete (no half-deletes).
2. Remove the entire section in the same PR that completes the work.
3. Commit message convention: `docs: close FOLLOWUPS — <section name>`.

If only PART of a section is done (e.g. one suspect of many migrated),
amend the section's "Known suspects" list instead of deleting — leave
a progress note like:

```md
**Completed so far:**

- ✅ `ConfirmDialog.tsx` — migrated.
- ✅ `TaskMergeDialog.tsx` — deleted (dead code).

**Remaining suspects:**
...
```

(See the handwritten-modal cleanup section for the canonical example.)

### DISCOVER a third instance — amend, don't duplicate

If you find a third file matching an existing follow-up's pattern,
ADD it to the existing "Known suspects" list rather than starting a
new section.

## Cross-references

- The **rule** lives in `CLAUDE.md` §2 / §7 / §8 (durable, prescriptive).
- This file holds the **cleanup work items** (transient).
- The originating PR's plan file at
  `C:\Users\ROG\.claude\plans\<slug>.md` is per-PR ephemeral.
