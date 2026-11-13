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

# Reproduce the binary response returned for the GitHub checksum asset in Windows PowerShell 5.1.
$fixture=Archive 'online.zip' $required
$zip=[IO.Compression.ZipFile]::Open($fixture,[IO.Compression.ZipArchiveMode]::Update)
try {
    $manifest=$zip.GetEntry('GovAgentSec/release-manifest.json').Open()
    try {
        $bytes=[Text.Encoding]::UTF8.GetBytes('{"tag":"v1.0","openclaw":"2026.7.1-2"}')
        $manifest.Write($bytes,0,$bytes.Length)
    } finally {$manifest.Dispose()}
} finally {$zip.Dispose()}
$fixtureHash=(Get-FileHash -LiteralPath $fixture -Algorithm SHA256).Hash
$checksumBytes=[Text.Encoding]::UTF8.GetBytes("$fixtureHash  GovAgentSec-v1.0-windows-x64.zip`r`n")
$destination=Join-Path $out 'installed-fixture'
& {
    function Invoke-WebRequest([switch]$UseBasicParsing,[string]$Uri,[string]$OutFile) {
        switch -Wildcard ($Uri) {
            '*/GovAgentSec-v1.0-windows-x64.zip' {Copy-Item -LiteralPath $fixture -Destination $OutFile}
            '*/SHA256SUMS.txt' {
                [pscustomobject]@{Content=$checksumBytes;RawContentStream=[IO.MemoryStream]::new($checksumBytes)}
            }
            default {throw "Unexpected download: $Uri"}
        }
    }
    & (Join-Path $root 'Bootstrap-Windows.ps1') -InstallDirectory $destination -NoBrowser
    if($LASTEXITCODE -ne 0){throw 'Bootstrap rejected a valid binary checksum response.'}
}
$receipt=Get-Content -LiteralPath (Join-Path $destination '.govagentsec-release.json') -Raw -Encoding UTF8|ConvertFrom-Json
if($receipt.archive_sha256 -ne $fixtureHash){throw 'Bootstrap receipt is missing the verified archive checksum.'}

foreach($file in @('Setup-Windows.ps1','Setup-OpenClaw.ps1','Bootstrap-Windows.ps1','Install.ps1','scripts/Start-GovAgentSec.ps1','scripts/Configure-Model.ps1')){
    $errors=$null;$tokens=$null
    $null=[Management.Automation.Language.Parser]::ParseFile((Join-Path $root $file),[ref]$tokens,[ref]$errors)
    if($errors.Count){throw "PowerShell parse errors: $file"}
}
@{passed=$true;checks=9;source='offline-real-powershell-zip-validation';host_modified=$false}|ConvertTo-Json|Set-Content (Join-Path $out 'report.json') -Encoding UTF8
Write-Output "PASS bootstrap checksum, binary checksum response, traversal, incomplete archive and PowerShell syntax; $out"
