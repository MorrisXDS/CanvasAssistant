# Week 1 Milestone 1.2: Layer 0 - Utilities

**Status:** ✅ COMPLETE
**Date Completed:** January 21, 2026
**Developer:** Team

---

## 📋 Milestone Overview

Implemented **Layer 0 (Utilities)** - the foundation for logging and system monitoring throughout the application.

### Deliverables

✅ **Logger.ts** - Winston-based logger with PII redaction
✅ **SystemMonitor.ts** - Battery, power, and focus state tracking
✅ **Unit Tests** - Comprehensive test coverage for both utilities
✅ **Integration** - Connected to main.ts for application-wide use

---

## 📁 Files Created

### Source Files
```
src/layers/l0-utilities/
├── Logger.ts          # Winston logger with PII redaction
├── SystemMonitor.ts   # System state monitoring (power, focus)
└── index.ts           # Barrel exports
```

### Test Files
```
tests/l0-utilities/
├── Logger.test.ts         # Logger unit tests (11 test cases)
└── SystemMonitor.test.ts  # SystemMonitor unit tests (17 test cases)
```

---

## 🔧 Logger Implementation

### Features
- **Winston-based logging** with file and console transports
- **PII Redaction** - Automatically removes:
  - Bearer tokens
  - Email addresses
  - API keys (long alphanumeric strings)
  - Canvas-specific tokens
- **Log Rotation** - Max 10MB per file, keeps 5 files
- **Multiple Log Levels** - info, warn, error, debug
- **Timestamps** - ISO format with timezone

### Usage Example
```typescript
import { Logger } from './layers/l0-utilities/Logger';

const logger = new Logger();
logger.info('Application started');
logger.warn('Low disk space');
logger.error('Database connection failed', error);
```

### PII Redaction Examples
```typescript
// Input: "Authorization: Bearer abc123xyz789"
// Output: "Authorization: Bearer [REDACTED]"

// Input: "User: student@mail.utoronto.ca"
// Output: "User: [EMAIL_REDACTED]"

// Input: "API Key: 1234567890abcdef1234567890abcdef"
// Output: "API Key: [KEY_REDACTED]"
```

### Log File Location
- **Development:** `logs/cid.log`
- **Production:** Same location relative to app

---

## 🔋 SystemMonitor Implementation

### Features
- **Power Source Detection** - AC vs Battery
- **Window Focus Tracking** - Knows if app is active
- **Fullscreen Detection** - Monitors fullscreen state
- **Event-Driven Updates** - Emits `state-change` events only when state changes
- **Adaptive Sync Logic** - Determines if sync should run based on power/focus
- **5-Second Poll Interval** - Respects performance constraints

### System State Interface
```typescript
interface SystemState {
  powerSource: 'battery' | 'ac' | 'unknown';
  batteryLevel: number; // 0-100
  isCharging: boolean;
  windowFocused: boolean;
  isFullscreen: boolean;
  canSync: boolean; // Derived from power/focus state
}
```

### Sync Logic
- **On AC Power:** Always allow sync
- **On Battery + Focused:** Allow sync (user is actively using app)
- **On Battery + Unfocused:** Disable sync (save battery)

### Usage Example
```typescript
import { SystemMonitor } from './layers/l0-utilities/SystemMonitor';

const monitor = new SystemMonitor();
monitor.start();

monitor.on('state-change', (state) => {
  console.log(`Power: ${state.powerSource}, Can Sync: ${state.canSync}`);

  if (state.canSync) {
    // Trigger background sync
  }
});

// Update from main process
mainWindow.on('focus', () => monitor.setWindowFocused(true));
mainWindow.on('blur', () => monitor.setWindowFocused(false));
```

---

## 🧪 Test Coverage

### Logger Tests (11 cases)
- ✅ Creates log directory if missing
- ✅ Creates log file on first write
- ✅ Redacts Bearer tokens
- ✅ Redacts email addresses
- ✅ Redacts long API keys
- ✅ Redacts Canvas tokens
- ✅ Logs info messages
- ✅ Logs warning messages
- ✅ Logs error messages
- ✅ Logs error with stack trace
- ✅ Respects log rotation configuration

