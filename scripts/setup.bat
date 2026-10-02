@echo off
rem Windows setup: double-click me (add -NoLaunch to skip opening the app).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" %*
if errorlevel 1 pause
