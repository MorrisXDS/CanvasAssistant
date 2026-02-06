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
    ; Initialize defaults - no cleanup
    StrCpy $DeleteCredentials "0"
    StrCpy $DeleteAppData "0"
    StrCpy $DeleteDownloads "0"

    ; Ask user if they want to remove personal data
    MessageBox MB_YESNO|MB_ICONQUESTION "Do you want to remove all personal data?$\n$\n- Stored Canvas API credentials$\n- Application data (settings, database, logs)$\n- Downloaded course files$\n$\nClick 'No' to keep your data for future reinstalls." IDNO skip_cleanup

    StrCpy $DeleteCredentials "1"
    StrCpy $DeleteAppData "1"
    StrCpy $DeleteDownloads "1"

    ; Copy cleanup script to temp before app files are removed
    CopyFiles /SILENT "$INSTDIR\resources\cleanup.ps1" "$TEMP\canvas-cleanup.ps1"

    ; Run cleanup with user-selected options
    Call un.RunCleanupScript

    ; Clean up temp file
    Delete "$TEMP\canvas-cleanup.ps1"

    skip_cleanup:

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
