$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$cacheRoot = Join-Path $env:USERPROFILE ".cache"
$bundledNode = Get-ChildItem -Path $cacheRoot -Recurse -Filter node.exe -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -like "*dependencies\node\bin\node.exe" } |
  Select-Object -First 1 -ExpandProperty FullName
$node = $null

if ($bundledNode -and (Test-Path $bundledNode)) {
  $node = $bundledNode
} else {
  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if ($nodeCommand) {
    $node = $nodeCommand.Source
  }
}

if (-not $node) {
  Write-Host "Node.js was not found. Install Node.js or run from the bundled desktop runtime."
  exit 1
}

$defaultCoral = Join-Path $env:USERPROFILE ".local\bin\coral.exe"
if (-not $env:CORAL_BIN -and (Test-Path $defaultCoral)) {
  $env:CORAL_BIN = $defaultCoral
}

Set-Location $projectRoot
& $node ".\server\live-server.mjs"
