[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$taskName = 'GovAgentSec AgentGuard Backend'
$scriptPath = Join-Path $PSScriptRoot 'start_agentguard_live.ps1'
if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) { throw "启动脚本不存在：$scriptPath" }
$userId = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$arguments = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptPath`""
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing -and @($existing.Actions | Where-Object { $_.Arguments -ne $arguments }).Count -gt 0) {
    throw "Scheduled task $taskName belongs to a different installation. Update it explicitly before continuing."
}
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
$task = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Starts the loopback-only AgentGuard backend used by OpenClaw.'
Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Out-Null
$registered = Get-ScheduledTask -TaskName $taskName
[ordered]@{
    status = 'registered'
    task_name = $registered.TaskName
    state = [string]$registered.State
    run_level = 'limited'
    trigger = 'current_user_logon'
} | ConvertTo-Json -Depth 4
