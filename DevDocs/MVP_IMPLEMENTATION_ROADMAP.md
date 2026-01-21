# Canvas Integration Dashboard - MVP Implementation Roadmap

**Version:** 1.0
**Timeline:** 10 Weeks (Weeks 1-10)
**Target:** Functional MVP with core features
**Last Updated:** January 21, 2026

---

## Executive Summary

This roadmap defines the **10-week MVP implementation** for the Canvas Integration Dashboard based on finalized architectural decisions from `OPEN_QUESTIONS.md`. The focus is on delivering a working product with:

- ✅ Offline-first Canvas data sync
- ✅ ROI-based priority scoring
- ✅ Grade analytics (assessed vs. current)
- ✅ Notifications feed
- ✅ Basic keyboard navigation

**Deferred to Phase 2:**
- Recurring calendar events (RRULE)
- Automatic file syncing (manual download only in MVP)
- ML-based classification
- Wet/dry lab categorization

---

## Architecture Summary

### Revised Layer Model (L0-L6)

```text
┌─────────────────────────────────────────────────┐
│ L6: UI (React + TypeScript)                    │
│ • Dashboard, Calendar, Course views            │
│ • Virtual lists (react-window)                 │
└─────────────────────────────────────────────────┘
                       ↕
┌─────────────────────────────────────────────────┐
│ L5: Presentation (Reactive Store - Zustand)    │
│ • Event-driven view models                     │
│ • Subscribes to L1 commit events               │
└─────────────────────────────────────────────────┘
                       ↕
┌─────────────────────────────────────────────────┐
│ L4: Controller (Command Dispatcher)            │
│ • Validates user commands                      │
│ • Ensures atomic transactions                  │
└─────────────────────────────────────────────────┘
                       ↕
┌─────────────────────────────────────────────────┐
│ L3: Intelligence (Priority Engine)             │
│ • ROI scoring with custom formula              │
│ • Grade analytics calculations                 │
└─────────────────────────────────────────────────┘
                       ↕
┌─────────────────────────────────────────────────┐
│ L2: Daemon (Adaptive Sync Engine)              │
│ • Canvas API client (rate-limited)             │
│ • ETag-based conditional GET                   │
│ • Max 3 concurrent course syncs                │
└─────────────────────────────────────────────────┘
                       ↕
┌─────────────────────────────────────────────────┐
│ L1: Persistence (SQLite WAL)                   │
│ • Idempotent upserts via external_id           │
│ • Commit event emission                        │
│ • <1ms write latency target                    │
└─────────────────────────────────────────────────┘
                       ↕
┌─────────────────────────────────────────────────┐
│ L0: Utilities (Environment Services)           │
│ • Power/battery monitoring                     │
│ • PII-redacted logging (Winston)               │
└─────────────────────────────────────────────────┘
```

**Key Changes from v4.0 Spec:**
- Renumbered layers from L0-L6 (removed fractional L2.5)
- L0 simplified to utility module (not a full "layer")
- ML features cut from MVP

---

## Week-by-Week Breakdown

### **Week 1: Environment Setup & L1 Foundation**

**Milestone 1.1: Project Scaffolding**
- [ ] Initialize Node.js project with TypeScript 5.x (strict mode)
- [ ] Set up directory structure:
  ```
  /src
    /layers
      /l0-utilities       # Logging, system monitoring
      /l1-persistence     # SQLite, migrations
      /l2-daemon          # Canvas API client
      /l3-intelligence    # ROI scoring, analytics
      /l4-controller      # Command validation
      /l5-presentation    # Zustand store
      /l6-ui              # React components
    /main.ts              # Electron main process
    /renderer.tsx         # Electron renderer
  /tests
  /migrations
  ```
- [ ] Install core dependencies:
  ```json
  {
    "dependencies": {
      "better-sqlite3": "^9.x",
      "electron": "^28.x",
      "react": "^18.x",
      "react-dom": "^18.x",
      "zustand": "^4.x",
      "winston": "^3.x",
      "keytar": "^7.x",
      "axios": "^1.x"
    },
    "devDependencies": {
      "typescript": "^5.x",
      "eslint": "^8.x",
      "prettier": "^3.x",
      "@types/better-sqlite3": "^7.x"
    }
  }
  ```
