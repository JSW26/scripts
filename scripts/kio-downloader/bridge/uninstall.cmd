@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0bridge.ps1" -Uninstall
if errorlevel 1 (
  echo.
  echo Uninstallation failed. Check the message above.
  pause
)
endlocal
