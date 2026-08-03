[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$FunctionUrl,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$StationId,

    [string]$BrowserPath,
    [string]$NodePath,
    [string]$TaskName = 'RoomFlow-Townsquare-Sync-Station',
    [switch]$NoStart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-Executable {
    param(
        [string]$RequestedPath,
        [string]$CommandName,
        [string[]]$Candidates
    )

    if ($RequestedPath) {
        if (-not (Test-Path -LiteralPath $RequestedPath -PathType Leaf)) {
            throw "Executable not found: $RequestedPath"
        }
        return (Resolve-Path -LiteralPath $RequestedPath).Path
    }

    if ($CommandName) {
        $command = Get-Command $CommandName -ErrorAction SilentlyContinue
        if ($command) { return $command.Source }
    }

    foreach ($candidate in $Candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    throw "Could not find $CommandName. Install it or pass its full path explicitly."
}

function Protect-RoomFlowPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [bool]$Container
    )

    $currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $systemSid = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')
    $rights = [System.Security.AccessControl.FileSystemRights]::FullControl
    $allow = [System.Security.AccessControl.AccessControlType]::Allow

    if ($Container) {
        $acl = New-Object System.Security.AccessControl.DirectorySecurity
        $inheritance = [System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
        $propagation = [System.Security.AccessControl.PropagationFlags]::None
    } else {
        $acl = New-Object System.Security.AccessControl.FileSecurity
        $inheritance = [System.Security.AccessControl.InheritanceFlags]::None
        $propagation = [System.Security.AccessControl.PropagationFlags]::None
    }

    $acl.SetOwner($currentSid)
    $acl.SetAccessRuleProtection($true, $false)
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($currentSid, $rights, $inheritance, $propagation, $allow)))
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($systemSid, $rights, $inheritance, $propagation, $allow)))
    Set-Acl -LiteralPath $Path -AclObject $acl
}

if ($env:OS -ne 'Windows_NT') {
    throw 'The always-on PC installer requires Windows.'
}

$parsedFunctionUrl = $null
if (-not [Uri]::TryCreate($FunctionUrl, [UriKind]::Absolute, [ref]$parsedFunctionUrl)) {
    throw 'FunctionUrl must be a valid absolute URL.'
}
$loopbackHost = $parsedFunctionUrl.Host -in @('localhost', '127.0.0.1', '::1')
if ($parsedFunctionUrl.Scheme -ne 'https' -and -not ($parsedFunctionUrl.Scheme -eq 'http' -and $loopbackHost)) {
    throw 'FunctionUrl must use HTTPS unless it points to the local computer.'
}

$parsedStationId = [Guid]::Empty
if (-not [Guid]::TryParse($StationId, [ref]$parsedStationId)) {
    throw 'StationId must be a valid UUID from the RoomFlow pairing dialog.'
}

$repositoryRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$launcherPath = Join-Path $PSScriptRoot 'start-sync-station.ps1'
$stationServerPath = Join-Path $repositoryRoot 'sync-station\server.mjs'
$extensionPath = Join-Path $repositoryRoot 'townsquare-bridge-extension'
foreach ($requiredPath in @($launcherPath, $stationServerPath, (Join-Path $extensionPath 'manifest.json'))) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "Required RoomFlow file not found: $requiredPath"
    }
}

$NodePath = Resolve-Executable -RequestedPath $NodePath -CommandName 'node.exe' -Candidates @()
$nodeVersionText = (& $NodePath --version 2>$null).Trim()
if ($nodeVersionText -notmatch '^v(?<major>\d+)\.' -or [int]$Matches.major -lt 18) {
    throw "Node.js 18 or newer is required. Found: $nodeVersionText"
}

$browserCandidates = @(
    (Join-Path ${env:ProgramFiles} 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path ${env:ProgramFiles} 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
)
$BrowserPath = Resolve-Executable -RequestedPath $BrowserPath -CommandName '' -Candidates $browserCandidates

$secureToken = Read-Host 'Paste ROOMFLOW_STATION_TOKEN (input is hidden)' -AsSecureString
$tokenPointer = [IntPtr]::Zero
$plainToken = $null
try {
    $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
    if ($plainToken -notmatch '^rfs_.{36,}$') {
        throw 'The station token is not valid. Create a new pairing key in RoomFlow and try again.'
    }
} finally {
    if ($tokenPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
    }
    $plainToken = $null
}

$dataRoot = Join-Path $env:LOCALAPPDATA 'RoomFlow\SyncStation'
$configPath = Join-Path $dataRoot 'config.json'
$tokenPath = Join-Path $dataRoot 'station-token.dpapi'
New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null
Protect-RoomFlowPath -Path $dataRoot -Container $true

$config = [ordered]@{
    version = 1
    functionUrl = $parsedFunctionUrl.AbsoluteUri
    stationId = $parsedStationId.ToString()
    repositoryRoot = (Resolve-Path -LiteralPath $repositoryRoot).Path
    nodePath = $NodePath
    browserPath = $BrowserPath
    dataRoot = $dataRoot
    installedAt = [DateTimeOffset]::UtcNow.ToString('o')
}
$config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
$secureToken | ConvertFrom-SecureString | Set-Content -LiteralPath $tokenPath -Encoding ASCII
Protect-RoomFlowPath -Path $configPath -Container $false
Protect-RoomFlowPath -Path $tokenPath -Container $false

$powershellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$taskArguments = "-NoProfile -ExecutionPolicy Bypass -File `"$launcherPath`" -ConfigPath `"$configPath`""
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute $powershellPath -Argument $taskArguments -WorkingDirectory $repositoryRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description 'Runs the RoomFlow Townsquare draft-only browser extension in an interactive Windows session.' `
    -Force | Out-Null

$existingTask = Get-ScheduledTask -TaskName $TaskName
if (-not $NoStart -and $existingTask.State -ne 'Running') {
    Start-ScheduledTask -TaskName $TaskName
}

Write-Host ''
Write-Host 'RoomFlow Sync Station installed.' -ForegroundColor Green
Write-Host "Task:    $TaskName"
Write-Host "Config:  $configPath"
Write-Host "Browser: $BrowserPath"
Write-Host ''
Write-Host 'Keep this Windows account signed in and disable system sleep. The dedicated browser will open automatically.'
Write-Host 'In this dedicated profile, load the unpacked extension if needed, save the Townsquare URL, and sign in.'
Write-Host "Check health with: powershell.exe -NoProfile -File `"$(Join-Path $PSScriptRoot 'check-sync-station.ps1')`""