### SystemMonitor Tests (17 cases)
- ✅ Initializes with default state
- ✅ Starts with unknown power source
- ✅ Defaults to window focused
- ✅ Defaults to not fullscreen
- ✅ Updates window focus state
- ✅ Updates fullscreen state
- ✅ Emits event on focus change
- ✅ Emits event on fullscreen change
- ✅ Does NOT emit if state unchanged
- ✅ Starts monitoring
- ✅ Stops monitoring
- ✅ Prevents multiple start calls
- ✅ Provides human-readable description
- ✅ Indicates when sync is allowed
- ✅ Shows focused state in description
- ✅ Shows fullscreen state in description
- ✅ Only emits events when state changes

### Running Tests
```bash
npm test
```

**Expected Output:**
```
PASS  tests/l0-utilities/Logger.test.ts
PASS  tests/l0-utilities/SystemMonitor.test.ts

Test Suites: 2 passed, 2 total
Tests:       28 passed, 28 total
```

---

## 🔌 Integration with Main Process

Updated `src/main.ts` to demonstrate L0 utilities in action:

### Changes Made
1. **Initialized Logger and SystemMonitor** at app startup
2. **Connected window events** to SystemMonitor:
   - `focus` / `blur` → `setWindowFocused()`
   - `enter-full-screen` / `leave-full-screen` → `setFullscreen()`
3. **Logged application lifecycle**:
   - App start
   - Window creation
   - System state changes
   - App quit
4. **Monitored sync eligibility** based on power/focus state

### Example Log Output
```
2026-01-21 14:05:00 [INFO]: Canvas Integration Dashboard starting...
2026-01-21 14:05:00 [INFO]: Platform: darwin, Electron: 34.0.0
2026-01-21 14:05:00 [INFO]: Creating main window...
2026-01-21 14:05:00 [INFO]: Loading development server at http://localhost:5173
2026-01-21 14:05:01 [INFO]: System state changed: Power: AC | Focused | Sync: ✓
2026-01-21 14:05:15 [DEBUG]: Window unfocused
2026-01-21 14:05:15 [INFO]: System state changed: Power: AC | Unfocused | Sync: ✓
```

---

## ✅ Success Criteria

All Week 1 Milestone 1.2 requirements met:

- [x] **Logger.ts** implements Winston with PII redaction
- [x] **Log rotation** configured (10MB, 5 files)
- [x] **Never logs API tokens or credentials**
- [x] **SystemMonitor.ts** tracks power, focus, fullscreen
- [x] **Poll interval** max once per 5 seconds
- [x] **Event emission** only on state changes (no redundant events)
- [x] **Unit tests** written for both utilities (28 tests total)
- [x] **Tests pass** with `npm test`
- [x] **Integration** with main.ts demonstrated

---

## 🚀 Next Steps

**Week 1 Milestone 1.3:** Layer 1 - Persistence (SQLite Database)

See `DevDocs/MVP_IMPLEMENTATION_ROADMAP.md` Week 1 for next milestones:
- Deploy SQLite with WAL mode
- Apply all schema migrations
- Implement event emission on commit
- Target: <1ms write latency

---

## 📚 Documentation References

- **Architecture:** `DevDocs/ARCHITECTURE_DIAGRAM.md` - Layer 0 section
- **Roadmap:** `DevDocs/MVP_IMPLEMENTATION_ROADMAP.md` - Week 1 Milestone 1.2
- **Templates:** `DevDocs/PROJECT_SCAFFOLDING.md` - L0 Utilities templates
- **Spec:** `DevDocs/CID_Implementation_Plan_v4.0.md` - Part I, Layer 0

---

**Milestone Status:** ✅ COMPLETE
**Ready for:** Week 1 Milestone 1.3 (Layer 1 - Persistence)
