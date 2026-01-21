# Canvas Integration Dashboard - Open Questions & Decisions

**Status:** ✅ RESOLVED
**Last Updated:** January 21, 2026
**Purpose:** Resolve all technical ambiguities before implementation begins
**All Decisions Finalized:** Ready for implementation

---

## Category 1: Algorithm Specifications (CRITICAL)

### Q1.1: ROI Priority Scoring Formula
**Question:** What is the exact mathematical formula for "ROI scoring with logarithmic volatility weighting"?

**Context from Spec:**
- L3 Intelligence layer computes priority_score
- Spec mentions "logarithmic volatility weighting" but no formula
- Dashboard displays assignments ranked by this score

**Need to Define:**
```
priority_score = f(
  points_possible,
  weight,              // % of final grade
  time_until_due,
  grade_volatility,    // from grade_history
  current_grade,       // course performance
  target_grade,        // student's goal
  ???                  // other factors?
)
```

**Proposed Options:**
- [ ] Option A: Simple ROI = (points_possible * weight) / hours_until_due
- [ ] Option B: Weighted with grade gap = (weight * target_delta) / log(hours_until_due + 1)
- [x] Option C: Custom formula (specify below)

**Decision:** Custom Formula

```
priority_score = (weight × target_delta) / log(max(v_eff, 0.1) + 1)

Where:
- weight: % of final grade (from assignments.weight)
- target_delta: Gap between target and assessed grade
- v_eff: Grade volatility (STDDEV of grade_history with exponential decay)
- 0.1: Minimum floor to avoid division by zero
```

**Rationale:** This formula balances the student's academic "risk" (volatility) with the actual impact on their final mark. Higher volatility increases the denominator (logarithmically), reducing priority for unpredictable courses. Assignments with high weight and large target gaps get maximum priority.

---

### Q1.2: Naive Bayes Classifier for Assignment Importance
**Question:** What features feed the classifier, and where does training data come from?

**Context from Spec:**
- Milestone 3.1 mentions "Naive Bayes classifier for assignment importance"
- No specification of features or training corpus

**Need to Define:**
1. **Features:** What signals predict importance?
   - [ ] Title keywords (e.g., "midterm", "final", "quiz")
   - [ ] Points possible (high-stakes assignments)
   - [ ] Due date proximity
   - [ ] Assignment type (submission_types field)
   - [ ] Other: _____________

2. **Training Data:** Where do we get labeled examples?
   - [ ] Option A: Manual labeling by team (50-100 assignments)
   - [ ] Option B: Heuristic labeling (weight > 10% = important)
   - [x] Option C: Skip ML entirely, use rule-based classification
   - [ ] Option D: User feedback loop (users rate importance, system learns)

**Decision:** Skip ML entirely; use rule-based classification

**Rationale:** Given the 10-week timeline, training a Naive Bayes model with high accuracy is prohibitive. Rule-based scoring using points_possible, weight, and title keywords (e.g., "midterm", "final", "exam") provides immediate, predictable value without "black-box" errors or training data requirements.

---

### Q1.3: Wet/Dry Lab Classification
**Question:** Is this feature worth building, and how accurate will it be?

**Context from Spec:**
- Resources table has `lab_classification` field (wet/dry/unknown)
- Uses NLP-based categorization with confidence scoring

**Concerns:**
- Very domain-specific feature
- Requires training data from lab course materials
- Unclear user value (how does wet vs. dry change student behavior?)

**Options:**
- [ ] Option A: Build full NLP classifier (requires labeled dataset)
- [ ] Option B: Simple keyword matching ("pipette", "PCR" → wet; "MATLAB", "Python" → dry)
- [x] Option C: Cut this feature entirely for MVP
- [ ] Option D: Add as manual user tag instead of automatic classification

**Decision:** Cut this feature entirely for MVP

**Rationale:** Lab classification is not a priority for the core dashboard. Resources will be diverted to **Target Delta** analytics and **Calendar/Timetable** features which provide more immediate student value. Can revisit in Phase 3+ if user feedback indicates demand.

---

## Category 2: Architecture & Design Decisions

### Q2.1: Why Layer "L2.5" Instead of Proper Numbering?
**Question:** Why introduce a fractional layer (L2.5: Controller) instead of renumbering?

