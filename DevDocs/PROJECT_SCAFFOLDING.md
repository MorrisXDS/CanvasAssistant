# Canvas Integration Dashboard - Project Scaffolding Guide

**Version:** 1.0
**Purpose:** Complete directory structure and initial file templates
**Target:** Week 1 Milestone 1.1 (Environment Setup)
**Last Updated:** January 21, 2026

---

## Directory Structure

```
CanvasAssistant/
├── src/
│   ├── main.ts                          # Electron main process entry
│   ├── renderer.tsx                     # Electron renderer entry
│   ├── preload.ts                       # Context bridge for IPC
│   │
│   ├── layers/
│   │   ├── l0-utilities/
│   │   │   ├── SystemMonitor.ts         # Battery, focus monitoring
│   │   │   ├── Logger.ts                # Winston with PII redaction
│   │   │   └── index.ts                 # Exports
│   │   │
│   │   ├── l1-persistence/
│   │   │   ├── Database.ts              # SQLite wrapper with events
│   │   │   ├── types.ts                 # TypeScript interfaces
│   │   │   ├── migrations/
│   │   │   │   ├── 001_initial.sql      # Create all tables
│   │   │   │   ├── 002_add_indexes.sql  # Performance indexes
│   │   │   │   └── runner.ts            # Migration engine
│   │   │   └── index.ts
│   │   │
│   │   ├── l2-daemon/
│   │   │   ├── CanvasClient.ts          # HTTP client with rate limiting
│   │   │   ├── SyncEngine.ts            # Orchestrates sync workflow
│   │   │   ├── RateLimiter.ts           # Queue with exponential backoff
│   │   │   ├── ETagCache.ts             # Conditional GET support
│   │   │   └── index.ts
│   │   │
│   │   ├── l3-intelligence/
│   │   │   ├── PriorityEngine.ts        # ROI scoring formula
│   │   │   ├── GradeAnalytics.ts        # Assessed grade, volatility
│   │   │   └── index.ts
│   │   │
│   │   ├── l4-controller/
│   │   │   ├── CommandDispatcher.ts     # Command pattern implementation
│   │   │   ├── commands/
│   │   │   │   ├── UpdateAssignmentGradeCommand.ts
│   │   │   │   ├── DismissNotificationCommand.ts
│   │   │   │   ├── CreateEventCommand.ts
│   │   │   │   └── TriggerSyncCommand.ts
│   │   │   ├── ConflictResolver.ts      # Local vs. remote resolution
│   │   │   └── index.ts
│   │   │
│   │   ├── l5-presentation/
│   │   │   ├── store.ts                 # Zustand global state
│   │   │   ├── viewModels/
│   │   │   │   ├── DashboardViewModel.ts
│   │   │   │   ├── CourseViewModel.ts
│   │   │   │   └── CalendarViewModel.ts
│   │   │   └── index.ts
│   │   │
│   │   └── l6-ui/
│   │       ├── App.tsx                  # Root component
│   │       ├── components/
│   │       │   ├── Dashboard/
│   │       │   │   ├── PriorityList.tsx
│   │       │   │   ├── RecentNotifications.tsx
│   │       │   │   ├── HealthIndicator.tsx
│   │       │   │   └── QuickStats.tsx
│   │       │   ├── Calendar/
│   │       │   │   ├── DayView.tsx
│   │       │   │   ├── WeekView.tsx
│   │       │   │   ├── MonthView.tsx
│   │       │   │   └── EventModal.tsx
│   │       │   ├── Course/
│   │       │   │   ├── InfoHub.tsx
│   │       │   │   ├── WorkLedger.tsx
│   │       │   │   └── ProgressAnalytics.tsx
│   │       │   ├── Notifications/
│   │       │   │   ├── NotificationFeed.tsx
│   │       │   │   └── NotificationItem.tsx
│   │       │   ├── Files/
│   │       │   │   ├── FileBrowser.tsx
│   │       │   │   └── FolderTree.tsx
│   │       │   └── shared/
│   │       │       ├── Sidebar.tsx
│   │       │       ├── ThemeToggle.tsx
│   │       │       └── ConflictModal.tsx
│   │       ├── styles/
│   │       │   ├── global.css
│   │       │   └── themes.css
│   │       └── index.ts
│   │
│   └── types/
│       ├── canvas-api.ts                # Canvas API response types
│       └── global.d.ts                  # Global type declarations
│
├── tests/
│   ├── l1-persistence/
│   │   └── Database.test.ts
│   ├── l2-daemon/
│   │   ├── RateLimiter.test.ts
│   │   └── SyncEngine.test.ts
│   ├── l3-intelligence/
│   │   ├── PriorityEngine.test.ts
│   │   └── GradeAnalytics.test.ts
│   └── l6-ui/
│       └── Dashboard.test.tsx
│
├── migrations/                          # SQL migrations (symlink to src/layers/l1-persistence/migrations)
├── logs/                                # Winston log output
├── dist/                                # electron-builder output
├── node_modules/
│
├── .gitignore
├── .eslintrc.json
├── .prettierrc
├── package.json
├── tsconfig.json
├── electron-builder.json
└── README.md
```

