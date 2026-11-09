[CmdletBinding()]
param([switch]$NonInteractive)
$ErrorActionPreference = 'Stop'
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'release-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
function Run([string]$command, [string[]]$arguments) {
    & $command @arguments
    if ($LASTEXITCODE -ne 0) { throw "Failed: $command" }
}
$env:PATH = (Join-Path $env:ProgramFiles 'nodejs') + ';' + (Join-Path $env:APPDATA 'npm') + ';' + $env:PATH
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
    Run 'winget.exe' @('install','--id','OpenJS.NodeJS.LTS','--version',$manifest.node_install_version,'--exact','--silent','--accept-source-agreements','--accept-package-agreements')
}
Run 'node.exe' @('-e','const [a,b,c]=process.versions.node.split(".").map(Number);if(!((a===22&&(b>22||(b===22&&c>=3)))||(a===24&&b>=15)||(a===25&&b>=9)||a>25))process.exit(1)')
$hostRoot = Join-Path $env:APPDATA 'npm\node_modules\openclaw'
$package = Join-Path $hostRoot 'package.json'
$other = Get-Command openclaw.cmd -ErrorAction SilentlyContinue
if ($other -and [IO.Path]::GetFullPath($other.Source) -ne [IO.Path]::GetFullPath((Join-Path $env:APPDATA 'npm\openclaw.cmd'))) {
    throw 'A custom OpenClaw installation was found. No overwrite performed; use the standard current-user npm prefix.'
}
if (Test-Path -LiteralPath $package) {
    if ((Get-Content -LiteralPath $package -Raw -Encoding UTF8 | ConvertFrom-Json).version -ne $manifest.openclaw) {
        throw 'Existing OpenClaw is not 2026.7.1-2. No upgrade or downgrade performed. Use a separate Windows account for this release.'
    }
} else {
    Run 'npm.cmd' @('install','--global','--prefix',(Join-Path $env:APPDATA 'npm'),('openclaw@' + $manifest.openclaw))
}
if ((Get-Content -LiteralPath $package -Raw -Encoding UTF8 | ConvertFrom-Json).version -ne $manifest.openclaw) { throw 'OpenClaw version check failed' }
if ($NonInteractive) {
    $state = Join-Path $env:USERPROFILE '.openclaw'
    $fresh = -not (Test-Path -LiteralPath (Join-Path $state 'openclaw.json'))
    Run 'node.exe' @((Join-Path $PSScriptRoot 'scripts\initialize_windows_config.mjs'),$hostRoot,$state)
    if ($fresh) {
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
        Run 'icacls.exe' @((Join-Path $state 'openclaw.json'),'/inheritance:r','/grant:r',($identity + ':(F)'))
    }
} else {
    Run (Join-Path $env:APPDATA 'npm\openclaw.cmd') @('onboard','--install-daemon')
}
Write-Host 'Pinned OpenClaw is ready. Existing configuration and credentials were preserved.'
