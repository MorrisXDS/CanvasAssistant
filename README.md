# Canvas Integration Dashboard

**Offline-first academic command center for Canvas LMS**

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)
![License](https://img.shields.io/badge/license-PolyForm%20Noncommercial-green)
![Electron](https://img.shields.io/badge/electron-40-teal)
![Node](https://img.shields.io/badge/node-20%2B-brightgreen)

<p align="center">
  <img src="assets/screenshots/dashboard.png" alt="Dashboard" width="800" />
</p>

Canvas Integration Dashboard (CID) pulls all your Canvas LMS data into a single desktop app that works offline. Instead of jumping between browser tabs for assignments, grades, files, and announcements, you open one window and everything is there — synced from Canvas and stored locally on your machine.

---

## Features

### Dashboard — See what needs your attention

When you open the app, the dashboard shows four key numbers: active courses, pending tasks, overdue tasks, and your average grade. Below that, a priority queue ranks your most urgent work, alongside recent announcements and today's schedule. Click any stat card to jump to the full list. Right-click a task to mark it complete, duplicate it, or view it on the calendar.

<p align="center">
  <img src="assets/screenshots/dashboard.png" alt="Dashboard view" width="800" />
</p>

### Calendar — Plan your week or month

View all your deadlines on a month or week calendar, color-coded by course. Click a date to see what's due that day. Filter by course, task type, priority, or deadline status. Import external calendar events from ICS files, or export your Canvas deadlines to Google Calendar or other apps.

<p align="center">
  <img src="assets/screenshots/calendar.png" alt="Calendar view" width="800" />
</p>

### Courses — Manage all your courses in one place

The courses page lists every course you're enrolled in, with your current grade and progress. Switch between grid and list view, search by name, or filter by grade range. Pin important courses to the top. Click into any course for its detail page: tasks organized by type, grade history, announcements, and syllabus.

<p align="center">
  <img src="assets/screenshots/courses.png" alt="Courses view" width="800" />
</p>

### Files — Browse and download course materials

The files page mirrors your Canvas folder structure: expand a course to see its folders, then browse or download files. Switch between list and grid view, search by filename, or filter by source type, download status, or file size. Notification dots highlight folders with recently updated files.

<p align="center">
  <img src="assets/screenshots/files.png" alt="Files view" width="800" />
</p>

### Settings — Configure the app to your preferences

Adjust theme and appearance, set your academic target grade, configure auto-sync frequency, choose notification triggers, manage download filters, and control data retention. Advanced options include debug mode, cache clearing, and window reset.

<p align="center">
  <img src="assets/screenshots/settings.png" alt="Settings view" width="800" />
</p>

### And more

- **Tasks** — Track assignments across all courses in one list. Filter by status, sort by deadline, right-click for quick actions.
- **Announcements** — Searchable feed of all course announcements. Filter by type, read status, or course.
- **Updates** — Review everything that changed since your last sync. Resolve conflicts and accept queued tasks.

---

## Installation

### Download a release (recommended)

1. Go to [Releases](https://github.com/MorrisXDS/CanvasAssistant/releases)
2. Download the installer for your platform (Windows `.exe`, macOS `.dmg`, Linux `.AppImage`)
3. Run the installer and open the app

### Build from source

**Prerequisites:** Node.js 20+ (22+ recommended)

```bash
git clone https://github.com/MorrisXDS/CanvasAssistant.git
cd CanvasAssistant
npm install
npm run dev
```

| Command           | Description                   |
| ----------------- | ----------------------------- |
| `npm run dev`     | Run in development mode       |
| `npm run build`   | Compile TypeScript + Vite     |
| `npm test`        | Run all tests                 |
| `npm run lint`    | Lint source files             |
| `npm run package` | Package with electron-builder |

---

## Getting Started

### 1. First launch — onboarding wizard

When you open the app for the first time, the onboarding wizard walks you through setup:

1. **Canvas URL** — Enter your Canvas instance URL (e.g., `https://canvas.youruniversity.edu`)
2. **API token** — Paste your Canvas API token ([how to generate one](https://community.canvaslms.com/t5/Student-Guide/How-do-I-manage-API-access-tokens-as-a-student/ta-p/273))
3. **Theme** — Pick light, dark, or match your system
4. **Downloads** — Choose where to save downloaded files
5. **Target grade** — Set your academic goal
6. **Courses** — Select which courses to show in the app

The app syncs your selected courses and you're ready to go.

### 2. Navigating the app

- The **sidebar** on the left is your main navigation. Drag items to reorder them. Collapse it for more screen space.
- **Notification dots** appear on sidebar items and course cards when new content arrives.
- The app **syncs with Canvas** in the background on a schedule you set (or click "Sync Now" on the dashboard).
- Everything **works offline**. Changes sync back when you reconnect.

### 3. Typical workflows

**Start of the day:** Open the dashboard, check what's overdue and what's due soon. Click into urgent tasks directly from the priority queue.

**Planning your week:** Go to the calendar week view. See all deadlines laid out. Export to ICS if you want them in your phone calendar.

**After class:** Check the updates page to see new files and announcements from today's courses. Download lecture slides from the files page.

**Before an exam:** Open the course detail page for that course. Review your grade breakdown by assignment type, check if you're meeting your target grade, and read through any recent announcements from the instructor.

**End of term:** Archive courses you've finished. They move to a collapsible "Archived" section on the courses page and stop appearing elsewhere.

---

## License

[PolyForm Noncommercial 1.0.0](LICENSE) — free to use, modify, and share for non-commercial purposes.
