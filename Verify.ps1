[CmdletBinding()]
param([int]$GatewayPort = 0, [string]$OpenClawState = (Join-Path $env:USERPROFILE '.openclaw'))
$ErrorActionPreference = 'Stop'
if (-not $GatewayPort) {
    $config = Get-Content -LiteralPath (Join-Path $OpenClawState 'openclaw.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $GatewayPort = if ($config.gateway.port) { [int]$config.gateway.port } else { 18789 }
}
$base = "http://127.0.0.1:$GatewayPort"
$response = $null
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try { $response = Invoke-WebRequest -UseBasicParsing -Uri ($base + '/') -TimeoutSec 5; break } catch { Start-Sleep -Seconds 2 }
}
if ($response.StatusCode -ne 200) { throw 'OpenClaw shell unavailable' }
foreach ($route in @('/protect-agent/ui/state','/plugins/aegis-admission/panel?embed=1','/plugins/aegis-security-center/panel','/plugins/agentguard-runtime-security/panel','/plugins/protect-agent/panel','/plugins/supply-chain-security/panel')) {
    $status = 0
    try { $status = (Invoke-WebRequest -UseBasicParsing -Uri ($base + $route) -TimeoutSec 5).StatusCode }
    catch { if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode } else { throw } }
    if ($status -notin @(401,403)) { throw "Sensitive route must reject anonymous access: $route ($status)" }
    Write-Host "PASS anonymous access denied: $route"
}
$ready = Invoke-RestMethod -Uri 'http://127.0.0.1:8080/readyz' -TimeoutSec 10
if (-not $ready.ready) { throw 'AgentGuard is not ready' }
$python = Join-Path $PSScriptRoot '.runtime\protect\Scripts\python.exe'
& $python (Join-Path $PSScriptRoot 'scripts\verify_sidecar.py') --state $OpenClawState
if ($LASTEXITCODE -ne 0) { throw 'Installed protection service verification failed' }
Write-Host 'Shell, anonymous access boundary, AgentGuard readiness and real model checks passed. Authenticated browser checks: node scripts/test_delivery_live.mjs'
