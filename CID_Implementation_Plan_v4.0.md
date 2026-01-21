# [cite_start]CANVAS INTEGRATION DASHBOARD [cite: 1]
## [cite_start]Technical Implementation Specification [cite: 2]
### [cite_start]Version 4.0 - Architecture & UI/UX Integration [cite: 3]
[cite_start]**January 2026** [cite: 4]
[cite_start]**CONFIDENTIAL - For Internal Use Only** [cite: 5]

---

## [cite_start]Executive Summary [cite: 6]
[cite_start]The Canvas Integration Dashboard (CID) is an offline-first, privacy-respecting academic command center designed to provide University of Toronto students with unified access to Canvas LMS data. [cite: 7] [cite_start]This comprehensive implementation plan addresses all architectural components, UI/UX design, security considerations, and deployment procedures required for a production-ready system. [cite: 8]

### [cite_start]Project Objectives [cite: 9]
* [cite_start]Provide unified, offline-capable access to Canvas LMS data [cite: 10]
* [cite_start]Implement intelligent priority scoring for academic tasks [cite: 11]
* [cite_start]Ensure data privacy through local-first architecture [cite: 12]
* [cite_start]Support automated synchronization with configurable intervals [cite: 13]
* [cite_start]Enable context-aware notifications based on system state [cite: 14]
* [cite_start]Deliver a keyboard-centric, high-density command center UI [cite: 15]

### [cite_start]Key Architectural Principles [cite: 16]
* [cite_start]**Unidirectional Data Flow:** Each layer has single responsibility with strict contracts [cite: 17]
* [cite_start]**Idempotency First:** All operations can be safely retried without side effects [cite: 18]
* [cite_start]**Event-Driven Updates:** UI reacts to data changes rather than polling [cite: 19]
* [cite_start]**Graceful Degradation:** System remains functional during network failures [cite: 20]
* [cite_start]**Adaptive Resource Management:** Dynamic polling based on system state [cite: 21]

### [cite_start]Performance Targets [cite: 22]
[cite_start][cite: 23]
| Component | Target | Constraint |
| :--- | :--- | :--- |
| Memory (RSS) | <300MB peak | Electron overhead |
| Write Latency | <1ms (WAL mode) | UI responsiveness |
| UI Render | 60fps sustained | Virtual lists |
| Network (idle) | 99% reduction | ETag caching |

---

## [cite_start]Part I: System Architecture [cite: 24]
### [cite_start]1.1 The 7-Layer Isolation Model [cite: 25]
[cite_start]The CID employs a Unidirectional Data Flow Architecture where each layer has a single, well-defined responsibility. [cite: 26] [cite_start]Cross-layer communication follows strict contracts to prevent tight coupling. [cite: 27]

[cite_start]**Architecture Overview** [cite: 28]
[cite_start][cite: 29]
```text
┌─────────────────────────────────────────────────┐
[cite_start]│ L5: UI (React) - Dashboard, Calendar, etc.     │ [cite: 30]
[cite_start]│ • Virtual lists for performance                │ [cite: 31]
[cite_start]│ • Keyboard-centric navigation                  │ [cite: 32]
[cite_start]└─────────────────────────────────────────────────┘ [cite: 33]
[cite_start]↕ [cite: 34]
┌─────────────────────────────────────────────────┐
[cite_start]│ L4: Presentation (Reactive Store)              │ [cite: 36]
[cite_start]│ • Event-driven observer pattern                │ [cite: 37]
[cite_start]│ • Computes view models on L1 commits           │ [cite: 38]
[cite_start]└─────────────────────────────────────────────────┘ [cite: 39]
[cite_start]↕ [cite: 40]
┌─────────────────────────────────────────────────┐
[cite_start]│ L2.5: Controller (Command Dispatcher)          │ [cite: 42]
[cite_start]│ • Validates commands, ensures atomicity        │ [cite: 43]
[cite_start]│ • Handles conflict resolution                  │ [cite: 44]
[cite_start]└─────────────────────────────────────────────────┘ [cite: 45]
[cite_start]↕ [cite: 46]
┌─────────────────────────────────────────────────┐
[cite_start]│ L3: Intelligence (Priority Engine)             │ [cite: 48]
[cite_start]│ • ROI scoring, grade analytics                 │ [cite: 49]
[cite_start]│ • Lab classification (wet/dry)                 │ [cite: 50]
[cite_start]└─────────────────────────────────────────────────┘ [cite: 51]
[cite_start]↕ [cite: 52]
┌─────────────────────────────────────────────────┐
[cite_start]│ L2: Daemon (Adaptive Sync Engine)              │ [cite: 54]
[cite_start]│ • Stream-based JSON parsing                    │ [cite: 55]
[cite_start]│ • Conditional GET with ETag                    │ [cite: 56]
[cite_start]└─────────────────────────────────────────────────┘ [cite: 57]
[cite_start]↕ [cite: 58]
┌─────────────────────────────────────────────────┐
[cite_start]│ L1: Persistence (SQLite WAL)                   │ [cite: 60]
[cite_start]│ • Document-relational hybrid                   │ [cite: 61]
[cite_start]│ • Event emission on commit                     │ [cite: 62]
[cite_start]└─────────────────────────────────────────────────┘ [cite: 63]
[cite_start]↕ [cite: 64]
┌─────────────────────────────────────────────────┐
[cite_start]│ L0: Environment Observer                       │ [cite: 66]
[cite_start]│ • Power, focus, thermal monitoring             │ [cite: 67]
[cite_start]│ • PII-redacted audit logging                   │ [cite: 68]
[cite_start]└─────────────────────────────────────────────────┘ [cite: 69]
```

