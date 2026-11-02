[CmdletBinding()]
param(
    [switch]$CheckOnly,
    [switch]$RepairSockets,
    [ValidateRange(15, 300)][int]$TimeoutSeconds = 90
)
$ErrorActionPreference = 'Stop'
$candidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'),
    (Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe')
)
$onPath = Get-Command docker.exe -ErrorAction SilentlyContinue
if ($onPath) { $candidates += $onPath.Source }
$dockerCli = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $dockerCli) { throw 'Docker CLI not found for this Windows user. Run from the account that installed Docker Desktop.' }

function Test-LinuxEngine {
    # Bound each CLI call as well as the startup loop; an unresponsive pipe must not hang setup.
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $dockerCli
    $info.Arguments = '--context desktop-linux version --format "{{.Server.Os}} {{.Server.Version}}"'
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $info
    try {
        [void]$process.Start()
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(5000)) {
            $process.Kill()
            [void]$process.WaitForExit(2000)
            return $false
        }
        $output = $stdout.GetAwaiter().GetResult().Trim()
        if ($process.ExitCode -eq 0 -and $output -match '^linux\s+\S+$') {
            Write-Host "Docker ready: $output (desktop-linux)"
            return $true
        }
        return $false
    } finally { $process.Dispose() }
}

if (Test-LinuxEngine) { return }
if ($CheckOnly) { throw 'Docker Linux engine is unavailable.' }
$desktopExe = Join-Path (Split-Path (Split-Path (Split-Path $dockerCli))) 'Docker Desktop.exe'
if (-not (Test-Path -LiteralPath $desktopExe -PathType Leaf)) { throw 'Docker Desktop executable not found beside the CLI.' }
Start-Process -FilePath $desktopExe -WindowStyle Hidden | Out-Null
$timer = [Diagnostics.Stopwatch]::StartNew()
while ($timer.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
    Start-Sleep -Seconds 2
    if (Test-LinuxEngine) { return }
}
if ($RepairSockets) {
    # The repair script independently checks the exact error, paths and socket-only contents.
    & (Join-Path $PSScriptRoot 'Repair-DockerSockets.ps1')
    return
}
throw 'Docker did not become ready. For the known Windows stale socket error, rerun with -RepairSockets. Otherwise inspect Docker Desktop diagnostics.'
