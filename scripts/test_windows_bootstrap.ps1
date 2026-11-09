$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
. (Join-Path $root 'Bootstrap-Windows.ps1')
$out=Join-Path $root ('local-validation\bootstrap-tests\'+[guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $out -Force|Out-Null
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
function Archive([string]$Name,[string[]]$Entries) {
    $file=Join-Path $out $Name
    $zip=[IO.Compression.ZipFile]::Open($file,[IO.Compression.ZipArchiveMode]::Create)
    try {foreach($entry in $Entries){$null=$zip.CreateEntry($entry)}}finally{$zip.Dispose()}
    return $file
}
function Reject([string]$File,[string]$Hash){
    $rejected=$false
    try {Test-ReleaseArchive $File $Hash}catch{$rejected=$true}
    if(-not $rejected){throw 'Unsafe archive accepted'}
}
$required=@('GovAgentSec/Setup-Windows.ps1','GovAgentSec/release-manifest.json')
$valid=Archive 'valid.zip' $required
Test-ReleaseArchive $valid (Get-FileHash $valid -Algorithm SHA256).Hash
Reject $valid ('0'*64)
foreach($bad in @('../escape.ps1','GovAgentSec/../escape.ps1','C:/escape.ps1','GovAgentSec/C:/escape.ps1','GovAgentSec\..\escape.ps1')){
    $file=Archive ([guid]::NewGuid().ToString()+'.zip') ($required+@($bad))
    Reject $file (Get-FileHash $file -Algorithm SHA256).Hash
}
$missing=Archive 'incomplete.zip' @('GovAgentSec/readme.txt');Reject $missing (Get-FileHash $missing -Algorithm SHA256).Hash
foreach($file in @('Setup-Windows.ps1','Setup-OpenClaw.ps1','Bootstrap-Windows.ps1','Install.ps1','scripts/Start-GovAgentSec.ps1','scripts/Configure-Model.ps1')){
    $errors=$null;$tokens=$null
    $null=[Management.Automation.Language.Parser]::ParseFile((Join-Path $root $file),[ref]$tokens,[ref]$errors)
    if($errors.Count){throw "PowerShell parse errors: $file"}
}
@{passed=$true;checks=8;source='offline-real-powershell-zip-validation';host_modified=$false}|ConvertTo-Json|Set-Content (Join-Path $out 'report.json') -Encoding UTF8
Write-Output "PASS bootstrap checksum, traversal, incomplete archive and PowerShell syntax; $out"
