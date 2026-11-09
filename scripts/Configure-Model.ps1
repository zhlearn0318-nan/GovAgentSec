[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$state=Join-Path $env:USERPROFILE '.openclaw'
if($env:OPENCLAW_CONFIG_PATH -or ($env:OPENCLAW_STATE_DIR -and [IO.Path]::GetFullPath($env:OPENCLAW_STATE_DIR) -ne [IO.Path]::GetFullPath($state))){throw 'Use the model wizard for your custom OpenClaw profile manually.'}
$hostRoot=Join-Path $env:APPDATA 'npm\node_modules\openclaw'
if((Get-Content (Join-Path $hostRoot 'package.json') -Raw -Encoding UTF8|ConvertFrom-Json).version -ne '2026.7.1-2'){throw 'Pinned OpenClaw required'}
$config=Join-Path $state 'openclaw.json'
$backupDir=Join-Path $state 'govagentsec\backups'
New-Item -ItemType Directory -Path $backupDir -Force|Out-Null
$backup=Join-Path $backupDir ('before-model-'+[guid]::NewGuid().ToString()+'.json')
Copy-Item -LiteralPath $config -Destination $backup
$hash=(Get-FileHash $config -Algorithm SHA256).Hash
if((Get-FileHash $backup -Algorithm SHA256).Hash -ne $hash){throw 'Backup verification failed'}
[ordered]@{sha256=$hash;backup=$backup}|ConvertTo-Json|Set-Content ($backup+'.manifest.json') -Encoding UTF8
Write-Host 'Configure your session provider, API endpoint and model using the OpenClaw wizard. Local security review stays local.'
& (Join-Path $env:APPDATA 'npm\openclaw.cmd') configure --section model
if($LASTEXITCODE -ne 0){throw "Model configuration failed. Backup: $backup"}
& (Join-Path $env:APPDATA 'npm\openclaw.cmd') gateway restart
if($LASTEXITCODE -ne 0){throw "Gateway restart failed. Backup: $backup"}
