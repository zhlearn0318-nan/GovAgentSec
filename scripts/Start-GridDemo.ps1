[CmdletBinding()]
param([switch]$NoBrowser, [switch]$NewSession)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent

# Native OpenClaw only; reuse the full-stack startup and authenticated entry.
$startupArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $repo 'scripts/Start-GovAgentSec.ps1'))
if ($NoBrowser) { $startupArgs += '-NoBrowser' }
& powershell.exe @startupArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host '电网演示已进入现有 OpenClaw 工作区。'
Write-Host '动态权限登录 jingban；资料审批使用 shenpi，技能审核使用 admin。'
if ($NewSession) {
    Write-Host '重录时请在 OpenClaw 会话列表点击新建会话；原会话、授权和审计记录均保留。'
}
Write-Host ('录制说明：' + (Join-Path $repo 'modules/grid-demo/README.md'))
