# ================================================================
# Photography site - release packaging script
# 生成自包含、可双击运行的分发包：
#   release/suibei-photography-vX.Y.Z/
#     server.exe        # Go 后端（内容后台 + 静态托管）
#     dist/             # 完整静态站点（亦可直接双击 index.html）
#     backend/          # 源码 + content.json（便于重建 / 改内容）
#     start.bat         # 双击启动站点
#     README.MD
#     RELEASE_NOTES.md
#     suibei-photography-vX.Y.Z.zip  # 整包再压缩
#
# 用法：
#   pwsh scripts/release.ps1                 # 自动 patch+1（3.0.0 -> 3.0.1）并回写 package.json
#   pwsh scripts/release.ps1 -Version 3.1.0  # 指定版本号并回写
#   pwsh scripts/release.ps1 -NoBump         # 使用 package.json 现有版本，不回写
# ================================================================
param(
    [string]$Version = "",
    [switch]$NoBump = $false
)

$ErrorActionPreference = "Stop"
. $PSScriptRoot\common.ps1   # 引入 Find-Go / Build-Exe / Build-Site

$root = Get-ProjectRoot
$projName = "suibei-photography"
$pkgPath = Join-Path $root "package.json"

# ---------- 解析 / 计算版本 ----------
function Get-Ver($path) {
    $txt = Get-Content $path -Raw | ConvertFrom-Json
    return $txt.version
}
function Set-Ver($path, $v) {
    $o = Get-Content $path -Raw | ConvertFrom-Json
    $o.version = $v
    # 保留原格式（2 空格缩进）
    $o | ConvertTo-Json -Depth 10 | Set-Content $path -Encoding UTF8
}

$cur = Get-Ver $pkgPath
if ($NoBump) {
    $newVer = $cur
} elseif ($Version -ne "") {
    if ($Version -notmatch '^\d+\.\d+\.\d+$') { Write-Error "版本格式应为 x.y.z，收到: $Version"; exit 1 }
    $newVer = $Version
} else {
    $p, $m, $b = $cur -split '\.'
    $newVer = "$p.$m.$([int]$b + 1)"
    Set-Ver $pkgPath $newVer
    Write-Host "[release] 版本号自增: $cur -> $newVer（已回写 package.json）" -ForegroundColor Cyan
}
Write-Host "[release] 打包版本: v$newVer" -ForegroundColor Green

# ---------- 编译 + 构建 ----------
$go = Find-Go
if (-not $go) { Write-Error "Go not found. 安装: https://go.dev/dl/"; exit 1 }
Write-Host "[release] 使用 Go: $go" -ForegroundColor DarkGray

Write-Host "[release] 编译 server.exe ..." -ForegroundColor Yellow
Build-Exe $go
Write-Host "[release] 生成 dist/ 静态站点 ..." -ForegroundColor Yellow
Build-Site $go

# ---------- 准备 release 目录 ----------
$relRoot = Join-Path $root "release"
$relDir  = Join-Path $relRoot "$projName-v$newVer"
if (Test-Path $relDir) { Remove-Item $relDir -Recurse -Force }
New-Item -ItemType Directory -Path $relDir | Out-Null

$distSrc = Join-Path $root "dist"
$backendSrc = Join-Path $root "backend"
$serverExe  = Join-Path $root "server.exe"

# 1) 复制 dist/（预构建，便于直接双击 dist/index.html 静态托管）
Copy-Item $distSrc (Join-Path $relDir "dist") -Recurse -Force
# 2) 复制 backend/（源码 + content.json + templates，便于重建/改内容）
Copy-Item $backendSrc (Join-Path $relDir "backend") -Recurse -Force
# 3) 复制前端源目录（server.exe 启动时会用它重新构建 dist/，必须齐备，否则 build 失败）
foreach ($d in @("css", "js", "assets", "img")) {
    $src = Join-Path $root $d
    if (Test-Path $src) { Copy-Item $src (Join-Path $relDir $d) -Recurse -Force }
}
# 4) 复制根级前端入口（开发模式所需）
foreach ($f in @("site-data.js", "index.html", "admin.html")) {
    $src = Join-Path $root $f
    if (Test-Path $src) { Copy-Item $src $relDir -Force }
}
# 3) server.exe
Copy-Item $serverExe (Join-Path $relDir "server.exe") -Force
# 4) README
if (Test-Path (Join-Path $root "README.MD")) { Copy-Item (Join-Path $root "README.MD") $relDir -Force }

# 5) 启动脚本
$startBat = @"
@echo off
cd /d "%~dp0"
start "" server.exe serve -port 8080
timeout /t 2 >nul
start "" http://localhost:8080/
"@
Set-Content -Path (Join-Path $relDir "start.bat") -Value $startBat -Encoding Default

# ---------- 生成 release notes ----------
$notes = @"
# $projName v$newVer

隋北 摄影作品集网站 — 自包含分发包。

## 运行方式
- 双击 `start.bat` 启动站点（默认 http://localhost:8080 ，后台管理在 /admin.html）
- 或直接将 `dist/` 作为静态站点托管（支持双击 `dist/index.html` 直接打开）

## 目录结构
- `server.exe`  — Go 后端（内容后台 API + 静态文件服务）
- `dist/`       — 构建后的完整静态站点
- `backend/`    — 源码与 content.json（可用于重建站点或本地修改内容）
- `start.bat`   — 一键启动

## 构建信息
- 构建时间: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
- Go 版本: $(& $go version | Out-String).Trim()
- 源版本: $cur -> $newVer
"@
Set-Content -Path (Join-Path $relDir "RELEASE_NOTES.md") -Value $notes -Encoding UTF8

# ---------- 整包压缩 ----------
$zipName = "$projName-v$newVer.zip"
$zipPath = Join-Path $relRoot $zipName
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Write-Host "[release] 压缩整包 ..." -ForegroundColor Yellow
Compress-Archive -Path $relDir -DestinationPath $zipPath -CompressionLevel Optimal

# ---------- 完成 ----------
$size = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Host "`n[release] 完成 ✅" -ForegroundColor Green
Write-Host "  目录: $relDir"
Write-Host "  压缩包: $zipPath ($size MB)"
