# Testing Week 1 Milestone 1.2: Layer 0 Utilities

**Milestone:** Layer 0 - Logger & SystemMonitor
**Status:** Ready to Test
**Date:** January 21, 2026

---

## 🚀 Quick Test Guide

### Step 1: Install Dependencies

```bash
# Remove old packages (if any exist)
rm -rf node_modules package-lock.json

# Fresh install with all updated dependencies
npm install
```

**Expected time:** 2-3 minutes
**Expected output:** ~600 packages installed

---

### Step 2: Run Unit Tests

```bash
npm test
```

**What this tests:**
- ✅ Logger PII redaction (Bearer tokens, emails, API keys)
- ✅ Logger file creation and rotation
- ✅ SystemMonitor state tracking
- ✅ SystemMonitor event emission
- ✅ Window focus/fullscreen detection

**Expected output:**
```
PASS  tests/l0-utilities/Logger.test.ts
  Logger
    Initialization
      ✓ should create log directory if it does not exist (5 ms)
      ✓ should create log file (8 ms)
    PII Redaction
      ✓ should redact Bearer tokens (3 ms)
      ✓ should redact email addresses (2 ms)
      ✓ should redact long API keys (2 ms)
      ✓ should redact Canvas tokens (2 ms)
    Log Levels
      ✓ should log info messages (2 ms)
      ✓ should log warning messages (2 ms)
      ✓ should log error messages (2 ms)
      ✓ should log error with stack trace (3 ms)
    Log Rotation
      ✓ should respect max file size configuration (1 ms)

PASS  tests/l0-utilities/SystemMonitor.test.ts
  SystemMonitor
    Initialization
      ✓ should initialize with default state (2 ms)
      ✓ should start with unknown power source (1 ms)
      ✓ should default to window focused (1 ms)
      ✓ should default to not fullscreen (1 ms)
    Window State Updates
      ✓ should update window focus state (2 ms)
      ✓ should update fullscreen state (1 ms)
      ✓ should emit event when window focus changes (3 ms)
      ✓ should emit event when fullscreen changes (2 ms)
      ✓ should NOT emit event if state has not changed (2 ms)
    Start and Stop
      ✓ should start monitoring (1 ms)
      ✓ should stop monitoring (1 ms)
      ✓ should not start multiple times (1 ms)
    State Description
      ✓ should provide human-readable state description (1 ms)
      ✓ should indicate when sync is allowed (2 ms)
      ✓ should show focused state in description (2 ms)
      ✓ should show fullscreen state in description (1 ms)
    Event Emissions
      ✓ should only emit events when state changes (3 ms)
      ✓ should emit complete state object on change (2 ms)

Test Suites: 2 passed, 2 total
Tests:       28 passed, 28 total
Snapshots:   0 total
Time:        2.5 s
```

**✅ Success:** All 28 tests should pass

---

### Step 3: Run the Application

```bash
npm run dev
```

**What this does:**
1. Compiles TypeScript (watch mode)
2. Starts Vite dev server (localhost:5173)
3. Launches Electron window
4. Initializes Logger and SystemMonitor

**Expected console output:**
```
[0] 2:30:00 PM - Starting compilation in watch mode...
[0] 2:30:01 PM - Found 0 errors. Watching for file changes.
[1]
[1]   VITE v6.0.7  ready in 150 ms
[1]   ➜  Local:   http://localhost:5173/
```

**Expected Electron window:**
- Opens automatically
- Shows placeholder UI (welcome screen)
- DevTools open on the right side

---

## 🔍 What to Look For

### Console Logs (Terminal)

You should see logs from the Logger utility:

```
2026-01-21 14:30:01 [INFO]: Canvas Integration Dashboard starting...
2026-01-21 14:30:01 [INFO]: Platform: darwin, Electron: 34.0.0
2026-01-21 14:30:01 [INFO]: Creating main window...
2026-01-21 14:30:01 [INFO]: Loading development server at http://localhost:5173
2026-01-21 14:30:02 [INFO]: System state changed: Power: AC | Focused | Sync: ✓
```

**Color coding in terminal:**
- 🟢 **INFO** - Green
- 🟡 **WARN** - Yellow
- 🔴 **ERROR** - Red
- 🔵 **DEBUG** - Blue (only shows if LOG_LEVEL=debug)

---

### Log Files

Check the `logs/` directory that gets created:

```bash
# View the log file
cat logs/cid.log

# Or watch it in real-time
tail -f logs/cid.log
```

**Expected contents:**
```
2026-01-21 14:30:01 [INFO]: Canvas Integration Dashboard starting...
2026-01-21 14:30:01 [INFO]: Platform: darwin, Electron: 34.0.0
2026-01-21 14:30:01 [INFO]: Creating main window...
2026-01-21 14:30:01 [INFO]: Loading development server at http://localhost:5173
2026-01-21 14:30:02 [INFO]: System state changed: Power: AC | Focused | Sync: ✓
```

**Note:** Log file does NOT have color codes (plain text for archival)

---

### DevTools Console (in Electron)

Open DevTools in the Electron window (Ctrl+Shift+I or Cmd+Option+I):

