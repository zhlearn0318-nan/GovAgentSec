param([Parameter(Mandatory=$true)][string]$EvidenceDir)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$hostRoot=Join-Path $env:APPDATA 'npm/node_modules/openclaw'
if ((Get-Content -Raw -LiteralPath (Join-Path $hostRoot 'package.json') | ConvertFrom-Json).version -ne '2026.7.1-2') { throw 'Fixed host version required' }
$configFile=Join-Path $env:USERPROFILE '.openclaw/openclaw.json'
$configHash=(Get-FileHash -LiteralPath $configFile -Algorithm SHA256).Hash
$owners=@(Get-NetTCPConnection -LocalPort 18789 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
foreach ($ownerId in $owners) {
  $p=Get-CimInstance Win32_Process -Filter "ProcessId=$ownerId"
  if ($p.CommandLine -notlike '*openclaw*gateway*') { throw 'Unexpected port owner; refusing restart' }
}
foreach ($ownerId in $owners) { Stop-Process -Id $ownerId -ErrorAction Stop }
$logDir=Join-Path $repo '.runtime/u11-gateway'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$started=Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList @((Join-Path $hostRoot 'dist/index.js'),'gateway','--port','18789') -WorkingDirectory $repo -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'stdout.log') -RedirectStandardError (Join-Path $logDir 'stderr.log') -PassThru
if ((Get-FileHash -LiteralPath $configFile -Algorithm SHA256).Hash -ne $configHash) { throw 'Config changed during restart' }
New-Item -ItemType Directory -Path $EvidenceDir -Force | Out-Null
@{new_pid=$started.Id;old_pids=$owners;config_unchanged=$true;version='2026.7.1-2';config_sha256=$configHash} | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $EvidenceDir 'restart.json')
Write-Output "Gateway started: PID $($started.Id)"
