[CmdletBinding()]
param(
    [string]$OpenClawState = (Join-Path $env:USERPROFILE '.openclaw'),
    [switch]$PrepareOnly,
    [switch]$SkipDependencies
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$env:OPENCLAW_STATE_DIR = [IO.Path]::GetFullPath($OpenClawState)
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
$modules = Join-Path $root 'modules'
$aegis = Join-Path $modules 'aegis'
$group2 = Join-Path $modules 'agentguard-group2'
$protectPython = Join-Path $root '.runtime\protect\Scripts\python.exe'
$env:PATH = (Join-Path $env:APPDATA 'npm') + ';' + (Join-Path $env:ProgramFiles 'nodejs') + ';' + $env:PATH

function Invoke-Checked([string]$Executable, [string[]]$Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed: $Executable (exit $LASTEXITCODE)" }
}
function Resolve-Tool([string]$Name, [string[]]$Candidates = @()) {
    foreach ($candidate in $Candidates) { if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate } }
    $found = Get-Command $Name -All -ErrorAction SilentlyContinue | Where-Object { $_.Source -notlike '*\Microsoft\WindowsApps\*' } | Select-Object -First 1
    if ($found) { return $found.Source }
    throw "$Name is missing. See docs/OPENCLAW_WINDOWS.md for prerequisites."
}
$openclaw = Resolve-Tool 'openclaw.cmd'
$controlUiRoot = Join-Path (Split-Path $openclaw) 'node_modules\openclaw\dist\control-ui'
if (-not (Test-Path (Join-Path $controlUiRoot 'index.html'))) { throw 'Cannot locate the npm OpenClaw Control UI beside openclaw.cmd.' }
$version = & $openclaw --version
if ($LASTEXITCODE -ne 0 -or "$version" -notmatch '2026\.7\.1-2') { throw 'This release requires the tested OpenClaw 2026.7.1-2. See docs/OPENCLAW_WINDOWS.md.' }
if (-not (Test-Path -LiteralPath (Join-Path $OpenClawState 'openclaw.json'))) { throw 'Complete OpenClaw onboarding before installing GovAgentSec.' }
if (-not $SkipDependencies) {
    Invoke-Checked 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $root 'scripts\Prepare-Dependencies.ps1'))
    $env:PATH = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') + ';' + $env:PATH
}
$docker = Resolve-Tool 'docker.exe' @((Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'), (Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe'))
$python = Resolve-Tool 'python.exe' @((Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'))
Invoke-Checked $python @('-c','import sys; assert sys.version_info[:2] == (3, 12), "GovAgentSec requires Python 3.12"')
$conda = Resolve-Tool 'conda.exe' @((Join-Path $env:LOCALAPPDATA 'miniconda3\Scripts\conda.exe'))
$git = Resolve-Tool 'git.exe'
$ollama = Resolve-Tool 'ollama.exe' @((Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'))
$engine = & $docker --context desktop-linux info --format '{{.ServerVersion}}' 2>$null
if ($LASTEXITCODE -ne 0) {
    $desktop = Join-Path (Split-Path (Split-Path (Split-Path $docker))) 'Docker Desktop.exe'
    if (Test-Path -LiteralPath $desktop) { Start-Process -FilePath $desktop -WindowStyle Hidden | Out-Null }
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Seconds 2
        $engine = & $docker --context desktop-linux info --format '{{.ServerVersion}}' 2>$null
        if ($LASTEXITCODE -eq 0) { break }
    }
    if ($LASTEXITCODE -ne 0) { throw 'Docker Linux engine is unavailable. Complete Docker first-run setup; for stale socket errors see scripts/Repair-DockerSockets.ps1.' }
}

if (-not $SkipDependencies) {
    Write-Host 'Preparing real protection models and isolated Python environments...'
    if (-not (Test-Path -LiteralPath $protectPython)) { Invoke-Checked $python @('-m','venv',(Join-Path $root '.runtime\protect')) }
    Invoke-Checked $protectPython @((Join-Path $root 'scripts\download_torch.py'))
    Invoke-Checked $protectPython @('-m','pip','install',(Join-Path $root '.runtime\wheels\torch-2.6.0+cu124-cp312-cp312-win_amd64.whl'))
    Invoke-Checked $protectPython @('-m','pip','install','-r',(Join-Path $root 'requirements-protect-lock.txt'))
    Invoke-Checked $protectPython @((Join-Path $root 'scripts\download_models.py'))
    $py2 = Join-Path $group2 '.venv\Scripts\python.exe'
    if (-not (Test-Path -LiteralPath $py2)) { Invoke-Checked $python @('-m','venv',(Join-Path $group2 '.venv')) }
    Invoke-Checked $py2 @('-m','pip','install','--require-hashes','-r',(Join-Path $group2 'requirements-lock.txt'))
    Invoke-Checked $python @((Join-Path $root 'scripts\download_opa.py'))
    $env:AEGIS_CONDA_COMMAND = $conda
    $env:AEGIS_GIT_COMMAND = $git
    Invoke-Checked 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $aegis 'bootstrap_runtimes.ps1'),'-Component','All')
    $sandbox = Get-Content -LiteralPath (Join-Path $aegis 'demo_web\config\skill_dynamic_sandbox_v2.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $sandbox.images.PSObject.Properties.Value.reference | Select-Object -Unique | ForEach-Object {
        $reference = $_
        & $docker --context desktop-linux image inspect $reference --format '{{.Id}}' 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) {
            for ($attempt = 0; $attempt -lt 3; $attempt++) {
                & $docker --context desktop-linux pull $reference
                if ($LASTEXITCODE -eq 0) { break }
                Start-Sleep -Seconds 2
            }
            if ($LASTEXITCODE -ne 0) { throw "Could not download fixed sandbox image: $reference. Rerun Install.cmd to resume." }
        }
    }
    $modelsPresent = & $ollama list
    if ($LASTEXITCODE -ne 0 -or "$modelsPresent" -notmatch 'qwen2\.5:7b-instruct-q4_K_M') {
        Invoke-Checked $ollama @('pull','qwen2.5:7b-instruct-q4_K_M')
    }
}
$servingThisRelease = $false
$currentConfig = Get-Content -LiteralPath (Join-Path $OpenClawState 'openclaw.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$currentProtection = $currentConfig.plugins.entries.'protect-agent'.config
if ($currentProtection.mode -eq 'real' -and $currentProtection.projectRoot -eq (Join-Path $modules 'protect-agent-group1\智能体安全')) {
    try {
        $localToken = [IO.File]::ReadAllText($currentProtection.tokenFile).Trim()
        $probe = Invoke-RestMethod -Uri ($currentProtection.baseUrl + '/readyz') -Headers @{Authorization=('Bearer ' + $localToken)} -TimeoutSec 2
        $servingThisRelease = $probe.ready -eq $true
    } catch { $servingThisRelease = $false }
}
if ($servingThisRelease) {
    Invoke-Checked $protectPython @((Join-Path $root 'scripts\verify_sidecar.py'),'--state',$OpenClawState)
} else {
    Invoke-Checked $protectPython @((Join-Path $root 'scripts\verify_real_models.py'))
}
$batch = Join-Path $root '.runtime\config-batch.json'
Invoke-Checked $protectPython @((Join-Path $root 'scripts\build_config.py'),'--state',$OpenClawState,'--docker',$docker,'--output',$batch)
Invoke-Checked $openclaw @('config','set','--batch-file',$batch,'--dry-run','--replace')
New-Item -ItemType Directory -Path (Join-Path $aegis 'demo_web\data\openclaw-final') -Force | Out-Null
Invoke-Checked $protectPython @((Join-Path $root 'scripts\verify_admission.py'),'--batch',$batch)
if ($PrepareOnly) { Write-Host "Preparation complete. Review $batch before applying."; exit 0 }

$priorConfig = Get-Content -LiteralPath (Join-Path $OpenClawState 'openclaw.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$priorGroup2 = $null
foreach ($pluginPath in $priorConfig.plugins.load.paths) {
    if ((Split-Path $pluginPath -Leaf) -eq 'openclaw_runtime_security_plugin') {
        $candidate = Split-Path (Split-Path $pluginPath)
        if ([IO.Path]::GetFullPath($candidate) -ne [IO.Path]::GetFullPath($group2)) { $priorGroup2 = $candidate }
    }
}
if ($priorGroup2 -and -not (Test-Path -LiteralPath (Join-Path $priorGroup2 'stop_agentguard_live.ps1'))) {
    throw 'The previous AgentGuard installation has no validated stop script. Stop that deployment before migrating.'
}
$hookSource = Join-Path $root 'hooks\supply-chain-security'
$hookTarget = Join-Path $OpenClawState 'hooks\supply-chain-security'
foreach ($file in Get-ChildItem -LiteralPath $hookSource -File) {
    $target = Join-Path $hookTarget $file.Name
    if ((Test-Path -LiteralPath $target) -and (Get-FileHash -LiteralPath $target).Hash -ne (Get-FileHash -LiteralPath $file.FullName).Hash) {
        throw "Existing hook differs from this release: $target"
    }
}

$stateRoot = Join-Path $OpenClawState 'govagentsec'
New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null
$backup = Join-Path $stateRoot ('openclaw.before-install.' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')
Copy-Item -LiteralPath (Join-Path $OpenClawState 'openclaw.json') -Destination $backup
$tokenPath = Join-Path $stateRoot 'protect-agent.token'
if (-not (Test-Path -LiteralPath $tokenPath)) {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    [IO.File]::WriteAllText($tokenPath, ([BitConverter]::ToString($bytes)).Replace('-',''), [Text.Encoding]::ASCII)
}
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
Invoke-Checked 'icacls.exe' @($tokenPath,'/inheritance:r','/grant:r',($identity + ':(R,W)'))
foreach ($name in @('workspace','plugin-skills','skill-workshop')) { New-Item -ItemType Directory -Path (Join-Path $OpenClawState $name) -Force | Out-Null }
New-Item -ItemType Directory -Path (Join-Path $aegis 'demo_web\data\openclaw-final') -Force | Out-Null
$uiIndex = Join-Path $controlUiRoot 'index.html'
$uiBackup = Join-Path $stateRoot ('control-ui.before-install.' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.html')
Copy-Item -LiteralPath $uiIndex -Destination $uiBackup
$previousStopped = $false
$newStarted = $false
$existingGroup2Ready = $false
if (-not $priorGroup2 -and (Test-Path -LiteralPath (Join-Path $group2 'live-runtime\agentguard-process.json'))) {
    try { $existingGroup2Ready = (Invoke-RestMethod -Uri 'http://127.0.0.1:8080/readyz' -TimeoutSec 2).ready -eq $true } catch { }
}
$oldTask = Get-ScheduledTask -TaskName 'AgentGuard OpenClaw Backend' -ErrorAction SilentlyContinue
$oldTaskDisabled = $false
try {
    if ($priorGroup2) {
        Invoke-Checked 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $group2 'stop_agentguard_live.ps1'),'-DeploymentRoot',$priorGroup2)
        $previousStopped = $true
        if ($oldTask -and ($oldTask.Actions.Arguments -like ('*' + (Join-Path $priorGroup2 'start_agentguard_live.ps1') + '*')) -and $oldTask.State -ne 'Disabled') {
            $oldTask | Disable-ScheduledTask | Out-Null
            $oldTaskDisabled = $true
        }
    }
    New-Item -ItemType Directory -Path $hookTarget -Force | Out-Null
    Get-ChildItem -LiteralPath $hookSource -File | Copy-Item -Destination $hookTarget
    Invoke-Checked $openclaw @('config','set','--batch-file',$batch,'--replace')
    Invoke-Checked 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $group2 'start_agentguard_live.ps1'))
    $newStarted = $true
    Invoke-Checked 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $modules 'protect-agent-group1\智能体安全\integrations\openclaw\plugin\install-control-ui.ps1'),'-ControlUiRoot',$controlUiRoot)
    Invoke-Checked $openclaw @('gateway','restart')
    Invoke-Checked 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $root 'Verify.ps1'),'-OpenClawState',$OpenClawState)
    Invoke-Checked 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $group2 'register_agentguard_task.ps1'))
} catch {
    $failure = $_.Exception.Message
    if ($newStarted -and -not $existingGroup2Ready) { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $group2 'stop_agentguard_live.ps1') }
    Copy-Item -LiteralPath $backup -Destination (Join-Path $OpenClawState 'openclaw.json') -Force
    Copy-Item -LiteralPath $uiBackup -Destination $uiIndex -Force
    if ($previousStopped) { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $priorGroup2 'start_agentguard_live.ps1') }
    if ($oldTaskDisabled) { $oldTask | Enable-ScheduledTask | Out-Null }
    & $openclaw gateway restart
    throw "Installation failed; configuration and UI restored from $stateRoot. $failure"
}
Write-Host 'GovAgentSec installed. Open your OpenClaw dashboard and choose 政安智枢 GovAgentSec.'
Write-Host "Configuration backup: $backup"