- [ ] Configure ESLint + Prettier
- [ ] Set up Git hooks (pre-commit linting)

**Milestone 1.2: L0 Utilities - Logging**
- [ ] Implement Winston logger with:
  - PII redaction (never log API tokens, emails)
  - Log rotation at 10MB, keep 5 files
  - Levels: error, warn, info, debug
  - File output: `logs/cid.log`
- [ ] Create `SystemMonitor` utility:
  - Battery state detection
  - Focus/fullscreen state
  - Polls max once per 5 seconds
  - Emits events only on state changes

**Milestone 1.3: L1 Persistence - SQLite Schema**
- [ ] Initialize SQLite database with WAL mode:
  ```sql
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
  ```
- [ ] Create migration system (track version in `schema_version` table)
- [ ] Deploy all core tables (from spec Part II):
  - `courses`
  - `assignments`
  - `calendar_events`
  - `notifications`
  - `resources`
  - `grade_history`
  - `user_preferences`
- [ ] Implement event emitter on commit:
  ```typescript
  db.on('commit', (tableName: string) => {
    eventBus.emit('db:update', { table: tableName });
  });
  ```
- [ ] Write latency test (target: <1ms)

**Success Criteria:**
- ✅ Project builds with `npm run build`
- ✅ SQLite database initializes with all tables
- ✅ Write latency <1ms (measure with `EXPLAIN QUERY PLAN`)
- ✅ Logger writes to file without errors

---

### **Week 2: L2 Sync Engine - Canvas API Client**

**Milestone 2.1: Canvas API Authentication**
- [ ] Create `CanvasClient` class with:
  - Base URL configuration (e.g., `https://utoronto.instructure.com/api/v1`)
  - API token storage via `keytar` (OS keychain)
  - HTTPS-only requests
- [ ] Implement first-run setup flow:
  - Prompt for Canvas instance URL
  - Prompt for API token (with generation instructions)
  - Validate token with `/api/v1/users/self` endpoint
  - Store in keychain

**Milestone 2.2: Rate-Limited HTTP Client**
- [ ] Implement request queue with:
  - Max 3 concurrent requests
  - Parse `X-Rate-Limit-Remaining` header
  - Exponential backoff on 429 response (2s, 4s, 8s, 16s)
  - Retry logic for network errors (max 3 retries)
- [ ] Add ETag caching:
  - Store ETags in `sync_metadata` table
  - Send `If-None-Match` header
  - Handle 304 Not Modified responses

**Milestone 2.3: Course & Assignment Sync**
- [ ] Implement `/api/v1/courses` sync:
  - Fetch active courses for current user
  - Upsert to `courses` table via `external_id`
  - Extract: `code`, `name`, `current_grade`
- [ ] Implement `/api/v1/courses/:id/assignments` sync:
  - Fetch all assignments per course
  - Upsert to `assignments` table
  - Extract: `title`, `due_at`, `points_possible`, `submission_types`
  - Mark `is_completed` based on submission status
- [ ] Atomic transactions per course (all-or-nothing)

**Milestone 2.4: Notifications & Grade History**
- [ ] Sync `/api/v1/courses/:id/discussion_topics` (announcements)
  - Upsert to `notifications` table with `source_type='canvas'`
- [ ] Track grade changes:
  - On each sync, if `current_grade` changed, insert to `grade_history`
  - Calculate `grade_volatility` (STDDEV over last 10 records)

**Success Criteria:**
- ✅ Full sync completes in <30 seconds for 6 courses
- ✅ 99% of requests return 304 on second sync (ETag working)
- ✅ Rate limiter prevents 429 errors during bulk sync
- ✅ Database contains real Canvas data

---

### **Week 3: L3 Intelligence - ROI Scoring & Analytics**

