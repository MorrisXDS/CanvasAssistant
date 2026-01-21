# Canvas Integration Dashboard - Developer Documentation

**Version:** 1.0
**Last Updated:** January 21, 2026
**Status:** Ready for Implementation

---

## 📚 Document Overview

This folder contains comprehensive technical documentation for the Canvas Integration Dashboard (CID) project. All documents are ready for immediate use by the development team.

### Document Index

| Document | Purpose | Primary Audience |
|----------|---------|------------------|
| **CID_Implementation_Plan_v4.0.md** | Complete technical specification | All team members |
| **OPEN_QUESTIONS.md** | All 25 resolved architectural decisions | Tech leads, architects |
| **MVP_IMPLEMENTATION_ROADMAP.md** | 10-week week-by-week implementation plan | Project managers, developers |
| **ARCHITECTURE_DIAGRAM.md** | Layer architecture and data flow | Software architects, senior devs |
| **ROI_FORMULA_SPEC.md** | Priority scoring algorithm implementation | L3 Intelligence developers |
| **PROJECT_SCAFFOLDING.md** | Directory structure and initial templates | All developers |

### Milestone-Specific Documentation

Week-by-week implementation guides with troubleshooting:

| Milestone | Location | Contents |
|-----------|----------|----------|
| **Week 1 Milestone 1.1** | `milestones/week1/MILESTONE_1.1_FIXES.md` | Build error fixes, dependency updates, troubleshooting |

*More milestone docs will be added as development progresses.*

---

## 🚀 Quick Start Guide

