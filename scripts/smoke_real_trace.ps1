param(
    [string]$AgentId = 'main',
    [ValidateRange(30, 600)][int]$TimeoutSeconds = 180,
    [string]$ConfigPath = "$env:USERPROFILE/.openclaw/openclaw.json"
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Push-Location $repo
try {
    & node "$PSScriptRoot/smoke_real_trace.mjs" --agent $AgentId --timeout $TimeoutSeconds --config $ConfigPath
    $code = $LASTEXITCODE
} finally {
    Pop-Location
}
exit $code