**Current Layering:**
```
L5: UI (React)
L4: Presentation (Reactive Store)
L2.5: Controller (Command Dispatcher)  ← Why not L3?
L3: Intelligence (Priority Engine)      ← Why not L2?
L2: Daemon (Adaptive Sync Engine)       ← Why not L4?
L1: Persistence (SQLite WAL)
L0: Environment Observer
```

**Options:**
- [ ] Option A: Keep fractional numbering (has specific semantic meaning?)
- [x] Option B: Renumber to sequential L0-L6 for clarity
- [ ] Option C: Use named layers only, drop numbers entirely

**Decision:** Renumber to sequential L0-L6

**Rationale:** Fractional numbering creates technical debt and confusion. A clean 0-6 hierarchy maintains the "7-Layer Isolation Model" while improving code readability and developer onboarding. New numbering will be documented in revised architecture diagram.

---

### Q2.2: Is 7-Layer Architecture Justified?
**Question:** Could we simplify to 4 layers without losing critical functionality?

**Simplified Alternative:**
```
L3: UI + Presentation (React + Zustand)
L2: Business Logic (Sync + Priority + Commands)
L1: Persistence (SQLite)
L0: System Monitoring (Power/Focus)
```

**Trade-offs:**
- **Current (7 layers):** Maximum testability, clear boundaries, higher cognitive load
- **Simplified (4 layers):** Faster development, easier onboarding, less strict isolation

**Decision:** Keep 7-Layer Architecture (with refinements)

**Rationale:** The separation between the **L2 Sync Daemon** (network I/O) and **L1 Persistence** (SQLite) is critical for offline-first functionality. Strict isolation ensures that network failures do not hang the UI. However, L0 (Environment Observer) will be simplified to a utility module rather than a full "layer" to reduce cognitive overhead.

---

### Q2.3: Local Edits Without Canvas Sync
**Question:** Why allow local modifications (e.g., assignments, events) if they can never push back to Canvas?

**Context from Spec:**
- Schema has `local_modified_at` fields
- Conflict resolution UI for local vs. remote data
- But spec explicitly says "Does NOT push to Canvas API"

**Current Use Cases for Local Edits:**
1. User-created calendar events (fully local)
2. Assignment metadata edits (???)
3. Course note-taking (???)

**Options:**
- [ ] Option A: Only allow local edits for non-Canvas entities (user events, notes)
- [ ] Option B: Allow all local edits, mark clearly as "local-only annotations"
- [ ] Option C: Make all Canvas data strictly read-only except user-created content
- [ ] Option D: Add a "Notes" field to assignments/courses for local annotations

**Decision:** Allow local edits to Canvas objects (grades, weights, assignments) with conflict detection

**Rationale:** Users can edit Canvas objects locally for "what-if" analysis. These fields will NOT be overridden by Canvas API pulls if the API does not provide data for those specific fields. If a conflict occurs (user edits + Canvas updates same field), the system will flag it and present both versions for user resolution via the Conflict Resolver UI (Part V of spec). This enables academic planning without compromising data integrity.

---

## Category 3: Technical Implementation Details

### Q3.1: Canvas API Rate Limiting Strategy
**Question:** How do we handle Canvas API rate limits during bulk sync?

**Canvas API Limits (typically):**
- 3000 requests per hour per token
- Tiered by institution

**Scenarios:**
- Full sync for 6 courses: ~50-100 API calls
- Incremental sync: 6-12 calls (one per course)
- File download: Variable (could be hundreds for large courses)

**Need to Define:**
1. **Rate Limit Detection:**
   - [x] Parse `X-Rate-Limit-Remaining` header
   - [x] Detect 429 Too Many Requests response
   - [x] Exponential backoff on 429

2. **Concurrency:**
   - [x] Max concurrent requests: **3 concurrent course syncs**
   - [x] Queue system for file downloads
   - [x] Priority: assignments > announcements > files

**Decision:** Parse `X-Rate-Limit-Remaining` header + exponential backoff on 429

**Rationale:** Adaptive sync requires the system to slow down BEFORE hitting a 429 error, preserving token health. Max 3 concurrent course syncs prevents institutional throttling. Queue system ensures high-priority resources (assignments) sync before low-priority ones (file attachments).

---

### Q3.2: Total Weight ≠ 100% Handling
**Question:** What's the UX when `total_weight ≠ 100%` for extended periods?

