[CmdletBinding()]
param([string]$DeploymentRoot = '')
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $DeploymentRoot) { $DeploymentRoot = $PSScriptRoot }
$root = (Resolve-Path -LiteralPath $DeploymentRoot).Path
$python = Join-Path $root '.venv\Scripts\python.exe'
$recordPath = Join-Path $root 'live-runtime\agentguard-process.json'
if (-not (Test-Path -LiteralPath $recordPath -PathType Leaf)) { Write-Output '{"status":"not_running"}'; exit 0 }
$record = Get-Content -LiteralPath $recordPath -Raw -Encoding UTF8 | ConvertFrom-Json
$process = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$record.process_id)" -ErrorAction SilentlyContinue
if ($null -eq $process) { Write-Output '{"status":"not_running"}'; exit 0 }
$expected = (Resolve-Path -LiteralPath $python).Path
if (-not [string]::Equals($process.ExecutablePath, $expected, [StringComparison]::OrdinalIgnoreCase) -or $process.CommandLine -notlike "*$root*") {
    throw '进程身份与部署记录不匹配，拒绝停止。'
}
function Stop-Tree([int]$ParentId) {
    $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $ParentId" -ErrorAction SilentlyContinue)
    foreach ($child in $children) { Stop-Tree -ParentId ([int]$child.ProcessId) }
    Stop-Process -Id $ParentId -Force -ErrorAction SilentlyContinue
    Wait-Process -Id $ParentId -Timeout 10 -ErrorAction SilentlyContinue
}
Stop-Tree -ParentId ([int]$record.process_id)
Write-Output '{"status":"stopped"}'
