@echo off
chcp 65001 >nul 2>&1
echo 清理无用 / 孤立文件...
echo ----------------------------------------
pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\common.ps1" -Action clean
echo ----------------------------------------
pause
