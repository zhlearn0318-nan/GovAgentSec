[CmdletBinding()]
param([switch]$CheckOnly)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$package=Join-Path $root 'modules\session-sandbox'
Push-Location $package
try {
  if(-not $CheckOnly) {
    # Keep reproducible downloads separate from a possibly damaged global cache.
    $cache=Join-Path $root 'local-validation\session-sandbox\npm-cache'
    & npm.cmd ci --ignore-scripts --no-audit --no-fund --cache $cache
    if($LASTEXITCODE -ne 0){throw 'srt npm install failed'}
  }
  $cli=Join-Path $package 'node_modules\@anthropic-ai\sandbox-runtime\dist\cli.js'
  if(-not (Test-Path -LiteralPath $cli)){throw 'srt is not installed'}
  $version=(& node $cli --version)
  if($LASTEXITCODE -ne 0 -or $version.Trim() -ne '0.0.81'){throw 'Expected pinned srt 0.0.81'}
  Write-Host $version
  $exe=Join-Path $package 'node_modules\@anthropic-ai\sandbox-runtime\vendor\srt-win\x64\srt-win.exe'
  $rawStatus=(& $exe user status)
  if($LASTEXITCODE -ne 0){throw 'srt Windows account status unavailable'}
  $status=($rawStatus | ConvertFrom-Json)
  if(-not $status.cred_present -or $status.marker_version -ne $status.setup_version) {
    if($CheckOnly){throw 'srt Windows account/WFP installation missing'}
    & node $cli windows-install --skip-profile-grant
    if($LASTEXITCODE -ne 0){throw 'srt Windows setup failed'}
  }
  Write-Host 'srt installed. Native execution/WFP/filesystem checks: node scripts/test_session_sandbox_srt.mjs'
} finally { Pop-Location }
