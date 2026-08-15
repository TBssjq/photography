@echo off
chcp 65001 >nul 2>&1
title 隋北摄影站 · 编译并启动
setlocal

set "ROOT=%~dp0"
set "EXE=%ROOT%server.exe"
set "PORT=8080"

echo ========================================
echo   隋北摄影站 · 每次重新编译并启动
echo ========================================

:: 1~2. 释放旧端口 + 用 Go 重新编译 + 生成 dist/（统一委托给 scripts/common.ps1）
echo "[1/3] 检查 Go、释放 %PORT% 旧服务、编译最新代码并构建站点..."
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\common.ps1" -Action serve -Port %PORT%
if errorlevel 1 (
    echo [错误] 编译/构建失败！请确认已安装 Go（https://go.dev/dl）。
    pause
    exit /b 1
)
echo [OK] 编译与构建完成。

:: 3. 启动服务（默认行为：构建站点 + 监听 8080）
echo [2/3] 正在启动服务（http://localhost:%PORT%）...
start "" "%EXE%"
timeout /t 4 /nobreak >nul

:: 4. 打开后台管理页
echo [3/3] 打开后台：http://localhost:%PORT%/admin.html
start "" "http://localhost:%PORT%/admin.html"

echo.
echo 启动完成！后台黑框请勿关闭，关闭即停止服务。
echo 站点首页：http://localhost:%PORT%/
echo.
exit /b 0
