# Download the official v1.0 bundle, verify its checksum, then run the local installer.
[CmdletBinding()]
param([string]$InstallDirectory=(Join-Path $env:LOCALAPPDATA 'GovAgentSec\v1.0'), [switch]$NoBrowser)
$ErrorActionPreference='Stop'
function Test-ReleaseArchive([string]$Archive,[string]$ExpectedHash) {
    if($ExpectedHash -notmatch '^[a-fA-F0-9]{64}$' -or (Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash -ne $ExpectedHash){throw 'Release archive checksum mismatch; refusing execution.'}
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip=[IO.Compression.ZipFile]::OpenRead($Archive)
    try {
        foreach($entry in $zip.Entries){
            $name=$entry.FullName.Replace('\','/')
            if(-not $name.StartsWith('GovAgentSec/') -or $name.Contains(':') -or $name.Split('/') -contains '..' -or $name -match '//') {throw 'Unsafe archive entry; refusing extraction.'}
            if((($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000){throw 'Symlink archive entry is not allowed.'}
        }
        foreach($required in @('GovAgentSec/Setup-Windows.ps1','GovAgentSec/release-manifest.json')){
            if(-not $zip.GetEntry($required)){throw 'Incomplete release archive.'}
        }
    } finally {$zip.Dispose()}
}
# Dot-sourcing exposes the verifier for offline tests without downloading or installing.
if($MyInvocation.InvocationName -eq '.'){return}
try {
    [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
    $base='https://github.com/zhlearn0318-nan/GovAgentSec/releases/download/v1.0'
    $archiveName='GovAgentSec-v1.0-windows-x64.zip'
    $destination=[IO.Path]::GetFullPath($InstallDirectory)
    $receipt=Join-Path $destination '.govagentsec-release.json'
    if(Test-Path -LiteralPath $destination){
        if(-not (Test-Path -LiteralPath $receipt)){throw 'Destination exists and is not an installed release. Choose an empty directory; nothing was overwritten.'}
        $saved=Get-Content -LiteralPath $receipt -Raw -Encoding UTF8|ConvertFrom-Json
        if($saved.tag -ne 'v1.0'){throw 'Destination belongs to a different release.'}
    } else {
        $temp=Join-Path ([IO.Path]::GetTempPath()) ('govagentsec-download-'+[guid]::NewGuid().ToString())
        New-Item -ItemType Directory -Path $temp -Force|Out-Null
        $archive=Join-Path $temp $archiveName
        Write-Host 'Downloading GovAgentSec v1.0...'
        Invoke-WebRequest -UseBasicParsing ($base+'/'+$archiveName) -OutFile $archive
        # GitHub serves this file as application/octet-stream, so decode the response bytes explicitly.
        $checksumResponse=Invoke-WebRequest -UseBasicParsing ($base+'/SHA256SUMS.txt')
        $checksums=[Text.Encoding]::UTF8.GetString($checksumResponse.RawContentStream.ToArray())
        $line=@($checksums -split '\r?\n'|Where-Object{$_ -match ('^[a-fA-F0-9]{64}\s+\*?'+[regex]::Escape($archiveName)+'$')})
        if($line.Count -ne 1){throw 'Archive checksum is missing or ambiguous.'}
        $expected=($line[0] -split '\s+')[0]
        Test-ReleaseArchive $archive $expected
        $expanded=Join-Path $temp 'expanded';[IO.Compression.ZipFile]::ExtractToDirectory($archive,$expanded)
        $source=[IO.Path]::GetFullPath((Join-Path $expanded 'GovAgentSec'))
        $manifest=Get-Content (Join-Path $source 'release-manifest.json') -Raw -Encoding UTF8|ConvertFrom-Json
        if($manifest.tag -ne 'v1.0' -or $manifest.openclaw -ne '2026.7.1-2'){throw 'Unexpected release manifest.'}
        # Both absolute paths are checked before moving the extracted directory.
        if(-not $source.StartsWith([IO.Path]::GetFullPath($temp)+[IO.Path]::DirectorySeparatorChar) -or (Test-Path -LiteralPath $destination)){throw 'Extraction target changed; refusing move.'}
        New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force|Out-Null
        Move-Item -LiteralPath $source -Destination $destination
        @{tag='v1.0';archive_sha256=$expected}|ConvertTo-Json|Set-Content -LiteralPath $receipt -Encoding UTF8
    }
    $arguments=@('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $destination 'Setup-Windows.ps1'))
    if($NoBrowser){$arguments+='-NoBrowser'}
    & powershell.exe @arguments
    exit $LASTEXITCODE
} catch {Write-Error $_.Exception.Message -ErrorAction Continue;exit 1}
