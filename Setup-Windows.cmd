@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Setup-Windows.ps1" %*
set "result=%errorlevel%"
if not "%result%"=="0" echo Installation stopped. Follow the error message, then rerun this installer.
pause
exit /b %result%
