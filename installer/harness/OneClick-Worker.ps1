[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$Release,
    [Parameter(Mandatory=$true)][string]$MediaRoot,
    [Parameter(Mandatory=$true)][string]$InstallRoot,
    [Parameter(Mandatory=$true)][string]$Logs,
    [string]$BundleExePath,
    [ValidateSet('install','uninstall')][string]$Action = 'install'
)
$ErrorActionPreference = 'Stop'
$utf8 = New-Object Text.UTF8Encoding($false)
function Quote-Argument([string]$Value) {
    if ($Value -match '["\r\n]') { throw '路径不能包含引号或换行。' }
    return '"' + [regex]::Replace($Value, '(\\+)$', '$1$1') + '"'
}
function Progress-Message([string]$Message) {
    [IO.File]::WriteAllText((Join-Path $Logs 'progress.json'), (@{message=$Message} | ConvertTo-Json), $utf8)
}
try {
    [IO.Directory]::CreateDirectory($Logs) | Out-Null
    $manifest = Get-Content -LiteralPath (Join-Path $Release 'release.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not $manifest.python) { throw '此发行物缺少内置 Python 运行环境。' }
    $artifact = Join-Path $InstallRoot ('downloads/' + $manifest.python.file)
    $beside = Join-Path $MediaRoot $manifest.python.file
    . (Join-Path $Release 'Python-Bootstrap.ps1')
    if (Test-Path -LiteralPath $beside -PathType Leaf) { $artifact = $beside }
    elseif ($manifest.python.distribution) {
        $artifact = Get-DistributedPython -Python $manifest.python -MediaRoot $MediaRoot -DownloadRoot (Split-Path -Parent $artifact) -Progress { param($Message) Progress-Message $Message }
    }
    elseif ($BundleExePath) {
        Progress-Message '正在校验并释放内置运行环境…'
        $startInfo = New-Object Diagnostics.ProcessStartInfo
        $startInfo.FileName = $BundleExePath
        $startInfo.Arguments = (@('--export-python', $artifact, $manifest.python.sha256) | ForEach-Object { Quote-Argument $_ }) -join ' '
        $startInfo.UseShellExecute = $false; $startInfo.CreateNoWindow = $true
        $export = [Diagnostics.Process]::Start($startInfo)
        [void]$export.Handle; $export.WaitForExit(); $export.Refresh()
        if ($export.ExitCode -ne 0) { throw '内置运行环境释放失败，请确认安装目录可写且空间充足，并重新获取完整安装器。' }
    }
    Progress-Message '正在启动内置安装环境…'
    $python = Expand-VerifiedBootstrapPython -Artifact $artifact -ExpectedHash $manifest.python.sha256 -ExpandedBytes $manifest.python.expandedBytes -CacheRoot (Join-Path $InstallRoot 'setup-cache')
    $arguments = @('-I', (Join-Path $Release 'harness_auto.py'), '--release', $Release, '--media', $MediaRoot,
        '--install-root', $InstallRoot, '--artifact', $artifact, '--status', (Join-Path $Logs 'progress.json'), '--action', $Action)
    $env:PYTHONUTF8 = '1'
    $process = Start-Process -FilePath $python -ArgumentList (($arguments | ForEach-Object { Quote-Argument $_ }) -join ' ') `
        -WindowStyle Hidden -RedirectStandardOutput (Join-Path $Logs 'installation.json') -RedirectStandardError (Join-Path $Logs 'components.txt') -PassThru
    [void]$process.Handle; $process.WaitForExit(); $process.Refresh()
    if ($process.ExitCode -ne 0) {
        $detail = [IO.File]::ReadAllText((Join-Path $Logs 'components.txt'), [Text.Encoding]::UTF8).Trim()
        if (-not $detail) { $detail = "安装组件异常退出（$($process.ExitCode)），请重试并检查诊断目录。" }
        if ($detail.Length -gt 400) { $detail = '组件检查未通过，详细原因见诊断目录中的 components.txt。' }
        throw $detail
    }
    Get-Content -LiteralPath (Join-Path $Logs 'installation.json') -Raw -Encoding UTF8
    exit 0
} catch {
    [IO.File]::WriteAllText((Join-Path $Logs 'failure.txt'), $_.Exception.Message, $utf8)
    exit 1
}
