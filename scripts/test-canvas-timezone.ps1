# Test Canvas API timezone settings
# Usage: .\test-canvas-timezone.ps1

$token = $env:CANVAS_ACCESS_TOKEN
$baseUrl = "https://q.utoronto.ca"

if (-not $token) {
    Write-Host "Error: CANVAS_ACCESS_TOKEN environment variable not set" -ForegroundColor Red
    Write-Host "Set it with: `$env:CANVAS_ACCESS_TOKEN = 'your_token_here'"
    exit 1
}

Write-Host "Fetching Canvas user settings..." -ForegroundColor Cyan

# User settings endpoint
$settingsUrl = "$baseUrl/api/v1/users/self/settings"
Write-Host "`nGET $settingsUrl" -ForegroundColor Yellow

try {
    $settings = Invoke-RestMethod -Uri $settingsUrl -Headers @{
        "Authorization" = "Bearer $token"
    }
    Write-Host "`n=== User Settings ===" -ForegroundColor Green
    $settings | ConvertTo-Json -Depth 5
} catch {
    Write-Host "Settings endpoint failed: $_" -ForegroundColor Red
}

# User profile endpoint (may also have timezone)
$profileUrl = "$baseUrl/api/v1/users/self/profile"
Write-Host "`nGET $profileUrl" -ForegroundColor Yellow

try {
    $profile = Invoke-RestMethod -Uri $profileUrl -Headers @{
        "Authorization" = "Bearer $token"
    }
    Write-Host "`n=== User Profile ===" -ForegroundColor Green
    $profile | ConvertTo-Json -Depth 5
} catch {
    Write-Host "Profile endpoint failed: $_" -ForegroundColor Red
}

# Self endpoint
$selfUrl = "$baseUrl/api/v1/users/self"
Write-Host "`nGET $selfUrl" -ForegroundColor Yellow

try {
    $self = Invoke-RestMethod -Uri $selfUrl -Headers @{
        "Authorization" = "Bearer $token"
    }
    Write-Host "`n=== User Self ===" -ForegroundColor Green
    $self | ConvertTo-Json -Depth 5
} catch {
    Write-Host "Self endpoint failed: $_" -ForegroundColor Red
}
