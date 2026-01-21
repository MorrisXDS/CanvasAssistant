# Canvas Integration Dashboard - Open Questions & Decisions

**Status:** Working Document
**Last Updated:** January 21, 2026
**Purpose:** Resolve all technical ambiguities before implementation begins

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
- [ ] Option C: Custom formula (specify below)

**Decision:** _____________

**Rationale:** _____________

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
   - [ ] Option C: Skip ML entirely, use rule-based classification
   - [ ] Option D: User feedback loop (users rate importance, system learns)

**Decision:** _____________

**Rationale:** _____________

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
- [ ] Option C: Cut this feature entirely for MVP
- [ ] Option D: Add as manual user tag instead of automatic classification

**Decision:** _____________

**Rationale:** _____________

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
- [ ] Option B: Renumber to sequential L0-L6 for clarity
- [ ] Option C: Use named layers only, drop numbers entirely

**Decision:** _____________

**Rationale:** _____________

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

**Decision:** _____________

**Rationale:** _____________

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

**Decision:** _____________

**Rationale:** _____________

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
   - [ ] Parse `X-Rate-Limit-Remaining` header
   - [ ] Detect 429 Too Many Requests response
   - [ ] Exponential backoff on 429

2. **Concurrency:**
   - [ ] Max concurrent requests: ___ (spec says "configurable concurrency")
   - [ ] Queue system for file downloads
   - [ ] Priority: assignments > announcements > files

**Decision:** _____________

**Rationale:** _____________

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
- [ ] Option A: Show warning banner "Analytics unavailable until all work is posted (current: 75%)"
- [ ] Option B: Show partial analytics with disclaimer "Based on X% of coursework"
- [ ] Option C: Extrapolate to 100% (risky, potentially misleading)
- [ ] Option D: Allow manual override "I confirm this is all coursework"

**Decision:** _____________

**Rationale:** _____________

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
- [ ] Option D: Phase 2 feature (cut from MVP)

**Decision:** _____________

**Rationale:** _____________

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
- [ ] Option C: Manual download only (user clicks, we download once, no sync)
- [ ] Option D: Phase 2 feature

**Decision:** _____________

**Rationale:** _____________

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
   - [ ] Code signing for electron-updater?
   - [ ] Update verification?

**Decision:** _____________

**Rationale:** _____________

---

### Q4.2: Data Export & Backup
**Question:** How can users export or back up their data?

**Scenarios:**
1. User wants to switch computers
2. User wants to analyze data in Excel/Python
3. App crashes, database corrupted

**Options:**
- [ ] Option A: JSON export of all tables
- [ ] Option B: SQLite file copy (with instructions)
- [ ] Option C: Cloud backup (Dropbox/Google Drive sync)
- [ ] Option D: No export (data stays local, ephemeral)

**Decision:** _____________

**Rationale:** _____________

---

### Q4.3: Database Migration Rollback
**Question:** What happens if a schema migration fails or corrupts data?

**Context from Spec:**
- "Database migrations applied automatically on version bump"
- No rollback strategy mentioned

**Need to Define:**
1. **Pre-migration backup:**
   - [ ] Automatic backup before every migration?
   - [ ] Keep last N backups?

2. **Rollback mechanism:**
   - [ ] Manual rollback via CLI command?
   - [ ] Automatic rollback on failure?
   - [ ] Warn user and require intervention?

**Decision:** _____________

**Rationale:** _____________

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
- [ ] Option D: Ship MVP, iterate based on feedback

**Decision:** _____________

**Rationale:** _____________

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
- Can L4 and L2.5 merge?
- Can L0 be a simple utility module instead of a "layer"?
- Is L3 worth it vs. simple sorting heuristics?

**Decision:** _____________

**Rationale:** _____________

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
- [ ] Option A: Keep 10-week timeline, cut features to fit
- [ ] Option B: Extend timeline to 16-20 weeks for full spec
- [ ] Option C: MVP in 10 weeks, full features in 20 weeks
- [ ] Option D: Hire additional developers

**Decision:** _____________

**Rationale:** _____________

---

### Q6.2: Phase Prioritization
**Question:** If we need to cut scope, what's the priority order?

**Must-Have (MVP):**
- [ ] Dashboard with assignment list
- [ ] Basic Canvas sync (courses, assignments, grades)
- [ ] SQLite persistence
- [ ] Simple priority scoring (time + weight)
- [ ] Notifications feed

**Should-Have (Phase 2):**
- [ ] Calendar view (day/week/month)
- [ ] Grade analytics (assessed vs. current)
- [ ] Keyboard shortcuts
- [ ] Theme switching

**Nice-to-Have (Phase 3+):**
- [ ] File syncing
- [ ] Recurring events
- [ ] ML-based priority scoring
- [ ] Lab classification
- [ ] Command palette

**Decision:** _____________

**Rationale:** _____________

---

## Next Steps

**For Each Question Above:**
1. Assign owner to research/propose solution
2. Set decision deadline
3. Document final decision in this file
4. Update main spec (CID_Implementation_Plan_v4.md) accordingly

**Review Cadence:**
- Update this document daily during Phase 0 (pre-implementation)
- Mark questions as RESOLVED when decided
- Archive resolved questions to separate document after 1 week

---

**Document Owner:** _____________
**Last Review:** January 21, 2026
**Next Review:** _______________