**Milestone 3.1: ROI Priority Scoring**
- [ ] Implement custom formula (from OPEN_QUESTIONS.md Q1.1):
  ```typescript
  function calculatePriorityScore(assignment: Assignment, course: Course): number {
    const weight = assignment.weight; // % of final grade
    const targetDelta = Math.max(0, course.target_grade - course.assessed_grade);
    const vEff = Math.max(course.grade_volatility, 0.1); // Floor at 0.1

    return (weight * targetDelta) / Math.log(vEff + 1);
  }
  ```
- [ ] Update `assignments.priority_score` on every sync
- [ ] Rule-based importance boost:
  - Keywords in title: "exam", "midterm", "final" → multiply score by 1.5
  - Weight > 15% → multiply score by 1.2

**Milestone 3.2: Grade Analytics**
- [ ] Calculate `assessed_grade`:
  ```sql
  SELECT SUM(grade * weight)
  FROM assignments
  WHERE course_id = ? AND is_completed = TRUE
  ```
- [ ] Calculate `total_weight`:
  ```sql
  SELECT SUM(weight)
  FROM assignments
  WHERE course_id = ?
  ```
- [ ] Calculate `target_delta`:
  ```typescript
  const remainingWeight = 100 - totalWeight;
  if (remainingWeight === 0) {
    return Math.max(0, targetGrade - assessedGrade);
  }
  return Math.max(0, (targetGrade - assessedGrade) / remainingWeight);
  ```
- [ ] Update `courses.assessed_grade`, `total_weight` after each sync

**Milestone 3.3: Volatility Calculation**
- [ ] Compute volatility on grade history changes:
  ```sql
  SELECT STDEV(grade)
  FROM (
    SELECT grade FROM grade_history
    WHERE course_id = ?
    ORDER BY recorded_at DESC
    LIMIT 10
  )
  ```
- [ ] Update `courses.grade_volatility` field

**Success Criteria:**
- ✅ All assignments have valid `priority_score` > 0
- ✅ Courses with `total_weight = 100%` display analytics
- ✅ Courses with `total_weight < 100%` hide analytics (100% Guardrail)
- ✅ Volatility updates when grades change

---

### **Week 4: L5 Presentation - Reactive Store**

**Milestone 4.1: Zustand Store Setup**
- [ ] Create global state store:
  ```typescript
  interface AppState {
    courses: Course[];
    assignments: Assignment[];
    notifications: Notification[];
    syncStatus: 'idle' | 'syncing' | 'error';
    lastSyncTime: Date | null;
  }
  ```
- [ ] Subscribe to L1 commit events:
  ```typescript
  db.on('commit', ({ table }) => {
    if (table === 'courses') {
      store.setState({ courses: fetchCourses() });
    }
  });
  ```

**Milestone 4.2: View Model Computation**
- [ ] Create `DashboardViewModel`:
  - `priorityQueue`: Assignments sorted by `priority_score` DESC, limited to next 10
  - `recentNotifications`: Last 5 unread notifications
  - `quickStats`: { courseCount, upcomingDeadlines, unreadCount }
- [ ] Create `CourseDetailViewModel`:
  - `workLedger`: Assignments grouped by 'Graded' vs 'Upcoming'
  - `progressMetrics`: { assessedGrade, currentGrade, targetDelta, volatility }
  - `showAnalytics`: Boolean (true only if `total_weight === 100`)

**Success Criteria:**
- ✅ UI updates automatically when database changes (no manual polling)
- ✅ View models compute in <16ms (60fps target)
- ✅ React DevTools shows minimal re-renders

---

### **Week 5: L6 UI - Dashboard & Core Components**

**Milestone 5.1: Electron App Shell**
- [ ] Create main window with:
  - Min size: 1024x768
  - Navigation sidebar (5 sections: Dashboard, Calendar, Courses, Notifications, Files)
  - Theme support (light/dark/system)
  - Global keyboard shortcuts (Alt+1-5)

**Milestone 5.2: Dashboard View**
- [ ] **ROI Priority List** component:
  - Virtual list rendering with `react-window` (handles 100+ assignments)
  - Columns: Title, Course, Due Date, Weight, Priority (color indicator only)
  - Color coding: Critical (red), High (amber), Normal (green)
  - **Note:** Numeric priority_score is internal only, never displayed to users
  - Click to expand assignment details