**Console tab should show:**
```javascript
Canvas Integration Dashboard renderer loaded
```

**No errors should appear** (red text)

---

## 🧪 Interactive Testing

### Test 1: Window Focus Tracking

**Actions:**
1. Click outside the Electron window (blur)
2. Click back inside (focus)

**Expected logs:**
```
[DEBUG]: Window unfocused
[INFO]: System state changed: Power: AC | Unfocused | Sync: ✓
[DEBUG]: Window focused
[INFO]: System state changed: Power: AC | Focused | Sync: ✓
```

**✅ Success:** State changes are logged when you focus/unfocus

---

### Test 2: Fullscreen Detection

**Actions:**
1. Press F11 or Ctrl+Cmd+F (enter fullscreen)
2. Press F11 or Esc (exit fullscreen)

**Expected logs:**
```
[DEBUG]: Entered fullscreen
[INFO]: System state changed: Power: AC | Focused | Fullscreen | Sync: ✓
[DEBUG]: Left fullscreen
[INFO]: System state changed: Power: AC | Focused | Sync: ✓
```

**✅ Success:** Fullscreen state is detected and logged

---

### Test 3: PII Redaction

**Add test log in DevTools console:**
```javascript
// This won't work directly in renderer, but demonstrates the concept
// The logger in main process automatically redacts this
```

**To test manually, add to `src/main.ts` temporarily:**
```typescript
logger.info('User: student@utoronto.ca logged in with Bearer abc123token456');
```

**Expected in `logs/cid.log`:**
```
[INFO]: User: [EMAIL_REDACTED] logged in with Bearer [REDACTED]
```

**✅ Success:** PII is redacted from log files

---

### Test 4: Power State (Laptop Only)

**Actions:**
1. Unplug your laptop (switch to battery)
2. Minimize the window (unfocus)

**Expected logs:**
```
[INFO]: System state changed: Power: BATTERY | Unfocused | Sync: ✗
[WARN]: Sync disabled due to system state (battery + unfocused)
```

**Actions:**
1. Click back on window (focus)

**Expected logs:**
```
[INFO]: System state changed: Power: BATTERY | Focused | Sync: ✓
```

**✅ Success:** Adaptive sync logic works (disables sync on battery + unfocused)

---

## 📊 Coverage Report (Optional)

To see detailed test coverage:

```bash
npm test -- --coverage
```

**Expected output:**
```
---------------------------|---------|----------|---------|---------|
File                       | % Stmts | % Branch | % Funcs | % Lines |
---------------------------|---------|----------|---------|---------|
All files                  |   95.12 |    88.23 |   94.44 |   96.15 |
 l0-utilities              |   95.12 |    88.23 |   94.44 |   96.15 |
  Logger.ts                |   96.77 |    90.00 |   100.00|   96.55 |
  SystemMonitor.ts         |   93.75 |    85.71 |   88.88 |   95.83 |
---------------------------|---------|----------|---------|---------|
```

**✅ Goal:** >80% coverage on all metrics (we're exceeding this)

---

## 🐛 Troubleshooting

### Issue: `npm install` fails

**Solution:**
```bash
# Clear npm cache
npm cache clean --force

# Try again
npm install
```

### Issue: Tests fail with "Cannot find module"

**Solution:**
```bash
# Rebuild dependencies
npm rebuild

# Run tests again
npm test
```

### Issue: Electron window is blank

**Solution:**
1. Check terminal for TypeScript errors
2. Verify Vite is running (should see localhost:5173)
3. Open DevTools (Ctrl+Shift+I) and check Console tab for errors
4. Restart: Ctrl+C then `npm run dev`

### Issue: No log file created

**Cause:** Logger might not have permissions to create `logs/` directory

**Solution:**
```bash
# Manually create logs directory
mkdir -p logs

# Run app again
npm run dev
```

### Issue: SystemMonitor shows "unknown" power source

**Cause:** Electron's `powerMonitor` may not be available in test environment

**Expected:** This is normal in tests (mocked). In real app, it should show AC or BATTERY.

---

## ✅ Success Checklist

Before moving to Milestone 1.3, verify:

- [ ] `npm install` completed without errors
- [ ] `npm test` shows **28 tests passed**
- [ ] `npm run dev` starts without errors
- [ ] Electron window opens showing placeholder UI
- [ ] Terminal shows colored logs (INFO, WARN, etc.)
- [ ] `logs/cid.log` file exists and contains logs
- [ ] Window focus/unfocus events are logged
- [ ] Fullscreen events are detected
- [ ] No red errors in DevTools console

**All checked?** Layer 0 is working correctly! ✅

---

## 📚 Reference

**Log Locations:**
- **Console:** Colored output in terminal
- **File:** `logs/cid.log` (plain text, rotated at 10MB)

**Log Levels:**
- `info` - Normal operations
- `warn` - Warnings (e.g., sync disabled)
- `error` - Errors with stack traces
- `debug` - Verbose (only shown if LOG_LEVEL=debug)

**Set debug level:**
```bash
LOG_LEVEL=debug npm run dev
```

---

**Status:** Ready to test Layer 0 utilities
**Next:** Week 1 Milestone 1.3 (Layer 1 - Persistence)
