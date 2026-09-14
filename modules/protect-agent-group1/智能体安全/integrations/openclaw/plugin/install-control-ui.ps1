[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [Parameter()]
  [string]$ControlUiRoot = "D:\OpenClaw\npm\node_modules\openclaw\dist\control-ui",

  [Parameter()]
  [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

$startMarker = "<!-- protect-agent-ui:start -->"
$endMarker = "<!-- protect-agent-ui:end -->"
$indexCandidate = Join-Path -Path $ControlUiRoot -ChildPath "index.html"

if (-not (Test-Path -LiteralPath $indexCandidate -PathType Leaf)) {
  throw "OpenClaw Control UI index.html was not found at: $indexCandidate"
}

$indexPath = (Resolve-Path -LiteralPath $indexCandidate).Path
if ([IO.Path]::GetFileName($indexPath) -ne "index.html") {
  throw "Refusing to modify an unexpected target: $indexPath"
}

$content = [IO.File]::ReadAllText($indexPath)
$newline = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
$blockPattern = "(?ms)^[\t ]*" + [regex]::Escape($startMarker) + ".*?^[\t ]*" + [regex]::Escape($endMarker) + "\r?\n"
$hasMarker = $content.Contains($startMarker) -or $content.Contains($endMarker)

if ($Uninstall) {
  if (-not $hasMarker) {
    Write-Output "Protect Agent UI loader is not installed: $indexPath"
    exit 0
  }
  if (-not ($content.Contains($startMarker) -and $content.Contains($endMarker))) {
    throw "Only one Protect Agent UI marker was found. Refusing an unsafe partial removal."
  }
  $updated = [regex]::Replace($content, $blockPattern, "")
  if ($updated -eq $content) {
    throw "Protect Agent UI markers were found but the tagged block could not be removed safely."
  }
  $action = "Remove the Protect Agent UI loader"
} else {
  if ($content.Contains($startMarker) -and $content.Contains($endMarker)) {
    Write-Output "Protect Agent UI loader is already installed: $indexPath"
    exit 0
  }
  if ($hasMarker) {
    throw "Only one Protect Agent UI marker was found. Refusing an unsafe duplicate install."
  }
  $closingBody = [regex]::Match($content, "(?i)</body>")
  if (-not $closingBody.Success) {
    throw "The OpenClaw Control UI index does not contain a closing body tag."
  }
  $snippet = $startMarker + $newline +
    "  <script defer src=`"/protect-agent/ui/inject.js`"></script>" + $newline +
    "  " + $endMarker + $newline + "  "
  $updated = $content.Insert($closingBody.Index, $snippet)
  $action = "Install the Protect Agent UI loader"
}

if (-not $PSCmdlet.ShouldProcess($indexPath, $action)) {
  exit 0
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmssfff"
$backupPath = "$indexPath.protect-agent-backup-$timestamp"
$temporaryPath = "$indexPath.protect-agent-tmp-$timestamp"

Copy-Item -LiteralPath $indexPath -Destination $backupPath
try {
  [IO.File]::WriteAllText($temporaryPath, $updated, [Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $temporaryPath -Destination $indexPath -Force
} finally {
  if (Test-Path -LiteralPath $temporaryPath) {
    Remove-Item -LiteralPath $temporaryPath -Force
  }
}

Write-Output "$action completed."
Write-Output "Target: $indexPath"
Write-Output "Backup: $backupPath"