- [ ] **Recent Notifications** widget:
  - Last 5 unread notifications
  - One-click dismiss button
  - Course badges
- [ ] **Health Indicator** pill:
  - Shows last sync time
  - Database size
  - "Sync Now" button
- [ ] **Quick Stats** cards:
  - Total courses
  - Assignments due this week
  - Unread notifications

**Milestone 5.3: Global Navigation**
- [ ] Keyboard shortcuts with `react-hotkeys-hook`:
  - `Alt+1`: Dashboard
  - `Alt+2`: Calendar
  - `Alt+3`: Courses
  - `Alt+4`: Notifications
  - `Alt+5`: Files
  - `Ctrl/Cmd+S`: Manual sync
- [ ] Visual focus indicators (2px UofT Navy outline)

**Success Criteria:**
- ✅ Dashboard renders 100+ assignments at 60fps
- ✅ Keyboard navigation works across all sections
- ✅ Theme switches without restart

---

### **Week 6: L6 UI - Course Deep-Dive & Analytics**

**Milestone 6.1: Course Detail View**
- [ ] **Info Hub** pillar:
  - Course code + name
  - Instructor contact (if available in API)
  - "Open in Canvas" link button
- [ ] **Work Ledger** table:
  - High-density table with sortable columns
  - Grading split: "Graded" (is_completed=TRUE) vs "Upcoming"
  - Columns: Title, Due Date, Weight (%), Grade, Contribution to Final
  - Inline grade editing (sets `local_modified_at`)

**Milestone 6.2: Progress Analytics**
- [ ] **Grade Reality Gauge** (visual comparison):
  - Horizontal bar chart showing:
    - Current Grade (from Canvas API)
    - Assessed Grade (calculated from completed work)
  - Labeled with numeric values
- [ ] **Target Delta** display:
  - "You need **X%** average on remaining work to reach your **Y%** goal"
  - If targetDelta ≤ 0: "🎉 You've already met your target!"
  - If total_weight ≠ 100%: Show warning banner (100% Guardrail)
- [ ] **Volatility Sparkline**:
  - Small line chart showing grade trend from `grade_history`
  - Last 10 data points
  - Helps students identify instability

**Milestone 6.3: 100% Guardrail**
- [ ] Hide analytics if `total_weight < 100%` or `> 100%`
- [ ] Show warning banner:
  - "⚠️ Analytics unavailable until all coursework is posted (current: **87%**)"
  - "Check Canvas for missing assignments or weight configuration"

**Success Criteria:**
- ✅ Analytics display correctly for courses with 100% weight
- ✅ Warning banner appears for incomplete courses
- ✅ Local grade edits trigger conflict detection on next sync

---

### **Week 7: L6 UI - Calendar & Notifications**

**Milestone 7.1: Calendar View (Single Events Only)**
- [ ] Implement Day/Week/Month views:
  - **Day:** Hourly timeline (6am-11pm) with event blocks
  - **Week:** 7-column grid with all-day events at top
  - **Month:** Traditional calendar grid with event dots
- [ ] Display Canvas deadlines:
  - Assignments (`due_at`) appear as events
  - Module unlocks (`unlock_at`) appear as events
- [ ] User-created events:
  - "Add Event" button
  - Form: Title, Start/End time, All-day toggle, Course association
  - Save to `calendar_events` with `source_type='user'`
- [ ] **No recurring events in MVP** (deferred to Phase 2)

**Milestone 7.2: Notifications Feed**
- [ ] Notification list view:
  - Grouped by course
  - Priority badges (Critical/High/Medium/Low)
  - Timestamp (relative: "2 hours ago")
- [ ] Dismiss functionality:
  - Sets `dismissed_at` timestamp
  - Moves to archive
- [ ] Archive toggle:
  - "Show Dismissed" checkbox
  - Restore button for dismissed items
- [ ] Priority filtering:
  - Dropdown: "All", "Critical", "High", "Medium", "Low"

