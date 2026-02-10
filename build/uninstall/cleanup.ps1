# Canvas Assistant Uninstall Cleanup Script
# Called by the NSIS uninstaller to remove user data from Windows systems.
#
# Parameters (passed by installer.nsh):
#   -DeleteCredentials  Remove Canvas API token from Windows Credential Manager
#   -DeleteAppData      Remove app config, database, and log directories
#   -DeleteDownloads    Remove downloaded course files from the install directory
#   -InstallDir <path>  Path to the application install directory
#   -Silent             Suppress interactive prompts

param(
    [switch]$DeleteCredentials,
    [switch]$DeleteAppData,
    [switch]$DeleteDownloads,
    [string]$InstallDir,
    [switch]$Silent
)

$ErrorActionPreference = 'SilentlyContinue'
$exitCode = 0

# --- Credentials ---
if ($DeleteCredentials) {
    # Remove the Canvas API token stored via keytar / Windows Credential Manager.
    # keytar stores credentials as "CanvasIntegrationDashboard/canvas-api-token".
    $target = "CanvasIntegrationDashboard/canvas-api-token"
    $result = cmdkey /delete:$target 2>&1
    if ($LASTEXITCODE -ne 0) {
        # Try alternate target format (service:account)
        cmdkey /delete:"CanvasIntegrationDashboard:canvas-api-token" 2>&1 | Out-Null
    }
}

# --- App Data ---
if ($DeleteAppData) {
    $appDataRoaming = Join-Path $env:APPDATA "canvas-integration-dashboard"
    $appDataLocal   = Join-Path $env:LOCALAPPDATA "canvas-integration-dashboard"

    if (Test-Path $appDataRoaming) {
        Remove-Item -Path $appDataRoaming -Recurse -Force
        if (Test-Path $appDataRoaming) { $exitCode = 1 }
    }

    if (Test-Path $appDataLocal) {
        Remove-Item -Path $appDataLocal -Recurse -Force
        if (Test-Path $appDataLocal) { $exitCode = 1 }
    }
}

# --- Downloaded Course Files ---
if ($DeleteDownloads -and $InstallDir) {
    $downloadsDir = Join-Path $InstallDir "Downloads"
    if (Test-Path $downloadsDir) {
        Remove-Item -Path $downloadsDir -Recurse -Force
        if (Test-Path $downloadsDir) { $exitCode = 1 }
    }
}

exit $exitCode
