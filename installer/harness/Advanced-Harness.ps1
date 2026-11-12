[CmdletBinding()]
param(
    [string]$Release = $PSScriptRoot,
    [string]$MediaRoot = $PSScriptRoot,
    [ValidateSet('install','repair','uninstall','inspect','preflight')][string]$Action = 'install',
    [string]$ConfigFile
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
. (Join-Path $Release 'Python-Bootstrap.ps1')
$releaseManifest = Get-Content -LiteralPath (Join-Path $Release 'release.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$script:bootstrapPython = $null

function Quote-Argument([string]$Value) {
    if ($Value.Contains('"') -or $Value.Contains("`n") -or $Value.Contains("`r")) { throw '路径不能包含引号或换行。' }
    return '"' + [regex]::Replace($Value, '(\\+)$', '$1$1') + '"'
}

function Start-Deployment($Values, [string]$RequestedAction = $Action) {
    $python = $Values.python
    if (-not $python) {
        foreach ($directory in @(Get-ChildItem -LiteralPath (Join-Path $Values.installRoot 'profiles') -Directory -ErrorAction SilentlyContinue)) {
            $recordPath = Join-Path $directory.FullName 'installation.json'
            if (-not (Test-Path -LiteralPath $recordPath)) { continue }
            try {
                $record = Get-Content -LiteralPath $recordPath -Raw -Encoding UTF8 | ConvertFrom-Json
                if ([string]::Equals([IO.Path]::GetFullPath($record.dshHome), [IO.Path]::GetFullPath($Values.dshHome), [StringComparison]::OrdinalIgnoreCase) -and
                    [string]::Equals($record.profile, $Values.profile, [StringComparison]::OrdinalIgnoreCase) -and
                    (Test-Path -LiteralPath $record.pythonPath -PathType Leaf)) { $python = $record.pythonPath; break }
            } catch { }
        }
    }
    if (-not $python -and $Values.managedPython) {
        if (-not $releaseManifest.python) { throw '此发行物未包含受管 Python 清单。' }
        if (-not $script:bootstrapPython) {
            $script:bootstrapPython = Expand-VerifiedBootstrapPython -Artifact $Values.managedPython -ExpectedHash $releaseManifest.python.sha256 -ExpandedBytes $releaseManifest.python.expandedBytes
        }
        $python = $script:bootstrapPython
    }
    if (-not $python -or -not (Test-Path -LiteralPath $python -PathType Leaf)) { throw '请选择受管 Python 制品或现有 Python。' }
    $script = Join-Path $Release 'harness_setup.py'
    $arguments = @('-I', $script, $RequestedAction, '--release', $Release, '--install-root', $Values.installRoot,
        '--dsh-home', $Values.dshHome, '--profile', $Values.profile, '--python', $python)
    if ($Values.dsh.EndsWith('.js')) { $arguments += @('--dsh-cli', $Values.dsh) }
    else { $arguments += @('--dsh', $Values.dsh) }
    if ($RequestedAction -in @('install','repair','preflight')) {
        $arguments += @('--model-root', $Values.models)
        if ($Values.scannerPython) { $arguments += @('--scanner-python', $Values.scannerPython) }
        if ($Values.trustRag) { $arguments += @('--trustrag-module', $Values.trustRag) }
        if ($Values.managedPython) { $arguments += @('--managed-python-artifact', $Values.managedPython) }
        if ($Values.prepareModels) { $arguments += '--prepare-models' }
        foreach ($root in $Values.scanRoots) { $arguments += @('--scan-root', $root) }
        foreach ($root in $Values.loaderRoots) { $arguments += @('--loader-root', $root) }
    }
    $logs = Join-Path ([IO.Path]::GetTempPath()) ('GovAgentSec-setup-' + [Guid]::NewGuid().ToString('N'))
    [IO.Directory]::CreateDirectory($logs) | Out-Null
    $process = Start-Process -FilePath $python -ArgumentList (($arguments | ForEach-Object { Quote-Argument $_ }) -join ' ') `
        -RedirectStandardOutput (Join-Path $logs 'result.json') -RedirectStandardError (Join-Path $logs 'error.txt') `
        -WindowStyle Hidden -PassThru
    # Windows PowerShell 5.1 must retain the handle before waiting; otherwise
    # ExitCode can be null for a successfully completed redirected process.
    [void]$process.Handle
    return @{ process = $process; logs = $logs; action = $RequestedAction }
}

if ($ConfigFile) {
    $values = Get-Content -LiteralPath $ConfigFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $job = Start-Deployment $values
    $job.process.WaitForExit()
    $job.process.Refresh()
    if ($job.process.ExitCode -ne 0) { throw "部署失败。诊断信息：$($job.logs)" }
    Get-Content -LiteralPath (Join-Path $job.logs 'result.json') -Raw -Encoding UTF8
    exit 0
}

$form = New-Object Windows.Forms.Form
$form.Text = 'GovAgentSec · DeepSeek Harness 安装'
$form.Size = New-Object Drawing.Size(820, 980)
$form.StartPosition = 'CenterScreen'
$form.Font = New-Object Drawing.Font('Microsoft YaHei UI', 9)
$form.AutoScroll = $true
$fields = @{}
$definitions = @(
    @('dsh','Harness CLI（dsh.exe 或 bin.js）',''),
    @('dshHome','DSH_HOME',$(if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' })),
    @('profile','目标 profile','web'),
    @('installRoot','安装目录',(Join-Path $env:LOCALAPPDATA 'GovAgentSec')),
    @('managedPython','离线 Python 制品（zip）',$(if ($releaseManifest.python) { Join-Path $MediaRoot $releaseManifest.python.file } else { '' })),
    @('python','现有 Python（选用离线制品时可留空）',''),
    @('scannerPython','扫描器 Python（Pydantic 2 / PyYAML）',''),
    @('models','模型缓存目录（按模型锁校验）',(Join-Path $env:LOCALAPPDATA 'GovAgentSec/models')),
    @('trustRag','TrustRAG defend_module.py','')
)
$y = 20
foreach ($definition in $definitions) {
    $label = New-Object Windows.Forms.Label
    $label.Text = $definition[1]; $label.Location = New-Object Drawing.Point(20, $y); $label.Size = New-Object Drawing.Size(300, 23)
    $box = New-Object Windows.Forms.TextBox
    $box.Text = $definition[2]; $box.Location = New-Object Drawing.Point(325, $y); $box.Size = New-Object Drawing.Size(440, 25)
    $form.Controls.Add($label); $form.Controls.Add($box); $fields[$definition[0]] = $box
    $y += 41
}
foreach ($definition in @(@('scanRoots','允许扫描的目录（每行一个）'), @('loaderRoots','全部 Skill 加载根目录（每行一个）'))) {
    $label = New-Object Windows.Forms.Label
    $label.Text = $definition[1]; $label.Location = New-Object Drawing.Point(20, $y); $label.Size = New-Object Drawing.Size(300, 40)
    $box = New-Object Windows.Forms.TextBox
    $box.Multiline = $true; $box.ScrollBars = 'Vertical'; $box.Location = New-Object Drawing.Point(325, $y); $box.Size = New-Object Drawing.Size(440, 70)
    $form.Controls.Add($label); $form.Controls.Add($box); $fields[$definition[0]] = $box
    $y += 86
}
$prepareModels = New-Object Windows.Forms.CheckBox
$prepareModels.Text = '下载或续传缺失的锁定模型文件（先检查环境以查看预计下载量）'
$prepareModels.Checked = [bool]$releaseManifest.python
$prepareModels.Location = New-Object Drawing.Point(20, $y); $prepareModels.Size = New-Object Drawing.Size(745, 28)
$form.Controls.Add($prepareModels); $y += 34
$notice = New-Object Windows.Forms.Label
$notice.Text = '请关闭目标 Harness。安装会验证真实模型和扫描器；首次验证可能需要数分钟。安装后仍须重启 Harness 并完成真实对话验收。模型和审计数据在卸载时保留。'
$notice.Location = New-Object Drawing.Point(20, $y); $notice.Size = New-Object Drawing.Size(745, 55)
$form.Controls.Add($notice); $y += 62
$button = New-Object Windows.Forms.Button
$button.Text = $(if ($Action -eq 'uninstall') { '卸载当前 profile' } else { '验证并安装' })
$button.Location = New-Object Drawing.Point(20, $y); $button.Size = New-Object Drawing.Size(180, 36)
$form.Controls.Add($button)
$checkButton = New-Object Windows.Forms.Button
$checkButton.Text = '检查环境与空间'; $checkButton.Location = New-Object Drawing.Point(220, $y); $checkButton.Size = New-Object Drawing.Size(180, 36)
$form.Controls.Add($checkButton); $y += 46
$status = New-Object Windows.Forms.TextBox
$status.Multiline = $true; $status.ReadOnly = $true; $status.ScrollBars = 'Vertical'
$status.Location = New-Object Drawing.Point(20, $y); $status.Size = New-Object Drawing.Size(745, 140)
$form.Controls.Add($status)
$timer = New-Object Windows.Forms.Timer
$timer.Interval = 500
$script:deploymentJob = $null
function Invoke-UiDeployment([string]$RequestedAction) {
    try {
        $values = @{}
        foreach ($key in $fields.Keys) { $values[$key] = $fields[$key].Text.Trim() }
        foreach ($key in @('scanRoots','loaderRoots')) { $values[$key] = @($values[$key] -split '\r?\n' | Where-Object { $_.Trim() } | ForEach-Object { $_.Trim() }) }
        if (-not $values.scannerPython) { $values.scannerPython = $values.python }
        $values.prepareModels = $prepareModels.Checked
        $button.Enabled = $false; $checkButton.Enabled = $false
        $status.Text = '正在校验离线运行时并检查环境，请等待。'; $form.Refresh()
        $script:deploymentJob = Start-Deployment $values $RequestedAction
        $button.Enabled = $false; $checkButton.Enabled = $false
        $timer.Start()
    } catch { $button.Enabled = $true; $checkButton.Enabled = $true; $status.Text = $_.Exception.Message }
}
$button.Add_Click({ Invoke-UiDeployment $Action })
$checkButton.Add_Click({ Invoke-UiDeployment 'preflight' })
$timer.Add_Tick({
    if ($script:deploymentJob.process.HasExited) {
        $timer.Stop(); $button.Enabled = $true; $checkButton.Enabled = $true
        if ($script:deploymentJob.action -eq 'preflight' -and (Test-Path -LiteralPath (Join-Path $script:deploymentJob.logs 'result.json'))) {
            try {
                $report = Get-Content -LiteralPath (Join-Path $script:deploymentJob.logs 'result.json') -Raw -Encoding UTF8 | ConvertFrom-Json
                $lines = @($(if ($report.ok) { '预检通过；安装时仍会执行真实模型与扫描器探测。' } else { '预检未通过，请处理以下问题。' }))
                if ($report.host.version) { $lines += "Harness：$($report.host.version)" }
                if ($report.managedPython) { $lines += ('离线运行环境大小：{0:N2} GiB（本地文件）' -f ($report.pythonArtifactBytes/1GB)) }
                foreach ($gpu in $report.machine.gpus) { $lines += "显卡：$($gpu.name)，驱动：$($gpu.driverVersion)，显存：$($gpu.memoryMiB) MiB" }
                foreach ($volume in $report.volumes) { $lines += ('磁盘需求 {0:N2} GiB，可用 {1:N2} GiB' -f ($volume.requiredBytes/1GB), ($volume.freeBytes/1GB)) }
                if ($null -ne $report.models.downloadBytes) { $lines += ('模型预计下载 {0:N2} GiB；重试上限 {1:N2} GiB' -f ($report.models.downloadBytes/1GB),($report.models.worstCaseDownloadBytes/1GB)) }
                foreach ($issue in $report.issues) { $lines += "$($issue.component)：$($issue.recovery)" }
                $status.Text = $lines -join [Environment]::NewLine
            } catch { $status.Text = "预检失败。诊断目录：$($script:deploymentJob.logs)" }
        } elseif ($script:deploymentJob.process.ExitCode -eq 0) {
            $status.Text = $(if ($Action -eq 'uninstall') { '已卸载；模型、审计和共享运行时已保留。' } else { '配置已安装。请按原方式启动 Harness，核对安全工作区并完成对话验收。' })
        } else { $status.Text = "部署失败，已尝试恢复配置。诊断目录：$($script:deploymentJob.logs)" }
    }
})
$form.Add_FormClosing({ param($sender, $eventArgs)
    if ($script:deploymentJob -and -not $script:deploymentJob.process.HasExited) {
        $eventArgs.Cancel = $true; $status.Text = '安装事务进行中，请等待完成后关闭。'
    }
})
[void]$form.ShowDialog()
$timer.Dispose()
