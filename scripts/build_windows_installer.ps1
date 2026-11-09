[CmdletBinding()]
param([string]$OutputDirectory)
$ErrorActionPreference='Stop'
# A Python parent may inherit PowerShell 7's module path. Use this host's utility
# module so Get-FileHash is available when building with Windows PowerShell 5.1.
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1') -Force
$root=Split-Path $PSScriptRoot -Parent
if(-not $OutputDirectory){$OutputDirectory=Join-Path $root 'local-validation\releases\v1.0'}
$output=[IO.Path]::GetFullPath($OutputDirectory)
$allowed=[IO.Path]::GetFullPath((Join-Path $root 'local-validation'))+[IO.Path]::DirectorySeparatorChar
if(-not $output.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)){throw 'Output must be under local-validation.'}
New-Item -ItemType Directory -Path $output -Force|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$payload=Join-Path $root 'Bootstrap-Windows.ps1'
$source=Join-Path $PSScriptRoot 'windows-installer\Program.cs'
$exe=Join-Path $output 'GovAgentSec-v1.0-Setup.exe'
& $compiler /nologo /target:exe /platform:x64 /optimize+ "/out:$exe" "/resource:$payload,Bootstrap.ps1" $source
if($LASTEXITCODE -ne 0){throw 'Installer compilation failed.'}
$check=& $exe --check
if($LASTEXITCODE -ne 0){throw 'Installer self-check failed.'}
$expected=(Get-FileHash $payload -Algorithm SHA256).Hash.ToLowerInvariant()
if($check -notcontains ('payload_sha256='+$expected)){throw 'Embedded bootstrap differs from source.'}
@{passed=$true;source='compiled-exe-payload-check';installer=$exe;payload_sha256=$expected;sha256=(Get-FileHash $exe -Algorithm SHA256).Hash;full_install_run=$false}|ConvertTo-Json|Set-Content (Join-Path $output 'exe-verification.json') -Encoding UTF8
Write-Output "Built and checked: $exe"
