# unabridged installer for Windows (PowerShell 5.1 or 7+).
#   irm https://raw.githubusercontent.com/saieeshb/unabridged/main/install.ps1 | iex
#
# Installs the `unabridged` command, then offers to add it to the coding agents it finds
# (Claude Code, Codex, Cursor, Gemini CLI, VS Code, …) — it shows what it will change and asks.
# Environment overrides: UNABRIDGED_REF (tag, branch or commit), UNABRIDGED_HOME, UNABRIDGED_NO_SETUP=1
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$Repo = 'saieeshb/unabridged'
$HomeDir = if ($env:UNABRIDGED_HOME) { $env:UNABRIDGED_HOME } elseif ($env:CC_EXPORTER_HOME) { $env:CC_EXPORTER_HOME } else { Join-Path $env:LOCALAPPDATA 'unabridged' }
$AppDir = Join-Path $HomeDir 'app'
$BinDir = Join-Path $HomeDir 'bin'
$NoSetup = $env:UNABRIDGED_NO_SETUP -or $env:CC_EXPORTER_NO_PLUGIN

function Say($msg) { Write-Host "> $msg" -ForegroundColor Magenta }

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js 18 or newer is required: https://nodejs.org (or: winget install OpenJS.NodeJS.LTS)' }
$major = [int](& node -p "process.versions.node.split('.')[0]")
if ($major -lt 18) { throw "Node.js 18 or newer is required (found $(& node -v))." }

$Ref = if ($env:UNABRIDGED_REF) { $env:UNABRIDGED_REF } else { $env:CC_EXPORTER_REF }
if (-not $Ref) {
  try { $Ref = (Invoke-RestMethod -UseBasicParsing "https://api.github.com/repos/$Repo/releases/latest").tag_name } catch { $Ref = 'main' }
  if (-not $Ref) { $Ref = 'main' }
}

Say "Installing unabridged ($Ref) into $HomeDir"
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("unabridged-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  $zip = Join-Path $tmp 'src.zip'
  Invoke-WebRequest -UseBasicParsing "https://github.com/$Repo/archive/$Ref.zip" -OutFile $zip
  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  $src = Get-ChildItem -Path $tmp -Directory | Select-Object -First 1
  if (-not (Test-Path (Join-Path $src.FullName 'bin\unabridged.mjs'))) { throw "The download doesn't look like unabridged." }
  if (Test-Path $AppDir) { Remove-Item -Recurse -Force $AppDir }
  New-Item -ItemType Directory -Force -Path $HomeDir | Out-Null
  Move-Item -Path $src.FullName -Destination $AppDir
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
foreach ($name in 'unabridged', 'cc-exporter') {
  Set-Content -Path (Join-Path $BinDir "$name.cmd") -Encoding ASCII -Value "@echo off`r`nnode `"%~dp0..\app\bin\unabridged.mjs`" %*"
}
Say "Command installed: $(Join-Path $BinDir 'unabridged.cmd')"

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not (($userPath -split ';') -contains $BinDir)) {
  $newPath = (@($userPath, $BinDir) | Where-Object { $_ }) -join ';'
  [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
  $env:Path = "$env:Path;$BinDir"
  Say "Added $BinDir to your user PATH (open a new terminal to pick it up)"
}

if (-not $NoSetup) {
  if ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
    Say "Adding unabridged to your coding agents (you'll see the changes first)"
    & (Join-Path $BinDir 'unabridged.cmd') setup
  } else {
    Say 'To add it to Claude Code, Codex, Cursor, Gemini CLI and other agents, run: unabridged setup'
  }
}

Say 'Done. Try:  unabridged --list'
