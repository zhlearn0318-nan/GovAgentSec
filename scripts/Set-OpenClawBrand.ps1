[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$uiRoot = Join-Path $env:APPDATA 'npm\node_modules\openclaw\dist\control-ui'
$logo = Join-Path $PSScriptRoot '..\modules\govagentsec-ui\logo.svg'
$assets = Join-Path $uiRoot 'assets'
$candidates = @(Get-ChildItem -LiteralPath $assets -Filter 'index-*.js' | Where-Object {
    [IO.File]::ReadAllText($_.FullName).Contains('sidebar-brand__title')
})
if ($candidates.Count -ne 1) { throw 'Expected one OpenClaw brand bundle; no files changed.' }
$bundle = $candidates[0]
$original = [IO.File]::ReadAllText($bundle.FullName)
$updated = $original
foreach ($kind in @('sidebar','topbar')) {
    $markup = '<span class="' + $kind + '-brand__title" style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;overflow:visible;line-height:1.15;font-size:15px;white-space:nowrap" aria-label="OpenClaw × 政安智枢"><span>OpenClaw</span><span style="font-size:13px;line-height:1" aria-hidden="true">×</span><span>政安智枢</span></span>'
    foreach ($oldTitle in @('OpenClaw','OpenClaw x 政安智枢')) {
        $updated = $updated.Replace(('<span class="' + $kind + '-brand__title">' + $oldTitle + '</span>'), $markup)
    }
}
$pattern = '(class="(?:sidebar|topbar)-brand__logo"\s+src=\$\{st\(`)apple-touch-icon\.png(`,this\.basePath\)\})'
$updated = [regex]::Replace($updated, $pattern, '${1}assets/govagentsec-brand.svg${2}')
$updated = $updated.Replace('st(`govagentsec-brand.svg`,this.basePath)', 'st(`assets/govagentsec-brand.svg`,this.basePath)')
if (-not $updated.Contains('aria-label="OpenClaw × 政安智枢"') -or -not $updated.Contains('govagentsec-brand.svg')) { throw 'Brand markup mismatch; no files changed.' }
$backup = Join-Path $PSScriptRoot ('..\local-validation\openclaw-brand-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backup | Out-Null
Copy-Item -LiteralPath $bundle.FullName -Destination $backup
$targetLogo = Join-Path $assets 'govagentsec-brand.svg'
if (Test-Path -LiteralPath $targetLogo) { Copy-Item -LiteralPath $targetLogo -Destination $backup }
Copy-Item -LiteralPath $logo -Destination $targetLogo
[IO.File]::WriteAllText($bundle.FullName, $updated, [Text.UTF8Encoding]::new($false))
$indexPath = Join-Path $uiRoot 'index.html'
Copy-Item -LiteralPath $indexPath -Destination $backup
$index = [IO.File]::ReadAllText($indexPath)
$version = (Get-FileHash -LiteralPath $bundle.FullName -Algorithm SHA256).Hash.Substring(0, 12).ToLowerInvariant()
$entryPattern = '(src="\./assets/' + [regex]::Escape($bundle.Name) + ')(?:\?[^" ]*)?"'
$index = [regex]::Replace($index, $entryPattern, '${1}?govbrand=' + $version + '"')
[IO.File]::WriteAllText($indexPath, $index, [Text.UTF8Encoding]::new($false))
Write-Output "Updated brand bundle: $($bundle.Name)"
Write-Output "Backup: $backup"