**Data Flow Principles**

1. L5 receives read-only props from L4; user events flow down to L2.5
2. L4 subscribes to L1 state changes via event emitters, not polling
3. L2.5 validates commands, invokes L3 for calculations, commits atomic transactions to L1
4. L3 operates as pure functions with no side effects except L1 writes for calculated fields
5. L2 handles all network I/O and writes raw Canvas data to L1
6. L1 emits commit events after transactions complete, enabling reactive UI updates
7. L0 monitors system state and controls L2 polling behavior

---

## Part II: Data Model

### 2.1 Schema Design Principles

* **Idempotency First:** All external entities have unique external_id for safe upserts
* **Audit Trail:** created_at, updated_at, deleted_at for all mutable tables
* **Normalization:** Unified notifications table for Canvas + system events
* **UI-Optimized Fields:** Additional columns for computed UI states

### 2.2 Core Tables

#### Courses Table

```sql
CREATE TABLE courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT, [cite: 87]
    external_id TEXT UNIQUE NOT NULL, [cite: 88]
    code TEXT NOT NULL,                -- e.g., 'ECE314' [cite: 89]
    name TEXT NOT NULL, [cite: 90]
    current_grade REAL, [cite: 91]
    assessed_grade REAL,               -- NEW: Grade from completed work [cite: 92]
    target_grade REAL DEFAULT 85.0, [cite: 93]
    grade_volatility REAL DEFAULT 0.0, -- Calculated from history [cite: 94]
    total_weight REAL DEFAULT 0.0,     -- NEW: Sum of all weights [cite: 95]
    landing_page_url TEXT, [cite: 96]
    last_synced_at DATETIME, [cite: 97]
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, [cite: 98]
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, [cite: 99]
    deleted_at DATETIME [cite: 100]
); [cite: 101]
```

#### Assignments Table

```sql
CREATE TABLE assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, [cite: 104]
    external_id TEXT UNIQUE NOT NULL, [cite: 105]
    course_id INTEGER NOT NULL, [cite: 106]
    title TEXT NOT NULL, [cite: 107]
    description TEXT, [cite: 108]
    due_at DATETIME, [cite: 109]
    unlock_at DATETIME, [cite: 110]
    points_possible REAL, [cite: 111]
    submission_types TEXT,              -- JSON array [cite: 112]
    weight REAL DEFAULT 0.0,            -- NEW: % of final grade [cite: 113]
    grade REAL,                         -- NEW: Earned grade [cite: 114]
    priority_score REAL DEFAULT 0.0,    -- L3 calculated ROI [cite: 115]
    is_completed BOOLEAN DEFAULT FALSE, [cite: 116]
    completed_at DATETIME, [cite: 117]
    local_modified_at DATETIME, [cite: 118]
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, [cite: 119]
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, [cite: 120]
    FOREIGN KEY(course_id) REFERENCES courses(id) [cite: 121]
); [cite: 122]
```

#### Calendar Events Table (NEW)

