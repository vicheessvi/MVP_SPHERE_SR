@echo off
setlocal
cd /d "%~dp0"

where powershell.exe >nul 2>&1
if errorlevel 1 (
  echo Windows PowerShell was not found.
  echo Open start.ps1 manually on a supported Windows computer.
  pause
  exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
set "MVP_SPHERE_EXIT_CODE=%ERRORLEVEL%"

if not "%MVP_SPHERE_EXIT_CODE%"=="0" (
  echo.
  echo MVP_SPHERE_SR failed to start. Error code: %MVP_SPHERE_EXIT_CODE%
  pause
)

exit /b %MVP_SPHERE_EXIT_CODE%
