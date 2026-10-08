<#
.SYNOPSIS
  Reports which build revision https://aagaam.in is actually serving.

.DESCRIPTION
  AAGAM deploys only from `main` via .github/workflows/deploy.yml (~35 min).
  A fix that is committed and green in CI is still absent from the live site
  until GET /api/health reports its SHA. This script prints both sides so a
  test report can state exactly what was exercised.

  /api/health returns:
    { status, service, revision, timestamp, uptimeSeconds }
  `revision` is process.env.DEPLOY_SHA, or the literal "development" when the
  process was started outside a deploy.

.EXAMPLE
  .\scripts\live-revision.ps1
  .\scripts\live-revision.ps1 -BaseUrl https://aagaam.in/api
#>
[CmdletBinding()]
param(
  [string]$BaseUrl = "https://aagaam.in/api",
  # Local git ref to compare against. Pass -NoGit to skip the comparison.
  [string]$Ref = "origin/main",
  [switch]$NoGit
)

$ErrorActionPreference = "Stop"

function Write-Step($text) { Write-Host $text -ForegroundColor Cyan }

try {
  $health = Invoke-RestMethod -Uri "$BaseUrl/health" -TimeoutSec 20
}
catch {
  Write-Error "Could not reach $BaseUrl/health - $($_.Exception.Message)"
  exit 2
}

$served = [string]$health.revision
Write-Host ""
Write-Host "Live revision : $served" -ForegroundColor Green
Write-Host "Service       : $($health.service) ($($health.status))"
Write-Host "Served at     : $($health.timestamp)"
Write-Host "Uptime        : $($health.uptimeSeconds)s"
Write-Host ""

if ($NoGit) { exit 0 }

$gitDir = Join-Path $PSScriptRoot "..\.git"
if (-not (Test-Path $gitDir)) {
  Write-Host "No git repository next to this script; skipping comparison." -ForegroundColor DarkGray
  exit 0
}

Push-Location (Join-Path $PSScriptRoot "..")
try {
  $local = (git rev-parse $Ref 2>$null)
  if (-not $local) {
    Write-Host "Ref '$Ref' not resolvable locally; skipping comparison." -ForegroundColor DarkYellow
    exit 0
  }

  $dirty = (git status --porcelain)

  if ($served -eq "development") {
    Write-Host "NOT A DEPLOY - the API reports 'development'. This is a local/staging process." -ForegroundColor Yellow
    exit 1
  }

  if ($served -eq $local) {
    Write-Host "OK - live matches $Ref ($($local.Substring(0,7)))." -ForegroundColor Green
    if ($dirty) {
      Write-Host "Working tree is dirty:" -ForegroundColor DarkYellow
      $dirty | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkYellow }
    }
    exit 0
  }

  $ahead = git rev-list --count "$local..$served" 2>$null
  $behind = git rev-list --count "$served..$local" 2>$null

  Write-Host "STALE - live is $served" -ForegroundColor Red
  Write-Host "  $Ref is $local" -ForegroundColor Yellow
  if ($ahead -and [int]$ahead -gt 0) {
    Write-Host "  live contains $ahead commit(s) not in $Ref (unexpected - check the branch)" -ForegroundColor Yellow
  }
  if ($behind -and [int]$behind -gt 0) {
    Write-Host "  $Ref is $behind commit(s) ahead of live - the deploy has not landed yet." -ForegroundColor Yellow
    Write-Host "  Wait for .github/workflows/deploy.yml to finish, then re-run this script." -ForegroundColor Yellow
  }
  Write-Host ""
  Write-Host "Commits not yet live:" -ForegroundColor Yellow
  git log --oneline "$served..$local" | Select-Object -First 20 | ForEach-Object { Write-Host "  $_" }
  exit 1
}
finally {
  Pop-Location
}
