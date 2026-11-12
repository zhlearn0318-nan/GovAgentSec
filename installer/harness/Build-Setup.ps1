[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$Release,
    [string]$CertificateThumbprint,
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._-]*\.exe$')][string]$OutputName = 'GovAgentSec-Setup.exe',
    [switch]$Production,
    [switch]$Standalone
)
$ErrorActionPreference = 'Stop'
if ($Production -and -not $CertificateThumbprint) { throw '正式发行必须提供代码签名证书。' }
$releasePath = (Resolve-Path -LiteralPath $Release).Path
$manifest = Get-Content -LiteralPath (Join-Path $releasePath 'release.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($Standalone -and $manifest.python.distribution) { throw '请使用未配置在线分卷的发行目录构建单文件安装器。' }
if ($Production -and (-not $manifest.acceptance.cleanWindows -or -not $manifest.acceptance.distributionHarness)) {
    throw '正式发行需要先完成干净 Windows 与发行版宿主验收。'
}
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw '缺少 .NET Framework C# 编译器。' }
$stage = Join-Path $releasePath ('setup-build-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($stage) | Out-Null
$sources = @('release.json', $manifest.bundle.file, $manifest.runtime.file, 'harness_setup.py', 'harness_preflight.py', 'harness_python.py', 'harness_auto.py',
    'Install-Harness.ps1', 'Advanced-Harness.ps1', 'OneClick-Worker.ps1', 'Python-Bootstrap.ps1', 'verify_harness_release.mjs', 'verify_harness_lifecycle.mjs', 'prepare_harness_runtime.py', 'models.lock.json')
foreach ($source in $sources) { Copy-Item -LiteralPath (Join-Path $releasePath $source) -Destination $stage }
$payload = Join-Path $releasePath 'setup-payload.zip'
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path -LiteralPath $payload) { Remove-Item -LiteralPath $payload }
[IO.Compression.ZipFile]::CreateFromDirectory($stage, $payload)
$output = Join-Path $releasePath $OutputName
& $compiler /nologo /codepage:65001 /target:winexe /reference:System.Windows.Forms.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll "/resource:$payload,payload.zip" "/out:$output" (Join-Path $PSScriptRoot 'Bootstrap.cs')
if ($LASTEXITCODE -ne 0) { throw '安装器编译失败。' }
if ($Standalone) {
    $artifact = Join-Path $releasePath $manifest.python.file
    if (-not $manifest.python -or (Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.python.sha256) {
        throw '单文件安装器需要完整且校验通过的 Python 制品。'
    }
    $outputStream = [IO.File]::Open($output, [IO.FileMode]::Append, [IO.FileAccess]::Write)
    try {
        $offset = $outputStream.Position
        $inputStream = [IO.File]::OpenRead($artifact)
        try { $length = $inputStream.Length; $inputStream.CopyTo($outputStream, 1048576) } finally { $inputStream.Dispose() }
        while (($outputStream.Position + 56) % 8 -ne 0) { $outputStream.WriteByte(0) }
        $writer = New-Object IO.BinaryWriter($outputStream)
        $writer.Write([long]$offset); $writer.Write([long]$length)
        [byte[]]$hashBytes = for ($i = 0; $i -lt 64; $i += 2) { [Convert]::ToByte($manifest.python.sha256.Substring($i, 2), 16) }
        $writer.Write($hashBytes); $writer.Write([Text.Encoding]::ASCII.GetBytes('GASPY001')); $writer.Flush()
    } finally { $outputStream.Dispose() }
}
if ($CertificateThumbprint) {
    $certificate = Get-Item -LiteralPath "Cert:\CurrentUser\My\$CertificateThumbprint"
    $signature = Set-AuthenticodeSignature -LiteralPath $output -Certificate $certificate -HashAlgorithm SHA256 -TimestampServer 'http://timestamp.digicert.com'
    if ($signature.Status -ne 'Valid') { throw '安装器签名未通过验证。' }
}
$hash = (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $releasePath ($OutputName + '.sha256')), ($hash + '  ' + $OutputName + [Environment]::NewLine))
$manifestName = if ($OutputName -eq 'GovAgentSec-Setup.exe') { 'setup.manifest.json' } else { [IO.Path]::GetFileNameWithoutExtension($OutputName) + '.manifest.json' }
@{ file=$OutputName; sha256=$hash; signed=[bool]$CertificateThumbprint; standalone=[bool]$Standalone; version=$manifest.version } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $releasePath $manifestName) -Encoding UTF8
Write-Output $output