**Success Criteria:**
- ✅ Calendar displays Canvas deadlines and user events
- ✅ Notifications can be dismissed and restored
- ✅ All views render at 60fps

---

### **Week 8: L6 UI - Files & L4 Command Layer**

**Milestone 8.1: Files Browser (Manual Download Only)**
- [ ] Folder tree view:
  - Mirror Canvas folder hierarchy from `resources` table
  - Folders expandable/collapsible
- [ ] File list:
  - Columns: Name, Type, Size, Last Modified
  - Icons for file types (PDF, DOCX, etc.)
- [ ] Manual download:
  - "Download" button per file
  - Saves to `user_data_dir/cid/files/` with SHA-256 filename
  - Updates `local_path` and `synced_at` in database
- [ ] Offline viewing:
  - "Open" button if file is downloaded
  - Opens in default OS application
- [ ] **No automatic syncing in MVP**

**Milestone 8.2: L4 Controller - Command Validation**
- [ ] Implement command pattern for user actions:
  ```typescript
  interface Command {
    execute(): Promise<void>;
    validate(): boolean;
    rollback(): Promise<void>;
  }
  ```
- [ ] Commands:
  - `UpdateAssignmentGradeCommand`: Validates grade 0-100, sets `local_modified_at`
  - `DismissNotificationCommand`: Sets `dismissed_at`
  - `CreateEventCommand`: Validates dates, required fields
  - `TriggerSyncCommand`: Prevents concurrent syncs
- [ ] Atomic transactions via L1

**Success Criteria:**
- ✅ Files can be downloaded and opened offline
- ✅ All user actions go through validated commands
- ✅ Invalid commands show user-friendly error messages

---

### **Week 9: Conflict Resolution & Polish**

**Milestone 9.1: Conflict Resolver UI**
- [ ] Detect conflicts during sync:
  - Canvas `updated_at` > local `updated_at` AND `local_modified_at` NOT NULL
- [ ] Display side-by-side comparison modal:
  ```
  ┌─────────────────────────────────────────────────┐
  │ Conflict Detected: Assignment "Midterm Exam"   │
  ├─────────────────────────────────────────────────┤
  │ My Copy (Local)   │ Canvas (Remote)             │
  │ Grade: 85%        │ Grade: 82%                  │
  │ Modified: 2h ago  │ Updated: 30m ago            │
  │                   │                             │
  │ [Keep Mine]       │ [Use Canvas]                │
  └─────────────────────────────────────────────────┘
  ```
- [ ] Resolution actions:
  - **Keep Mine:** Clears `local_modified_at`, logs decision
  - **Use Canvas:** Overwrites local, updates `updated_at`, logs decision

**Milestone 9.2: Performance Optimization**
- [ ] Memory profiling:
  - Measure RSS with 6 courses + 100 assignments
  - Target: <280MB during sync, <200MB idle
  - Set V8 heap limit: `--max-old-space-size=256`
- [ ] Database indexing:
  ```sql
  CREATE INDEX idx_assignments_priority ON assignments(priority_score DESC);
  CREATE INDEX idx_assignments_due_date ON assignments(due_at);
  CREATE INDEX idx_notifications_dismissed ON notifications(dismissed_at);
  ```
- [ ] UI performance:
  - React Profiler: Ensure no component renders >16ms
  - Virtual lists for all long lists

**Milestone 9.3: Error Handling**
- [ ] Network error recovery:
  - Retry failed requests with exponential backoff
  - Show "Sync Failed" banner with "Retry" button
- [ ] Database migration rollback:
  - Automatic backup before migration
  - Auto-rollback on failure
  - Keep last 3 backups

**Success Criteria:**
- ✅ Conflicts detected and presented to user
- ✅ Memory stays under 300MB peak
- ✅ Database queries use indexes (verify with `EXPLAIN QUERY PLAN`)

---

### **Week 10: Testing, Packaging & Deployment**

**Milestone 10.1: Testing**
- [ ] Unit tests (Jest):
  - L3 ROI calculation
  - L2 rate limiter
  - L1 upsert logic
  - Target: >80% coverage
