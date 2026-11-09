[CmdletBinding()]
param([switch]$Plan, [switch]$NoBrowser, [string]$ReportDirectory)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$manifest = Get-Content -LiteralPath (Join-Path $root 'release-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$steps = @('preflight','openclaw','dependencies','ollama','gateway-service','security-install','shortcuts','verify')
if ($Plan) {
    [ordered]@{mode='plan';version=$manifest.version;tag=$manifest.tag;openclaw=$manifest.openclaw;steps=$steps;requires_cuda=$true;default_engine='docker';changes_applied=$false} | ConvertTo-Json -Depth 4
    exit 0
}
if (-not $ReportDirectory) { $ReportDirectory = Join-Path $root ('local-validation\windows-install\' + (Get-Date -Format 'yyyyMMdd-HHmmss')) }
New-Item -ItemType Directory -Path $ReportDirectory -Force | Out-Null
$reportFile = Join-Path $ReportDirectory 'report.json'
$report = [ordered]@{version=$manifest.version;openclaw=$manifest.openclaw;source='windows-installer';status='running';stage='preflight';completed=@();error=$null;config_before=$null;config_after=$null}
$state = Join-Path $env:USERPROFILE '.openclaw'
$config = Join-Path $state 'openclaw.json'
function Hash-Config { if (Test-Path -LiteralPath $config) { return (Get-FileHash -LiteralPath $config -Algorithm SHA256).Hash } return $null }
function Save-Report { $report.config_after=Hash-Config; $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $reportFile -Encoding UTF8 }
function Run([string]$Command, [string[]]$Arguments) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed: $Command (exit $LASTEXITCODE). Review the preceding error; fix it and rerun Setup-Windows.cmd." }
}
function Step([string]$Name, [scriptblock]$Action) {
    $report.stage=$Name;Save-Report;Write-Host "`n=== $Name ===" -ForegroundColor Cyan
    & $Action
    $report.completed+= $Name;Save-Report
}
try {
    $report.config_before=Hash-Config
    Step 'preflight' {
        if ([Environment]::OSVersion.Platform -ne 'Win32NT' -or -not [Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { throw 'Windows x64 is required.' }
        if ($env:OPENCLAW_CONFIG_PATH -or ($env:OPENCLAW_STATE_DIR -and [IO.Path]::GetFullPath($env:OPENCLAW_STATE_DIR) -ne [IO.Path]::GetFullPath($state))) { throw 'Custom OpenClaw state/profile detected. Use manual deployment; the installer will not modify another profile.' }
        if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) { throw 'Install Microsoft App Installer (winget), then rerun.' }
        $gpu=Get-Command nvidia-smi.exe -ErrorAction SilentlyContinue
        if (-not $gpu) { throw 'The full protection chain requires NVIDIA CUDA. Install a compatible NVIDIA driver; CPU-only mode is not supplied by this release.' }
        Run $gpu.Source @('--query-gpu=name,memory.total','--format=csv,noheader')
        if (Test-Path -LiteralPath $config) {
            $backupDir=Join-Path $state 'govagentsec\backups';New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
            $backup=Join-Path $backupDir ('before-v1-' + [guid]::NewGuid().ToString() + '.json')
            Copy-Item -LiteralPath $config -Destination $backup
            if ((Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash -ne $report.config_before) { throw 'Backup hash mismatch' }
            $report.backup=$backup
        }
    }
    Step 'openclaw' { Run 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $root 'Setup-OpenClaw.ps1'),'-NonInteractive') }
    $env:PATH=(Join-Path $env:APPDATA 'npm')+';'+(Join-Path $env:ProgramFiles 'nodejs')+';'+[Environment]::GetEnvironmentVariable('Path','Machine')+';'+[Environment]::GetEnvironmentVariable('Path','User')+';'+$env:PATH
    Step 'dependencies' { Run 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $root 'scripts\Prepare-Dependencies.ps1')) }
    $env:PATH=[Environment]::GetEnvironmentVariable('Path','Machine')+';'+[Environment]::GetEnvironmentVariable('Path','User')+';'+$env:PATH
    Step 'ollama' {
        $ollama=Get-Command ollama.exe -ErrorAction SilentlyContinue
        $ollamaPath=if($ollama){$ollama.Source}else{Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'}
        try { $null=Invoke-RestMethod 'http://127.0.0.1:11434/api/version' -TimeoutSec 3 } catch {
            Start-Process -FilePath $ollamaPath -ArgumentList 'serve' -WindowStyle Hidden | Out-Null
        }
        $ready=$false
        for($i=0;$i -lt 20;$i++){try{$null=Invoke-RestMethod 'http://127.0.0.1:11434/api/version' -TimeoutSec 2;$ready=$true;break}catch{Start-Sleep -Seconds 1}}
        if(-not $ready){throw 'Local Ollama did not start on 11434.'}
    }
    Step 'gateway-service' { Run (Join-Path $env:APPDATA 'npm\openclaw.cmd') @('gateway','install') }
    Step 'security-install' { Run 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $root 'Install.ps1')) }
    Step 'shortcuts' {
        $desktop=[Environment]::GetFolderPath('Desktop');$link=Join-Path $desktop 'GovAgentSec v1.0.lnk'
        $shell=New-Object -ComObject WScript.Shell;$shortcut=$shell.CreateShortcut($link)
        $shortcut.TargetPath=Join-Path $root 'Start-GovAgentSec.cmd';$shortcut.WorkingDirectory=$root;$shortcut.Save()
    }
    Step 'verify' { Run 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $root 'Verify.ps1')) }
    $report.status='passed';Save-Report
    Write-Host "Installation passed. Report: $reportFile" -ForegroundColor Green
    if(-not $NoBrowser){Run 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $root 'scripts\open_govagentsec.ps1'))}
} catch {
    $report.status='failed';$report.error="Installation stopped at $($report.stage). See console output; no success is claimed."
    Save-Report;Write-Error ($_.Exception.Message + "`nReport: $reportFile") -ErrorAction Continue;exit 1
}
