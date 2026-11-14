@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0bridge.ps1" -Install
if errorlevel 1 (
  echo.
  echo Installation failed. Check the message above.
  pause
)
endlocal