- [ ] Integration tests:
  - Full sync workflow
  - Conflict resolution
  - Database migrations
- [ ] UI tests (React Testing Library):
  - Dashboard rendering
  - Keyboard shortcuts
  - Theme switching

**Milestone 10.2: Packaging**
- [ ] Configure `electron-builder`:
  ```json
  {
    "appId": "com.uoft.cid",
    "productName": "Canvas Integration Dashboard",
    "directories": {
      "output": "dist"
    },
    "mac": {
      "target": ["dmg", "zip"],
      "category": "public.app-category.education",
      "hardenedRuntime": true
    },
    "win": {
      "target": ["nsis"],
      "sign": true
    },
    "linux": {
      "target": ["AppImage"],
      "category": "Education"
    }
  }
  ```
- [ ] Code signing (macOS/Windows)
- [ ] Auto-updater configuration

**Milestone 10.3: Documentation**
- [ ] User guide:
  - First-run setup (API token generation)
  - Keyboard shortcuts reference
  - Conflict resolution workflow
- [ ] Developer README:
  - Build instructions
  - Architecture overview
  - Layer responsibilities

**Milestone 10.4: Release**
- [ ] Create GitHub release with binaries
- [ ] Publish to UofT student forums/subreddit for beta testing
- [ ] Set up feedback collection (Google Form or GitHub Issues)

**Success Criteria:**
- ✅ App builds for macOS, Windows, Linux
- ✅ Auto-updater works
- ✅ First 10 beta users successfully install and sync

---

## Success Metrics

### Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Memory (Idle) | <200MB RSS | Chrome DevTools Memory Profiler |
| Memory (Peak) | <300MB RSS | During full sync |
| Write Latency | <1ms | SQLite PRAGMA query_only |
| UI Frame Rate | 60fps sustained | React Profiler |
| Sync Duration | <30s | 6 courses full sync |
| Network Efficiency | 99% 304 responses | Second sync with ETags |

### Functional Requirements

- [x] All 5 sections functional (Dashboard, Calendar, Courses, Notifications, Files)
- [x] Keyboard shortcuts operational (Alt+1-5, j/k, Ctrl/Cmd+S)
- [x] Theme switching (light/dark/system)
- [x] Conflict resolution UI
- [x] Grade analytics with 100% Guardrail
- [x] Offline access to synced data

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Canvas API changes | High | Use stable v1 endpoints, version lock, monitor Canvas release notes |
| Rate limiting | Medium | Respect headers, max 3 concurrent, exponential backoff |
| Database corruption | High | WAL mode, automatic backups, migration rollback |
| Memory bloat | Medium | V8 heap limits, virtual lists, profiling |
| Timeline slip | High | Cut Phase 2 features if needed, ship core MVP first |

---

## Phase 2 Preview (Weeks 11-16)

**Should-Have Features:**
- Recurring calendar events (RRULE support)
- Advanced grade analytics (trend predictions)
- Automatic file syncing (background downloads)
- Command palette (Ctrl/Cmd+K)
- Drag-and-drop calendar rescheduling

**Trigger for Phase 2:**
- MVP ships with 0 critical bugs
- 50+ active users
- Positive feedback on core features

---

## Appendix: Development Environment

### Required Tools
- **Node.js:** 18.x LTS or later
- **npm:** 9.x or later
- **SQLite:** 3.40+ (bundled with better-sqlite3)
- **OS:** macOS 11+, Windows 10+, or Ubuntu 20.04+

### Recommended IDE Setup
- **VS Code** with extensions:
  - ESLint
  - Prettier
  - SQLite Viewer
  - TypeScript

### Canvas API Token Generation
1. Log in to Canvas (https://utoronto.instructure.com)
2. Account → Settings → New Access Token
3. Purpose: "Canvas Integration Dashboard"
4. Expiry: None (or set custom)
5. Copy token (only shown once)

---

**Document Status:** READY FOR IMPLEMENTATION
**Next Review:** End of Week 2 (Milestone 2.3)
**Feedback:** Submit issues to GitHub or project lead
