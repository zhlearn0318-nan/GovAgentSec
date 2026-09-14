[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$requirements = @(
    @{ Command='git.exe'; Id='Git.Git'; Paths=@((Join-Path $env:ProgramFiles 'Git\cmd\git.exe')) },
    @{ Command='python.exe'; Id='Python.Python.3.12'; Paths=@((Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe')) },
    @{ Command='conda.exe'; Id='Anaconda.Miniconda3'; Paths=@((Join-Path $env:LOCALAPPDATA 'miniconda3\Scripts\conda.exe')) },
    @{ Command='docker.exe'; Id='Docker.DockerDesktop'; Paths=@((Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'),(Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe')) },
    @{ Command='ollama.exe'; Id='Ollama.Ollama'; Paths=@((Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe')) }
)
foreach ($item in $requirements) {
    $exists = Get-Command $item.Command -All -ErrorAction SilentlyContinue | Where-Object { $_.Source -notlike '*\Microsoft\WindowsApps\*' } | Select-Object -First 1
    if (-not $exists) { $exists = @($item.Paths | Where-Object { Test-Path -LiteralPath $_ }).Count -gt 0 }
    if ($item.Command -eq 'python.exe') {
        $candidates = @($item.Paths) + @(Get-Command python.exe -All -ErrorAction SilentlyContinue | Where-Object { $_.Source -notlike '*\Microsoft\WindowsApps\*' } | ForEach-Object { $_.Source })
        $exists = $false
        foreach ($candidate in $candidates) {
            if (Test-Path -LiteralPath $candidate) {
                & $candidate -c 'import sys; sys.exit(0 if sys.version_info[:2] == (3,12) else 1)'
                if ($LASTEXITCODE -eq 0) { $exists = $true; break }
            }
        }
    }
    if (-not $exists) {
        & winget.exe install --id $item.Id --exact --silent --accept-source-agreements --accept-package-agreements
        if ($LASTEXITCODE -notin @(0,3010)) { throw "Dependency install failed: $($item.Id)" }
        if ($LASTEXITCODE -eq 3010) { throw 'Windows needs a restart to finish dependency installation; restart and run Install.cmd again.' }
    }
}
Write-Host 'Dependency applications checked. Docker first-run setup must be complete.'
