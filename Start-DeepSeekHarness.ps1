[CmdletBinding()]
param(
    [string]$HarnessRoot = 'D:\deepseek-harness',
    [ValidateRange(1024, 65535)][int]$Port = 3081,
    [switch]$NoOpen
)
$ErrorActionPreference = 'Stop'
$runtime = Join-Path $PSScriptRoot '.runtime\deepseek-harness'
$manifestPath = Join-Path $runtime 'installation.json'
if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw 'Run python scripts/configure_deepseek_harness.py first. See docs/DEEPSEEK_HARNESS.md.'
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.agentGuardEnabled) {
    & (Join-Path $PSScriptRoot 'modules\agentguard-group2\start_agentguard_live.ps1') -Port 18080 -OpaPort 18181
    if ($LASTEXITCODE -ne 0) { throw 'AgentGuard startup failed' }
}
$entry = Join-Path $HarnessRoot 'apps\cli\lib\bin.js'
if (-not (Test-Path -LiteralPath $entry)) { throw "Harness launcher missing: $entry" }
$node = (Get-Command node.exe -ErrorAction Stop).Source
$arguments = @($entry, 'web')
if (-not $manifest.profileInstalled) { $arguments += @('--patch', $manifest.overlay) }
$arguments += @('--port', "$Port")
if ($NoOpen) { $arguments += '--no-open' }
$env:DSH_HOME = $manifest.dshHome
$env:GOVAGENTSEC_HARNESS_PORT = "$Port"
Push-Location $PSScriptRoot
try {
    & $node @arguments
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
