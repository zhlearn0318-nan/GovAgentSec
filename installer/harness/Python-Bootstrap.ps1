function Get-DistributedPython {
    param($Python, [string]$MediaRoot, [string]$DownloadRoot, [scriptblock]$Progress)
    $artifact = Join-Path $DownloadRoot $Python.file
    [IO.Directory]::CreateDirectory($DownloadRoot) | Out-Null
    $lock = [IO.File]::Open(($artifact + '.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $staged = $artifact + '.partial'
    try {
        if (Test-Path -LiteralPath $artifact -PathType Leaf) {
            & $Progress '正在校验已下载的运行环境…'
            if ((Get-Item -LiteralPath $artifact).Length -eq $Python.bytes -and
                (Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash -eq $Python.sha256) { return $artifact }
            Remove-Item -LiteralPath $artifact
        }
        $partPaths = @()
        $downloaded = @()
        $index = 0
        foreach ($part in $Python.distribution.parts) {
            $index++
            $mediaPart = Join-Path $MediaRoot $part.file
            $fromMedia = Test-Path -LiteralPath $mediaPart -PathType Leaf
            if ($fromMedia) {
                $path = $mediaPart
            } else {
                $path = Join-Path $DownloadRoot ($part.file + '.partial')
                $downloaded += $path
                $current = if (Test-Path -LiteralPath $path -PathType Leaf) { (Get-Item -LiteralPath $path).Length } else { 0 }
                if ($current -gt $part.bytes) { Remove-Item -LiteralPath $path; $current = 0 }
                if ($current -lt $part.bytes) {
                    & $Progress "正在下载运行环境（$index/$($Python.distribution.parts.Count)）…"
                    $curl = Join-Path $env:WINDIR 'System32/curl.exe'
                    $url = $Python.distribution.baseUrl + '/' + $part.file
                    & $curl --disable --silent --show-error --fail --location --proto '=https' --proto-redir '=https' `
                        --connect-timeout 30 --max-time 7200 --max-filesize $part.bytes --continue-at - --output $path -- $url
                    if ($LASTEXITCODE -ne 0) { throw '运行环境下载中断，请确认 GitHub 可访问、磁盘空间充足，然后重试。' }
                }
            }
            & $Progress "正在校验运行环境分卷（$index/$($Python.distribution.parts.Count)）…"
            if ((Get-Item -LiteralPath $path).Length -ne $part.bytes -or
                (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $part.sha256) {
                if (-not $fromMedia) { Remove-Item -LiteralPath $path }
                throw "运行环境分卷校验失败，请重新下载 $($part.file)。"
            }
            $partPaths += $path
        }
        & $Progress '正在合并并校验运行环境…'
        $output = [IO.File]::Create($staged)
        try {
            foreach ($path in $partPaths) {
                $input = [IO.File]::OpenRead($path)
                try { $input.CopyTo($output, 1048576) } finally { $input.Dispose() }
            }
        } finally { $output.Dispose() }
        if ((Get-Item -LiteralPath $staged).Length -ne $Python.bytes -or
            (Get-FileHash -LiteralPath $staged -Algorithm SHA256).Hash -ne $Python.sha256) {
            throw '合并后的运行环境校验失败，请重新获取安装器和分卷。'
        }
        [IO.File]::Move($staged, $artifact)
        foreach ($path in $downloaded) { Remove-Item -LiteralPath $path }
        return $artifact
    } finally {
        try {
            if (Test-Path -LiteralPath $staged -PathType Leaf) { Remove-Item -LiteralPath $staged }
        } finally { $lock.Dispose() }
    }
}

function Expand-VerifiedBootstrapPython {
    param([string]$Artifact, [string]$ExpectedHash, [long]$ExpandedBytes, [string]$CacheRoot = [IO.Path]::GetTempPath())
    $actual = (Get-FileHash -LiteralPath $Artifact -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $ExpectedHash) { throw 'Python artifact digest mismatch.' }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($Artifact)
    try {
        $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
        [long]$total = 0
        if ($archive.Entries.Count -gt 50000) { throw 'Python artifact has too many entries.' }
        foreach ($entry in $archive.Entries) {
            $name = $entry.FullName
            $parts = $name.Split('/')
            if ([IO.Path]::IsPathRooted($name) -or $name.Contains('\') -or $name.Contains(':') -or $name.EndsWith('/')) { throw 'Unsafe Python archive path.' }
            foreach ($part in $parts) {
                if (-not $part -or $part -eq '..' -or $part -eq '.' -or $part.EndsWith('.') -or $part.EndsWith(' ') -or $part -match '^(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)') { throw 'Unsafe Windows archive path.' }
            }
            $kind = ($entry.ExternalAttributes -shr 16) -band 61440
            if ($kind -ne 0 -and $kind -ne 32768) { throw 'Links are not allowed in the Python artifact.' }
            if (-not $seen.Add($name)) { throw 'Duplicate Python archive path.' }
            $total += $entry.Length
            if ($total -gt $ExpandedBytes) { throw 'Python archive exceeds its declared size.' }
        }
        $directory = Join-Path $CacheRoot ('GovAgentSec-bootstrap-' + [Guid]::NewGuid().ToString('N'))
        [IO.Directory]::CreateDirectory($directory) | Out-Null
        $prefix = [IO.Path]::GetFullPath($directory).TrimEnd('\') + '\'
        foreach ($entry in $archive.Entries) {
            if (-not $entry.FullName.StartsWith('python/', [StringComparison]::Ordinal)) { continue }
            $destination = [IO.Path]::GetFullPath((Join-Path $directory ($entry.FullName.Replace('/', '\'))))
            if (-not $destination.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Bootstrap path escapes temporary directory.' }
            [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
            $incoming = $entry.Open()
            try {
                $outgoing = [IO.File]::Open($destination, [IO.FileMode]::CreateNew)
                try { $incoming.CopyTo($outgoing) } finally { $outgoing.Dispose() }
            } finally { $incoming.Dispose() }
        }
        $python = Join-Path $directory 'python/python.exe'
        if (-not (Test-Path -LiteralPath $python -PathType Leaf)) { throw 'Python bootstrap executable is missing.' }
        return $python
    } finally { $archive.Dispose() }
}