---

## Initial File Templates

### `package.json`

```json
{
  "name": "canvas-integration-dashboard",
  "version": "0.1.0",
  "description": "Offline-first academic command center for Canvas LMS",
  "main": "dist/main.js",
  "scripts": {
    "dev": "concurrently \"npm run dev:main\" \"npm run dev:renderer\"",
    "dev:main": "tsc -w",
    "dev:renderer": "vite",
    "build": "tsc && vite build",
    "test": "jest",
    "test:watch": "jest --watch",
    "lint": "eslint src/**/*.ts src/**/*.tsx",
    "format": "prettier --write src/**/*.{ts,tsx}",
    "package": "electron-builder",
    "package:mac": "electron-builder --mac",
    "package:win": "electron-builder --win",
    "package:linux": "electron-builder --linux"
  },
  "dependencies": {
    "better-sqlite3": "^9.2.2",
    "electron": "^28.1.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-window": "^1.8.10",
    "zustand": "^4.4.7",
    "winston": "^3.11.0",
    "keytar": "^7.9.0",
    "axios": "^1.6.2",
    "react-hotkeys-hook": "^4.4.1"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.8",
    "@types/react": "^18.2.45",
    "@types/react-dom": "^18.2.18",
    "@types/react-window": "^1.8.8",
    "@types/node": "^20.10.5",
    "typescript": "^5.3.3",
    "vite": "^5.0.8",
    "@vitejs/plugin-react": "^4.2.1",
    "electron-builder": "^24.9.1",
    "eslint": "^8.56.0",
    "@typescript-eslint/eslint-plugin": "^6.15.0",
    "@typescript-eslint/parser": "^6.15.0",
    "prettier": "^3.1.1",
    "jest": "^29.7.0",
    "@testing-library/react": "^14.1.2",
    "@testing-library/jest-dom": "^6.1.5",
    "concurrently": "^8.2.2"
  },
  "author": "Your Name",
  "license": "MIT"
}
```

---

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020", "DOM"],
    "jsx": "react-jsx",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true,
    "types": ["node", "jest", "@testing-library/jest-dom"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

---

### `.eslintrc.json`

```json
{
  "parser": "@typescript-eslint/parser",
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "plugins": ["@typescript-eslint"],
  "env": {
    "node": true,
    "es6": true
  },
  "rules": {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "no-console": ["warn", { "allow": ["warn", "error"] }]
  }
}
```

---

### `.prettierrc`

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 90,
  "tabWidth": 2
}
```

---

### `.gitignore`

```
node_modules/
dist/
logs/
*.log
.DS_Store
*.db
*.db-shm
*.db-wal
backups/
.env
.vscode/
```

---

### `src/main.ts` (Electron Main Process)

```typescript
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { Database } from './layers/l1-persistence/Database';
import { Logger } from './layers/l0-utilities/Logger';
import { SystemMonitor } from './layers/l0-utilities/SystemMonitor';
import { SyncEngine } from './layers/l2-daemon/SyncEngine';

// Initialize logger
const logger = new Logger();
logger.info('Application starting...');

// Initialize database
const dbPath = path.join(app.getPath('userData'), 'cid', 'database.db');
const db = new Database(dbPath, logger);

