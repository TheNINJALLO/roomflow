$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$assetRoot = Join-Path $repoRoot 'app\src\main\assets'
$webFiles = @(
    'app.js',
    'config.js',
    'cost-engine.js',
    'cost-ui.js',
    'document-workflow.js',
    'index.html',
    'roomflow-integrations.js',
    'styles.css',
    'work-order.js'
)

foreach ($file in $webFiles) {
    $source = Join-Path $repoRoot $file
    $destination = Join-Path $assetRoot $file

    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "Missing web asset: $source"
    }

    Copy-Item -LiteralPath $source -Destination $destination -Force
    Write-Host "Synced $file"
}

Write-Host "Android web assets are synchronized."
