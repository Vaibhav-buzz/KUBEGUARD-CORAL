$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$node = $null

if (Test-Path $bundledNode) {
  $node = $bundledNode
} else {
  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if ($nodeCommand) {
    $node = $nodeCommand.Source
  }
}

if (-not $node) {
  Write-Host "Node.js was not found. Install Node.js or run from Codex where the bundled runtime exists."
  exit 1
}

$defaultCoral = Join-Path $env:USERPROFILE ".local\bin\coral.exe"
if (-not $env:CORAL_BIN -and (Test-Path $defaultCoral)) {
  $env:CORAL_BIN = $defaultCoral
}

Set-Location $projectRoot
& $node ".\server\live-server.mjs"
