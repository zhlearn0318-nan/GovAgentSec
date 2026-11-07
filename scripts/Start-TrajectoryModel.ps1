param([switch]$Download)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$logRoot = Join-Path $projectRoot 'local-validation'
New-Item -ItemType Directory -Force $logRoot | Out-Null
$ollamaCommand = (Get-Command ollama -ErrorAction Stop).Source
$prior = @{}
$settings = @{
    OLLAMA_HOST = '127.0.0.1:11435'
    OLLAMA_MODELS = (Join-Path $projectRoot 'models/trajectory')
    OLLAMA_NO_CLOUD = '1'
    OLLAMA_MAX_LOADED_MODELS = '1'
    OLLAMA_NUM_PARALLEL = '1'
}
try {
    foreach ($key in $settings.Keys) {
        $prior[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
        [Environment]::SetEnvironmentVariable($key, $settings[$key], 'Process')
    }
    $ready = $false
    try { $null = Invoke-RestMethod 'http://127.0.0.1:11435/api/version' -TimeoutSec 2; $ready = $true } catch {}
    if (-not $ready) {
        Start-Process -FilePath $ollamaCommand -ArgumentList 'serve' -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot 'trajectory-ollama.out.log') -RedirectStandardError (Join-Path $logRoot 'trajectory-ollama.err.log') | Out-Null
        for ($attempt = 0; $attempt -lt 20; $attempt++) {
            Start-Sleep -Milliseconds 500
            try { $null = Invoke-RestMethod 'http://127.0.0.1:11435/api/version' -TimeoutSec 1; $ready = $true; break } catch {}
        }
        if (-not $ready) { throw 'Trajectory model service did not start; inspect local-validation/trajectory-ollama.err.log' }
    }
    if ($Download) {
        & $ollamaCommand pull 'qwen3:4b'
        if ($LASTEXITCODE -ne 0) { throw 'Model download failed' }
    }
    Invoke-RestMethod 'http://127.0.0.1:11435/api/tags' | ConvertTo-Json -Depth 6
} finally {
    foreach ($key in $settings.Keys) { [Environment]::SetEnvironmentVariable($key, $prior[$key], 'Process') }
}