// Initialize system monitor
const systemMonitor = new SystemMonitor();

// Initialize sync engine
const syncEngine = new SyncEngine(db, logger);

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load renderer
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('trigger-sync', async () => {
  logger.info('Manual sync triggered');
  return await syncEngine.fullSync();
});

ipcMain.handle('get-courses', async () => {
  return db.getCourses();
});

ipcMain.handle('get-assignments', async (_, courseId: number) => {
  return db.getAssignments(courseId);
});
```

---

### `src/preload.ts` (Context Bridge)

```typescript
import { contextBridge, ipcRenderer } from 'electron';

// Expose secure IPC API to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  triggerSync: () => ipcRenderer.invoke('trigger-sync'),
  getCourses: () => ipcRenderer.invoke('get-courses'),
  getAssignments: (courseId: number) => ipcRenderer.invoke('get-assignments', courseId),
});
```

---

### `src/layers/l1-persistence/Database.ts`

```typescript
import Database from 'better-sqlite3';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import { Logger } from '../l0-utilities/Logger';

export class Database extends EventEmitter {
  private db: Database.Database;

  constructor(dbPath: string, private logger: Logger) {
    super();

    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize() {
    // Set pragmas
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');

    // Run migrations
    this.runMigrations();

    this.logger.info('Database initialized successfully');
  }

  private runMigrations() {
    // Migration logic here (see migrations/runner.ts)
    this.logger.info('Migrations complete');
  }

  // Example method: Get all courses
  getCourses() {
    const stmt = this.db.prepare('SELECT * FROM courses WHERE deleted_at IS NULL');
    return stmt.all();
  }

  // Example method: Upsert course
  upsertCourse(course: any) {
    const stmt = this.db.prepare(`
      INSERT INTO courses (external_id, code, name, current_grade)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(external_id) DO UPDATE SET
        code = excluded.code,
        name = excluded.name,
        current_grade = excluded.current_grade,
        updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(course.external_id, course.code, course.name, course.current_grade);

    // Emit commit event
    this.emit('commit', { table: 'courses' });
  }

  // Transaction wrapper
  transaction(fn: () => void) {
    const txn = this.db.transaction(fn);
    txn();
  }

  close() {
    this.db.close();
    this.logger.info('Database closed');
  }
}
```

---

### `src/layers/l1-persistence/migrations/001_initial.sql`

```sql
-- Courses table
CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT UNIQUE NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    current_grade REAL,
    assessed_grade REAL,
    target_grade REAL DEFAULT 85.0,
    grade_volatility REAL DEFAULT 0.0,
    total_weight REAL DEFAULT 0.0,
    landing_page_url TEXT,
    last_synced_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME
);

-- Assignments table
CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT UNIQUE NOT NULL,
    course_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    due_at DATETIME,
    unlock_at DATETIME,
    points_possible REAL,
    submission_types TEXT,
    weight REAL DEFAULT 0.0,
    grade REAL,
    priority_score REAL DEFAULT 0.0,
    is_completed BOOLEAN DEFAULT FALSE,
    completed_at DATETIME,
    local_modified_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(course_id) REFERENCES courses(id)
);

-- Calendar events table
CREATE TABLE IF NOT EXISTS calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT UNIQUE,
    source_type TEXT CHECK(source_type IN ('canvas', 'user')),
    course_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    start_at DATETIME NOT NULL,
    end_at DATETIME,
    all_day BOOLEAN DEFAULT FALSE,
    recurrence_rule TEXT,
    recurrence_exception_dates TEXT,
    parent_event_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY(course_id) REFERENCES courses(id),
    FOREIGN KEY(parent_event_id) REFERENCES calendar_events(id)
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT CHECK(source_type IN ('canvas', 'system')),
    source_id TEXT,
    course_id INTEGER,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    priority_level TEXT CHECK(priority_level IN ('critical','high','medium','low')) DEFAULT 'medium',
    priority_score REAL DEFAULT 0.0,
    published_at DATETIME NOT NULL,
    dismissed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(course_id) REFERENCES courses(id),
    UNIQUE(source_type, source_id)
);

-- Resources/Files table
CREATE TABLE IF NOT EXISTS resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT UNIQUE NOT NULL,
    course_id INTEGER NOT NULL,
    parent_folder_id INTEGER,
    type TEXT CHECK(type IN ('file', 'folder', 'external_url', 'page')),
    title TEXT NOT NULL,
    url TEXT,
    local_path TEXT,
    size_bytes INTEGER,
    mime_type TEXT,
    unlock_at DATETIME,
    synced_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(course_id) REFERENCES courses(id),
    FOREIGN KEY(parent_folder_id) REFERENCES resources(id)
);

-- Grade history table
CREATE TABLE IF NOT EXISTS grade_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    grade REAL NOT NULL,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(course_id) REFERENCES courses(id)
);

-- User preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO schema_version (version) VALUES (1);
```

---

### `src/layers/l0-utilities/Logger.ts`

```typescript
import winston from 'winston';
import path from 'path';

export class Logger {
  private logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
          return `${timestamp} [${level.toUpperCase()}]: ${message}`;
        })
      ),
      transports: [
        new winston.transports.File({
          filename: path.join('logs', 'cid.log'),
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
        }),
        new winston.transports.Console(),
      ],
    });
  }

  info(message: string) {
    this.logger.info(this.redactPII(message));
  }

  warn(message: string) {
    this.logger.warn(this.redactPII(message));
  }

  error(message: string) {
    this.logger.error(this.redactPII(message));
  }

  // Redact PII (emails, API tokens)
  private redactPII(message: string): string {
    return message
      .replace(/Bearer\s+[A-Za-z0-9_-]+/g, 'Bearer [REDACTED]')
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
  }
}
```

---

### `src/layers/l6-ui/App.tsx`

```tsx
import React from 'react';
import { useStore } from '../l5-presentation/store';
import Dashboard from './components/Dashboard/Dashboard';
import Sidebar from './components/shared/Sidebar';

export default function App() {
  const { currentView } = useStore();

  return (
    <div className="app">
      <Sidebar />
      <main className="content">
        {currentView === 'dashboard' && <Dashboard />}
        {/* Other views... */}
      </main>
    </div>
  );
}
```

---

### `src/layers/l5-presentation/store.ts`

```typescript
import { create } from 'zustand';

interface AppState {
  currentView: 'dashboard' | 'calendar' | 'courses' | 'notifications' | 'files';
  courses: any[];
  assignments: any[];
  syncStatus: 'idle' | 'syncing' | 'error';

  setView: (view: AppState['currentView']) => void;
  triggerSync: () => Promise<void>;
}

export const useStore = create<AppState>((set) => ({
  currentView: 'dashboard',
  courses: [],
  assignments: [],
  syncStatus: 'idle',

  setView: (view) => set({ currentView: view }),

  triggerSync: async () => {
    set({ syncStatus: 'syncing' });
    try {
      await window.electronAPI.triggerSync();
      set({ syncStatus: 'idle' });
    } catch (error) {
      set({ syncStatus: 'error' });
    }
  },
}));
```

---

## Next Steps

1. **Create directory structure:**
   ```bash
   mkdir -p src/layers/{l0-utilities,l1-persistence,l2-daemon,l3-intelligence,l4-controller,l5-presentation,l6-ui}
   mkdir -p tests/{l1-persistence,l2-daemon,l3-intelligence,l6-ui}
   mkdir -p logs dist migrations
   ```

2. **Initialize npm project:**
   ```bash
   npm init -y
   npm install --save <dependencies from package.json>
   npm install --save-dev <devDependencies from package.json>
   ```

3. **Copy templates:**
   - Use templates above for tsconfig.json, .eslintrc.json, etc.
   - Create initial files in src/layers/

4. **Test build:**
   ```bash
   npm run build
   npm run dev
   ```

5. **Begin Week 1 implementation** (see `MVP_IMPLEMENTATION_ROADMAP.md`)

---

**Document Status:** READY FOR USE
**Related Docs:**
- `MVP_IMPLEMENTATION_ROADMAP.md` (Week-by-week milestones)
- `ARCHITECTURE_DIAGRAM.md` (Layer responsibilities)
- `ROI_FORMULA_SPEC.md` (L3 implementation details)
