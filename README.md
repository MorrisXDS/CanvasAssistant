# Canvas Integration Dashboard

> **Offline-first academic command center for University of Toronto students**

Transform your Canvas LMS experience into an intelligent, priority-driven workflow. The Canvas Integration Dashboard (CID) helps you focus on what matters most by analyzing your coursework, calculating optimal task priorities, and providing actionable grade analytics—all while working completely offline.

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)

---

## ✨ Features

### 🎯 Smart Priority Dashboard
See your assignments ranked by **Return on Investment**—the system automatically calculates which tasks will have the biggest impact on your final grades. Color-coded visual indicators (🔴 Critical, 🟠 High, 🟢 Normal) help you focus on what matters most.

### 📊 Advanced Grade Analytics
- **Grade Reality Gauge**: Visual comparison of your assessed grade (completed work) vs. current grade (including partial credit)
- **Target Delta**: Know exactly what average you need on remaining work to hit your goal
- **Volatility Tracking**: See how stable your performance is over time

### 📅 Unified Calendar
All your Canvas deadlines, module releases, and personal events in one place. Switch between Day, Week, and Month views to plan your schedule effectively.

### 🔔 Centralized Notifications
Never miss professor announcements. All Canvas communications organized by course with one-click dismiss and archive functionality.

### 📁 Offline File Access
Download course materials once and access them offline. Browse your Canvas files with full folder hierarchy, even without internet.

### 🧠 Smart Recommendations & Insights
AI-powered suggestions help you work smarter:
- **Work Now**: Tasks that fit your current time slot with high urgency
- **Start Early**: High-stakes assignments 3-7 days out
- **Course Focus**: Neglected courses that need attention
- **Productivity Insights**: Discover your peak productivity windows and deadline patterns

### 📋 Policy Management
Configure course-specific policies for accurate grade calculations:
- **Grace Tokens**: Track late submission allowances
- **Late Penalties**: Define percentage deductions per day
- **Automatic Application**: Policies factor into priority calculations

### ⌨️ Keyboard-Centric Workflow
Power users rejoice! Navigate between sections (`Alt+1-5`), move through lists (`j/k`), and trigger actions without touching your mouse.

### 🔒 Privacy-Respecting & Offline-First
Your academic data never leaves your computer. No cloud storage, no tracking—just local-first architecture that respects your privacy.

---

## 🚀 Quick Start

### Installation

**macOS:**
```bash
# Download the latest .dmg from Releases
# Drag Canvas Integration Dashboard to Applications
# Open from Launchpad
```

**Windows:**
```bash
# Download the latest .exe installer from Releases
# Run the installer
# Launch from Start Menu
```

**Linux:**
```bash
# Download the latest .AppImage from Releases
chmod +x CanvasIntegrationDashboard-*.AppImage
./CanvasIntegrationDashboard-*.AppImage
```

### First-Run Setup

