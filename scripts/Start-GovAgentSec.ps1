[CmdletBinding()]
param([switch]$NoBrowser)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
try{$null=Invoke-RestMethod 'http://127.0.0.1:11434/api/version' -TimeoutSec 2}catch{
    $ollama=Get-Command ollama.exe -ErrorAction SilentlyContinue
    $ollamaPath=if($ollama){$ollama.Source}else{Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'}
    Start-Process -FilePath $ollamaPath -ArgumentList 'serve' -WindowStyle Hidden|Out-Null
}
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'modules\agentguard-group2\start_agentguard_live.ps1')
if($LASTEXITCODE -ne 0){throw 'AgentGuard could not start; no gateway start attempted.'}
$hostRoot=Join-Path $env:APPDATA 'npm\node_modules\openclaw'
if((Get-Content (Join-Path $hostRoot 'package.json') -Raw -Encoding UTF8|ConvertFrom-Json).version -ne '2026.7.1-2'){throw 'Pinned OpenClaw required'}
& (Join-Path $env:APPDATA 'npm\openclaw.cmd') gateway start
if($LASTEXITCODE -ne 0){throw 'Gateway service did not start. Rerun Setup-Windows.cmd to install its service.'}
$config=Get-Content (Join-Path $env:USERPROFILE '.openclaw\openclaw.json') -Raw -Encoding UTF8|ConvertFrom-Json
$port=if($config.gateway.port){$config.gateway.port}else{18789}
$ready=$false
for($i=0;$i -lt 150;$i++){
    try{$r=Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$port/plugins/govagentsec/welcome" -TimeoutSec 2;if($r.StatusCode -eq 200){$ready=$true;break}}catch{}
    Start-Sleep -Seconds 2
}
if(-not $ready){throw 'Workspace did not become available; inspect OpenClaw gateway logs.'}
& (Join-Path $PSScriptRoot 'open_govagentsec.ps1') -NoBrowser:$NoBrowser
