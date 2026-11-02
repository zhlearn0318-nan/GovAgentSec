@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Ensure-DockerReady.ps1" -RepairSockets
if errorlevel 1 (
    echo Docker startup failed. See the diagnostic message above.
    pause
    exit /b 1
)
echo Docker is ready for GovAgentSec.
