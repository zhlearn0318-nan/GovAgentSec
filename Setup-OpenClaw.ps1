[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
function Run([string]$command, [string[]]$arguments) {
    & $command @arguments
    if ($LASTEXITCODE -ne 0) { throw "Failed: $command" }
}
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
    Run 'winget.exe' @('install','--id','OpenJS.NodeJS.LTS','--exact','--accept-source-agreements','--accept-package-agreements')
}
$env:PATH = (Join-Path $env:ProgramFiles 'nodejs') + ';' + (Join-Path $env:APPDATA 'npm') + ';' + $env:PATH
Run 'npm.cmd' @('install','-g','openclaw@2026.7.1-2')
Run 'openclaw.cmd' @('onboard','--install-daemon')
Run 'openclaw.cmd' @('doctor')
Run 'openclaw.cmd' @('gateway','status')
Write-Host 'OpenClaw setup finished. Configure your own model provider, then run Install.cmd.'
