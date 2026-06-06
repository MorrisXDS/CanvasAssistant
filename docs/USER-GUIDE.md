# User Guide

> A page-by-page tour of what Canvas Assistant does and the workflows + non-obvious
> behaviors worth knowing. For the exact keyboard shortcuts on any page, press
> <kbd>?</kbd> inside the app — that help sheet is generated from the app's own shortcut
> registry, so it's always current (this guide intentionally doesn't re-list keys, to
> avoid drift). For setup see the [README](../README.md); for how it's built see
> [ARCHITECTURE.md](ARCHITECTURE.md).

## How it works at a glance

- **Offline-first.** Your local database is the source of truth. Sync pulls from Canvas in
  the background; everything already pulled stays usable with no network.
- **Canvas data is read-only; your edits layer on top.** A target grade, a custom task, a
  "what-if" grade — these are stored locally and never pushed to Canvas. Incoming Canvas
  changes that clash with a local edit are held for you to review (see [Updates](#updates)).
- **Press <kbd>?</kbd> anywhere** for that page's shortcuts; <kbd>Ctrl/⌘</kbd>+<kbd>1…5</kbd>
  jumps between the main pages.

---

## Dashboard

Your at-a-glance overview and triage hub.

- **Four stats:** active courses, pending tasks, overdue tasks, and your **weighted average
  grade** (computed across courses from graded coursework, weighted by credits). Click a
  stat to jump to the full list.
- **Average grade → breakdown.** Clicking the average opens a per-course grade breakdown.
- **Grade simulation.** Run a "what-if" (e.g. _what if I get 95% on the final?_) and the
  average + breakdown update live, without touching your real grades.
- **Upcoming coursework** is a triage list ordered by due date (not an algorithmic ranking).
- **Important Works** surfaces incomplete coursework above a weight threshold you set in
  Settings → _High-weight task threshold_ — useful for "what actually moves my grade."
- **Announcements** and **Today's schedule** round out the view. **Sync Now** triggers a
  manual sync.

---

## Calendar

Every deadline and event in one place.

- **Month / week / day** views, color-coded by course (a legend sits at the bottom).
- **Filters:** by course, task type, priority, and deadline status. A "filters active"
  badge appears whenever any filter is set.
- **Your own events.** Create and edit events directly; task due dates show automatically
  alongside them.
- **Import / export.** Pull in external events from an `.ics` file, or export your
  deadlines to `.ics` for any other calendar app.

---

## Courses

All your courses, your way.

- **Grid or list** view with current grade and progress; an overall average is shown up top.
- **Find + focus:** search by name, filter by grade range, and **pin** important courses to
  the top.
- **Hide vs. archive.** _Hidden_ courses drop out of every view but aren't archived;
  _archived_ courses move to a collapsible "Archived" section and stop appearing elsewhere.
  Both are reversible. (Visibility is enforced everywhere — hidden/archived courses' tasks,
  announcements, files, and calendar entries are filtered out too.)
- Open any course for its detail page.

---

## Course Detail

Everything for one course, organized into sections (jump between them with the on-screen
section bar or its shortcuts).

- **Tasks** — the course's coursework, filterable by status (All / Pending / Submitted /
  Graded / Non-graded) via the count chips; edit a task inline, mark complete, or open it
  on Canvas.
- **Queue** — Canvas items pulled in awaiting your accept/triage.
- **Announcements** — the course's announcements; open one for the full text.
- **Settings / Preferences** — set a nickname, color, credit weight, **target grade**, and
  grade-curve adjustment for the course.
- **Grade history** charts your recent grade snapshots; the **syllabus** is rendered inline.
- Archiving the course is available from here (it asks for confirmation first).

---

## Files

Your course materials, browsable and available offline.

- **Mirrors the Canvas folder tree:** expand a course → its folders → files and pages.
- **Download** what you need; **list or grid** view; **search** by filename and **filter**
  by source type, download status, or size.
- **Offline reading.** Synced course pages are cached locally with their links rewritten to
  local paths, so they open without a network connection.
- **Notification dots** flag folders that received freshly-synced files.

---

## Tasks

Every assignment across every course in one list.

- **Filter** by status (All / Pending / Overdue / Completed) and **sort** by deadline.
- **Add a task** of your own (stored locally), mark tasks complete, edit, or open the
  Canvas original.

---

## Announcements

A searchable feed across all courses.

- **Search** and **filter** by course, type, or read status. Open one for the full
  announcement, with a link back to Canvas.

---

## Updates

Review everything that changed since your last sync — the heart of the offline-first model.

- **Two streams:** Canvas items queued for you to accept (left), and a feed of what changed
  — new grades, files, pages, announcements (right).
- **Conflict resolution.** When a local edit clashes with a Canvas change, it shows up here
  with both values side by side — choose **Keep Local** or **Use Canvas**, and optionally
  **remember the choice** so the same decision auto-applies on future syncs.
- **Duplicate handling.** When a Canvas task looks like one you already have, a
  duplicate-warning flow lets you **link** them, **keep them separate**, or **bulk-merge**
  with per-field customization.

---

## Settings

Tune the app to your workflow. Sections include:

- **Display & Layout** — theme (light / dark / system), landing page, collapsed sidebar,
  the high-weight task threshold, and default views for Courses / Calendar / Files.
- **Academic** — your target grade and term selection (all / current / a specific term).
- **Files** — download location and filters.
- **Sync** — auto-sync on/off and cadence.
- **Account** — your Canvas connection (and re-authentication).
- **Notifications** — which changes trigger a notification.
- **Data** — **scheduled, optionally encrypted backups** with rotation, exports, data
  retention, and a full reset.
- **Updates** — enable automatic checks for new versions (daily / weekly / on launch only).
  When an update is available a notice appears with a compatibility warning if the new
  version is a major release; a "Check Now" button triggers an immediate check. Off by
  default.

---

## A few cross-cutting tips

- **Nothing you do here changes Canvas.** Edits are local; the app only ever _reads_ from
  Canvas.
- **Term selection** (Settings → Academic) is the quickest way to declutter — set it to the
  current term and past courses drop out everywhere.
- **Lost a shortcut?** <kbd>?</kbd> for the current page, <kbd>Ctrl/⌘</kbd>+<kbd>?</kbd> for
  the global set.
