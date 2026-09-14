<#
.SYNOPSIS
Verify the second-group AgentGuard native OpenClaw Control UI plugin.
#>

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'openclaw_agentguard_demo.common.ps1')

$projectRoot = Get-OpenClawDemoProjectRoot
$paths = Get-OpenClawDemoPaths -ProjectRoot $projectRoot
$record = Get-OpenClawDemoGatewayProcessRecord -Paths $paths
if ($null -eq $record -or $null -eq $record.PSObject.Properties['port']) {
    throw '未找到正在运行的 OpenClaw 演示网关。'
}
$port = [int]$record.port
$routeRoot = "http://127.0.0.1:$port/plugins/agentguard-runtime-security"
$panel = Invoke-WebRequest -UseBasicParsing -Uri "$routeRoot/panel" -TimeoutSec 8
$snapshot = Invoke-RestMethod -Uri "$routeRoot/api/snapshot" -TimeoutSec 8
$snapshotJson = $snapshot | ConvertTo-Json -Depth 24

$checks = [ordered]@{
    panel_http_ok = $panel.StatusCode -eq 200
    panel_title_found = $panel.Content.Contains('AgentGuard 运行时安全中心')
    interactive_workbench_found = $panel.Content.Contains('候选动作试算台') -and $panel.Content.Contains('/api/evaluate')
    operator_approval_controls_found = $panel.Content.Contains('批准并执行') -and $panel.Content.Contains('data-approval="interrupt"') -and $panel.Content.Contains('/api/approvals/resolve')
    audit_incident_ui_found = $panel.Content.Contains('全链路事件与异常') -and $panel.Content.Contains('incident-count')
    wechat_channel_declared = $null -ne $snapshot.wechat -and $snapshot.wechat.mode -eq 'enterprise_wechat_robot_notification'
    group2_scope_declared = $snapshot.scope -eq 'group2_tool_runtime_governance'
    no_admission_scan_ui = -not $panel.Content.Contains('上传 ZIP') -and -not $panel.Content.Contains('开始安全扫描')
    real_requests_loaded = [int]$snapshot.counts.total -gt 0
    tri_state_counts_consistent = [int]$snapshot.counts.total -eq (
        [int]$snapshot.counts.allow +
        [int]$snapshot.counts.require_approval +
        [int]$snapshot.counts.deny
    )
    evidence_fields_complete = [int]$snapshot.evidence.coverage_percent -eq 100
    aegis_bridge_declared = $snapshot.integration.aegis_bridge_contract -eq 'agentguard-runtime-route-v1'
    agentguard_live = $snapshot.services.agentguard.ok -eq $true
    dependencies_ready = $snapshot.services.dependencies.payload.ready -eq $true
    openclaw_mcp_live = $snapshot.services.openclaw_mcp.ok -eq $true
    api_key_absent = $snapshotJson -notmatch '(?i)\bsk-[A-Za-z0-9_-]{12,}\b'
    raw_ticket_absent = $snapshotJson -notmatch '"ticket"\s*:\s*"(?!\*\*\*REDACTED\*\*\*)'
}
$passed = -not ($checks.Values -contains $false)
$report = [ordered]@{
    status = if ($passed) { 'passed' } else { 'failed' }
    checked_at = [DateTimeOffset]::UtcNow.ToString('o')
    plugin = 'agentguard-runtime-security'
    scope = 'group2_tool_runtime_governance'
    gateway_port = $port
    observed = [ordered]@{
        total = [int]$snapshot.counts.total
        allow = [int]$snapshot.counts.allow
        require_approval = [int]$snapshot.counts.require_approval
        deny = [int]$snapshot.counts.deny
        executed_isolated = [int]$snapshot.counts.executed_isolated
        approval_records = @($snapshot.approvals).Count
        incidents = @($snapshot.incidents).Count
    }
    checks = $checks
    secrets_recorded = $false
}
$reportDir = Join-Path $projectRoot 'reports\e2e\openclaw'
New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
$reportPath = Join-Path $reportDir 'openclaw_runtime_security_plugin.json'
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($reportPath, ($report | ConvertTo-Json -Depth 12), $utf8WithoutBom)
$report | ConvertTo-Json -Depth 12
if (-not $passed) { exit 1 }
