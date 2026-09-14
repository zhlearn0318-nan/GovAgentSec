[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)][int]$Port = 8080,
    [ValidateRange(1024, 65535)][int]$OpaPort = 8181
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$runtime = Join-Path $root 'live-runtime'
$state = Join-Path $runtime 'state'
$logs = Join-Path $runtime 'logs'
$recordPath = Join-Path $runtime 'agentguard-process.json'
$secretPath = Join-Path $runtime 'agentguard-ticket-secret.txt'
$python = Join-Path $root '.venv\Scripts\python.exe'

function Test-Ready([int]$CheckPort) {
    try {
        $response = Invoke-RestMethod -Uri "http://127.0.0.1:$CheckPort/readyz" -TimeoutSec 2
        return $response.ready -eq $true
    }
    catch { return $false }
}

function Get-ValidatedRecord {
    if (-not (Test-Path -LiteralPath $recordPath -PathType Leaf)) { return $null }
    try { $record = Get-Content -LiteralPath $recordPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { return $null }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$record.process_id)" -ErrorAction SilentlyContinue
    if ($null -eq $process) { return $null }
    $expectedPython = (Resolve-Path -LiteralPath $python).Path
    if (-not [string]::Equals($process.ExecutablePath, $expectedPython, [StringComparison]::OrdinalIgnoreCase)) { return $null }
    if ($process.CommandLine -notlike "*$root*" -or $process.CommandLine -notmatch '(?i)-m\s+service') { return $null }
    return [pscustomobject]@{ Record = $record; Process = $process }
}

function Stop-ValidatedTree([int]$ParentId) {
    $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $ParentId" -ErrorAction SilentlyContinue)
    foreach ($child in $children) { Stop-ValidatedTree -ParentId ([int]$child.ProcessId) }
    Stop-Process -Id $ParentId -Force -ErrorAction SilentlyContinue
    Wait-Process -Id $ParentId -Timeout 10 -ErrorAction SilentlyContinue
}

try {
    if (-not (Test-Path -LiteralPath $python -PathType Leaf)) { throw "AgentGuard Python 环境不存在：$python" }
    foreach ($path in @($runtime, $state, $logs)) { New-Item -ItemType Directory -Path $path -Force | Out-Null }
    $validated = Get-ValidatedRecord
    if ($null -ne $validated -and [int]$validated.Record.port -eq $Port -and [int]$validated.Record.opa_port -eq $OpaPort -and (Test-Ready -CheckPort $Port)) {
        [ordered]@{ status='already_running'; process_id=[int]$validated.Record.process_id; port=$Port; ready=$true } | ConvertTo-Json
        exit 0
    }
    if ($null -ne $validated) {
        Stop-ValidatedTree -ParentId ([int]$validated.Record.process_id)
        Start-Sleep -Milliseconds 500
    }
    foreach ($checkPort in @($Port, $OpaPort)) {
        if (Get-NetTCPConnection -LocalPort $checkPort -State Listen -ErrorAction SilentlyContinue) {
            throw "端口 $checkPort 已被非本部署进程占用；为避免误停其他服务，拒绝启动。"
        }
    }
    if (-not (Test-Path -LiteralPath $secretPath -PathType Leaf)) {
        $bytes = New-Object byte[] 32
        $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
        $secretHex = ([BitConverter]::ToString($bytes)).Replace('-', '')
        [IO.File]::WriteAllText($secretPath, $secretHex, [Text.Encoding]::ASCII)
    }
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $aclGrant = $identity + ':(R,W)'
    & icacls $secretPath /inheritance:r /grant:r $aclGrant | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'AgentGuard 票据密钥 ACL 设置失败。' }

    $savedSecret = if (Test-Path Env:AGENTGUARD_TICKET_SECRET_FILE) { $env:AGENTGUARD_TICKET_SECRET_FILE } else { $null }
    $savedProbe = if (Test-Path Env:AGENTGUARD_READINESS_PROBE_WRITES) { $env:AGENTGUARD_READINESS_PROBE_WRITES } else { $null }
    try {
        $env:AGENTGUARD_TICKET_SECRET_FILE = $secretPath
        $env:AGENTGUARD_READINESS_PROBE_WRITES = 'false'
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        $process = Start-Process -FilePath $python `
            -ArgumentList @('-m','service','--host','127.0.0.1','--port',"$Port",'--opa-mode','rest','--opa-base-url',"http://127.0.0.1:$OpaPort",'--manage-opa','--state-dir',('"' + $state + '"'),'--enable-local-adapters') `
            -WorkingDirectory $root `
            -RedirectStandardOutput (Join-Path $logs "agentguard-$stamp.stdout.log") `
            -RedirectStandardError (Join-Path $logs "agentguard-$stamp.stderr.log") `
            -WindowStyle Hidden -PassThru
    }
    finally {
        if ($null -eq $savedSecret) { Remove-Item Env:AGENTGUARD_TICKET_SECRET_FILE -ErrorAction SilentlyContinue } else { $env:AGENTGUARD_TICKET_SECRET_FILE = $savedSecret }
        if ($null -eq $savedProbe) { Remove-Item Env:AGENTGUARD_READINESS_PROBE_WRITES -ErrorAction SilentlyContinue } else { $env:AGENTGUARD_READINESS_PROBE_WRITES = $savedProbe }
    }
    $ready = $false
    for ($attempt = 1; $attempt -le 35; $attempt++) {
        if (Test-Ready -CheckPort $Port) { $ready = $true; break }
        if (-not (Get-Process -Id $process.Id -ErrorAction SilentlyContinue)) { break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) {
        Stop-ValidatedTree -ParentId ([int]$process.Id)
        throw "AgentGuard 未能就绪，请检查 $logs"
    }
    $record = [ordered]@{
        process_id = [int]$process.Id
        started_at = (Get-Process -Id $process.Id).StartTime.ToUniversalTime().ToString('o')
        python_path = $python
        port = $Port
        opa_port = $OpaPort
        status = 'ready'
        secret_recorded = $false
    }
    [IO.File]::WriteAllText($recordPath, ($record | ConvertTo-Json -Depth 4), (New-Object Text.UTF8Encoding($false)))
    [ordered]@{ status='started'; process_id=[int]$process.Id; port=$Port; opa_port=$OpaPort; ready=$true } | ConvertTo-Json
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}