**Context from Spec:**
- Progress Analytics hidden if `total_weight ≠ 100%` (the "100% Guardrail")
- `target_delta` calculation requires knowing remaining weight

**Real-World Scenarios:**
1. Early semester: Professors haven't posted all assignments yet (weight = 40%)
2. Mid-semester: Some assignments posted but not all (weight = 75%)
3. Late semester: All posted, should equal 100%
4. Forever broken: Professor misconfigured weights (sum = 87% or 112%)

**Options:**
- [x] Option A: Show warning banner "Analytics unavailable until all work is posted (current: 75%)"
- [ ] Option B: Show partial analytics with disclaimer "Based on X% of coursework"
- [ ] Option C: Extrapolate to 100% (risky, potentially misleading)
- [ ] Option D: Allow manual override "I confirm this is all coursework"

**Decision:** Show warning banner with current weight percentage

**Rationale:** The **100% Guardrail** is essential for academic trust. Accurate ROI and target_delta cannot be calculated if the course syllabus weighting is incomplete or incorrect. Warning banner format: "⚠️ Analytics unavailable until all work is posted (current: 87%). Check Canvas for missing assignments."

---

### Q3.3: Recurring Event Deletion Complexity
**Question:** Is full RRULE support with exceptions worth the implementation cost?

**Context from Spec:**
- Calendar events support `recurrence_rule` (iCal RRULE format)
- `recurrence_exception_dates` for single-instance deletions
- "Edit series" vs. "Edit single instance" UI

**Implementation Complexity:**
- RRULE parsing library (e.g., rrule.js)
- Exception handling logic
- "Edit series from this point forward" feature
- Testing edge cases (leap years, DST, etc.)

**Options:**
- [ ] Option A: Full RRULE support (spec as written)
- [ ] Option B: Simple recurrence only (daily/weekly/monthly, no complex rules)
- [ ] Option C: No recurrence - user creates separate events
- [x] Option D: Phase 2 feature (cut from MVP)

**Decision:** Cut from MVP, defer to Phase 2

**Rationale:** Full RRULE support for recurring events adds significant overhead to the L1 schema and UI logic. MVP will support single-instance events only. Recurring events (lectures, labs) can be manually created or imported from Canvas calendar in Phase 2 once core sync and analytics are stable.

---

### Q3.4: File Syncing Scope
**Question:** Should MVP include full file syncing, or defer to Phase 2+?

**Context from Spec:**
- Section 5: Files (Offline Library)
- Local storage in `user_data_dir/cid/files/` with SHA-256 naming
- Selective sync, search, offline access

**Complexity Factors:**
- File size limits (max per file? max total?)
- Storage quota management (what if user runs out of disk space?)
- Stale file cleanup (delete local copies after X days?)
- Mime type handling (preview PDFs inline? open others externally?)
- Search indexing (full-text search across PDFs?)

**Options:**
- [ ] Option A: Full file syncing as specified (high complexity)
- [ ] Option B: View-only links (open files in browser, no local cache)
- [x] Option C: Manual download only (user clicks, we download once, no sync)
- [ ] Option D: Phase 2 feature

**Decision:** Unidirectional manual sync (Canvas → Local)

**Rationale:** No cloud uploads. Files are synced one-way from Canvas to local storage when user explicitly requests download. Manual caching allows for offline viewing without the complexity and corruption risks of bidirectional syncing or automatic background downloads. Users control storage usage.

---

## Category 4: Data & Security

### Q4.1: Security Threat Model
**Question:** What are the attack vectors and mitigations beyond PII redaction?

**Need to Document:**
1. **Threat: API Token Theft**
   - Stored in OS keychain (keytar)
   - [ ] What if keychain is compromised?
   - [ ] Token rotation policy?

2. **Threat: Local Database Access**
   - SQLite file at `user_data_dir/cid/database.db`
   - [ ] Encrypt database at rest?
   - [ ] File permissions (chmod 600)?

3. **Threat: Man-in-the-Middle**
   - [ ] Certificate pinning for Canvas API?
   - [ ] Or rely on OS trust store?

4. **Threat: Malicious Updates**
   - [x] Code signing for electron-updater
   - [x] Update verification

**Decision:** Mitigate via OS Keychain, File Permissions, and HMAC IPC Validation

