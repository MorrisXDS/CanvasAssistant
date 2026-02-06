# Canvas Integration Dashboard

**Offline-first academic command center for Canvas LMS**

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)
![License](https://img.shields.io/badge/license-PolyForm%20Noncommercial-green)
![Electron](https://img.shields.io/badge/electron-40-teal)

<!-- screenshot -->

Canvas Integration Dashboard (CID) pulls all your Canvas LMS data into a single desktop app that works offline. Instead of jumping between browser tabs for assignments, grades, files, and announcements, you open one window and everything is there -- synced from Canvas and stored locally on your machine.

## What You Can Do

### Dashboard -- See what needs your attention

When you open the app, the dashboard shows you four key numbers: active courses, pending tasks, overdue tasks, and your average grade. Below that, a priority queue ranks your most urgent work, alongside recent notifications and a grade summary. Click any stat card to jump to the full list. Right-click a task to mark it complete, duplicate it, or view it on the calendar.

Use the dashboard when you want a quick answer to "what should I be working on right now?"

### Courses -- Manage all your courses in one place

The courses page lists every course you're enrolled in, with your current grade and progress on each. Switch between grid and list view, search by name, or filter by grade range. Pin your most important courses to the top. Click into any course to see its full detail page: tasks organized by type (assignments, quizzes, discussions, exams), grade history, announcements, and the syllabus.

From a course detail page, you can edit tasks inline, set a target grade for the course, change the course color, or archive courses you're done with. Queued tasks from Canvas appear here too -- accept or reject them as they come in.

### Tasks -- Track assignments across all courses

The tasks page collects every assignment, quiz, and discussion from all your courses into one list. Filter by status (pending, overdue, completed) and see counts for each. Each task shows its priority level, course, due date, weight, and submission status. Right-click for quick actions: mark complete, duplicate, delete, or jump to the calendar view.

Use this page when you want to see everything due across all courses sorted by deadline, with overdue items surfaced first.

### Calendar -- Plan your week or month

View all your deadlines on a month or week calendar, color-coded by course. Click a date to see what's due that day. Filter by course, task type, priority, or deadline status to narrow down the view. Import external calendar events from ICS files, or export your Canvas deadlines to use in Google Calendar or other apps.

Use the calendar when you want to plan ahead and see how your workload is distributed over time.

### Files -- Browse and download course materials

The files page mirrors your Canvas folder structure: expand a course to see its folders (Lectures, Labs, Assignments, etc.), then browse or download files. Switch between list and grid view, search by filename, or filter by source type (resources, attachments, pages), download status, or file size. Notification dots highlight folders with recently added or updated files.

Use this page to download lecture slides, assignment handouts, or any file your instructors post -- all organized the same way as on Canvas.

### Announcements -- Stay on top of course news

All course announcements in a searchable feed, sorted newest first. Filter by type (urgent, deadline, grade, info), by read status (unread, dismissed), or by specific course. Each announcement shows the intent, title, excerpt, date, and course name. Click to read the full text, or dismiss to clear it from your unread list.

Use this when you want to catch up on what your instructors have posted without opening every course individually.

### Updates -- Review what changed since your last sync

The updates page shows everything that changed since you last looked. The left column lists items that need your action -- sync conflicts or queued tasks from Canvas that need you to accept or reject. The right column shows informational changes: new grades, files, announcements, and page edits. Filter by type to focus on what matters.

Check this page after a sync to quickly see what's new and resolve anything that needs your input.

### Settings -- Configure the app to your preferences

Access settings from the sidebar. Adjust theme and appearance, set your academic target grade, configure how often the app auto-syncs with Canvas, choose which events trigger notifications, manage download filters, and control data retention. Advanced options include debug mode, cache clearing, and window reset.

## Getting Started

### First launch

1. Download the latest installer from [Releases](https://github.com/MorrisXDS/CanvasAssistant/releases)
2. Open the app -- the onboarding wizard walks you through setup:
   - Enter your Canvas instance URL (e.g., `https://canvas.youruniversity.edu`)
   - Paste your Canvas API token ([how to generate one](https://community.canvaslms.com/t5/Student-Guide/How-do-I-manage-API-access-tokens-as-a-student/ta-p/273))
   - Pick a theme (light, dark, or match your system)
   - Choose where to save downloaded files
   - Set your target grade
   - Select which courses to show in the app
3. The app syncs your selected courses and you're ready to go

### After setup

- The sidebar on the left is your main navigation. Drag items to reorder them. Collapse it for more screen space.
- Notification dots appear on sidebar items and course cards when new content arrives.
- The app syncs with Canvas in the background on a schedule you set (or click "Sync Now" on the dashboard).
- Everything works offline. Changes sync back when you reconnect.

### Typical workflows

**Start of the day:** Open the dashboard, check what's overdue and what's due soon. Click into urgent tasks directly from the priority queue.

**Planning your week:** Go to the calendar week view. See all deadlines laid out. Export to ICS if you want them in your phone calendar.

**After class:** Check the updates page to see new files and announcements from today's courses. Download lecture slides from the files page.

**Before an exam:** Open the course detail page for that course. Review your grade breakdown by assignment type, check if you're meeting your target grade, and read through any recent announcements from the instructor.

**End of term:** Archive courses you've finished. They move to a collapsible "Archived" section on the courses page and stop appearing elsewhere.

## Building from Source

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

See [DevDocs/](DevDocs/) for architecture and contributor documentation.

## License

[PolyForm Noncommercial 1.0.0](LICENSE) -- free to use, modify, and share for non-commercial purposes.
