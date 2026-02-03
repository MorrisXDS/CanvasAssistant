# Cross-Platform In-App Uninstall Feature Plan

## Status: IMPLEMENTED

## Overview

Add an "Uninstall Canvas Assistant" option in Settings that provides a consistent experience across Windows, macOS, and Linux.

---

## User Flow

```
Settings Page → Danger Zone Section → "Uninstall App" button
                        │
                        ▼
         ┌──────────────────────────────────┐
         │     Uninstall Canvas Assistant    │
         │                                   │
         │  Select what to remove:           │
         │  ☑ Canvas API credentials         │
         │  ☑ App data (settings, database)  │
         │  ☐ Downloaded course files        │
         │                                   │
         │  [Cancel]  [Uninstall & Remove]   │
         └──────────────────────────────────┘
                        │
                        ▼
              Run cleanup (all platforms)
                        │
                        ▼
         ┌──────────────────────────────────┐
         │  Platform-specific instructions   │
         │                                   │
         │  Windows: "Opening uninstaller..."│
         │           (auto-launches)         │
         │                                   │
         │  macOS: "Drag app to Trash"       │
         │         + Show in Finder button   │
         │                                   │
         │  Linux: "Delete AppImage or run:  │
         │         sudo apt remove ..."      │
         └──────────────────────────────────┘
```

---

## Implementation Steps

### 1. Backend (IPC Handler)

**File:** `src/ipc-handlers/appHandlers.ts`

- Add `app:prepareUninstall` handler
- Options: `{ deleteCredentials, deleteAppData, deleteDownloads }`
- Reuse existing `resetAppState()` logic
- Return platform-specific next steps

### 2. Preload API

**File:** `src/preload.ts`

- Expose `prepareUninstall(options)` method
- Expose `getAppPath()` for showing app location
- Expose `launchUninstaller()` for Windows

### 3. Frontend Modal

**File:** `src/layers/l6-ui/components/Settings/UninstallModal.tsx` (new)

- Checkbox options matching NSIS dialog
- Warning text about data loss
- Platform-aware instruction display
- Confirm button with "type UNINSTALL to confirm" safety

### 4. Settings Page Integration

**File:** `src/layers/l6-ui/components/pages/SettingsPage.tsx`

- Add "Danger Zone" section at bottom
- Red-styled "Uninstall App" button
- Opens UninstallModal

### 5. Platform Actions

| Platform | After Cleanup                               |
| -------- | ------------------------------------------- |
| Windows  | Auto-launch `unins000.exe` from install dir |
| macOS    | Open Finder at `/Applications`              |
| Linux    | Show terminal command to copy               |

---

## Files to Create/Modify

| File                                                      | Action                             |
| --------------------------------------------------------- | ---------------------------------- |
| `src/ipc-handlers/appHandlers.ts`                         | Add `app:prepareUninstall` handler |
| `src/preload.ts`                                          | Expose uninstall API               |
| `src/layers/l6-ui/components/Settings/UninstallModal.tsx` | **New** - Modal component          |
| `src/layers/l6-ui/components/pages/SettingsPage.tsx`      | Add Danger Zone section            |

---

## Safety Measures

1. **Confirmation required** - Type "UNINSTALL" to proceed
2. **Downloaded files unchecked by default** - Preserve user's course materials
3. **Clear warnings** - Explain what will be deleted
4. **No auto-quit on macOS/Linux** - Let user see instructions first

---

## Already Implemented (NSIS Windows Uninstaller)

The following files already exist for Windows NSIS uninstaller:

- `build/installer.nsh` - Custom NSIS script with cleanup dialog
- `build/uninstall/cleanup.ps1` - Windows PowerShell cleanup script
- `build/uninstall/cleanup-macos.sh` - macOS cleanup script (manual use)

The in-app uninstall feature will complement these by providing a GUI option that works before the OS-level uninstall.

---

## Related Code

- `resetAppState()` in `src/main.ts` (lines 414-580) - Existing cleanup logic
- `data:clearAll` IPC handler in `src/ipc-handlers/dataHandlers.ts` - Existing clear data handler
- `CredentialManager.delete()` in `src/layers/l0-utilities/CredentialManager.ts` - Credential deletion

---

## Implementation Notes (Completed 2026-02-03)

### Files Created

| File                                                      | Purpose                                                                             |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/layers/l6-ui/components/Settings/UninstallModal.tsx` | Modal component with multi-phase flow (options → confirm → cleaning → instructions) |

### Files Modified

| File                                                   | Changes                                                                                                                                                               |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ipc-handlers/appHandlers.ts`                      | Added 6 new IPC handlers: `app:prepareUninstall`, `app:getAppPath`, `app:getPlatform`, `app:launchUninstaller`, `app:openAppLocation`, `app:getLinuxUninstallCommand` |
| `src/preload.ts`                                       | Exposed uninstall API: `prepareUninstall()`, `getAppPath()`, `getPlatform()`, `launchUninstaller()`, `openAppLocation()`, `getLinuxUninstallCommand()`                |
| `src/layers/l6-ui/components/Settings/DataSection.tsx` | Added uninstall button in Danger Zone section                                                                                                                         |
| `src/layers/l6-ui/components/Settings/index.ts`        | Exported `UninstallModal`                                                                                                                                             |

### Platform-Specific Behavior

- **Windows**: Launches `unins000.exe` from install directory, then quits app
- **macOS**: Opens Finder at app bundle location
- **Linux**: Shows terminal command (AppImage: `rm`, deb: `apt remove`)

### Known Limitations

- **Development mode (`npx electron .`)**: Uninstall feature does not work in dev mode because:
  - No `unins000.exe` exists (only created by NSIS packaging)
  - App paths point to source directory, not installed location
  - Test only in packaged builds (`npm run package`)

### User Flow

1. Settings → Data Management → Danger Zone → "Uninstall" button
2. Select cleanup options (credentials, app data, downloads)
3. Type "UNINSTALL" to confirm
4. Cleanup runs
5. Platform-specific instructions displayed
