# CanvasAssistant

Offline-first academic command center for Canvas LMS — pulls courses, tasks, announcements, files, and grades into a local SQLite database the user owns, then lets them work against that local copy with what-if grade simulation, custom tasks, and review queues for incoming Canvas changes.

## Language

### Cross-cutting states

States that appear on multiple entities. Defined once here; entity-specific entries below link rather than redefine.

**Dismissed**:
An entity the user has explicitly removed from view. Stored as a nullable `dismissedAt` ISO timestamp (or equivalent named column). Dismissed entities are filtered out of default listings — they are not deleted, just hidden. The state is **reversible in schema** (every dismissal-capable entity has an `undismiss` repository method or equivalent), but **one-way in the current UI** — no surface invokes the reversal. Applies to: Announcement, Recommendation, syllabus prompt on Course, and at least one sync-session row type.
_Avoid_: "hidden" (overloaded with Course.is_hidden), "archived" (overloaded with Course.archived_at), "read"/"marked read" (no separate read state exists — dismissal is the only consumed-state signal)

**Visibility**:
A Course's exit-from-default-visible state. A Course is **visible** iff `archived_at IS NULL` AND `is_hidden = 0` AND `deleted_at IS NULL` AND it passes the user's `termSelection` filter. The four exit paths are independent — a Course can be in multiple simultaneously (e.g. hidden AND archived) — though the UI treats any non-visible state the same: filtered out of dashboards, task lists, and the visible-data IPC handlers. Codified in [`VisibleDataProvider`](src/layers/l1-persistence/VisibleDataProvider.ts) per [CLAUDE.md §8](CLAUDE.md). Three of the four signals are reversible by the user; **auto-archive (`archive_source='auto'`) is not** — once a Course was auto-archived because its term ended, the user cannot restore it via the UI. The visible/non-visible derivation cascades: any course-scoped data (tasks, files, announcements, calendar events) inherits the parent Course's visibility.
_Avoid_: "visible" (bare — fine in conversation but use Visibility in code), "active" (overloaded with `is_active` on Policy), "shown" (too generic)

**LocallyEdited**:
A Canvas-derived text field that the user has overridden locally. Implemented as a paired-column pattern: the editable field (e.g. `description`, `message_html`) holds the _current_ value (user-edited or Canvas-original); a corresponding `<field>_original` column holds the Canvas-authoritative value before the user touched it. The pattern preserves what Canvas said so a future sync can detect conflict instead of silently winning. Implements [ADR-0005](docs/adr/0005-canvas-data-read-only-local-what-if-edits.md)'s "local edits are what-if annotations" rule for fields where a free-text local override makes sense. Applies to: Task (`description` / `description_original`), Announcement (`message_html` / `message_html_original`), CoursePage (`body_html` / `body_html_original`).
_Avoid_: "overridden", "patched", "annotated"

### Announcements

**Announcement**:
A message posted by an instructor in a course — Canvas's discussion-topic-with-`only_announcements`. Stored in the `notifications` table (vestigial name — see ambiguity below) with `source_type='announcement'`. Has a title, message body (plain + HTML — `messageHtml` is the canonical content; `message` is a plain extract; FileReference extraction depends on `messageHtml`), publish timestamp, and supports the cross-cutting **Dismissed** state. Can carry zero or more AnnouncementAttachments and zero or more embedded FileReferences in its HTML body. The HTML body is **LocallyEdited**-capable (`message_html_original` preserves the Canvas-authoritative version if the user has overridden the body). The old policy-detection columns (`is_policy_related`, `policy_keywords`, `priority_level`, `linked_policy_id`) are **no longer written** — the keyword-detection that populated them was removed 2026-06-02 (ADR-0003 cleanup; all three derived columns were unconsumed). The columns persist (a `notifications` rebuild is needed to drop them — see the migration-runner FK-OFF blocker) but always hold their defaults now.
_Avoid_: "notification" (overloaded — see flagged ambiguity), "post", "discussion topic"

**PolicyAnnouncement** _(removed — table dropped in migration 106, 2026-06-01)_:
Formerly a detection record written when sync saw an announcement flagged with `is_policy_related=true`, stored in `policy_announcements` keyed by `notification_id`. The write was live but the consumer was dead — nothing read it to create/update a `course_policies` row since the intelligence layer was removed per [ADR-0003](docs/adr/0003-removal-of-l3-intelligence-layer.md). The two orphan sync writers, the dead `policy-detected` event, and the table itself were removed. The `is_policy_related` flag on the notification row survives (still computed by `detectPolicyKeywords`) but is now likewise unconsumed — a harmless leftover boolean (micro-followup: stop computing it).
_Avoid_: "policy detection", "detected policy"

#### Flagged ambiguity — "Notification" means three different things

Three distinct concepts share the word "notification" in this codebase, and using the word un-qualified creates real confusion:

