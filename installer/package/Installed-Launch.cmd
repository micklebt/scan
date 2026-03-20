@echo off
cd /d "%~dp0"
if exist "C:\Program Files\PowerShell\7\pwsh.exe" (
  "C:\Program Files\PowerShell\7\pwsh.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0Installed-Launch.ps1"
) else (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0Installed-Launch.ps1"
)
