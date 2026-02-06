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

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

; Variables for cleanup options
Var DeleteCredentialsCheckbox
Var DeleteAppDataCheckbox
Var DeleteDownloadsCheckbox
Var DeleteCredentials
Var DeleteAppData
Var DeleteDownloads

; ============================================================================
; customRemoveFiles - Runs BEFORE files are deleted
; This is where we show the cleanup dialog and run the cleanup script
; ============================================================================

!macro customRemoveFiles
    ; Show cleanup options dialog
    Call un.ShowCleanupDialog

    ; Copy cleanup script to temp before app files are removed
    CopyFiles /SILENT "$INSTDIR\resources\cleanup.ps1" "$TEMP\canvas-cleanup.ps1"

    ; Run cleanup with user-selected options
    Call un.RunCleanupScript

    ; Clean up temp file
    Delete "$TEMP\canvas-cleanup.ps1"
!macroend

; ============================================================================
; Cleanup Dialog Function
; ============================================================================

Function un.ShowCleanupDialog
    ; Initialize with default values
    StrCpy $DeleteCredentials ${BST_CHECKED}
    StrCpy $DeleteAppData ${BST_CHECKED}
    StrCpy $DeleteDownloads ${BST_UNCHECKED}

    nsDialogs::Create 1018
    Pop $0

    ${If} $0 == error
        Return
    ${EndIf}

    ; Title
    ${NSD_CreateLabel} 0 0 100% 24u "Remove personal data?"
    Pop $0
    CreateFont $1 "Segoe UI" 11 700
    SendMessage $0 ${WM_SETFONT} $1 0

    ; Description
    ${NSD_CreateLabel} 0 28u 100% 24u "Canvas Assistant will be uninstalled. Choose what data to remove:"
    Pop $0

    ; Checkbox: Delete credentials (checked by default)
    ${NSD_CreateCheckbox} 12u 60u -24u 14u "Remove stored Canvas API credentials"
    Pop $DeleteCredentialsCheckbox
    ${NSD_SetState} $DeleteCredentialsCheckbox ${BST_CHECKED}

    ; Checkbox: Delete app data (checked by default)
    ${NSD_CreateCheckbox} 12u 78u -24u 14u "Remove application data (settings, database, logs)"
    Pop $DeleteAppDataCheckbox
    ${NSD_SetState} $DeleteAppDataCheckbox ${BST_CHECKED}

    ; Checkbox: Delete downloads (unchecked by default - user might want to keep files)
    ${NSD_CreateCheckbox} 12u 96u -24u 14u "Remove downloaded course files"
    Pop $DeleteDownloadsCheckbox
    ${NSD_SetState} $DeleteDownloadsCheckbox ${BST_UNCHECKED}

    ; Tip text
    ${NSD_CreateLabel} 0 124u 100% 24u "Tip: Uncheck all options to keep your data for future reinstalls."
    Pop $0
    SetCtlColors $0 0x666666 transparent

    nsDialogs::Show

    ; Capture checkbox states after dialog closes
    ${NSD_GetState} $DeleteCredentialsCheckbox $DeleteCredentials
    ${NSD_GetState} $DeleteAppDataCheckbox $DeleteAppData
    ${NSD_GetState} $DeleteDownloadsCheckbox $DeleteDownloads
FunctionEnd

; ============================================================================
; Run Cleanup Script Function
; ============================================================================

Function un.RunCleanupScript
    ; Check if any cleanup option is selected
    ${If} $DeleteCredentials != ${BST_CHECKED}
    ${AndIf} $DeleteAppData != ${BST_CHECKED}
    ${AndIf} $DeleteDownloads != ${BST_CHECKED}
        ; Nothing selected, skip cleanup
        Return
    ${EndIf}

    ; Check if cleanup script exists
    IfFileExists "$TEMP\canvas-cleanup.ps1" 0 cleanup_done

    ; Build PowerShell arguments
    StrCpy $0 "-ExecutionPolicy Bypass -NoProfile -File $\"$TEMP\canvas-cleanup.ps1$\""

    ${If} $DeleteCredentials == ${BST_CHECKED}
        StrCpy $0 "$0 -DeleteCredentials"
    ${EndIf}

    ${If} $DeleteAppData == ${BST_CHECKED}
        StrCpy $0 "$0 -DeleteAppData"
    ${EndIf}

    ${If} $DeleteDownloads == ${BST_CHECKED}
        StrCpy $0 "$0 -DeleteDownloads"
    ${EndIf}

    StrCpy $0 "$0 -Silent"

    ; Execute PowerShell cleanup script
    nsExec::ExecToLog 'powershell.exe $0'
    Pop $1

    ; If cleanup had issues, show a message (non-blocking)
    ${If} $1 != 0
        MessageBox MB_OK|MB_ICONINFORMATION "Some data could not be fully removed. You may need to manually delete:$\n$\n%APPDATA%\CanvasAssistant"
    ${EndIf}

cleanup_done:
FunctionEnd

; ============================================================================
; customInstall - Nothing special needed during install
; ============================================================================

!macro customInstall
!macroend
