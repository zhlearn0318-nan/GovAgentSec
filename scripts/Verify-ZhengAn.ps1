[CmdletBinding()]
param([switch]$Live, [ValidateRange(10, 1800)][int]$TimeoutSeconds = 180)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    $out = Join-Path $repo ('local-validation/verify/' + [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH-mm-ss-fffZ'))
    New-Item -ItemType Directory -Path $out -Force | Out-Null
    $reason = '缺少 Node.js，无法启动验收。安装项目所需运行环境后复跑；未自动下载。'
    $command = 'powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Verify-ZhengAn.ps1'
    if ($Live) { $command += ' -Live' }
    $layers = @('行为护栏','权限闸门','过程台账','经验自演进','文档索引') | ForEach-Object {
        @{ name=$_; status='skipped'; passed=0; failed=0; skipped=1; reason=$reason }
    }
    @{ schema_version=1; source='local-preflight'; status='incomplete'; exit_code=2; live_requested=[bool]$Live; reason=$reason;
       layers=@($layers); reproduce=$command } |
        ConvertTo-Json -Depth 6 | Set-Content (Join-Path $out 'report.json') -Encoding UTF8
    $lines = @('# 政安纵深四层验收', '', '结果：未完成；退出码 2。', '', $reason, '', '| 层 | 状态 |', '| --- | --- |')
    $lines += $layers | ForEach-Object { '| ' + $_.name + ' | 跳过：缺少 Node.js |' }
    $lines += @('', '复跑命令：', '', '```powershell', $command, '```')
    $lines | Set-Content (Join-Path $out 'report.md') -Encoding UTF8
    Write-Host "Report: $out"
    exit 2
}
$arguments = @((Join-Path $PSScriptRoot 'verify_zhengan.mjs'), '--timeout', "$TimeoutSeconds")
if ($Live) { $arguments += '--live' }
& $node.Source @arguments
exit $LASTEXITCODE