1. **The `notifications` table** — actually holds only Announcements today (only `source_type='announcement'` is ever written, despite the 4 other values in the CHECK constraint).
2. **The `sync_updates` table** — the user-facing "what changed since last sync" feed (cluster #7 territory).
3. **The L6 UI components** `NotificationsFeed`, `NotificationDot`, `Settings/NotificationsSection` — render concept #2 (sync_updates), not concept #1 (announcements).

The schema's "notification" name dates from when the table was designed to be a general change feed (a role now played by `sync_updates`); the UI's "notification" name is from the user-facing meaning of "the little dot in the corner." They drifted apart, the word stuck on both. **In conversation, code, and future glossary entries, use the specific term (`Announcement`, `SyncUpdate`, or the specific UI component name) and reserve "notification" only for direct references to the legacy schema name.**

### Files & references

The codebase has two physically distinct file entities (different tables, different lifecycles, different identity), plus a separate concept for _pointers to_ them, plus — as of [ADR-0008](docs/adr/0008-file-entity-unification.md) — a **read-time** unification (**FileEntity**) that collapses the two physical entities under a single Canvas-ID-keyed view. The physical entities (CanvasFile, AnnouncementAttachment) remain distinct at the storage layer; FileEntity is what consumers downstream of `FileEntityProvider` see.

**CanvasFile**:
A file inside a course's content area — a PDF in a module, an upload under the Files section, a syllabus attachment. Has a Canvas-side identity (external ID) and an optional local download. Stored in the `resources` table with `type='file'`. Carries built-in provenance: `context_type` and `context_id` record where the file was first surfaced (`page`/`assignment`/`syllabus`/`module`/`announcement`/`files`); `first_referenced_by` adds a finer-grained source key in the form `'assignment:123'` or `'page:front-page'`. Has a `remote_updated_at` column recording the Canvas-side modification time — this is a real staleness signal but is not currently consulted by the UI. A `version` column supports optimistic locking on writes. Lives as long as the course row is unarchived; the row outlives Canvas-side file deletion if no sweeper revisits it.
_Avoid_: "resource", "FileResource", "course file"

**AnnouncementAttachment**:
A file attached to an announcement when that announcement was posted on Canvas. Owned by exactly one announcement; dies with the announcement (FK cascade). Stored in the `notification_attachments` table. Carries an explicit `downloadStatus` lifecycle (pending / downloading / completed / failed) that CanvasFiles don't have. As with CanvasFile, the row outlives Canvas-side file deletion if the announcement still exists.
_Avoid_: "notification attachment", "FileAttachment", "attachment" (bare — too ambiguous)

**FileEntity**:
The unified read-time view of a single Canvas file blob, identified by the Canvas File ID (`canvasId`). Produced by `FileEntityProvider` (an L1 service introduced in PR-F.2) by composing reads against the two physical tables. **Not a row** — has no backing table; it's a synthesized shape. Combines canonical fields (`filename`, `displayName`, `sizeBytes`, `contentType`, `uuid`, `courseId`) once at the top level with a `presences` discriminated record: `canvasFile` (nullable; at most one — the `resources` row) and `attachments` (array, possibly empty — one entry per announcement that attaches the blob). At least one presence must be populated. The shape's purpose is to give consumers (Issue #29's clickable announcement-body file links, future Files-page consolidation) a single Canvas-ID-keyed lookup that doesn't force them to decide which physical table to query. The wire schema lives in `src/shared/ipc-contract.ts`; the design rationale lives in [ADR-0008](docs/adr/0008-file-entity-unification.md).

The premise — that the same Canvas blob receives the same `external_id` across both sync paths — is held at ~85% confidence based on Canvas API URL patterns and the codebase's modeling; not yet directly observed in production data. PR-F.2's provider implementation will log any divergence at startup so the assumption becomes a live monitored invariant.
_Avoid_: "File" (bare — too generic; matches the avoidance on CanvasFile/AnnouncementAttachment), "CanvasBlob" (the older name used in FOLLOWUPS during the design exploration; not the canonical term)

**FileReference**:
A pointer from a parent entity to a file. Has provenance (which parent) and, sometimes, position (where in the parent). Resolves to either a CanvasFile or an AnnouncementAttachment. Three subtypes today; the umbrella term exists so consumers (e.g. a renderer turning embedded links into Files-page navigations) can talk generically.

Every FileReference is in one of two states: **Resolved** (the target row exists locally — the FK is non-null) or **Unresolved** (the target row doesn't exist locally — the FK is null). Unresolved can mean any of: target not yet synced, target removed from Canvas, or parser saw a file-shaped URL that isn't actually a Canvas file. `ContentFileReference` extends this with a `download_status` sub-state for the resolved case.
_Avoid_: "file pointer", "file link", "embedded file"

**AnnouncementFileReference**:
A FileReference embedded in an announcement's HTML body, recorded with character offsets (`startPosition`/`endPosition`) marking exactly where the link appears in the message. Target is an AnnouncementAttachment. Stored in `announcement_file_references`.

**ModuleFileReference**:
A FileReference encoded as a `module_items` row with `item_type='File'`. Target is a CanvasFile (joined via Canvas `content_id`). Has no explicit position field — its position is the position of the module item in the module.

**ContentFileReference**:
A reference parsed out of any content-source HTML — page, assignment, syllabus, module body, or announcement body — and tracked with its own download lifecycle. Stored in `content_file_references`. **Despite the table name, this entity covers both file references AND embedded HTML references** — a `ref_type` column discriminates (`'file'` for images/PDFs/etc → target is a CanvasFile via `resource_id`; `'html'` for embedded HTML page/iframe references → target is another HTML content source). Differs from AnnouncementFileReference in two ways: (a) no character offsets, (b) carries its own `download_status` enum (`pending` / `downloading` / `completed` / `failed` / `not_found`). The name `content_file_references` is a misnomer; conceptually this is a `ContentReference` table.

### Tasks & the accept queue

The system has two distinct task-shaped entities living in two different tables. They are not "the same thing in different states" — they have different schemas, different lifecycles, and different identities. The bridge between them is the user's accept/merge decision.

**Task**:
The canonical, in-the-user's-task-list record. One per actively-tracked work item. Stored in `tasks`. Carries grade, weight, priority score, completion state, optional flag, field-level provenance (`fieldSources`), and (since the calendar feature) an optional linked calendar event. Can originate from Canvas sync (`sourceType='canvas'`) or be created locally by the user (`sourceType='user'`). Supports **soft-delete** via `deleted_at` — merged user-tasks and user-deleted items linger as soft-deleted rows so future syncs can detect resurrection attempts.

**Provenance:** A Task carries three orthogonal provenance signals: (a) **`sourceType`** is the row's _origin_ (set on insert, never changes); (b) **`fieldSources`** is a `{field → 'canvas' | 'user' | 'guessed'}` map giving each field's _current_ authoritative source (updated on every merge or manual override); (c) **`local_modified_at`** is the row-level "the user touched this since the last Canvas pull" flag that triggers the conflict-resolution path. The `description` field is **LocallyEdited**-capable (`description_original` preserves the Canvas value). A Task can be _hybrid_ — `sourceType='user'` with `fieldSources` like `{title: 'user', dueAt: 'canvas', weight: 'canvas'}` after absorbing a QueuedTask. The hybrid state is by design per [ADR-0005](docs/adr/0005-canvas-data-read-only-local-what-if-edits.md); there is no separate "merged Task" entity, just a Task with mixed `fieldSources`.

**Acceptance ledger** — when a Task is created/updated as the result of a QueuedTask resolution, the Task row records the audit trail: `accepted_from_queue_id` (FK back to the QueuedTask row), `acceptance_method` (`'manual' | 'auto' | 'bulk' | 'legacy'`), `accepted_at` (timestamp). For Tasks created by _merging_ a Canvas QueuedTask into an existing user Task, the user-side row additionally records `linked_from_user_task`, `merged_into_task_id` (FK to the absorbing Task; appears on the _soft-deleted_ original), `link_confidence` (0.0–1.0), and `link_method` (`'auto' | 'suggested' | 'manual'`).

**Time fields** — `unlock_at` (Canvas's "available from"), `due_at` (the deadline, with `due_time_known` flag distinguishing date-only from datetime-known), `start_at` (the user's planned start, distinct from `unlock_at`), `completed_at` (when the user marked complete).

**Grade dimensions** — `grade` (the Canvas grade or user override), `original_grade` (untouched Canvas value), `effective_grade` (derived for grade calculations), `entered_grade` (Canvas pre-penalty value), `points_deducted` (Canvas late deduction), `user_expected_grade` (user's anticipated grade for what-if), `use_expected_in_calc` (whether the simulator should use the expected grade). The full grade model belongs to cluster #3 — listed here for completeness.

**Submission/late status** — `submission_status` (Canvas-side: `submitted` / `graded` / etc), `user_submission_status` (user-side override — the effective status is the OR of the two), `late_policy_status` (`'none' | 'late' | 'missing' | 'extended'`), `seconds_late`, `is_excused`, `is_missing`.

**Sub-categorization** — `task_type` (the TaskType name as a denormalized string), `task_subtype` (a finer label: `'numbered' | 'webwork' | 'final' | 'midterm' | 'problem_set'`), `task_group_id` (FK to TaskGroup), `assignment_group_id` (FK to CanvasAssignmentGroup), `canvas_assignment_group_id` (the Canvas-side group's external ID — denormalized for sync resolution). See the dual-grouping ambiguity below.
_Avoid_: "assignment" (Canvas's term — overlaps but isn't identical; a Task may have no Canvas counterpart at all), "todo", "item"

**QueuedTask**:
A Canvas-side assignment that sync has discovered but the user has not yet accepted into their task list. **Not** a `Task` in a pending state — a physically separate row in `canvas_task_queue` with a lighter schema (no weight, no grade, no priority, no fieldSources). Exits the queue exactly once, via a status transition. Lingers in the table with `resolvedAt`/`resolvedBy` populated after exit; `merged`/`rejected`/`accepted` rows are history, not garbage. A `values_changed_at` timestamp tracks when Canvas updated the underlying assignment while the QueuedTask was still unresolved — UI surfaces this so the user knows the preview has drifted since they first saw it.

**Not the only entry path.** A Course's `auto_accept_canvas_tasks` mode controls whether new Canvas tasks transit the queue at all: mode 0 (default) queues everything; mode 1 bypasses the queue entirely (new tasks become Tasks immediately); mode 2 bypasses the queue AND auto-merges matching user Tasks. The QueuedTask flow described above applies only when at least one course is in mode 0. When the user changes the mode per-course, the bypass paths short-circuit the queue.
_Avoid_: "pending task", "draft task", "incoming task" (all suggest it's a Task variant — it isn't)
_Avoid_: "pending task", "draft task", "incoming task" (all suggest it's a Task variant — it isn't)

**QueuedTaskStatus** (the lifecycle):

- **`pending`** — awaiting user decision. Default on insert.
- **`accepted`** — user said "add this as a new Task". Creates a fresh row in `tasks` with `sourceType='canvas'`.
- **`merged`** — user said "this is the same as an existing user-created Task". The target Task (recorded in `matchedUserTaskId`) absorbs selected fields from the QueuedTask; per-field provenance is recorded in the target's `fieldSources`.
- **`rejected`** — user said "ignore this; don't re-queue". The QueuedTask row stays so a re-sync doesn't resurrect the same Canvas assignment as a fresh `pending` row.

**MatchedUserTaskId / MatchConfidence**:
On a QueuedTask, `matchedUserTaskId` is the FK to the user Task suggested as a merge target by the auto-matching algorithm; `matchConfidence` is the score. Both are _suggestions_ — the user can override with a manual pick during merge. After resolution, they record what was suggested, not necessarily what was chosen.

**TaskType**:
A kind of work — "Quiz", "Exam", "Project", "Assignment", "Lab", "Discussion", "Attendance", etc. The system ships 10 defaults in `global_task_types` (`is_system=TRUE`); user-defined kinds live in `custom_task_types` (see below). Conceptually one entity, two storage homes. Carries a `default_weight` and `canvas_patterns` (JSON list of name-fragments used to auto-classify Canvas content on sync). On the Task row, the TaskType is stored as a denormalized free-string `task_type` field (not an FK), and a finer `task_subtype` field labels variants below the TaskType (`'numbered' | 'webwork' | 'final' | 'midterm' | 'problem_set'`).
_Avoid_: "category", "kind" (when speaking generically — but fine in conversation)

**CustomTaskType**:
A TaskType defined by the user (or scoped to a specific course) rather than shipping as one of the 10 system defaults. Stored in `custom_task_types` with `name`, `display_name`, and an optional `course_id` (NULL = global custom type; non-NULL = course-scoped). Has a unique `name` constraint across the table — a user-added "essay" type would conflict with the system "essay" type if such existed. Course-scoped CustomTaskTypes cascade-delete with the Course; global ones persist independently. The denormalized `tasks.task_type` string can hold either a system or custom type name; the glossary-level concept is just **TaskType** — `CustomTaskType` is the storage-level distinction.
_Avoid_: "user task type" (fine in conversation), "custom category"

**TaskGroup**:
A per-course concrete grouping of Tasks with a collective weight in the grade — e.g. "Tutorial Quizzes (15%)" in CSC101. Stored in `course_task_groups`. Has a `weight_percent`, an optional `drop_lowest` rule, and a reference to its TaskType (`global_type_id`). May also carry the Canvas-side group identity (`canvas_group_id`, `canvas_group_name`) when it mirrors a Canvas assignment group. Many Tasks belong to one TaskGroup; many TaskGroups can share a TaskType.
_Avoid_: "category", "group" (bare — too generic)

**CanvasAssignmentGroup**:
A second, _Canvas-faithful_ grouping table — `canvas_assignment_groups` — that stores Canvas's drop/weight rules verbatim. Distinct from TaskGroup (`course_task_groups`). Tasks have separate FKs to each: `task_group_id` → TaskGroup and `assignment_group_id` → CanvasAssignmentGroup. See the dual-grouping ambiguity below.

**LinkSuggestion**:
A suggested match between a user Task and a Canvas task that the user can review and accept/reject, backing the explicit "task-link" review flow (the TaskLinkDialog UI). Stored in `link_suggestions` with a `status` workflow and a confidence score. **Separate from the QueuedTask flow** — QueuedTask handles brand-new Canvas tasks landing into the queue; LinkSuggestion handles after-the-fact linking of pre-existing user Tasks to Canvas counterparts the user added retroactively.
_Avoid_: "task link", "match", "suggestion" (bare — too generic)

### Courses

The Course is the root of nearly every domain query — almost all other entities (Task, Announcement, CanvasFile, CalendarEvent) are course-scoped, and visibility cascades from the Course down to them. The Course entity sits at the centre of the visibility model defined under Cross-cutting states.

**Course**:
A Canvas course (e.g. "CSC110 Fall 2026"). Stored in `courses`. One row per Canvas-side course; identity by external_id. Carries:

- **Identity & display** — `external_id`, `code`, `name`, `nickname` (user-friendly override shown in UI), `color` (per-course UI tint), `landing_page_url`.
- **Term** — `enrollment_term_id` (FK to EnrollmentTerm). Controls which term-filter buckets the course falls into.
- **Grade tracking** — `target_grade` + `target_grade_source` (`'default' | 'manual'`), `assessed_grade`, `current_grade`, `grade_curve_adjustment` (signed pct points), `credits` (default 1.0 — used for cross-course weighted GPA), `total_weight` (sum of constituent Task weights), `grade_volatility` (confirmed vestigial — schema-core column with zero live readers or writers; likely a remnant of the removed L3 intelligence subsystem per [ADR-0003](docs/adr/0003-removal-of-l3-intelligence-layer.md)).
- **Visibility signals** — `archived_at`, `archive_source` (`'manual' | 'auto'`), `is_hidden`, `deleted_at`. See **Visibility** under Cross-cutting states.
- **Provenance** — `field_sources` (the same per-field provenance map as Task), `local_modified_fields`, plus the LocallyEdited pair on `syllabus_body` (see CourseSyllabusBody).
- **Per-course authority settings** — `late_penalty_authority`, `drop_lowest_authority`, `grade_calc_mode` (each effectively `'canvas' | 'local' | 'both'`). User-controlled choice for whose computation wins per domain. These are the per-course knobs that gate grade-simulation behaviour.
- **Per-course preferences** — `allow_guessed_override`, `auto_assign_due_date` (NULL=inherit / 0=off / 1=on), `auto_accept_canvas_tasks` (mode 0=QUEUE_ALL — every new Canvas task lands in `canvas_task_queue` as a QueuedTask; mode 1=auto-accept — new Canvas tasks become Tasks immediately, bypassing the queue; mode 2=auto-accept + auto-merge — new Canvas tasks become Tasks AND auto-merge into matching user Tasks if found). Actively consulted by `TaskSyncStrategy`.
- **Cross-cutting Dismissed state** — `syllabus_prompt_dismissed_at` (the user has clicked "don't show me the 'set your syllabus' prompt for this course again").
  _Avoid_: "class" (Canvas-API neutral but conflicts with the conversational sense of "class meeting"), "section" (Canvas means specific course-section enrollments), "subject"

**EnrollmentTerm**:
A Canvas-side academic term (Fall 2026, Spring 2027, etc.). Stored in `enrollment_terms`. Has `external_id`, `name`, `start_at`, `end_at`. Used by Course's `enrollment_term_id` FK, and by the term-filter component of the Visibility derivation.
_Avoid_: "semester" (US-centric), "term" (bare — too generic; in code "term" often means session, period, or definition)

**CourseSyllabusBody**:
The HTML body of a course's syllabus page — text content as scraped from Canvas's `/courses/<id>/assignments?include[]=syllabus_body` payload. Stored as a column on the Course row (`courses.syllabus_body`). Supports the cross-cutting **LocallyEdited** state via `syllabus_body_original`. Hashed for change detection via `syllabus_hash`. Distinct from CourseSyllabusFile despite the shared "syllabus" word.
_Avoid_: "syllabus", "syllabus page" (use full term)

**CourseSyllabusFile**:
A user-designated _file_ (typically a PDF in the course's Files area) that the user has marked as "this is what defines the rules for this course." Not the syllabus page itself — a pointer to a specific CanvasFile. Stored in `course_syllabuses` (one row per Course, FK to `resources`). Tracks `last_reviewed_at` (when the user last said "I've read this and the rules are correct") and `change_detected_at` (when sync noticed Canvas has modified the underlying file since the last review). Powers the "is your syllabus still current?" UX and the policy-staleness gate. Distinct from CourseSyllabusBody.
_Avoid_: "syllabus file" (works in conversation but use the full term in code), "syllabus document"

**ArchivedCourse**:
Shorthand for a Course with `archived_at IS NOT NULL`. Filtered out of "visible" by Visibility. Recoverable iff `archive_source='manual'`; `archive_source='auto'` (term ended) is one-way.

**HiddenCourse**:
Shorthand for a Course with `is_hidden=1` and `archived_at IS NULL`. Reversibly filtered out of "visible" by the user.

**GradeAuthority**:
A per-course user choice for whose computation wins on a derived grade domain. Three instances live as columns on Course: `late_penalty_authority` (`'canvas' | 'local' | 'both'`), `drop_lowest_authority` (`'canvas' | 'local' | 'off'`), `grade_calc_mode` (`'canvas' | 'local' | 'both'`). Distinct from the field-level Conflict mechanism — Conflict handles disagreements on _raw field values_; GradeAuthority handles disagreements on _derived computations_. A course where the user knows their professor's grading scheme exactly will set `'local'`; a course where they don't will leave the default `'canvas'`. The `'both'` value typically means "compute and surface both, let the user compare."
_Avoid_: "grade source" (overloaded with `target_grade_source`), "calc mode" (only one of the three columns uses that exact term)

### Calendar

The calendar holds events from three different origins, and a single Task can auto-generate a calendar event so the user sees it on the calendar without re-entering it. The recurrence model expands instances live rather than storing them.

**CalendarEvent**:
A timed item displayed on the calendar. Stored in `calendar_events`. The corresponding Zod schema is named `ExternalCalendarEvent` in the IPC contract for historical reasons — **the "External" prefix is misleading**, the table also holds user-created events. Carries title, description, start/end timestamps (`start_at`/`end_at`), `all_day` flag, location, color (event-specific override), notes (calendar-only — never affect the linked Task), and `reminder_minutes`. Soft-deleted via `deleted_at`.
_Avoid_: "ExternalCalendarEvent" (the code name; the conceptual name is just CalendarEvent), "event" (bare — too generic), "calendar item"

**CalendarSource**:
A CalendarEvent's origin discriminator on the `source_type` column. Three values: `'canvas'` (synced from a Canvas assignment/quiz/event endpoint), `'user'` (user-created in the app), `'imported'` (came from an ICS file the user imported, with `imported_calendar_id` FK populated). Distinct from but not orthogonal to the **task-linked** signal — `task_id IS NOT NULL` means the event was auto-generated from a Task and changes to the Task's due date propagate to the event. Any of the three sources can be task-linked; the most common combination is `source_type='user'` + `task_id IS NOT NULL` (user-created event hooked to a Task for syncing).
_Avoid_: "event source" (overloaded), "origin"

**DisplayCalendarEvent**:
The read model of a CalendarEvent — what the UI consumes. Extends CalendarEvent with computed/joined fields: `isRecurrenceInstance` (`true` if this row was produced live by recurrence expansion), `recurrenceDate` (the instance's date when expanded), `color` (the _resolved_ color from the event/calendar/course/default cascade), `calendarName` (joined from `imported_calendars`), and Task-projection fields (`taskTitle`, `taskWeight`, `taskType`, `taskLocation`, `courseCode`, `courseName`) when the event is task-linked. Never persisted — produced on each calendar query.
_Avoid_: "expanded event", "computed event"

**ImportedCalendar**:
A user-imported ICS calendar file. Stored in `imported_calendars` with `name`, `filename`, `file_hash` (for change detection on re-import), `color` (calendar-level default for events that don't have their own color), `event_count`, `is_visible` (per-calendar toggle in the calendar-source picker — distinct from per-event visibility), `imported_at`, `updated_at`. The events from the import are CalendarEvents with `source_type='imported'` and `imported_calendar_id` FK populated.
_Avoid_: "ICS calendar" (in code use ImportedCalendar; in conversation "ICS" is fine when clear)

#### Recurrence

**RecurrenceMaster**:
A CalendarEvent with `recurrence_rule` set (an iCal RRULE string) and `parent_event_id=NULL`. Represents the _pattern_ — the rule from which individual instances are generated. May also carry `recurrence_exception_dates` (EXDATE) listing specific dates the rule should NOT produce instances for.

**RecurrenceInstance**:
A single occurrence produced by expanding a RecurrenceMaster's RRULE for a date range. **Not stored** — produced live by `RRuleExpander.expand()` on each calendar query. Marked `isRecurrenceInstance=true` on the DisplayCalendarEvent with a `recurrenceDate` field.

**RecurrenceOverride** (rare):
A stored CalendarEvent with `parent_event_id` pointing at a RecurrenceMaster. Represents "this specific instance is different from the pattern" (the iCal "modified instance" concept). Replaces the live-expanded RecurrenceInstance for the date it occupies. Allows the user to e.g. cancel one week of a weekly recurring class without breaking the rest.

### Grades

The grading model has two sides — what's stored on Task (per-assignment), what's stored on Course (per-course rollup) — plus a live what-if simulation that runs on top of the stored values. The vocabulary distinguishes between authoritative Canvas values, user-edited overrides, derived computations, and projected scenarios.

#### Grade dimensions on Task

A Task carries up to seven grade-related values. They are not interchangeable — each answers a different question.

**grade**:
The Task's _current_ grade. If the user has not overridden it, this matches the Canvas value; if they have, it holds the override. The headline number the UI shows. Defaults to NULL (ungraded).

**original_grade**:
The Canvas-authoritative grade at the moment of last sync. Preserved separately from `grade` so the conflict mechanism can detect drift if Canvas updates the grade _after_ the user has overridden it locally. Companion to the **LocallyEdited** pattern but at the value level (not text).

**effective_grade**:
A _derived_ grade used by the grade calculator. Accounts for grade replacements, drop-lowest rules, and other policy logic before it feeds into the Course's `current_grade`. Today derived live in-app (the L3 services that used to write it back are gone — see Zombie tables below); the column persists but its consistency depends on whoever ran the calculation last.

**entered_grade**:
The Canvas _pre-penalty_ grade — what the student earned before Canvas's late policy deductions. Distinct from `grade` (which holds the post-penalty value). Surfaces in the UI when the user wants to see "what I earned vs what Canvas counted."

**points_deducted**:
Points subtracted from `entered_grade` by Canvas's late policy. `entered_grade − points_deducted ≈ grade` (when no other adjustments apply).

**user_expected_grade**:
The user's _anticipated_ grade for an ungraded Task — their guess about how well they did before Canvas posts results. Distinct from SimulatedGrade (which is what-if exploration); expected_grade is the user's honest prediction. Becomes irrelevant once a real `grade` arrives.

**use_expected_in_calc**:
Boolean flag — whether the grade calculator should treat `user_expected_grade` as a temporary stand-in for `grade` when computing the Course's `current_grade`. Lets the user say "include my expected grades in the projection but mark them visually as estimates."

Also: **pointsPossible** (the max-points the Task is worth — not a grade itself but required for percentage normalization). And **weight** (the Task's share of the Course grade — applied after percentage normalization).

#### Grade dimensions on Course

The Course rollup has fewer dimensions because it's an aggregate, but each has a specific meaning.

**current_grade**:
The Course's current computed grade — the aggregate that takes every constituent Task's `effective_grade` (or `user_expected_grade` when `use_expected_in_calc=1`), applies weights, applies the **GradeAuthority** rules, and produces a single percentage. Updated whenever a contributing Task changes.

**assessed_grade**:
The Course grade based _only_ on Tasks that have actually been graded — ignores ungraded Tasks even if they have expected grades. The "where I stand right now on the work I've already turned in" number.

**target_grade**:
The user's goal grade. Defaults to 85.0. Used in projection UI ("you need X% on remaining work to hit your target"). Has a `target_grade_source` (`'default' | 'manual'`) distinguishing whether the user explicitly set it.

**grade_curve_adjustment**:
A signed percentage-point offset applied to the Course's current_grade (e.g. `+5.0` if the professor announced a 5-point curve). Applied at the rollup level, not per-Task.

**credits**:
The Course's credit value (default 1.0). Not part of _this_ Course's grade but used in cross-course weighted-GPA calculations on the dashboard.

**total_weight**:
Sum of constituent Tasks' weights. Should be 100 for a fully-weighted course; significant deviation is a data-quality signal.

#### Simulation (the live what-if feature)

The L3 intelligence subsystem was largely removed per [ADR-0003](docs/adr/0003-removal-of-l3-intelligence-layer.md), but grade _simulation_ survived. State is held **purely in-memory** in an L3 simulator service — no DB columns persist simulated values.

**SimulatedGrade**:
A what-if override for a single Task's grade, held in-memory during a simulation session. Pairs a Task with: `originalGrade` (the real grade before the simulation started), `simulatedGrade` (the user's "what if?" value), and a timestamp. Not persisted across app restarts.

**SimulationState**:
The whole simulator's current state — `isActive` (whether the user has begun a what-if session), `startedAt` (when the session began), and the array of SimulatedGrade overrides currently in effect. When `isActive=true`, the Course's `current_grade` calculation substitutes each SimulatedGrade's value in place of the underlying Task's stored grade. Cleared explicitly by `simulation:clear` IPC or implicitly on app close.
_Avoid_: "simulation", "what-if state" (in conversation OK; in code use SimulationState)

#### Letter grade

**LetterGrade**:
The string label for a percentage grade on the UofT scale (`A+` for ≥90, `A` for ≥85, `A-` for ≥80, etc., down to `F` for <50). Derived purely from a numeric percentage by the `getLetterGrade()` formatter in `formatters.ts`; not stored anywhere. UofT-specific — institutions with different grading scales would need to swap the formatter.
_Avoid_: "grade letter", "letter mark"

#### Zombie tables — mostly cleaned up (ADR-0003 follow-through, 2026-06-01)

What used to be three intelligence-leftover zombie tables here has now been resolved:

- **`grade_replacements`** / **`weight_transfers`** — **dropped** in migration 105 (#75). Encoded "drop-lowest"/"best-of-N" and weight-transfer policy rules; no writers or readers remained after ADR-0003.
- **`grade_history`** — **wired up** (2026-06-01, not dropped). `SyncCourseOperations.recordGradeChange` now records a row on each grade transition, making the long-stubbed `GradeHistoryCard` grade-over-time chart a live feature. See the "Removed/Resolved" note below.

The `effective_grade` column on Task was **dropped in migration 107 (2026-06-01)** — it was never read (the simulator's `effectiveGrade` is computed live, not stored). See the vestigial-columns list below.

### Course content (modules, pages)

Canvas organises course material into Modules (ordered groupings) of ModuleItems (heterogeneous entries pointing at files, pages, assignments, etc.) plus standalone CoursePages (wiki-style pages including the syllabus). The local store mirrors all three.

**Module**:
A Canvas module — an ordered grouping of course content. Stored in `modules`. Has `name`, `position` (display order within the course), `unlock_at` (when Canvas reveals it to students), `require_sequential_progress` (whether items must be completed in order), `published` (whether visible to students). Course-scoped via `course_id` FK.
_Avoid_: "unit" (Canvas-API neutral but conflicts with units in academic-credit sense), "chapter"

**ModuleItem**:
An entry within a Module. Stored in `module_items`. Has `item_type` (one of `'File' | 'Page' | 'Discussion' | 'Assignment' | 'Quiz' | 'SubHeader' | 'ExternalUrl' | 'ExternalTool'`) and `content_id` referencing the target entity (the Canvas-side ID). Plus `position`, `indent` (visual nesting level), `url`, `external_url`, `completion_requirement`, `published`. **Polymorphic** — the row is a reference; the _target_ depends on `item_type`:

- `'File'` → a CanvasFile (also covered by ModuleFileReference in the Files cluster)
- `'Page'` → a CoursePage with matching slug
- `'Assignment'` / `'Quiz'` → a Task (Canvas treats quizzes as assignments)
- `'Discussion'` → no separate entity modelled today (would be a future expansion)
- `'SubHeader'` → no target (a visual heading row, content is just the title)
- `'ExternalUrl'` / `'ExternalTool'` → no local entity (the `url` / `external_url` is the entire reference)
  _Avoid_: "module entry", "item" (bare), "module content"

**CoursePage**:
A wiki-style page in a Canvas course. Stored in `course_pages`. Has `external_id`, `title`, `url_slug` (the Canvas-side slug), `body_html` (the actual HTML), `body_text` (a plain-text extract), `is_front_page` (whether this is the course's landing page), `published`. Uses **LocallyEdited** via `body_html_original`. Has `content_hash` and `remote_updated_at` for change detection.

A CoursePage has a `page_type` discriminator with four values:

- `'syllabus'` — a syllabus page (see ambiguity below — sometimes Canvas returns syllabus content as a Page rather than in the `/assignments?include[]=syllabus_body` endpoint)
- `'landing'` — the course's front page (`is_front_page=1`)
- `'content'` — a regular content page
- `'module_item'` — a page that exists because it was referenced from a Module (created on-demand when sync resolves a ModuleItem with `item_type='Page'`)
  _Avoid_: "page" (bare — overloaded with file pages, sync_updates page entity_type), "wiki page" (technically accurate but rarely used in conversation)

#### Flagged ambiguity — syllabus storage duality

Syllabus content can live in **two places**:

1. **`courses.syllabus_body`** (the column) — the primary store, populated by sync from Canvas's `/courses/<id>?include[]=syllabus_body` endpoint. The `getCourseSyllabus` IPC handler reads this first.
2. **`course_pages` row with `page_type='syllabus'`** — a fallback, queried only if the column is empty. Populated by sync paths I haven't fully traced; may be a legacy mechanism Canvas occasionally returns when syllabus content lives as a Page rather than as the course-level field.

The CourseSyllabusBody glossary entry (in cluster #1) describes the column. Whether the page-typed row remains a meaningful fallback or is vestigial is unverified.

**Policy** _(removed — `course_policies` dropped in migration 110, 2026-06-02)_:
The `course_policies` table was designed to record per-course grading policies (e.g. "drop the lowest quiz", "10% per day late") extracted from announcements / syllabi by L3 intelligence. Per [ADR-0003](docs/adr/0003-removal-of-l3-intelligence-layer.md) that subsystem was removed; the table never had a live INSERT writer. The whole family is now gone: `grade_replacements`/`weight_transfers` (migration 105), `policy_rules`/`grace_tokens`/`grace_token_usage` (109), and `course_policies` itself (110 — the first ADR-0009 FK-off rebuild, which dropped `notifications.linked_policy_id` first). `MarkSyllabusReviewedCommand`'s dead `course_policies` UPDATE was removed (its real work — `course_syllabuses.last_reviewed_at` — is untouched), as were the export/import policy branches. The `Policy` Zod schema/type + `mapPolicyRowToEntity` are now unused leftovers (micro-followup). Only `course_task_groups` remains of the policy/grouping zombies.
_Avoid_: "course policy" (in conversation OK), "grading rule"

### Sync

The system has a one-way Canvas → local sync model per [ADR-0005](docs/adr/0005-canvas-data-read-only-local-what-if-edits.md); these terms describe the bookkeeping that supports it.

**SyncSession**:
One sync operation/run. UUID-keyed (`sync_sessions.id`), with start/end timestamps and totals (new tasks, updated tasks, new announcements, grade changes, new files). Owns the SyncUpdate rows the run produced (FK from sync*updates → sync_sessions). Supports the cross-cutting **Dismissed** state — once the user has acknowledged a session, it's hidden from the session list but kept for history.
\_Avoid*: "sync run" (fine in conversation but use SyncSession in code/docs), "sync job"

**SyncUpdate**:
A single change record produced by a SyncSession. Stored in `sync_updates`. **Polymorphic — one table shape, three lifecycle paths:**

1. **Informational** — `change_type IN ('new', 'updated', 'grade_changed')` on an entity type (`task` / `announcement` / `grade` / `file` / `page`). Surfaces in the "what's new" feed. The user views the feed → `seen_at` becomes non-null and the item drops from "unseen." `changed_field` records _which_ field of the entity changed (relevant for `updated` only).
2. **Conflict** — see the separate **Conflict** entry below.
3. **Action-required (queue marker)** — `is_action_required=1`. Points the feed at a QueuedTask that needs accept/reject. The SyncUpdate row is the feed item; the underlying task lives in `canvas_task_queue`.

Has an `updated_at` column distinct from `created_at` — if Canvas modifies the underlying entity _after_ the SyncUpdate was first written but before the user resolves/views it, `updated_at > created_at` signals the displayed preview has drifted.
_Avoid_: "notification" (overloaded — see cluster #4 ambiguity), "change", "update" (bare — too generic)

**Conflict**:
A SyncUpdate where Canvas's incoming value and the local field disagree, and the system has chosen to surface the difference rather than silently overwrite (per ADR-0005's "conflict, don't clobber"). Identified by `change_type='conflict'` or `entity_type='conflict'`. Carries `conflict_field` (the disputed field name), `old_value` (the local value), `new_value` (Canvas's value), `conflict_resolution` (`NULL` while unresolved; `'local'` or `'canvas'` once the user picks), `remember_choice` (intended to auto-apply the same choice for future conflicts on the same field-entity pair — see caveat below), `resolved_at` (timestamp of resolution). Although stored as a SyncUpdate row, **the concept stands alone** — it has its own UI (the duplicate-warning / merge modal), its own IPC (`sync:getPendingConflicts`, `sync:resolveAllConflicts`), and is the central concept of ADR-0005.

**Resolution semantics** — when the user picks a side: (a) the underlying entity's field is UPDATED in its source table (`tasks`, `courses`, or `notifications`) with the chosen value; (b) if the user picked Canvas, the row's local-modified flag for that field is cleared; (c) the SyncUpdate row is fully closed (`conflict_resolution` set, `resolved_at` set, `seen_at` set simultaneously — a resolved Conflict is automatically marked seen). Resolution is one-shot per Conflict row; a future sync producing a _new_ disagreement on the same field yields a _new_ Conflict row, not a re-opening of the old one.

**`remember_choice` semantics** — when set on resolution, writes a **SyncPreference** row (see Settings & coordination below) capturing `(entity, entity_id, field, prefer_canvas)` with an `expires_at` window. Future syncs that produce the same conflict consult `sync_preferences` via `SyncConflictResolver` and auto-resolve when a matching unexpired preference exists. The separate `field_notification_suppressions` table is a zombie that does NOT participate in this pipeline.

**Storage duality** — a Conflict is actually written to **two tables simultaneously**: (a) `sync_updates` with `entity_type='conflict'` as a feed item that flows through the unseen-changes UI, and (b) `pending_sync_conflicts` (see below) as a persistent unresolved-conflicts store keyed by a UUID `conflict_id`, with denormalized display labels (`entity_name`, `field_label`, `course_name`) ready for the conflict modal. The `sync:getPendingConflicts` IPC reads from `pending_sync_conflicts`. On resolution, both rows are updated/cleared. The two-table arrangement is intentional — sync*updates is the feed, pending_sync_conflicts is the modal's persistent state across app restarts.
\_Avoid*: "merge", "diff", "discrepancy"

**SyncStatus**:
Runtime state of the sync engine, emitted to the UI. Values: `'idle' | 'syncing' | 'error' | 'offline'`. Not stored — pure runtime. Distinct from SyncSession (per-run history) and SyncUpdate (per-change).

**SyncCheckpoint**:
A resumable-progress marker that lets a partial sync continue after interruption (crash, user-paused-for-conflict, network drop). Stored in `sync_checkpoints`. Surfaces in the user-visible "Resuming sync…" state.

**FieldModification** (removed — dropped in migration 105):
The `field_modifications` table was designed as a per-edit audit trail of user field changes but was never wired up (no writers/readers). **Dropped in migration 105 (2026-06-01).** The actual "this field is locally modified" signal lives elsewhere (column-level flags like `local_modified_at` on the source row and the `fieldSources` map on Task). Kept in the glossary so the term isn't mistaken for the live modification-tracking mechanism; if a per-edit audit trail is ever wanted, design it fresh.
_Avoid_: "field change", "edit history"

**FieldNotificationSuppression** (removed — dropped in migration 105):
The `field_notification_suppressions` table was designed to suppress **data-completeness alerts** — i.e. when the L3 `DataCompletenessAnalyzer` warns "Task X is missing a due date," a row here would record "user dismissed this warning until `expires_at`." It was never wired up and was **dropped in migration 105 (2026-06-01).** **Not** related to the Conflict resolution `remember_choice` feature — that's SyncPreference (alive). Kept in the glossary so future readers don't confuse the term with SyncPreference; if alert-suppression is ever built, design it fresh.
_Avoid_: "suppressed conflict" (this isn't for conflicts), "muted field", any conflation with SyncPreference

#### Flagged ambiguity — two grouping mechanisms

The system has **two** Task-grouping tables that overlap heavily but aren't unified:

- **`course_task_groups`** (the TaskGroup) — older, richer: carries `global_type_id` (FK to TaskType), `weight_percent`, `drop_lowest`. Created in v23.
- **`canvas_assignment_groups`** (the CanvasAssignmentGroup) — newer, more Canvas-faithful: stores the Canvas-side drop/weight rules directly. Created in v82.

A Task has FKs to **both** (`task_group_id` and `assignment_group_id`) and they can in principle point at different grouping intents. No code currently enforces consistency between them. Whether `course_task_groups` is being phased out in favor of `canvas_assignment_groups` (or vice-versa, or both are kept for separate purposes) is unverified — see [docs/FOLLOWUPS.md](docs/FOLLOWUPS.md).

#### Flagged ambiguity — same pointer, two tables

An announcement-body link can be stored simultaneously in **both** `announcement_file_references` (with HTML character offsets) **and** `content_file_references` (with download-status tracking) — two rows describing the same conceptual pointer with different metadata. Modules have a parallel split between `module_items` (the user-facing item) and `content_file_references` (the download tracking). No code currently enforces consistency between the two rows. Whether this dual encoding is a deliberate separation of concerns (positional pointer vs downloadable target) or accidental legacy coexistence is unverified — see [docs/FOLLOWUPS.md](docs/FOLLOWUPS.md).

#### Flagged ambiguity — same blob, two entities (resolved at read-time by FileEntity)

A single Canvas file (the underlying physical PDF / DOCX / etc.) can exist locally as **both** a CanvasFile (because it's in a course's Files area) **and** an AnnouncementAttachment (because an announcement attached it). There is no system-level FK link between the two rows at the storage layer, and they download independently — the same bytes can still land on disk twice, under different paths.

The **read-time** unification is **FileEntity** (see entry above), introduced by [ADR-0008](docs/adr/0008-file-entity-unification.md). Consumers that need a Canvas-ID-keyed view (Issue [#29](https://github.com/MorrisXDS/CanvasAssistant/issues/29)'s clickable announcement-body file links, future Files-page consolidation) go through `FileEntityProvider`. The two physical rows still exist; FileEntity just collapses them under `canvasId` for consumers that don't care which table the blob currently lives in.

What's still open / out of scope of ADR-0008:

- **Write-side unification.** Sync still writes to both physical tables independently. Same blob, two writes. A future ADR could introduce a backing `file_entities` table that both physical rows FK to (Shape C in the ADR-0008 trade-off matrix), but PR-F's scope stops at the read model.
- **Download dedup.** The same blob still downloads twice if it appears in both a course's Files area and an announcement attachment. The local file system still receives two copies. A future PR could route both downloads to a shared local path via `canvasId` — not addressed by PR-F.

### Settings, coordination, exports, credentials

The plumbing layer underneath the domain entities — where preferences, operational state, exports, and auth credentials live. Less domain-rich than the entity clusters but worth naming because the storage choices have real consequences (especially for the settings duality and the credential-storage fallback).

#### Settings storage

This system has **three different settings tables** plus a renderer-side localStorage layer. They serve overlapping purposes and the decision tree for "where does setting X go?" is not codified anywhere — see the ambiguity below.

**UserPreference**:
A generic key/value preference row. Stored in `user_preferences` (key TEXT PRIMARY KEY, value TEXT, optional description, updated*at). Active writers/readers include sync preferences (key `syncPreferences`), local-HTML-paths settings (key `localHtmlPathsSettings`), and academic settings (key `academicSettings`). Each "key" holds a JSON-encoded settings blob — the table is effectively a JSON document store with one row per logical settings group.
\_Avoid*: "user setting" (overloaded with renderer-side localStorage), "preference" (bare — too generic)

**AppSetting**:
A different generic key/value table (`app_settings`, key TEXT PRIMARY KEY, value TEXT, updated*at). Functionally identical shape to UserPreference. Used today for the backup-schedule configuration and a few other app-level settings written by `settingsHandlers.ts` and `backupScheduleHandlers.ts`. Why two tables exist for the same key/value shape is unverified historical drift — see the flagged ambiguity below.
\_Avoid*: "settings" (bare — too generic)

**SyncPreference**:
A _structured_ per-conflict-resolution preference — NOT a key/value setting. Stored in `sync_preferences` with `(entity, entity_id, field, prefer_canvas, created_at, expires_at)`. Powers the **Conflict** `remember_choice` feature: when the user resolves a conflict and ticks "remember my choice," a SyncPreference row is inserted; future syncs that produce the same `(entity, entity_id, field)` conflict consult this table via `SyncConflictResolver` and auto-resolve without re-surfacing. Has an expiration window so old preferences don't haunt the user forever. Conceptually a _rule store_, not a settings store, despite the "preference" name.

**Schema evolved outside the migration system.** The v38 migration originally created `sync_preferences` with a `prefer_local BOOLEAN` column. `SyncConflictResolver.ensureTable()` later added `prefer_canvas` and `expires_at` via runtime ALTER TABLE (caught with try/catch in case the columns already exist). The semantically-active column is `prefer_canvas`. The original `prefer_local` column was **dropped in migration 108 (2026-06-01)** — by then it was write-only (and even that write, in `ResolveSyncConflictCommand`, was a latent bug targeting the wrong column; it now writes `prefer_canvas`). `prefer_canvas` itself remains a runtime ALTER, not a migration, so migrations-only test DBs must add it manually to mirror production.
_Avoid_: "conflict preference" (fine in conversation), "remembered choice"

**VisibilitySetting**:
A key/value row in `visibility_settings` storing parameters of the Visibility derivation rule that need to be readable from both main and renderer processes (so localStorage isn't sufficient). Today holds exactly one key — `term_selection` (default `'auto'`) — which controls the term filter component of the Visibility rule (per the `Visibility` cross-cutting state above). Consulted by `VisibleDataProvider` on every visible-data query. Was created (v52) specifically to migrate `term_selection` out of localStorage and into the DB; the table can grow to hold other settings of the same character if needed.
_Avoid_: "visibility setting" in conversation is fine; in code use VisibilitySetting (capitalized) when speaking of the table

#### Flagged ambiguity — three places to put a setting

The system has three storage homes that all answer some form of "where does this preference live?":

1. **`user_preferences`** (key/value) — currently holds `syncPreferences`, `localHtmlPathsSettings`, `academicSettings`.
2. **`app_settings`** (key/value, same shape) — currently holds backup-schedule and other app-level state.
3. **Renderer-side `localStorage`** via `settingsManager` (CLAUDE.md §8) — currently holds UI-only settings (theme, sidebar collapsed state, nav order, landing page preference).

No documented rule distinguishes which kind of setting goes where. UserPreference vs AppSetting in particular has no clear separation — both are key/value, both are written from IPC handlers, both are read on app startup. The historical reason for two tables is not in the migration notes. See [docs/FOLLOWUPS.md](docs/FOLLOWUPS.md) — worth either consolidating into one table or codifying the distinction in CLAUDE.md.

#### Sync coordination & resumability

**SyncMetadata**:
Per-Canvas-endpoint cache state. Stored in `sync_metadata` (endpoint TEXT PRIMARY KEY, etag TEXT, last*synced_at). The ETag mechanism is the system's primary way to skip work — sync issues a conditional GET, and if Canvas returns 304 the local data is already current. `last_synced_at` is the wall-clock fallback.
\_Avoid*: "sync state" (overloaded with SyncStatus)

**SyncCheckpoint**:
_(Already defined in cluster #7 above; mentioned here for completeness — it lives in `sync_checkpoints` and tracks resumable progress for partial syncs.)_

**PendingSyncData**:
Canvas data that's been fetched but not yet committed locally because sync paused waiting for the user to resolve a Conflict. Stored in `pending_sync_data` (id, fetched*at, endpoint, payload TEXT — the full Canvas response cached as JSON, expires_at). The crash-recovery mechanism: if the app dies while the user is resolving a conflict, pending fetches are preserved across restart and replayed once the conflict is resolved. Written/read by `syncUpdatesHandlers.ts` and `SyncConflictResolver`.
\_Avoid*: "pending sync", "staged data"

**PendingSyncConflict**:
A persistent unresolved Conflict, stored separately from `sync_updates` so the conflict modal has stable display state across app restarts. Stored in `pending_sync_conflicts` (**not created by a migration** — `SyncConflictResolver.ensureTable()` runs the CREATE TABLE at service startup). Schema: `conflict_id TEXT PRIMARY KEY` (a UUID, not a row id), `entity`, `entity_id`, `external_id`, `entity_name` (denormalized for display), `field`, `field_label` (display-ready field name), `local_value`, `canvas_value`, `timestamp`, plus optional `course_id` + `course_name` for course context. **The `sync:getPendingConflicts` IPC reads from this table** — not from `sync_updates`. A Conflict therefore has dual storage: the SyncUpdate feed row (for the unseen-changes feed) plus the PendingSyncConflict row (for the modal). Both are cleared on resolution; both are persistent.
_Avoid_: "pending conflict" (in conversation fine), "unresolved conflict" (overlaps with the Conflict subtype distinction)

**PendingDownload**:
A file download queued because the network was unavailable, the user paused it, or the system is throttling. Stored in `pending_downloads` (id, resource*id, url, local_path, attempted_at, status). On app startup the persistence layer restores any active pending downloads and resumes them. Managed by `downloadPersistence.ts`.
\_Avoid*: "queued download", "deferred file"

**ActiveOperation**:
A coordination row preventing sync and downloads from stepping on each other. Stored in `active_operations` with `operation_type` (`'sync' | 'download_html' | 'download_file'`), optional `resource_type`/`resource_id`/`course_id`, a UUID `session_id`, `started_at`, `heartbeat_at`, and `status` (`'active' | 'stale' | 'completed'`). Sync and the HTML/file downloaders both write a row before starting work and update `heartbeat_at` periodically. Stale rows (heartbeat too old) get cleaned up. Prevents two concurrent operations on the same resource.
_Avoid_: "operation lock", "sync lock"

**EndpointBackoff**:
Per-Canvas-endpoint backoff state for rate-limit recovery. Stored in `endpoint_backoff`. When Canvas returns 429 (too many requests) or 5xx for an endpoint, sync records a backoff window so future requests to the same endpoint are skipped until the window expires. Managed by `SyncBackoffManager`.
_Avoid_: "rate limit state" (overloaded with the in-memory RateLimiter)

#### HTML export & dependency tracking

The system can export Canvas content (pages, syllabi, assignments) as self-contained local HTML files for offline reading — `Resource:open` opens them in a browser without needing Canvas. The export process is multi-pass because pages reference each other and reference files.

**HtmlExport**:
A record of a successfully-exported Canvas content item as a local HTML file. Stored in `html_exports` keyed by `(course_id, source_type, source_id)` (source*type one of `'page' | 'assignment' | 'syllabus' | 'module' | 'announcement'`). Carries `title`, `content_hash` (for re-export detection), `local_path` (where the HTML file landed on disk), `remote_updated_at` (Canvas-side mtime when exported), `exported_at`.
\_Avoid*: "exported page" (too narrow — covers all five source types), "local HTML"

**HtmlDependency**:
A parent→child reference between two pieces of Canvas content discovered during HTML parsing. Stored in `html_dependencies` keyed by `(parent_source_type, parent_source_id, child_source_type, child_source_id)`. The `child_source_type` can be `'file'` in addition to the five HTML source types — so the dependency graph spans both HTML-to-HTML and HTML-to-file edges. Carries `child_canvas_url` (the URL the parent linked to) and an `is_cycle` flag (set when recursive resolution detects a loop, so the exporter can break the chain). Used by `HtmlDependencyResolver` during recursive page export — "to export Page A, also export Pages B and C and download File D."
_Avoid_: "page link", "embedded reference" (overlaps confusingly with FileReference)

#### Exports & backups

**ExportHistory**:
A record of a backup/export operation. Stored in `export_history` with `export_type` (`'full' | 'selective' | 'csv' | 'scheduled'`), `file_path`, `file_size`, `encrypted` boolean, `courses_included` (JSON list of course IDs), `tasks_exported`, `files_exported` counts, `status` (`'completed' | 'failed' | 'deleted'`), `error_message`, `created_at`. One row per export run. Used by `BackupManager`, `backupScheduleHandlers`, the manual `data:exportDatabase` IPC, and the CSV-export pathway.
_Avoid_: "backup", "export record" (fine in conversation)

The scheduled-backup configuration itself lives in `app_settings`, not on a dedicated entity. ExportHistory is the history; the schedule is just a setting.

#### Credentials & authentication

**Credential**:
The Canvas API token used to authenticate against Canvas. **Never stored in the SQLite database** — kept in the OS keychain (primary) or in an encrypted file at `{userData}/CanvasAssistant/credentials.enc` (fallback). Managed by `CredentialManager` (L0). Validated on retrieval by issuing a `/users/self` request to confirm the token hasn't been revoked.
_Avoid_: "token" (in conversation OK; in code use Credential when speaking conceptually, `apiToken` when speaking of the string value), "API key"

**CredentialStatus**:
Runtime metadata about credential storage — `hasCredential` (boolean), `storageBackend` (`'keychain' | 'file' | 'none'`), `lastValidated` (timestamp), `isValid` (boolean | null where null means "not checked yet this session"). Emitted by `CredentialManager` to the renderer so the UI can show e.g. "your token has been revoked, re-authenticate" without exposing the token itself.
_Avoid_: "auth state" (overloaded with the L2 Canvas-connection status)

#### Tables created outside the migration system

A few tables are created at runtime by their owning service rather than via the migration runner. They are still real domain (or plumbing) tables — listed here so the migration sweep isn't mistaken for the complete schema.

**FeatureFlag**:
A runtime override for an L0 feature flag. Stored in `feature_flags` (`key TEXT PRIMARY KEY, value TEXT, updated_at`). Created by `FeatureFlags.initialize()` on app startup; populated when the user overrides a flag's default in dev mode or via a settings UI. Reads cascade: in-memory override → DB override → flag definition default.
_Avoid_: "flag" (bare — too generic)

**MetricsRow**:
An aggregated metrics observation — name + type + period + count/sum/min/max/avg + timestamp. Stored in **a separate database** (`metrics.db` at `METRICS_DB_PATH`, not the main `canvas.db`), in a `metrics` table created by `MetricsCollector` on initialization. Lives outside the main sync/domain pipeline because metrics writes can be lossy without affecting correctness. The separation is deliberate — observability data doesn't share a transaction with domain data.
_Avoid_: "metric" (in code use MetricsRow when speaking of the row; "metric" for the conceptual name + value)

**Plumbing tables (not domain-meaningful):**

- `schema_version` (created by `Database.initialize()`) — migration runner bookkeeping; `(version INTEGER PRIMARY KEY, applied_at, description)`. One row per applied migration. Not a domain concept.
- `_latency_test` (transient probe in `Database.ts`) — used for startup health checks measuring write latency. Created, written to, dropped within a probe call.

#### Self-healing schema pattern

Beyond the migration runner, several services run their own defensive `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN` statements at startup, wrapped in try/catch blocks that swallow "column already exists" errors. This pattern is **belt-and-suspenders** against the case where a migration failed silently or an older database is missing schema elements. Four call sites use this pattern today:

- **`Database.initialize()`** — ensures `schema_version` exists before the migration runner starts (chicken-and-egg).
- **`AppLifecycle.repairSchema()`** — runs `schemaChecks` for `visibility_settings` (v52), `courses.archived_at` (v66), and `calendar_events.task_id`/`color`/`notes`/`reminder_minutes` (v69-v70). If any are missing, runs a repair block.
- **`SyncConflictResolver.ensureTable()`** — creates `pending_sync_conflicts` (not in any migration — see entry above), recreates `sync_preferences` (duplicates v38 migration), and runs runtime `ALTER TABLE` to add columns (`pending_sync_conflicts.course_name`, `pending_sync_conflicts.course_id`, `sync_preferences.prefer_canvas`, `sync_preferences.expires_at`) — **the last two are how `sync_preferences` got its currently-active columns** since they were never added by a migration.
- **`OperationCoordinator`, `SyncBackoffManager`, `SyncEngine`** — each `CREATE TABLE IF NOT EXISTS` their primary table (`active_operations`, `endpoint_backoff`, `pending_sync_data` — all in v76, v32, v60 migrations respectively).

The pattern means **the migration files are not a complete schema definition**. To know the actual schema a running database has, you must combine the migrations with the runtime CREATE/ALTER statements in these service files.
_Avoid_: "schema repair" without qualification — the pattern is preventive, not corrective

### Zombie schema inventory

A complete inventory of tables present in the schema with **no live writers and no live readers** in current code (only DELETE statements in `resetAppState`). Most are leftovers from the L3 intelligence subsystem removed per [ADR-0003](docs/adr/0003-removal-of-l3-intelligence-layer.md); a few are from earlier designs that were superseded.

**✅ DROPPED in migration 105 (2026-06-01)** — the first holistic cleanup removed eleven of these (no writers/readers AND no inbound FK from a live table): `task_completion_events`, `user_behavior_patterns`, `effort_estimations`, `workload_snapshots`, `recommendations`, `user_insights`, `adaptive_weight_adjustments` (the 7 L3 intelligence tables), plus `grade_replacements`, `weight_transfers` (policy grade-rule children), and `field_modifications`, `field_notification_suppressions`. Their `DatabaseRowTypes` interfaces were removed too. The remaining zombies below await further cleanup.

**ADR-0003 leftovers still present:**

- `message_display_history` — was for deduplicating recommendation/insight display
- `content_analysis` — was for document intelligence (extracted text, entities, embeddings); the L3 content-analysis _service_ is mentioned as surviving in ADR-0003 but the table is unused (analysis runs in-memory when at all)

**Policy/grading-rules leftovers (also ADR-0003-adjacent):**

- ~~`policy_rules`, `grace_tokens`, `grace_token_usage`~~ — **DROPPED (migration 109, 2026-06-01).** Dead leaf tables (nothing live FK'd into them), so they dropped cleanly under FK-ON without a rebuild. Their export/import round-trip code was removed in the same change.
- ~~`course_policies`~~ — **DROPPED (migration 110, 2026-06-02)** — the first ADR-0009 FK-off rebuild. Dropping it required rebuilding `notifications` to remove `linked_policy_id` (the only live inbound FK) first. `MarkSyllabusReviewedCommand`'s dead `course_policies` UPDATE + the export/import policy branches were removed too.
- `course_task_groups` — legacy "TaskGroup" table; dead (no writers/readers) BUT `tasks.task_group_id` still FKs it (its other referrer, `course_policies.target_group_id`, is now gone). Needs a `tasks` rebuild (flagged FK-off migration, now possible) to drop that column first. **Last remaining zombie table.**

**✅ Migration-runner FK-OFF support — landed [ADR-0009](docs/adr/0009-migration-fk-off-rebuilds.md) (2026-06-02).** A migration may set `disableForeignKeys: true` to run with `foreign_keys=OFF` (toggled outside the transaction, restored in a `finally`) + a `PRAGMA foreign_key_check` after the body. First used by migration 110 (course_policies). The remaining `course_task_groups` drop is now just a flagged `tasks` rebuild.

- ~~`grade_history` — per-grade-change audit trail. Read-but-never-written.~~ **WIRED UP (2026-06-01).** `SyncCourseOperations.recordGradeChange` now appends a row whenever a course's `current_grade` changes between syncs (one point per distinct transition, skipping null/unchanged grades). The full chain (`GradeHistoryReader` → `data:getGradeHistory` → `GradeHistoryCard` on `CourseDetail.tsx`) is now a live grade-over-time feature. No longer a zombie.

**Removed (migration 106, 2026-06-01):**

- `policy_announcements` — was the lone "live-writer-but-no-consumer" zombie; sync wrote rows every run, nothing read them since ADR-0003 removed the consumer. The two orphan writers + dead `policy-detected` event removed alongside the table. The `is_policy_related` notification flag survives but is now also unconsumed (micro-followup).

**Vestigial columns (not tables):**

- ~~`tasks.effective_grade`~~ — **DROPPED (migration 107, 2026-06-01).** The live `effectiveGrade` used by the grade simulator is COMPUTED (`getEffectiveGrade` / `simulation ?? task.grade`), never this column — which only ever appeared in migrations.
- ~~`courses.grade_volatility`~~ — **DROPPED (migration 107).** Schema-present since v1, never read or written.
- ~~`tasks.pain_index` / `penalty_severity` / `has_safety_net` / `days_until_cutoff`~~ — **DROPPED (migration 107).** Old ROI/priority scoring inputs (v30/v41); only ever written by the import-restore path (that write was removed too), no readers. The `idx_tasks_pain_index` index went with them.
- `tasks.lock_at` — **NOT vestigial (earlier note here was wrong).** Canvas's "no more submissions after" date is a live, Canvas-authoritative field: mapped in `taskMappers`, synced by `TaskSyncStrategy`/Accept/Merge, and exported. Stays.
- ~~`sync_preferences.prefer_local`~~ — **DROPPED (migration 108, 2026-06-01).** Original v38 column, superseded by the runtime-added `prefer_canvas`. Its only writer (`ResolveSyncConflictCommand`) was writing into a column nothing reads — a latent bug where an Updates-page "remember my choice" never took effect (and `INSERT OR REPLACE` could clobber an existing `prefer_canvas` back to default). That command now writes `prefer_canvas` (the resolver's read column) via upsert, which fixed the bug and freed the column to drop.
- `course_policies.scope_type`, `course_policies.target_group_id`, `course_policies.target_task_id`, `course_policies.applicable_types`, `course_policies.excluded_types` — Policy targeting columns added in v31 migration; all dead with the rest of the Policy zombie family. (`target_group_id` FKs `course_task_groups`, which is why neither can be dropped without the other.)

## Example dialogue

A new developer is being onboarded by someone who has worked on the system for a while. The conversation walks through what happens when a professor posts a new assignment in Canvas with a PDF attached.

> **Dev:** OK, so the professor just posted "Assignment 4" in CSC110 and attached the rubric as a PDF. What hits our DB on the next sync?
>
> **Expert:** Several rows in several tables. Sync hits the assignments endpoint, sees the new assignment, and writes a **QueuedTask** row in `canvas_task_queue`. _Not_ a Task. The QueuedTask is staging — the user hasn't accepted it yet.
>
> **Dev:** Hold on — why not just write a Task directly?
>
> **Expert:** Because the user's `auto_accept_canvas_tasks` mode on that Course controls that. The default is mode 0, "QUEUE_ALL" — every new Canvas assignment lands in the queue and the user has to accept, merge, or reject it. If they'd set the Course to mode 1 (auto-accept) or mode 2 (auto-merge), sync would skip the queue and write a Task directly. Most users leave mode 0.
>
> **Dev:** Right. And the PDF on the assignment? That's not the same as the assignment-body's attachments?
>
> **Expert:** No — different path. The PDF is a Canvas course-content file, so sync writes a **CanvasFile** row in `resources` with `type='file'`. It's separate from any AnnouncementAttachment — those only get written when an _announcement_ carries attachments. If the same PDF were also attached to an announcement, we'd end up with two rows for the same physical file: one CanvasFile, one AnnouncementAttachment. No FK between them. That's the "same blob, two entities" ambiguity flagged in the glossary.
>
> **Dev:** Sure. So now the user opens the app. What do they see?
>
> **Expert:** A **SyncUpdate** in the unseen-changes feed — that's the polymorphic record in `sync_updates`. For Assignment 4 the SyncUpdate is the _action-required_ lifecycle path — `is_action_required=1`, pointing at the QueuedTask. The feed dot turns on, the user clicks through to the duplicate-warning UI, sees the QueuedTask preview, and either accepts, merges, or rejects.
>
> **Dev:** Merges into what?
>
> **Expert:** If the user already had a `sourceType='user'` Task called something similar — say they'd created "Assignment 4 (rubric coming)" a week ago — they can merge the QueuedTask into that existing Task. The system tries to suggest a target via the `matchedUserTaskId` + `matchConfidence` fields, but the user can override. On merge: the user Task absorbs fields from the QueuedTask (`dueAt`, `pointsPossible`, etc.), the per-field `fieldSources` map records which fields came from Canvas vs which stayed user-authored, and the resulting Task is hybrid — `sourceType='user'` (it was originally user-created) with mixed field provenance.
>
> **Dev:** And the QueuedTask row?
>
> **Expert:** Stays in `canvas_task_queue` with `status='merged'`, `resolvedAt`, `resolvedBy`, and `matchedUserTaskId` populated. History, not garbage. A future sync that re-encounters the same Canvas assignment won't create a new pending QueuedTask because the resolved one is already there.
>
> **Dev:** Got it. Now what if the professor updates the due date a day later?
>
> **Expert:** Two cases. If the QueuedTask is still `pending`, sync updates the queue row in place and sets `values_changed_at` — the UI surfaces "this preview has changed since you first saw it." If the QueuedTask has been resolved (accepted or merged), then we're touching an actual Task. Canvas's new due date comes in, the local `dueAt` says something different (whether because of the merge or because the user manually edited), and sync compares. If they differ AND `local_modified_at` says the user touched this field, sync writes a SyncUpdate of the **Conflict** lifecycle — `change_type='conflict'`, with `old_value` = local, `new_value` = Canvas. The user gets the duplicate-warning UI again, picks a side. On resolution, the chosen value writes back to `tasks.due_at` directly.
>
> **Dev:** What does "remember my choice" do?
>
> **Expert:** Sets `remember_choice=1` on the resolved SyncUpdate row and writes a SyncPreference row to `sync_preferences` keyed by `(entity, entity_id, field)`. Future syncs that produce the same conflict check SyncConflictResolver, which reads `sync_preferences`, and if a matching unexpired preference is found the conflict auto-resolves without re-surfacing. There's a separately-named `field_notification_suppressions` table that sounds related — it isn't. It was for a different, never-wired-up feature (data-completeness alert suppression). Don't conflate the two.
>
> **Dev:** And the PDF — if the user wants to grab it?
>
> **Expert:** It already exists as a CanvasFile row, but `localPath` is null until they download it. The user clicks "download" on the Files page; the file gets fetched, saved under `Downloads/CSC110/...`, and `localPath` is set. If the PDF is also referenced in the assignment's HTML body, there's a parallel **ContentFileReference** in `content_file_references` tracking the same blob with its own `download_status` — that's the "same pointer, two tables" ambiguity. The Files page may show the file once or twice depending on where it lives.
>
> **Dev:** This system is genuinely two things.
>
> **Expert:** Many things, actually. That's why we have a glossary.