```sql
CREATE TABLE calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, [cite: 125]
    external_id TEXT UNIQUE,            -- NULL for user-created [cite: 126]
    source_type TEXT CHECK(source_type IN ('canvas', 'user')), [cite: 127]
    course_id INTEGER, [cite: 128]
    title TEXT NOT NULL, [cite: 129]
    description TEXT, [cite: 130]
    start_at DATETIME NOT NULL, [cite: 131]
    end_at DATETIME, [cite: 132]
    all_day BOOLEAN DEFAULT FALSE, [cite: 133]
    recurrence_rule TEXT,               -- iCal RRULE format [cite: 134]
    recurrence_exception_dates TEXT,    -- JSON array of excluded dates [cite: 135]
    parent_event_id INTEGER,            -- For recurring instances [cite: 136]
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, [cite: 137]
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, [cite: 138]
    deleted_at DATETIME, [cite: 139]
    FOREIGN KEY(course_id) REFERENCES courses(id), [cite: 140]
    FOREIGN KEY(parent_event_id) REFERENCES calendar_events(id) [cite: 141]
); [cite: 142]
```

#### Notifications Table

```sql
CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT, [cite: 145]
    source_type TEXT CHECK(source_type IN ('canvas', 'system')), [cite: 146]
    source_id TEXT, [cite: 147]
    course_id INTEGER, [cite: 148]
    title TEXT NOT NULL, [cite: 149]
    message TEXT NOT NULL, [cite: 150]
    priority_level TEXT CHECK(priority_level IN [cite: 151]
        ('critical','high','medium','low')) DEFAULT 'medium', [cite: 152]
    priority_score REAL DEFAULT 0.0, [cite: 153]
    published_at DATETIME NOT NULL, [cite: 154]
    dismissed_at DATETIME,              -- NULL = active [cite: 155]
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, [cite: 156]
    FOREIGN KEY(course_id) REFERENCES courses(id), [cite: 157]
    UNIQUE(source_type, source_id) [cite: 158]
); [cite: 159]
```

#### Resources/Files Table

```sql
CREATE TABLE resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT, [cite: 162]
    external_id TEXT UNIQUE NOT NULL, [cite: 163]
    course_id INTEGER NOT NULL, [cite: 164]
    parent_folder_id INTEGER, [cite: 165]
    type TEXT CHECK(type IN ('file', 'folder', 'external_url', 'page')), [cite: 166]
    title TEXT NOT NULL, [cite: 167]
    url TEXT, [cite: 168]
    local_path TEXT,                    -- NEW: Cached file location [cite: 169]
    size_bytes INTEGER, [cite: 170]
    mime_type TEXT, [cite: 171]
    lab_classification TEXT CHECK( [cite: 172]
        lab_classification IN ('wet', 'dry', 'unknown')), [cite: 173]
    classification_confidence REAL, [cite: 174]
    unlock_at DATETIME, [cite: 175]
    synced_at DATETIME,                 -- NEW: Last download time [cite: 176]
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, [cite: 177]
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, [cite: 178]
    FOREIGN KEY(course_id) REFERENCES resources(id), [cite: 179]
    FOREIGN KEY(parent_folder_id) REFERENCES resources(id) [cite: 180]
); [cite: 181]
```

#### Grade History Table

```sql
CREATE TABLE grade_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT, [cite: 184]
    course_id INTEGER NOT NULL, [cite: 185]
    grade REAL NOT NULL, [cite: 186]
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP, [cite: 187]
    FOREIGN KEY(course_id) REFERENCES courses(id) [cite: 188]
); [cite: 189]
```

#### User Preferences Table

```sql
CREATE TABLE user_preferences (
    key TEXT PRIMARY KEY, [cite: 192]
    value TEXT NOT NULL,                -- JSON-encoded [cite: 193]
    description TEXT, [cite: 194]
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP [cite: 195]
); [cite: 196]
```

**Key preferences include:**
- `sync_interval_minutes`: Polling frequency
- `theme`: system | light | dark
- `notification_battery_gate`: Boolean for battery-aware silencing
- `notification_fullscreen_gate`: Boolean for fullscreen-aware silencing
- `keyboard_shortcuts`: JSON map of hotkeys

---

## Part III: UI/UX Specifications

### 3.1 Global Visual Identity

The CID is designed as an **academic command center** with high-density information display and keyboard-centric efficiency.

