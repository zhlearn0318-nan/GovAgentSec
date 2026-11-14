[CmdletBinding()]
param([switch]$NoBrowser)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$stamp=(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+$PID
$evidence=Join-Path $root "local-validation\startup\$stamp"
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
$report=[ordered]@{success=$false;started_at=(Get-Date).ToString('o');stage='preflight';checks=[ordered]@{};browser_opened=$false}
function Step([string]$name){$report.stage=$name;Write-Host "`n== $name ==" -ForegroundColor Cyan}
function Config-Hash([string]$File){
    $sha=[Security.Cryptography.SHA256]::Create()
    try{return ([BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($File)))).Replace('-','')}finally{$sha.Dispose()}
}
function Wait-Ready([string]$Name,[string]$Url,[int]$Seconds=60,[hashtable]$Headers=@{}){
    $timer=[Diagnostics.Stopwatch]::StartNew()
    do {
        try {
            $r=Invoke-RestMethod -Uri $Url -Headers $Headers -TimeoutSec 3
            if($r.ready -eq $true -or $r.ok -eq $true -or ($Name -eq 'Ollama' -and $r.version)){return}
        } catch {}
        Start-Sleep -Seconds 2
    } while($timer.Elapsed.TotalSeconds -lt $Seconds)
    throw "$Name did not become ready within $Seconds seconds. Endpoint: $Url"
}
function Gateway-Alive([string]$Base){
    try {$r=Invoke-RestMethod "$Base/healthz" -TimeoutSec 3;return $r.ok -eq $true}catch{return $false}
}
Push-Location $root
try {
    Step '1/6 Verify installed runtime'
    $hostRoot=Join-Path $env:APPDATA 'npm\node_modules\openclaw'
    $version=(Get-Content (Join-Path $hostRoot 'package.json') -Raw -Encoding UTF8|ConvertFrom-Json).version
    if($version -ne '2026.7.1-2'){throw "Expected OpenClaw 2026.7.1-2, found $version. No upgrade attempted."}
    # Service and open-page helpers use the standard Windows user profile.
    if($env:OPENCLAW_CONFIG_PATH -or $env:OPENCLAW_STATE_DIR){throw 'Custom OpenClaw profile detected. Use its own startup command; no standard profile changes made.'}
    $configFile=Join-Path $env:USERPROFILE '.openclaw\openclaw.json'
    $config=Get-Content $configFile -Raw -Encoding UTF8|ConvertFrom-Json
    $beforeHash=Config-Hash $configFile
    $report.checks.openclaw_version=$version
    $report.config_before_sha256=$beforeHash
    $port=if($config.gateway.port){[int]$config.gateway.port}else{18789}
    $base="http://127.0.0.1:$port"
    $report.url="$base/plugins/govagentsec/welcome"
    $cli=Join-Path $env:APPDATA 'npm\openclaw.cmd'
    $null=Get-Command node.exe -ErrorAction Stop

    Step '2/6 Prepare session sandbox'
    $engine=$config.agents.defaults.sandbox.backend
    if($engine -and $engine -notin @('docker','srt')){throw "Unsupported configured sandbox engine: $engine"}
    if($engine -eq 'srt'){
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Ensure-SrtReady.ps1') -CheckOnly
        if($LASTEXITCODE -ne 0){throw 'Configured srt engine is not ready. No automatic engine switch performed.'}
        if($config.agents.defaults.sandbox.mode -ne 'all'){throw 'Configured srt sandbox is not enabled for all runs. Review protection settings.'}
    }else{
        $engine='docker'
        & (Join-Path $PSScriptRoot 'Ensure-DockerReady.ps1')
        if(-not (Get-Command docker.exe -ErrorAction SilentlyContinue)){
            $dockerPath=@((Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin'),(Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin'))|Where-Object {Test-Path (Join-Path $_ 'docker.exe')}|Select-Object -First 1
            $env:PATH="$dockerPath;$env:PATH"
        }
        $env:DOCKER_CONTEXT='desktop-linux'
        & node (Join-Path $PSScriptRoot 'setup_session_sandbox.mjs')
        if($LASTEXITCODE -ne 0){throw 'Session sandbox setup failed. Gateway not started.'}
        & docker.exe run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges --user 1000:1000 --pids-limit 128 --memory 512m --cpus 1 govagentsec-session:node20-v1 node -e 'process.exit(process.getuid()===1000?0:1)'
        if($LASTEXITCODE -ne 0){throw 'Docker sandbox execution probe failed.'}
        $report.checks.docker_execution='passed: non-root, read-only, network none'
    }
    $report.checks.sandbox_engine=$engine
    $afterHash=Config-Hash $configFile
    $report.config_after_sha256=$afterHash
    $changed=$beforeHash -ne $afterHash
    $report.config_changed=$changed

    Step '3/6 Start local model service'
    try{$null=Invoke-RestMethod 'http://127.0.0.1:11434/api/version' -TimeoutSec 2}catch{
        $ollama=Get-Command ollama.exe -ErrorAction SilentlyContinue
        $ollamaPath=if($ollama){$ollama.Source}else{Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'}
        Start-Process -FilePath $ollamaPath -ArgumentList 'serve' -WindowStyle Hidden|Out-Null
    }
    Wait-Ready 'Ollama' 'http://127.0.0.1:11434/api/version'
    $report.checks.ollama=$true

    Step '4/6 Start AgentGuard and OPA'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'modules\agentguard-group2\start_agentguard_live.ps1')
    if($LASTEXITCODE -ne 0){throw 'AgentGuard could not start. Check its live-runtime/logs directory.'}
    Wait-Ready 'AgentGuard' 'http://127.0.0.1:8080/readyz'
    $report.checks.agentguard=$true

    Step '5/6 Start gateway and wait for readiness'
    if(Gateway-Alive $base){
        if($changed){
            & $cli gateway restart
            if($LASTEXITCODE -ne 0){throw 'Gateway restart failed.'}
            $report.gateway_action='restarted_after_config_change'
        }else{$report.gateway_action='reused';Write-Host 'Existing gateway reused.'}
    }else{
        & $cli gateway start
        if($LASTEXITCODE -ne 0){throw 'Gateway service start failed. Check the installed OpenClaw Gateway scheduled task.'}
        $report.gateway_action='started'
    }
    Wait-Ready 'OpenClaw gateway' "$base/readyz" 300
    $report.checks.gateway=$true
    $config=Get-Content $configFile -Raw -Encoding UTF8|ConvertFrom-Json
    $protect=$config.plugins.entries.'protect-agent'
    if($protect.enabled -eq $true){
        $token=([IO.File]::ReadAllText($protect.config.tokenFile)).Trim()
        try {Wait-Ready 'Protect Agent' ($protect.config.baseUrl.TrimEnd('/')+'/readyz') 60 @{Authorization="Bearer $token"}}finally{$token=$null}
        $report.checks.protect_agent=$true
    }else{$report.checks.protect_agent='disabled in current configuration';Write-Warning 'Protect Agent is disabled in current configuration.'}

    Step '6/6 Open workspace'
    & (Join-Path $PSScriptRoot 'open_govagentsec.ps1') -NoBrowser:$NoBrowser
    $report.browser_opened=-not $NoBrowser
    $report.success=$true
    Write-Host "`nGovAgentSec is ready: $($report.url)" -ForegroundColor Green
}catch{
    $report.error=$_.Exception.Message
    Write-Host "`nStartup failed at [$($report.stage)]: $($report.error)" -ForegroundColor Red
}finally{
    $report.finished_at=(Get-Date).ToString('o')
    $report|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $evidence 'report.json') -Encoding UTF8
    Write-Host "Report: $(Join-Path $evidence 'report.json')"
    Pop-Location
}
if(-not $report.success){exit 1}
