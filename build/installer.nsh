; Canvas Assistant Custom NSIS Installer/Uninstaller Script
; Included by electron-builder during NSIS build
;
; Adds cleanup options during uninstallation to remove:
; - Stored credentials (Windows Credential Manager)
; - Application data (settings, database, logs)
; - Downloaded course files

; Suppress warning 6020 (uninstaller code without WriteUninstaller) -
; electron-builder's uninstaller build pass doesn't call WriteUninstaller
; because the output IS the uninstaller. The installer pass does call it.
!pragma warning disable 6020
!pragma warning disable 6001

!include "LogicLib.nsh"

; Variables for cleanup options
Var DeleteCredentials
Var DeleteAppData
Var DeleteDownloads

; ============================================================================
; customRemoveFiles - Runs BEFORE files are deleted
; Uses MessageBox prompts (nsDialogs doesn't work in this macro context)
; ============================================================================

!macro customRemoveFiles
    ; Initialize defaults - keep everything unless the user opts to delete.
    StrCpy $DeleteCredentials "0"
    StrCpy $DeleteAppData "0"
    StrCpy $DeleteDownloads "0"

    ; --- Choice 1: downloaded course files ---------------------------------
    ; Stored in Documents\CanvasAssistant\Downloads (outside the install dir).
    ; Yes = keep, No = delete; default highlighted button is 'Yes' (keep).
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON1 "Keep your downloaded course files?$\n$\nThey live in your Documents\CanvasAssistant folder.$\n$\nClick 'Yes' to keep them, or 'No' to permanently delete them." IDYES keep_downloads
    StrCpy $DeleteDownloads "1"
    keep_downloads:

    ; --- Choice 2: settings, data & saved sign-in --------------------------
    ; The app-data folder (settings, local database, logs) + the Canvas token
    ; in Windows Credential Manager. Kept together so a future reinstall picks
    ; up where you left off. Yes = keep, No = delete.
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON1 "Keep your settings and preferences?$\n$\nThis includes your app settings, local database, and saved Canvas sign-in - kept for a future reinstall.$\n$\nClick 'Yes' to keep them, or 'No' to permanently delete them." IDYES keep_appdata
    StrCpy $DeleteAppData "1"
    StrCpy $DeleteCredentials "1"
    keep_appdata:

    ; Run the PowerShell cleanup only if the user chose to delete something.
    ${If} $DeleteAppData == "1"
    ${OrIf} $DeleteDownloads == "1"
        ; Copy cleanup script to temp before app files are removed
        CopyFiles /SILENT "$INSTDIR\resources\cleanup.ps1" "$TEMP\canvas-cleanup.ps1"
        Call un.RunCleanupScript
        Delete "$TEMP\canvas-cleanup.ps1"
    ${EndIf}

    ; NSIS fallback: directly remove app data directories if PowerShell missed them
    ${If} $DeleteAppData == "1"
        RMDir /r "$APPDATA\canvas-integration-dashboard"
        RMDir /r "$LOCALAPPDATA\canvas-integration-dashboard"
    ${EndIf}

    ; Remove all installed app files (default behavior we replaced by defining this macro)
    RMDir /r $INSTDIR
!macroend

; ============================================================================
; Run Cleanup Script Function
; ============================================================================

Function un.RunCleanupScript
    ; Check if cleanup script exists
    IfFileExists "$TEMP\canvas-cleanup.ps1" 0 cleanup_done

    ; Build PowerShell arguments
    StrCpy $0 "-ExecutionPolicy Bypass -NoProfile -File $\"$TEMP\canvas-cleanup.ps1$\""

    ${If} $DeleteCredentials == "1"
        StrCpy $0 "$0 -DeleteCredentials"
    ${EndIf}

    ${If} $DeleteAppData == "1"
        StrCpy $0 "$0 -DeleteAppData"
    ${EndIf}

    ${If} $DeleteDownloads == "1"
        StrCpy $0 "$0 -DeleteDownloads -InstallDir $\"$INSTDIR$\""
    ${EndIf}

    StrCpy $0 "$0 -Silent"

    ; Execute PowerShell cleanup script
    nsExec::ExecToLog 'powershell.exe $0'
    Pop $1

    ; If cleanup had issues, show a message (non-blocking)
    ${If} $1 != 0
        MessageBox MB_OK|MB_ICONINFORMATION "Some data could not be fully removed. You may need to manually delete:$\n$\n%APPDATA%\canvas-integration-dashboard"
    ${EndIf}

cleanup_done:
FunctionEnd

; ============================================================================
; customInstall - Nothing special needed during install
; ============================================================================

!macro customInstall
!macroend