**Color Palette**
- **Primary:** UofT Navy (#002A5C) for navigation headers
- **Secondary:** Silver (#A3A3A3) for borders and dividers
- **Themes:** Full support for system | light | dark modes

**Priority Heatmap Colors**

| Priority Level | Score Range | Color |
| :--- | :--- | :--- |
| Critical | >75 | Crimson Red (#DC2626) |
| High | >50 | Amber (#D97706) |
| Normal | ≤50 | Emerald (#059669) |

### 3.2 The Five Main Sections

#### Section 1: Dashboard (The Hub)

The landing view for daily academic status, emphasizing immediate actionability.

**Key Components:**
- **ROI Priority List:** Assignments ranked by Return on Investment score
- **Recent Notifications:** Latest communications grouped by course
- **Health Indicator:** Visual pill showing sync age and database size
- **Quick Stats:** Course count, upcoming deadlines, unread notifications

**Implementation Notes:**
- Use `react-window` for virtualized list rendering
- Priority scores calculated by L3, cached in L1
- Real-time updates via L4 event subscriptions

#### Section 2: Calendar (Chronological Planner)

Interactive schedule management with multiple view modes.

**View Modes:**
- **Day:** Hourly timeline with event blocks
- **Week:** 7-column grid with all-day events at top
- **Month:** Traditional calendar grid with event dots

**Event Sources:**
- **Automatic:** Canvas deadlines (`due_at`) and module releases (`unlock_at`)
- **Manual:** User-created events with full CRUD support
- **Recurring:** iCal RRULE format for repeated events

**Recurring Event Logic:**
- **Single Instance Modification:** Creates exception in `recurrence_exception_dates`
- **Single Instance Deletion:** Adds date to exclusion list
- **Series Modification:** Updates `parent_event_id` record
- **Series Deletion:** Soft-deletes parent with `deleted_at` timestamp

#### Section 3: Course Deep-Dive (Visual Analytics)

Three-pillar hub for detailed subject analysis.

**Pillar 1: Info Hub**
- Instructor contact details
- Direct Canvas landing page link
- Course code and full name

**Pillar 2: The Work Ledger**
- High-density table of all coursework
- **Grading Split:** Categorizes as 'Graded' (Assessed) or 'Upcoming' (Current)
- **Weighted Metrics:** Raw marks + calculated contribution to final grade
- Sortable columns: Due date, weight, grade, priority

**Pillar 3: Progress Analytics**
- **Grade Reality Gauge:** Visual comparison of Current Grade vs Assessed Grade
- **Target Delta:** Gap analysis showing average needed on remaining work to reach goal
- **Volatility Sparkline:** Trend graph showing performance stability from `grade_history`
- **100% Guardrail:** Analytics hidden if `total_weight ≠ 100%`
- Target Delta floors at 0% if goal already met

**Calculation Formulas:**

$$assessed\_grade = \sum(grade \times weight) \text{ WHERE } is\_completed = \text{TRUE}$$

$$current\_grade = \text{Canvas API value (includes partial credit)}$$

$$remaining\_weight = 100\% - \sum(weight) \text{ WHERE } is\_completed = \text{TRUE}$$

$$target\_delta = \max(0, (target - assessed\_grade) / remaining\_weight)$$

$$volatility = \text{STDDEV}(grade\_history.grade) \text{ OVER last 10 records}$$

#### Section 4: Notifications (Communication Feed)

Centralized hub for all professor updates and system alerts.

**Features:**
- **One-Click Dismissal:** Sets `dismissed_at` timestamp
- **Archive Toggle:** Reveals dismissed items with Restore button
- **Priority Filtering:** Visual indicators for critical/high/medium/low
- **Course Grouping:** Organized by source course

**Data Sources:**
- **Canvas:** Announcements synced from API
- **System:** Local events (sync failures, deadline reminders)

#### Section 5: Files (Offline Library)

Local-first file browser mirroring Canvas folder hierarchy.

**Features:**
- **Offline Access:** Browse and open synced PDFs/notes without internet
- **Selective Sync:** User-controlled download of specific files/folders
- **Lab Classification:** Automatic wet/dry/unknown categorization
- **Search:** Full-text search across file metadata and content

**Storage Strategy:**
- Files stored in `user_data_dir/cid/files/` with SHA-256 filenames
- `local_path` column in `resources` table maps to filesystem
- Sync status tracked via `synced_at` timestamp

---

## Part IV: Keyboard-Centric Interaction

The CID supports professional-grade efficiency through comprehensive keyboard navigation.

### 4.1 Global Shortcuts

| Shortcut | Action |
| :--- | :--- |
| Alt + 1 | Navigate to Dashboard |
| Alt + 2 | Navigate to Calendar |
| Alt + 3 | Navigate to Courses |
| Alt + 4 | Navigate to Notifications |
| Alt + 5 | Navigate to Files |
| Ctrl/Cmd + K | Open command palette |
| Ctrl/Cmd + S | Trigger manual sync |

### 4.2 List Navigation

| Shortcut | Action |
| :--- | :--- |
| j / ↓ | Move down in list |
| k / ↑ | Move up in list |
| Enter | Expand/view details |
| d | Dismiss (for notifications) |
| Space | Toggle selection |

### 4.3 Implementation Notes

- Use Mousetrap.js or similar library for cross-platform binding
- Respect system preferences for Cmd (macOS) vs Ctrl (Windows/Linux)
- Visual focus indicators with 2px UofT Navy outline
- Keyboard shortcuts configurable via `user_preferences` table

---

## Part V: The Canvas Sync Mediator

The **Conflict Resolver** manages mismatches when local edits and server updates occur simultaneously.

### 5.1 Conflict Detection

Conflicts are detected when:
1. User makes local modification (sets `local_modified_at` timestamp)
2. Sync engine receives updated data from Canvas API
3. Canvas `updated_at` > local `updated_at` AND `local_modified_at` is NOT NULL

### 5.2 Resolution UI

When conflict is detected, display side-by-side comparison:

| My Copy (Local) | Canvas (Remote) |
| :--- | :--- |
| Shows local edits made while offline | Shows latest university data from sync |
| Button: 'Push Mine' - Force local version | Button: 'Pull Canvas' - Accept remote version |

### 5.3 Resolution Logic

**Push Mine (Local Wins):**
- Sets `external_id` value to local data
- Clears `local_modified_at` flag
- Logs resolution to audit trail
- Does NOT push to Canvas API (read-only architecture)

**Pull Canvas (Remote Wins):**
- Overwrites local data with Canvas values
- Clears `local_modified_at` flag
- Updates `updated_at` timestamp
- Logs resolution to audit trail

---

## Part VI: Implementation Phases

### Phase 1: Foundation (Weeks 1-2)

**Milestone 1.1: Environment Setup**
- Initialize Node.js project with TypeScript 5.x strict mode
- Install core dependencies: sqlite3, better-sqlite3, winston, keytar
- Configure ESLint + Prettier
- Set up 7-layer directory structure

**Milestone 1.2: Layer 0b - Audit Trail**
- Implement PII-redacted logging with Winston
- Log rotation at 10MB with 5-file retention
- Never log API tokens or credentials

**Milestone 1.3: Layer 0a - Environment Observer**
- Monitor power source, focus, fullscreen state
- Poll system state max once per 5 seconds
- Emit events only on state changes

**Milestone 1.4: Layer 1 - Schema Initialization**
- Deploy SQLite with WAL mode and migration tracking
- Apply all schema migrations
- Implement event emission on commit
- Target: <1ms write latency with `PRAGMA synchronous = NORMAL`

### Phase 2: Data Acquisition (Weeks 3-4)

**Milestone 2.1: Canvas API Client**
- Rate-limited HTTP client with exponential backoff
- Full pagination support via Link header parsing
- Conditional GET with ETag caching
- Secure credential storage via OS keychain

**Milestone 2.2: Sync Engine**
- Parallel course sync with configurable concurrency
- Atomic transactions per course (all-or-nothing)
- Grade history tracking for volatility calculation
- Conflict detection for locally modified entities

### Phase 3: Intelligence Layer (Week 5)

**Milestone 3.1: Priority Scoring**
- Implement ROI calculation with logarithmic volatility weighting
- Naive Bayes classifier for assignment importance
- L3 computes scores, L2.5 commits to L1

**Milestone 3.2: Grade Analytics**
- Calculate `assessed_grade` from completed work
- Compute `target_delta` for goal tracking
- Generate volatility from `grade_history`

**Milestone 3.3: Lab Classification**
- NLP-based wet/dry/unknown categorization
- Confidence scoring for classification results

### Phase 4: UI/UX Implementation (Weeks 6-8)

**Milestone 4.1: Core UI Framework**
- Set up React with TypeScript
- Implement global theme system (light/dark/system)
- Configure UofT Navy color palette
- Set up `react-window` for virtualized lists

**Milestone 4.2: Dashboard Implementation**
- ROI Priority List component
- Recent Notifications widget
- Health Indicator pill
- Quick Stats cards

**Milestone 4.3: Calendar Implementation**
- Day/Week/Month view modes
- Event creation/editing UI
- Recurring event support (RRULE)
- Drag-and-drop rescheduling

**Milestone 4.4: Course Deep-Dive Implementation**
- Info Hub pillar
- Work Ledger table with sorting/filtering
- Progress Analytics charts (Grade Reality Gauge, Target Delta, Volatility Sparkline)
- 100% weight validation

**Milestone 4.5: Notifications & Files**
- Notification feed with dismiss/restore
- Priority filtering and grouping
- File browser with folder hierarchy
- Offline file access

**Milestone 4.6: Keyboard Navigation**
- Implement all global shortcuts (Alt+1-5, Ctrl/Cmd+K, Ctrl/Cmd+S)
- List navigation (j/k/Enter/d)
- Visual focus indicators
- Command palette UI

### Phase 5: Optimization & Polish (Week 9)

- Memory profiling and V8 heap constraints
- Stream-based JSON parsing for large payloads
- Database query optimization and indexing
- UI performance testing (target 60fps)

### Phase 6: Testing & Deployment (Week 10)

- Unit tests for all layers (>80% coverage)
- Integration tests for sync engine
- UI component tests with React Testing Library
- End-to-end tests with Playwright
- Package for macOS, Windows, Linux

---

## Part VII: Performance Metrics & Success Criteria

### 7.1 Memory Constraints

| State | Target RSS | Strategy |
| :--- | :--- | :--- |
| Idle | <200MB | Electron base + minimal cache |
| Active Sync | <280MB | Stream-based parsing |
| Peak | <300MB | V8 --max-old-space-size=256 |

### 7.2 Performance Targets

| Metric | Target | Verification Method |
| :--- | :--- | :--- |
| Write Latency | <1ms | PRAGMA journal_mode = 'wal' |
| UI Frame Rate | 60fps sustained | Chrome DevTools Performance |
| List Render Time | <16ms per item | React Profiler |
| Sync Duration | <30s full sync | Timestamp logging |
| Network (idle) | 99% 304 responses | HTTP response code monitoring |

### 7.3 Functional Requirements

- All 5 sections (Dashboard, Calendar, Courses, Notifications, Files) functional
- Keyboard shortcuts operational for all documented hotkeys
- Theme switching (light/dark/system) without app restart
- Conflict resolution UI triggered on sync conflicts
- Grade analytics display with 100% weight validation
- Recurring calendar events with RRULE support
- Offline file browsing for synced resources

---

## Part VIII: Deployment & Distribution

### 8.1 Build Configuration

- Use `electron-builder` for packaging
- Target platforms: macOS (x64, arm64), Windows (x64), Linux (AppImage)
- Code signing for macOS and Windows
- Auto-update via `electron-updater`

### 8.2 Installation Requirements

- Minimum OS: macOS 11.0, Windows 10, Ubuntu 20.04
- Disk Space: 500MB for application + 2GB for database/files
- Network: HTTPS access to Canvas API

### 8.3 First-Run Setup

1. Prompt for Canvas API base URL (e.g., https://utoronto.instructure.com)
2. Request API token (with instructions for generation)
3. Store credentials securely via keytar (OS keychain)
4. Trigger initial full sync
5. Display welcome screen with keyboard shortcut guide

### 8.4 Update Strategy

- Check for updates on app launch
- Display notification for available updates
- Download in background, apply on next launch
- Database migrations applied automatically on version bump

---

## Conclusion

The Canvas Integration Dashboard represents a comprehensive solution to the challenges of modern academic management. By combining a rigorously architected 7-layer system with an intuitive, keyboard-centric UI/UX, the CID delivers:

- Offline-first reliability for uninterrupted academic planning
- Intelligent priority scoring to focus effort on high-ROI tasks
- Advanced grade analytics for data-driven performance tracking
- Professional-grade keyboard navigation for power users
- Privacy-respecting local-first architecture

This implementation plan provides a clear roadmap from initial environment setup through deployment, with concrete performance targets, detailed UI specifications, and evidence-backed optimization strategies. The modular layer architecture ensures maintainability and testability, while the adaptive resource management system guarantees performance within the stringent 300MB memory constraint. The result is a production-ready academic command center that transforms Canvas LMS data into actionable intelligence.

---

**— End of Document —**
