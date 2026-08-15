@echo off
chcp 65001 >nul 2>&1
echo Cleaning unused / orphan files...
echo ----------------------------------------
pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\common.ps1" -Action clean
echo ----------------------------------------
pause