1. **Get Your Canvas API Token:**
   - Go to [https://utoronto.instructure.com](https://utoronto.instructure.com)
   - Click **Account → Settings → New Access Token**
   - Purpose: "Canvas Integration Dashboard"
   - Expiry: None (or set custom)
   - **Copy the token** (only shown once!)

2. **Launch CID & Complete Setup Wizard:**
   The app guides you through a comprehensive 7-stage setup:

   | Stage | What You Configure |
   |-------|-------------------|
   | Welcome | Feature overview |
   | Connection | Canvas URL & API token |
   | Appearance | Light/Dark/System theme |
   | Storage | Download location for files |
   | Notifications | Desktop notification preferences |
   | Academic | Default target grade (applied to all courses) |
   | Sync | Auto-sync interval and preferences |

   > **Tip:** You can skip optional stages and adjust settings later. After token validation, a "Skip to Dashboard" option appears.

3. **Initial Sync:**
   - The app downloads all your courses, assignments, and grades
   - Progress indicator shows sync status
   - You can start using the app while sync completes in background

4. **Start Using CID:**
   - Navigate to **Dashboard** (`Alt+1`) to see your priority queue
   - Check **Calendar** (`Alt+2`) for upcoming deadlines
   - Explore **Courses** (`Alt+3`) for detailed grade analytics

---

## 📖 User Guide

### Dashboard (Alt+1)

Your command center for daily academic planning.

**Priority List:**
- Assignments ranked by importance (combining weight, grade gap, and course volatility)
- Color-coded indicators: 🔴 Critical (work on first), 🟠 High (important), 🟢 Normal
- Click any assignment to see full details

**Quick Stats:**
- Total active courses
- Assignments due this week
- Unread notifications

**Health Indicator:**
- Shows last sync time
- Click "Sync Now" to manually refresh from Canvas

### Calendar (Alt+2)

Manage your academic schedule with multiple views:

**View Modes:**
- **Day:** Hourly timeline (6am-11pm)
- **Week:** 7-column grid with all-day events
- **Month:** Traditional calendar with event dots

**Event Sources:**
- 🔵 Canvas deadlines (from `due_at` field)
- 🟣 Module releases (from `unlock_at` field)
- 🟢 Your custom events (create with "Add Event" button)

**Navigation:**
- Arrow keys or `j/k` to move between days/weeks
- `Enter` to view event details
- `Space` to toggle event selection

### Courses (Alt+3)

Deep-dive into each course with three pillars:

**1. Info Hub:**
- Course code and full name
- Instructor contact details
- "Open in Canvas" quick link

**2. Work Ledger:**
- High-density table of all coursework
- **Graded:** Completed assignments with earned marks
- **Upcoming:** Pending work with due dates
- Sortable by: Due Date, Weight, Grade, Priority

**3. Progress Analytics:**
- **Grade Reality Gauge:** Visual bar showing Assessed vs. Current Grade
- **Target Delta:** Average needed on remaining work to reach your goal
- **Volatility Sparkline:** Performance stability trend

> **Note:** Analytics only appear when all coursework is posted (total weight = 100%). If you see a warning, check Canvas for missing assignments.

### Notifications (Alt+4)

Stay on top of professor communications:

- **Feed View:** Latest announcements from all courses
- **Grouping:** Organized by source course
- **Priority Filtering:** Filter by Critical/High/Medium/Low
- **Dismissal:** One-click to archive (restores with "Show Dismissed" toggle)

### Files (Alt+5)

Browse your Canvas materials offline:

- **Folder Tree:** Mirror of Canvas hierarchy
- **Manual Download:** Click "Download" to cache files locally
- **Offline Viewing:** "Open" button launches in default app
- **Search:** Find files by name or type

---

## ⌨️ Keyboard Shortcuts

### Global Navigation
| Shortcut | Action |
|----------|--------|
| `Alt+1` | Go to Dashboard |
| `Alt+2` | Go to Calendar |
| `Alt+3` | Go to Courses |
| `Alt+4` | Go to Notifications |
| `Alt+5` | Go to Files |
| `Ctrl/Cmd+S` | Manual sync |
| `Ctrl/Cmd+K` | Command palette |

### List Navigation
| Shortcut | Action |
|----------|--------|
| `j` or `↓` | Move down |
| `k` or `↑` | Move up |
| `Enter` | Expand/view details |
| `d` | Dismiss (notifications) |
| `Space` | Toggle selection |

---

## 🔧 Settings & Configuration

### Sync Interval
Default: Every 15 minutes (when on AC power and focused)

**To change:**
- Go to **Settings** (gear icon)
- Adjust "Sync Interval" slider (5-60 minutes)
- Toggle "Sync on Battery" if desired

### Theme
Supports Light, Dark, and System modes.

**To switch:**
- Click theme toggle in top-right corner
- Or use `Ctrl/Cmd+T`

### Target Grade
Default: 80% for all courses (configurable during setup)

**How Target Grades Work:**
- **App Default**: Set in Settings → Academic. Applies to all new courses.
- **Per-Course**: Each course can have its own target grade.
- **Sync Behavior**: Courses using the "(default)" grade automatically update when you change the app default. Once you manually change a course's grade, it becomes independent and won't auto-update.

**To change app default:**
- Go to **Settings → Academic**
- Adjust "Default Target Grade" slider
- All courses marked "(default)" will update automatically

**To customize per course:**
- Go to **Courses** (`Alt+3`)
- Click course name
- Edit "Target Grade" field in Info Hub
- The "(default)" indicator will disappear, and this course becomes independent

### Content & Links

**Link Behavior:**
Configure how links in announcements and course content are handled:
- **Always External** (default): All links open in your browser
- **Prefer Local**: If a file has been downloaded, open it locally; otherwise, open externally

**To change:**
- Go to **Settings → Content**
- Select your preferred link behavior

### Keyboard Shortcuts
All shortcuts are customizable:

- Go to **Settings → Keyboard Shortcuts**
- Click any shortcut to rebind
- Press new key combination
- Save

---

## 🛠️ Troubleshooting

### Sync Fails with "401 Unauthorized"
**Cause:** API token expired or invalid

**Fix:**
1. Go to Settings → Canvas Connection
2. Click "Regenerate Token"
3. Follow first-run setup steps again

### Analytics Not Showing for a Course
**Cause:** Total assignment weight ≠ 100%

**Fix:**
- Check Canvas for missing assignments
- Verify professor configured weights correctly
- Warning banner shows current total (e.g., "87%")

### App Uses Too Much Memory
**Cause:** Large file cache or many courses

**Fix:**
1. Go to Settings → Storage
2. Click "Clear File Cache"
3. Manually download only needed files

### Notifications Not Appearing
**Cause:** Battery-saving mode enabled

**Fix:**
- Go to Settings → Notifications
- Uncheck "Disable on Battery"
- Uncheck "Disable when Fullscreen"

---

## 🔐 Privacy & Security

### What Data is Stored?
- **Locally:** All course data, assignments, grades, notifications, downloaded files
- **In the Cloud:** Nothing. Zero data leaves your computer.

### Where is Data Stored?
- **macOS:** `~/Library/Application Support/cid/`
- **Windows:** `%APPDATA%/cid/`
- **Linux:** `~/.config/cid/`

### How is My API Token Protected?
- Stored in your **OS keychain** (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- Never logged or exposed in plaintext
- Encrypted by your operating system

### Can I Export My Data?
Yes! Go to **File → Export Database As...** to save a copy of your SQLite database. You can:
- Transfer to a new computer
- Analyze in SQLite Browser
- Backup to cloud storage manually

---

## 🐛 Known Issues

### Version 0.1.0 (MVP)
- **File sync is manual:** Files require manual download—no automatic background downloads (planned for v0.2.0)
- **No grade predictions:** Only shows current analytics, not future projections
- **ICS calendar import limitations:** Some complex recurrence rules may not parse correctly

### Recently Fixed
- **Recurring events:** Now supported via RRULE parsing for Canvas and imported calendars
- **Duplicate recommendations:** Fixed deduplication logic in v0.1.0

See [GitHub Issues](https://github.com/MorrisXDS/CanvasAssistant/issues) for full list.

---

## 🏗️ Technical Architecture

CID follows a **7-layer architecture** with strict unidirectional dependencies:

| Layer | Purpose |
|-------|---------|
| L0 - Utilities | Logging, system monitoring, configuration |
| L1 - Persistence | SQLite database (WAL mode), migrations |
| L2 - Daemon | Canvas API client, sync engine, rate limiting |
| L3 - Intelligence | Priority calculation, recommendations, insights |
| L4 - Controller | Command dispatch, IPC handling |
| L5 - Presentation | Zustand state management, view models |
| L6 - UI | React components |

**Key Design Principles:**
- **Offline-First**: All data stored locally in SQLite; network is optional
- **Privacy-Respecting**: No telemetry, no cloud sync, data never leaves your machine
- **Performance**: <300MB memory, <1ms write latency, 60fps UI

For developer documentation, see `CLAUDE.md` in the repository root.

---

## 🤝 Contributing

While this is primarily a UofT student project, we welcome contributions!

**For Developers:**
See `DevDocs/README.md` for architecture documentation and setup instructions.

**For Users:**
- Report bugs via [GitHub Issues](https://github.com/MorrisXDS/CanvasAssistant/issues)
- Request features via [Discussions](https://github.com/MorrisXDS/CanvasAssistant/discussions)
- Share feedback on [r/UofT](https://reddit.com/r/UofT)

---

## 📜 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **University of Toronto** for providing Canvas LMS access
- **Canvas LMS** by Instructure for the comprehensive API
- **Electron** framework for enabling cross-platform desktop apps
- **SQLite** for powering local-first data storage

---

## 📞 Support

**Need Help?**
- 📖 Read the User Guide above
- 🐛 Check [Troubleshooting](#-troubleshooting)
- 💬 Ask in [GitHub Discussions](https://github.com/MorrisXDS/CanvasAssistant/discussions)
- 📧 Email: support@example.com (TBD)

**Developer Questions?**
See `DevDocs/README.md` for technical documentation.

---

**Made with ❤️ by UofT students, for UofT students**

*Version 0.1.0 | Last Updated: January 24, 2026*