### For Project Managers
1. Read `MVP_IMPLEMENTATION_ROADMAP.md` for timeline and milestones
2. Review `OPEN_QUESTIONS.md` for scope decisions (what's in/out of MVP)
3. Use roadmap to create sprint planning and assign tasks

### For Software Architects
1. Study `ARCHITECTURE_DIAGRAM.md` for layer responsibilities
2. Review `CID_Implementation_Plan_v4.0.md` Part I for architecture principles
3. Check `OPEN_QUESTIONS.md` Category 2 for architectural decisions

### For Backend Developers (L1-L3)
1. Read `ARCHITECTURE_DIAGRAM.md` for layer communication contracts
2. Review `ROI_FORMULA_SPEC.md` for priority scoring implementation
3. Use `PROJECT_SCAFFOLDING.md` to set up L1 (Persistence), L2 (Sync), L3 (Intelligence) layers

### For Frontend Developers (L5-L6)
1. Read `ARCHITECTURE_DIAGRAM.md` sections on L5 (Presentation) and L6 (UI)
2. Review `CID_Implementation_Plan_v4.0.md` Part III for UI/UX specifications
3. Check `MVP_IMPLEMENTATION_ROADMAP.md` Week 5-7 for UI milestones

---

## 🎯 Key Decisions Summary

### Architecture
- **7 Layers (L0-L6):** Sequential numbering, L0 simplified to utilities
- **Unidirectional Data Flow:** User events flow down, state flows up via commit events
- **Offline-First:** SQLite WAL mode, ETag caching, graceful degradation

### MVP Scope (10 Weeks)
**Must-Have:**
- Dashboard with ROI priority list (color-coded, **no numeric scores shown to users**)
- Canvas sync (courses, assignments, grades, notifications)
- SQLite persistence with automatic migrations
- Grade analytics (assessed vs. current, target delta)
- Basic keyboard navigation (Alt+1-5, j/k)

**Deferred to Phase 2:**
- Recurring calendar events (RRULE)
- Automatic file syncing (manual download only in MVP)
- ML-based classification

**Cut Entirely:**
- Wet/dry lab classification

### Algorithms
- **ROI Formula:** `priority_score = (weight × target_delta) / log(max(v_eff, 0.1) + 1)`
- **No ML:** Rule-based keyword classification instead of Naive Bayes
- **100% Guardrail:** Hide analytics if total_weight ≠ 100%

### Security
- API tokens in OS keychain (keytar)
- Database file permissions: chmod 600 (no encryption at rest)
- IPC messages signed with HMAC validation
- Code signing for updates

---

## 📊 Development Timeline

### Phase 1: MVP (Weeks 1-10)
See `MVP_IMPLEMENTATION_ROADMAP.md` for detailed breakdown:
- **Week 1:** Environment setup + SQLite schema
- **Week 2:** Canvas API client + sync engine
- **Week 3:** ROI scoring + grade analytics
- **Week 4:** Reactive store (Zustand)
- **Week 5:** Dashboard UI
- **Week 6:** Course detail view + analytics
- **Week 7:** Calendar + notifications
- **Week 8:** Files browser + command layer
- **Week 9:** Conflict resolution + optimization
- **Week 10:** Testing + packaging

### Phase 2: Polish (Weeks 11-16)
- Calendar recurring events
- Advanced analytics
- Automatic file syncing
- Command palette enhancements

---

## 🔒 Important Conventions

### Priority Score Handling
**CRITICAL:** The numeric `priority_score` field is **internal only** and must **never be displayed to users**. Only show color-coded visual indicators:
- 🔴 Critical (red)
- 🟠 High (amber)
- 🟢 Normal (green)

See `ROI_FORMULA_SPEC.md` "## UI Display" section for details.

### Unidirectional Data Flow
- **L6 → L5 → L4:** User events (clicks, keyboard input)
- **L1 → L5 → L6:** State updates (commit events trigger re-renders)
- **L2 → L1:** Sync writes raw Canvas data
- **L4 → L3 → L1:** Commands invoke calculations, commit to database

### Naming Conventions
- **Layers:** `src/layers/l{0-6}-{name}/`
- **Tests:** `tests/l{0-6}-{name}/`
- **Migrations:** `src/layers/l1-persistence/migrations/{number}_{description}.sql`
- **Commands:** `{Verb}{Noun}Command.ts` (e.g., `UpdateAssignmentGradeCommand.ts`)

---

## 📦 Project Structure

```
CanvasAssistant/
├── DevDocs/                    # 👈 You are here
│   ├── README.md
│   ├── CID_Implementation_Plan_v4.0.md
│   ├── OPEN_QUESTIONS.md
│   ├── MVP_IMPLEMENTATION_ROADMAP.md
│   ├── ARCHITECTURE_DIAGRAM.md
│   ├── ROI_FORMULA_SPEC.md
│   └── PROJECT_SCAFFOLDING.md
│
├── src/
│   ├── layers/
│   │   ├── l0-utilities/       # Logging, system monitoring
│   │   ├── l1-persistence/     # SQLite, migrations
│   │   ├── l2-daemon/          # Canvas API client
│   │   ├── l3-intelligence/    # ROI scoring, analytics
│   │   ├── l4-controller/      # Command validation
│   │   ├── l5-presentation/    # Zustand store
│   │   └── l6-ui/              # React components
│   ├── main.ts                 # Electron main process
│   ├── renderer.tsx            # Electron renderer
│   └── preload.ts              # Context bridge
│
├── tests/                      # Jest + React Testing Library
├── logs/                       # Winston log output
├── dist/                       # electron-builder output
├── package.json
├── tsconfig.json
└── README.md                   # User-facing README (TBD)
```

See `PROJECT_SCAFFOLDING.md` for complete file-by-file breakdown.

---

## 🔧 Setup Instructions

### Prerequisites
- Node.js 18.x LTS or later
- npm 9.x or later
- SQLite 3.40+ (bundled with better-sqlite3)
- OS: macOS 11+, Windows 10+, or Ubuntu 20.04+

### Initial Setup
```bash
# 1. Install dependencies
npm install

# 2. Create directory structure (see PROJECT_SCAFFOLDING.md)
mkdir -p src/layers/{l0-utilities,l1-persistence,l2-daemon,l3-intelligence,l4-controller,l5-presentation,l6-ui}
mkdir -p tests logs dist

# 3. Copy initial templates from PROJECT_SCAFFOLDING.md
# (main.ts, Database.ts, Logger.ts, etc.)

# 4. Build
npm run build

# 5. Run in development mode
npm run dev
```

---

## 📝 Contributing Guidelines

### Before Starting Work
1. Read the relevant documentation for your layer
2. Check `OPEN_QUESTIONS.md` for architectural decisions
3. Follow naming conventions and layer responsibilities

### Code Style
- **TypeScript:** Strict mode enabled
- **Formatting:** Prettier (configured in `.prettierrc`)
- **Linting:** ESLint (configured in `.eslintrc.json`)
- **Testing:** Jest + React Testing Library (>80% coverage target)

### Git Workflow
1. Create feature branch: `feature/{layer}-{description}` (e.g., `feature/l3-roi-scoring`)
2. Commit frequently with clear messages
3. Run tests before pushing
4. Create PR with description referencing relevant DevDoc sections

---

## 🎓 Learning Resources

### Understanding the Architecture
- **Unidirectional Data Flow:** Similar to Redux, Flux architecture
- **Event-Driven UI:** React re-renders triggered by database commit events, not polling
- **Command Pattern:** L4 validates all user actions before execution
- **Offline-First:** Inspired by PouchDB, CouchDB sync models

### Key Technologies
- **Electron:** Desktop app framework (similar to VS Code)
- **SQLite WAL Mode:** Write-Ahead Logging for concurrent reads
- **Zustand:** Lightweight React state management (simpler than Redux)
- **react-window:** Virtual list rendering for performance

---

## 🐛 Troubleshooting

### Common Issues

**Q: Database locked errors?**
A: Ensure WAL mode is enabled (`PRAGMA journal_mode = WAL`)

**Q: Memory exceeds 300MB?**
A: Check for memory leaks in virtual lists, ensure V8 heap limit set

**Q: Sync fails with 429 errors?**
A: Rate limiter may need tuning, check `X-Rate-Limit-Remaining` header parsing

**Q: Priority scores seem wrong?**
A: Verify `total_weight = 100%` for the course (100% Guardrail)

---

## 📧 Contact & Support

**Project Lead:** [TBD]
**Architecture Questions:** See `ARCHITECTURE_DIAGRAM.md` or ask in #architecture Slack channel
**Timeline Questions:** See `MVP_IMPLEMENTATION_ROADMAP.md` or ask project manager
**Bug Reports:** GitHub Issues

---

## 📄 Document Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-21 | Initial release with all 6 core documents |

---

**Status:** ✅ READY FOR IMPLEMENTATION
**Next Steps:** Begin Week 1 Milestone 1.1 (Environment Setup)
