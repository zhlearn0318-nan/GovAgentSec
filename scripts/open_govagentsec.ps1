param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$hostPackage = Join-Path $env:APPDATA 'npm/node_modules/openclaw/package.json'
$version = (Get-Content -LiteralPath $hostPackage -Raw -Encoding UTF8 | ConvertFrom-Json).version
if ($version -ne '2026.7.1-2') { throw '需要固定版本 OpenClaw 2026.7.1-2；未执行升级。' }
$configPath = Join-Path $env:USERPROFILE '.openclaw/openclaw.json'
$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$gatewayPort = if ($config.gateway.port) { [int]$config.gateway.port } else { 18789 }
$entry = "http://127.0.0.1:$gatewayPort/plugins/govagentsec/welcome"
$response = Invoke-WebRequest -Uri $entry -UseBasicParsing -TimeoutSec 10
if ($response.StatusCode -ne 200 -or -not $response.Content.Contains('开始处理任务')) { throw '新版入口尚未加载，请先重启本机网关。' }
if (-not $NoBrowser) {
    $entryCredential = $config.gateway.auth.token
    $openUrl = if ($config.gateway.auth.mode -eq 'token' -and $entryCredential) { $entry + '#token=' + [uri]::EscapeDataString($entryCredential) } else { $entry }
    Start-Process $openUrl
    $openUrl = $null
    $entryCredential = $null
}
Write-Output $entry
