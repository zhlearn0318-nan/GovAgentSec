[CmdletBinding()]
param([int]$GatewayPort = 0, [string]$OpenClawState = (Join-Path $env:USERPROFILE '.openclaw'))
$ErrorActionPreference = 'Stop'
if (-not $GatewayPort) {
    $config = Get-Content -LiteralPath (Join-Path $OpenClawState 'openclaw.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $GatewayPort = if ($config.gateway.port) { [int]$config.gateway.port } else { 18789 }
}
$base = "http://127.0.0.1:$GatewayPort"
foreach ($route in @('/plugins/govagentsec/panel','/plugins/aegis-security-center/panel','/plugins/agentguard-runtime-security/panel','/plugins/protect-agent/panel','/plugins/supply-chain-security/panel')) {
    $response = $null
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try { $response = Invoke-WebRequest -UseBasicParsing -Uri ($base + $route) -TimeoutSec 5; break } catch { Start-Sleep -Seconds 2 }
    }
    if ($response.StatusCode -ne 200) { throw "Page unavailable: $route" }
    Write-Host "PASS $route"
}
$ready = Invoke-RestMethod -Uri 'http://127.0.0.1:8080/readyz' -TimeoutSec 10
if (-not $ready.ready) { throw 'AgentGuard is not ready' }
$python = Join-Path $PSScriptRoot '.runtime\protect\Scripts\python.exe'
& $python (Join-Path $PSScriptRoot 'scripts\verify_sidecar.py') --state $OpenClawState
if ($LASTEXITCODE -ne 0) { throw 'Installed protection service verification failed' }
Write-Host 'Page, AgentGuard readiness, and real model checks passed.'
