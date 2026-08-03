[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$ConfigPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$nodeProcess = $null
$browserProcess = $null

function Stop-ChildProcess {
    param([System.Diagnostics.Process]$Process)
    if ($Process -and -not $Process.HasExited) {
        Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
    }
}

try {
    $resolvedConfigPath = (Resolve-Path -LiteralPath $ConfigPath).Path
    $config = Get-Content -LiteralPath $resolvedConfigPath -Raw | ConvertFrom-Json
    foreach ($field in @('functionUrl', 'stationId', 'repositoryRoot', 'nodePath', 'browserPath', 'dataRoot')) {
        if (-not $config.$field) { throw "Sync Station configuration is missing $field." }
    }

    $serverPath = Join-Path $config.repositoryRoot 'sync-station\server.mjs'
    $extensionPath = Join-Path $config.repositoryRoot 'townsquare-bridge-extension'
    $tokenPath = Join-Path $config.dataRoot 'station-token.dpapi'
    $profilePath = Join-Path $config.dataRoot 'browser-profile'
    $logPath = Join-Path $config.dataRoot 'logs'
    foreach ($requiredFile in @($config.nodePath, $config.browserPath, $serverPath, (Join-Path $extensionPath 'manifest.json'), $tokenPath)) {
        if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
            throw "Required Sync Station file not found: $requiredFile"
        }
    }
    New-Item -ItemType Directory -Path $profilePath -Force | Out-Null
    New-Item -ItemType Directory -Path $logPath -Force | Out-Null

    $encryptedToken = (Get-Content -LiteralPath $tokenPath -Raw).Trim()
    $secureToken = ConvertTo-SecureString -String $encryptedToken
    $tokenPointer = [IntPtr]::Zero
    try {
        $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
        $env:ROOMFLOW_STATION_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
        $env:ROOMFLOW_FUNCTION_URL = [string]$config.functionUrl
        $env:ROOMFLOW_STATION_ID = [string]$config.stationId
        $env:ROOMFLOW_STATION_VERSION = '1.0.0-windows'

        $nodeProcess = Start-Process `
            -FilePath $config.nodePath `
            -ArgumentList @("`"$serverPath`"") `
            -WorkingDirectory $config.repositoryRoot `
            -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $logPath 'controller.stdout.log') `
            -RedirectStandardError (Join-Path $logPath 'controller.stderr.log') `
            -PassThru
    } finally {
        if ($tokenPointer -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
        }
        Remove-Item Env:ROOMFLOW_STATION_TOKEN -ErrorAction SilentlyContinue
        Remove-Item Env:ROOMFLOW_FUNCTION_URL -ErrorAction SilentlyContinue
        Remove-Item Env:ROOMFLOW_STATION_ID -ErrorAction SilentlyContinue
        Remove-Item Env:ROOMFLOW_STATION_VERSION -ErrorAction SilentlyContinue
    }

    $controllerReady = $false
    for ($attempt = 0; $attempt -lt 45; $attempt++) {
        if ($nodeProcess.HasExited) {
            throw "The Sync Station controller exited with code $($nodeProcess.ExitCode)."
        }
        try {
            Invoke-RestMethod -Uri 'http://127.0.0.1:8787/health' -TimeoutSec 2 | Out-Null
            $controllerReady = $true
            break
        } catch {
            Start-Sleep -Seconds 1
        }
    }
    if (-not $controllerReady) { throw 'The Sync Station controller did not become ready in time.' }

    $browserArguments = @(
        "--user-data-dir=`"$profilePath`"",
        "--load-extension=`"$extensionPath`"",
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--restore-last-session',
        'http://127.0.0.1:8787/station'
    )
    $browserProcess = Start-Process `
        -FilePath $config.browserPath `
        -ArgumentList $browserArguments `
        -WorkingDirectory $config.repositoryRoot `
        -WindowStyle Normal `
        -RedirectStandardOutput (Join-Path $logPath 'browser.stdout.log') `
        -RedirectStandardError (Join-Path $logPath 'browser.stderr.log') `
        -PassThru

    Write-Output 'ROOMFLOW_SYNC_STATION_READY'
    while ($true) {
        Start-Sleep -Seconds 2
        if ($nodeProcess.HasExited) {
            throw "The Sync Station controller exited with code $($nodeProcess.ExitCode)."
        }
        if ($browserProcess.HasExited) {
            throw "The dedicated browser exited with code $($browserProcess.ExitCode)."
        }
    }
} catch {
    Write-Error "RoomFlow Sync Station stopped: $($_.Exception.Message)"
    exit 1
} finally {
    Remove-Item Env:ROOMFLOW_STATION_TOKEN -ErrorAction SilentlyContinue
    Stop-ChildProcess -Process $browserProcess
    Stop-ChildProcess -Process $nodeProcess
}