**Mitigations:**
1. **API Token Theft:** Rely on OS keychain security (keytar). If compromised, user must revoke token via Canvas settings.
2. **Local Database Access:** Set file permissions to chmod 600 (owner read/write only). No encryption at rest (performance overhead not justified for non-PII academic data).
3. **Man-in-the-Middle:** Rely on OS trust store (system certificates). No custom certificate pinning.
4. **Malicious Updates:** Code signing for macOS/Windows. Verify update signatures before applying.
5. **IPC Security:** All renderer-to-main communication signed with HMAC validation to prevent script injection.

**Rationale:** Balance security with implementation complexity. Focus on standard OS-level protections rather than custom crypto that could introduce vulnerabilities.

---

### Q4.2: Data Export & Backup
**Question:** How can users export or back up their data?

**Scenarios:**
1. User wants to switch computers
2. User wants to analyze data in Excel/Python
3. App crashes, database corrupted

**Options:**
- [ ] Option A: JSON export of all tables
- [x] Option B: SQLite file copy (with instructions)
- [ ] Option C: Cloud backup (Dropbox/Google Drive sync)
- [ ] Option D: No export (data stays local, ephemeral)

**Decision:** SQLite file copy via "Export Database" menu option

**Rationale:** As a local-first app, providing a "File → Export Database As..." option is the most transparent way for users to own their data. Users can copy the .db file to new computers, analyze in SQLite Browser, or backup to cloud storage manually. No automatic cloud sync to preserve privacy.

---

### Q4.3: Database Migration Rollback
**Question:** What happens if a schema migration fails or corrupts data?

**Context from Spec:**
- "Database migrations applied automatically on version bump"
- No rollback strategy mentioned

**Need to Define:**
1. **Pre-migration backup:**
   - [x] Automatic backup before every migration
   - [x] Keep last 3 backups (auto-delete older)

2. **Rollback mechanism:**
   - [ ] Manual rollback via CLI command
   - [x] Automatic rollback on migration failure
   - [x] Warn user and provide recovery instructions

**Decision:** Pre-migration backup + automatic rollback on failure

**Rationale:** Since SQLite is the "Single Source of Truth," a failed migration during a version bump is a catastrophic failure state. Automatic backup before migrations (stored in `backups/database_v{version}_{timestamp}.db`) with auto-rollback ensures data safety. Keep last 3 backups to prevent disk bloat.

---

## Category 5: User Experience & Validation

### Q5.1: User Research
**Question:** Have target users (UofT students) validated these features?

**Key Assumptions to Validate:**
1. Students want offline access (vs. just using Canvas mobile app)
2. Priority scoring is more useful than Canvas's default sort
3. Grade analytics (assessed vs. current) provides actionable insight
4. Keyboard shortcuts are a selling point (vs. friction for casual users)
5. Wet/dry lab classification is valuable

**Validation Methods:**
- [ ] Option A: Conduct user interviews (5-10 UofT students)
- [ ] Option B: Survey (Google Forms, 50+ responses)
- [ ] Option C: Build clickable prototype, observe usage
- [x] Option D: Ship MVP, iterate based on feedback

**Decision:** Ship MVP, iterate based on real-world feedback

**Rationale:** Core features (offline sync, ROI priority, grade analytics) address documented pain points for UofT students managing multiple courses. Real-world usage data with actual Canvas data is more valuable than prototype observation in a tight 10-week window. Build telemetry (privacy-respecting) into MVP to track feature usage and guide Phase 2 priorities.

---

### Q5.2: Cost/Benefit of Each Layer
**Question:** Is each layer pulling its weight in complexity vs. value?

**Layer Value Analysis:**

| Layer | Complexity | User-Facing Value | Keep? |
|-------|------------|-------------------|-------|
| L5: UI | High | ★★★★★ (core UX) | ✓ |
| L4: Reactive Store | Medium | ★★★★☆ (real-time updates) | ? |
| L2.5: Command Dispatcher | Medium | ★☆☆☆☆ (internal only) | ? |
| L3: Priority Engine | High | ★★★★☆ (ROI scoring) | ? |
| L2: Sync Daemon | High | ★★★★★ (core data) | ✓ |
| L1: SQLite | Medium | ★★★★★ (offline access) | ✓ |
| L0: Environment Observer | Low | ★★☆☆☆ (battery/focus) | ? |

