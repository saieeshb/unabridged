# cc-exporter installer for Windows (PowerShell 5.1 or 7+).
#   irm https://raw.githubusercontent.com/saieeshb/cc-exporter/main/install.ps1 | iex
#
# Installs the `cc-exporter` command, and the Claude Code plugin when `claude` is on PATH.
# Environment overrides: CC_EXPORTER_REF (tag, branch or commit), CC_EXPORTER_HOME, CC_EXPORTER_NO_PLUGIN=1
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$Repo = 'saieeshb/cc-exporter'
$HomeDir = if ($env:CC_EXPORTER_HOME) { $env:CC_EXPORTER_HOME } else { Join-Path $env:LOCALAPPDATA 'cc-exporter' }
$AppDir = Join-Path $HomeDir 'app'
$BinDir = Join-Path $HomeDir 'bin'

function Say($msg) { Write-Host "> $msg" -ForegroundColor Magenta }

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js 18 or newer is required: https://nodejs.org (or: winget install OpenJS.NodeJS.LTS)' }
$major = [int](& node -p "process.versions.node.split('.')[0]")
if ($major -lt 18) { throw "Node.js 18 or newer is required (found $(& node -v))." }

$Ref = $env:CC_EXPORTER_REF
if (-not $Ref) {
  try { $Ref = (Invoke-RestMethod -UseBasicParsing "https://api.github.com/repos/$Repo/releases/latest").tag_name } catch { $Ref = 'main' }
  if (-not $Ref) { $Ref = 'main' }
}

Say "Installing cc-exporter ($Ref) into $HomeDir"
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("cc-exporter-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  $zip = Join-Path $tmp 'src.zip'
  Invoke-WebRequest -UseBasicParsing "https://github.com/$Repo/archive/$Ref.zip" -OutFile $zip
  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  $src = Get-ChildItem -Path $tmp -Directory | Select-Object -First 1
  if (-not (Test-Path (Join-Path $src.FullName 'bin\cc-exporter.mjs'))) { throw "The download doesn't look like cc-exporter." }
  if (Test-Path $AppDir) { Remove-Item -Recurse -Force $AppDir }
  New-Item -ItemType Directory -Force -Path $HomeDir | Out-Null
  Move-Item -Path $src.FullName -Destination $AppDir
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
Set-Content -Path (Join-Path $BinDir 'cc-exporter.cmd') -Encoding ASCII -Value "@echo off`r`nnode `"%~dp0..\app\bin\cc-exporter.mjs`" %*"
Say "Command installed: $(Join-Path $BinDir 'cc-exporter.cmd')"

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not (($userPath -split ';') -contains $BinDir)) {
  $newPath = (@($userPath, $BinDir) | Where-Object { $_ }) -join ';'
  [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
  $env:Path = "$env:Path;$BinDir"
  Say "Added $BinDir to your user PATH (open a new terminal to pick it up)"
}

if (-not $env:CC_EXPORTER_NO_PLUGIN -and (Get-Command claude -ErrorAction SilentlyContinue)) {
  Say 'Adding the Claude Code plugin (slash command, skill, MCP connector)'
  & claude plugin marketplace add $Repo 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { & claude plugin marketplace update cc-exporter 2>$null | Out-Null }
  & claude plugin install cc-exporter@cc-exporter 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { Say 'Plugin installed. In Claude Code, run /reload-plugins or start a new session, then /export-chat' }
  else { Say "Couldn't install the plugin automatically. In Claude Code run: /plugin install cc-exporter@cc-exporter" }
}

Say 'Done. Try:  cc-exporter --list'
