[CmdletBinding()]
param(
    [string]$HealthUrl = 'http://127.0.0.1:8787/health'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

try {
    $health = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 10
    $lastErrorCode = if ($null -ne $health.lastError) { [string]$health.lastError.code } else { $null }
    $summary = [ordered]@{
        healthy = [bool]$health.ok
        status = [string]$health.status
        edgeConnected = [bool]$health.edgeConnected
        browserReady = [bool]$health.browser.ready
        extensionInstalled = [bool]$health.browser.extensionInstalled
        extensionConfigured = [bool]$health.browser.extensionConfigured
        phase = [string]$health.browser.phase
        lastHeartbeatAt = $health.lastHeartbeatAt
        lastErrorCode = $lastErrorCode
    }
    $summary | ConvertTo-Json
    if ($health.ok) { exit 0 }
    exit 1
} catch {
    [ordered]@{
        healthy = $false
        status = 'unreachable'
        message = 'The loopback Sync Station health endpoint is unavailable.'
    } | ConvertTo-Json
    exit 1
}
