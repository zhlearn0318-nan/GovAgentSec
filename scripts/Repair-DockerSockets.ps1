[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$localRoot = [IO.Path]::GetFullPath($env:LOCALAPPDATA)
$errorFile = Join-Path $localRoot 'Docker\backend.error.json'
if (-not (Test-Path -LiteralPath $errorFile)) { throw 'No Docker startup error record found.' }
$failure = Get-Content -LiteralPath $errorFile -Raw
if ($failure -notmatch 'The file cannot be accessed by the system' -or $failure -notmatch 'sock|dockerInference') {
    throw 'This repair only handles the known stale Windows socket failure.'
}
$desktopRoot = Join-Path $localRoot 'Programs\DockerDesktop'
$desktopExe = Join-Path $desktopRoot 'Docker Desktop.exe'
if (-not (Test-Path -LiteralPath $desktopExe)) { throw 'Per-user Docker Desktop installation not found.' }
$targets = @('Docker\run', 'docker-secrets-engine') | ForEach-Object {
    $source = [IO.Path]::GetFullPath((Join-Path $localRoot $_))
    if (-not $source.StartsWith($localRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe path' }
    if (Test-Path -LiteralPath $source) {
        if ((Get-Item -LiteralPath $source).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing linked parent directory' }
        $unexpected = @(Get-ChildItem -LiteralPath $source -Force | Where-Object {
            $_.PSIsContainer -or -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $_.Length -ne 0
        })
        if ($unexpected.Count) { throw 'Unexpected non-socket data found; refusing repair.' }
        $source
    }
}
Get-Process -Name 'Docker Desktop','com.docker.backend','docker-desktop' -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -like "$desktopRoot\*" -or $_.Path -eq (Join-Path $env:USERPROFILE '.docker\cli-plugins\docker-desktop.exe')
} | Stop-Process -Force
Start-Sleep -Seconds 3
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
foreach ($source in $targets) {
    $destination = [IO.Path]::GetFullPath($source + '.govagentsec-backup-' + $stamp)
    if (-not $destination.StartsWith($localRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe backup path' }
    Move-Item -LiteralPath $source -Destination $destination
    Write-Host "Backed up temporary socket directory: $destination"
}
Start-Process -FilePath $desktopExe -WindowStyle Hidden
Write-Host 'Docker Desktop restarted. Images, containers, volumes and settings retained.'
