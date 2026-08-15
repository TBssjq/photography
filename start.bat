@echo off
chcp 65001 >nul 2>&1
title Suibei Photography - build and start
setlocal

set "ROOT=%~dp0"
set "EXE=%ROOT%server.exe"
set "PORT=8080"

echo ========================================
echo   Suibei Photography - rebuild and start each time
echo ========================================

rem 1~2. free old port + recompile with Go + generate dist/ (delegated to scripts/common.ps1)
echo "[1/3] Checking Go, freeing port %PORT%, compiling latest code and building site..."

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\common.ps1" -Action serve -Port %PORT%
if errorlevel 1 (
    echo [ERROR] Build or compile failed. Please install Go from https://go.dev/dl
    pause
    exit /b 1
)

echo [OK] Compile and build complete.

rem 3. start service (default: build site + listen on 8080)
echo [2/3] Starting service at http://localhost:%PORT%
start "" "%EXE%"
ping -n 5 127.0.0.1 >nul

rem 4. open admin page
echo [3/3] Opening admin at http://localhost:%PORT%/admin.html
start "" "http://localhost:%PORT%/admin.html"

echo.
echo Startup complete! Do not close the black window; closing stops the service.
echo Site home: http://localhost:%PORT%/
echo.
exit /b 0
