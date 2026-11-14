@echo off
chcp 65001 >nul
rem Native OpenClaw entry; uses existing full-stack startup.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-GridDemo.ps1" %*
if errorlevel 1 pause