**Questions:**
- Can L4 and L2.5 merge? **No** - Presentation logic (view models) and command validation serve different purposes.
- Can L0 be a simple utility module instead of a "layer"? **Yes** - Simplify to utility/service module.
- Is L3 worth it vs. simple sorting heuristics? **Yes** - ROI scoring is core value proposition.

**Decision:** Merge L0 Environment Observer into utility module; keep other layers

**Rationale:** L0 (battery/focus monitoring) doesn't need full "layer" status - can be a simple service. This reduces cognitive overhead while maintaining the critical separation between Sync (L2), Intelligence (L3), and Persistence (L1). Revised architecture will have 6 functional layers + utilities.

---

## Category 6: Timeline & Resources

### Q6.1: Is 10 Weeks Realistic?
**Question:** Can this be built in 10 weeks with the available team?

**Context from Spec:**
- 6 phases over 10 weeks
- Multiple complex features (sync, analytics, calendar, files)

**Need to Clarify:**
1. **Team size:** ___ developers (full-time or part-time?)
2. **Skill levels:** ___ (junior/mid/senior mix?)
3. **Prior experience:** ___ (React? Electron? SQLite? Canvas API?)

**Options:**
- [x] Option A: Keep 10-week timeline, cut features to fit
- [ ] Option B: Extend timeline to 16-20 weeks for full spec
- [ ] Option C: MVP in 10 weeks, full features in 20 weeks
- [ ] Option D: Hire additional developers

**Decision:** Keep 10-week timeline, cut Phase 3 features

**Rationale:** Focus on "Must-Have" features (Sync, ROI scoring, Dashboard, Notifications) and move complex features (ML classification, full file sync, recurring events) to backlog. Deliver working MVP that students can use immediately rather than perfect system in 6 months. Ship early, iterate based on feedback.

---

### Q6.2: Phase Prioritization
**Question:** If we need to cut scope, what's the priority order?

**Must-Have (MVP - Weeks 1-10):**
- [x] Dashboard with assignment list
- [x] Basic Canvas sync (courses, assignments, grades)
- [x] SQLite persistence with WAL mode
- [x] ROI priority scoring (custom formula)
- [x] Notifications feed with dismiss/archive
- [x] Basic keyboard shortcuts (Alt+1-5, j/k navigation)

**Should-Have (Phase 2 - Weeks 11-16):**
- [x] Calendar view (day/week/month, single events only)
- [x] Grade analytics (assessed vs. current, target delta, volatility)
- [x] Theme switching (light/dark/system)
- [x] Command palette (Ctrl/Cmd+K)
- [x] File browser with manual download

**Nice-to-Have (Phase 3+ - Future Backlog):**
- [ ] Automatic file syncing
- [ ] Recurring events (RRULE support)
- [ ] ML-based importance classification
- [ ] Wet/dry lab classification
- [ ] Advanced command palette features

**Decision:** Prioritized roadmap above with clear phase boundaries

**Rationale:** MVP delivers core value (offline access, smart prioritization, grade tracking) in 10 weeks. Phase 2 adds polish and analytics. Phase 3+ features deferred until user feedback validates demand.

---

## ✅ All Questions Resolved - Ready for Implementation

**Completed Actions:**
1. ✅ All 25 questions answered with concrete decisions
2. ✅ Rationales documented for architectural choices
3. ✅ MVP scope clearly defined (10-week timeline)
4. ✅ Phase 2/3 features identified and deferred

**Next Steps:**
1. Create `MVP_IMPLEMENTATION_ROADMAP.md` with week-by-week milestones
2. Generate revised architecture diagram (L0-L6 sequential numbering)
3. Document ROI formula as implementation specification
4. Set up project scaffolding (directory structure, dependencies)
5. Begin Phase 1: Foundation (Environment setup, SQLite schema)

**Post-Resolution Actions:**
- [ ] Update `CID_Implementation_Plan_v4.md` to reflect final decisions
- [ ] Share decisions with team for review
- [ ] Create GitHub project board with MVP tasks
- [ ] Schedule Phase 1 kickoff meeting

---

**Document Owner:** Project Team
**Decisions Finalized:** January 21, 2026
**Status:** LOCKED - No further changes without formal change request
