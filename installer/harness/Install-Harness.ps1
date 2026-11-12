[CmdletBinding()]
param(
    [string]$Release = $PSScriptRoot,
    [string]$MediaRoot = $PSScriptRoot,
    [string]$BundleExePath,
    [ValidateSet('install','repair','uninstall','inspect','preflight')][string]$Action = 'install',
    [string]$ConfigFile
)
$ErrorActionPreference = 'Stop'
if ($ConfigFile) {
    & (Join-Path $Release 'Advanced-Harness.ps1') -Release $Release -MediaRoot $MediaRoot -Action $Action -ConfigFile $ConfigFile
    exit $LASTEXITCODE
}
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
function Quote-Argument([string]$Value) {
    if ($Value -match '["\r\n]') { throw '路径不能包含引号或换行。' }
    return '"' + [regex]::Replace($Value, '(\\+)$', '$1$1') + '"'
}
$form = New-Object Windows.Forms.Form
$form.Text = 'GovAgentSec · DeepSeek Harness 安装'
$form.ClientSize = New-Object Drawing.Size(620, 300)
$form.StartPosition = 'CenterScreen'; $form.FormBorderStyle = 'FixedDialog'; $form.MaximizeBox = $false
$form.Font = New-Object Drawing.Font('Microsoft YaHei UI', 10)
$heading = New-Object Windows.Forms.Label
$heading.Text = '安装 GovAgentSec 防护插件'; $heading.Location = New-Object Drawing.Point(24, 22)
$heading.Size = New-Object Drawing.Size(565, 30); $heading.Font = New-Object Drawing.Font('Microsoft YaHei UI', 14, [Drawing.FontStyle]::Bold)
$hint = New-Object Windows.Forms.Label
$hint.Text = '请选择插件安装路径，其余配置将自动完成。安装前请关闭 Harness。'
$hint.Location = New-Object Drawing.Point(24, 60); $hint.Size = New-Object Drawing.Size(570, 28)
$label = New-Object Windows.Forms.Label
$label.Text = '安装路径'; $label.Location = New-Object Drawing.Point(24, 101); $label.Size = New-Object Drawing.Size(80, 26)
$pathBox = New-Object Windows.Forms.TextBox
$pathBox.Text = Join-Path $env:LOCALAPPDATA 'GovAgentSec'
$pathBox.AccessibleName = '安装路径'; $pathBox.Location = New-Object Drawing.Point(105, 98); $pathBox.Size = New-Object Drawing.Size(380, 28); $pathBox.TabIndex = 0
$browse = New-Object Windows.Forms.Button
$browse.Text = '浏览…'; $browse.Location = New-Object Drawing.Point(495, 96); $browse.Size = New-Object Drawing.Size(100, 32); $browse.TabIndex = 1
$browse.Add_Click({
    $dialog = New-Object Windows.Forms.FolderBrowserDialog
    $dialog.Description = '选择 GovAgentSec 插件的安装目录'; $dialog.SelectedPath = $pathBox.Text
    if ($dialog.ShowDialog($form) -eq 'OK') { $pathBox.Text = $dialog.SelectedPath }
    $dialog.Dispose()
})
$status = New-Object Windows.Forms.Label
$status.Text = '自动识别 Harness；首次安装会自动下载缺失的模型文件。'
$status.Location = New-Object Drawing.Point(24, 147); $status.Size = New-Object Drawing.Size(570, 65)
$progress = New-Object Windows.Forms.ProgressBar
$progress.Location = New-Object Drawing.Point(24, 218); $progress.Size = New-Object Drawing.Size(570, 8); $progress.Visible = $false
$button = New-Object Windows.Forms.Button
$button.Text = $(if ($Action -eq 'uninstall') { '卸载' } else { '安装' })
$button.Location = New-Object Drawing.Point(470, 246); $button.Size = New-Object Drawing.Size(125, 34); $button.TabIndex = 2
$form.Controls.AddRange(@($heading, $hint, $label, $pathBox, $browse, $status, $progress, $button))
$form.AcceptButton = $button
$timer = New-Object Windows.Forms.Timer; $timer.Interval = 700
$script:job = $null
$button.Add_Click({
    if ($button.Text -eq '完成') { $form.Close(); return }
    try {
        $chosen = $pathBox.Text.Trim()
        if (-not [IO.Path]::IsPathRooted($chosen) -or $chosen -match '["\r\n]') { throw '请选择有效的绝对安装路径。' }
        $chosen = [IO.Path]::GetFullPath($chosen)
        $logs = Join-Path $chosen ('setup-logs/' + [Guid]::NewGuid().ToString('N'))
        [IO.Directory]::CreateDirectory($logs) | Out-Null
        $arguments = @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $Release 'OneClick-Worker.ps1'),
            '-Release',$Release,'-MediaRoot',$MediaRoot,'-InstallRoot',$chosen,'-Logs',$logs,'-Action',$(if ($Action -eq 'uninstall') { 'uninstall' } else { 'install' }))
        if ($BundleExePath) { $arguments += @('-BundleExePath',$BundleExePath) }
        $powershell = Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
        $process = Start-Process -FilePath $powershell -ArgumentList (($arguments | ForEach-Object { Quote-Argument $_ }) -join ' ') `
            -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'result.json') -RedirectStandardError (Join-Path $logs 'error.txt') -PassThru
        [void]$process.Handle
        $script:job = @{ process=$process; logs=$logs }
        $button.Enabled = $false; $browse.Enabled = $false; $pathBox.Enabled = $false
        $status.Text = '正在准备安装，请保持窗口开启…'
        $progress.Visible = $true; $progress.Style = 'Marquee'; $timer.Start()
    } catch { $status.Text = $_.Exception.Message }
})
$timer.Add_Tick({
    $statusFile = Join-Path $script:job.logs 'progress.json'
    if (Test-Path -LiteralPath $statusFile) {
        try { $status.Text = (Get-Content -LiteralPath $statusFile -Raw -Encoding UTF8 | ConvertFrom-Json).message } catch { }
    }
    if ($script:job.process.HasExited) {
        $script:job.process.Refresh(); $timer.Stop(); $progress.Style = 'Blocks'
        $button.Enabled = $true
        if ($script:job.process.ExitCode -eq 0) {
            $progress.Value = 100; $button.Text = '完成'
            $status.Text = $(if ($Action -eq 'uninstall') { '卸载完成。模型缓存和审计记录已保留。' } else { '安装完成！请按原方式重新启动 DeepSeek Harness。' })
        } else {
            $browse.Enabled = $true; $pathBox.Enabled = $true; $progress.Visible = $false
            $failureFile = Join-Path $script:job.logs 'failure.txt'
            $reason = if (Test-Path -LiteralPath $failureFile) { [IO.File]::ReadAllText($failureFile, [Text.Encoding]::UTF8) } else { '请检查 Harness 和网络后重试。' }
            $status.Text = "安装未完成：$reason`n诊断目录：$($script:job.logs)"
        }
    }
})
$form.Add_FormClosing({ param($sender, $eventArgs)
    if ($script:job -and -not $script:job.process.HasExited) { $eventArgs.Cancel = $true; $status.Text = '安装正在进行，请等待完成后关闭。' }
})
[void]$form.ShowDialog()
$timer.Dispose(); $form.Dispose()
