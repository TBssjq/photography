# ================================================================
# Photography site - shared build logic (reused by start.bat / deploy.ps1)
# Provides: Find-Go (locate Go), Build-Site (generate dist/),
#           Build-Exe (compile server.exe), Stop-Port (free occupied port)
#
# Two usages:
#   1) dot-source from another ps1:  . $PSScriptRoot\common.ps1
#      -> only imports functions, does not auto-execute (Action empty)
#   2) run by bat / directly:
#      pwsh common.ps1 -Action build          # check Go + compile exe + gen dist
#      pwsh common.ps1 -Action serve -Port 8080  # same + free port first
#      pwsh common.ps1 -Action clean          # remove orphan/junk files & empty dirs (idempotent)
# ================================================================

param(
    [string]$Action = "",
    [int]$Port = 8080
)

$ErrorActionPreference = "Stop"

function Get-ProjectRoot { Split-Path -Parent $PSScriptRoot }
function Get-BackendDir { Join-Path (Get-ProjectRoot) "backend" }

# ---------- Locate Go (PATH or common install paths) ----------
function Find-Go {
    if (Get-Command go -ErrorAction SilentlyContinue) {
        return (Get-Command go).Source
    }
    $goPaths = @(
        "D:\app\go\bin\go.exe",
        "C:\Go\bin\go.exe",
        "$env:USERPROFILE\go\bin\go.exe",
        "C:\Program Files\Go\bin\go.exe"
    )
    foreach ($p in $goPaths) {
        if (Test-Path $p) {
            $env:GOROOT = Split-Path (Split-Path $p)
            $env:PATH = "$env:GOROOT\bin;$env:PATH"
            return $p
        }
    }
    return $null
}

# ---------- Generate static site into dist/ ----------
function Build-Site($go) {
    Push-Location (Get-BackendDir)
    try {
        & $go run main.go build
        if ($LASTEXITCODE -ne 0) { throw "go run main.go build failed (exit $LASTEXITCODE)" }
    } finally { Pop-Location }
}

# ---------- Compile server.exe (in project root) ----------
function Build-Exe($go) {
    $root = Get-ProjectRoot
    $exe  = Join-Path $root "server.exe"
    Push-Location (Get-BackendDir)
    try {
        & $go build -o $exe .
        if ($LASTEXITCODE -ne 0) { throw "go build -o server.exe . failed (exit $LASTEXITCODE)" }
    } finally { Pop-Location }
}

# ---------- Free processes occupying the given port ----------
function Stop-Port($p) {
    $pids = netstat -ano 2>$null | Select-String ":$p\s" | ForEach-Object {
        ($_ -split '\s+')[-1]
    } | Where-Object { $_ -match '^\d+$' -and [int]$_ -gt 0 } | Sort-Object -Unique
    foreach ($pidx in $pids) {
        # 用 cmd /c 包裹，隔离 taskkill 的非零退出码，避免触发 PowerShell NativeCommandError 中断构建
        cmd /c "taskkill /F /PID $pidx >nul 2>&1"
    }
}

# ---------- Clean junk / orphan files (idempotent, whitelist-based) ----------
# 只删「明确已知的遗留/无用文件」与「确实为空的遗留目录」，不扫描、不猜测，
# 避免在没有 git 的情况下误删有用文件。可重复执行（不存在则跳过）。
function Clean-Junk {
    $root = Get-ProjectRoot
    # 已知遗留 / 无用文件（相对项目根；不存在自动跳过）
    $junkFiles = @(
        "_t.png",
        "server_verify.exe",
        "server.log",
        "server.err",
        "js/awwwards.js",
        "js/portfolio3d.js",
        "js/fx-suite.js",
        "js/micro-animations.js",
        "js/load-steps.js",
        "TEST/index.html",
        "release/suibei-photography-v3.0.1.zip"
    )
    # 已知遗留空目录（仅当确实为空才删除，避免误删有内容的目录）
    $junkDirs = @("TEST", "release")

    $removed = 0
    foreach ($f in $junkFiles) {
        $p = Join-Path $root $f
        if (Test-Path $p) {
            Remove-Item $p -Force
            Write-Host "  removed file: $f" -ForegroundColor Yellow
            $removed++
        }
    }
    foreach ($d in $junkDirs) {
        $p = Join-Path $root $d
        if (Test-Path $p) {
            if (-not (Get-ChildItem $p -Recurse | Select-Object -First 1)) {
                Remove-Item $p -Force -Recurse
                Write-Host "  removed empty dir: $d" -ForegroundColor Yellow
                $removed++
            } else {
                Write-Host "  skip (not empty, kept): $d" -ForegroundColor DarkGray
            }
        }
    }
    if ($removed -eq 0) {
        Write-Host "[clean] nothing to clean." -ForegroundColor Green
    } else {
        Write-Host "[clean] cleaned $removed item(s)." -ForegroundColor Green
    }
}

# ---------- Direct-run mode (executes when Action is non-empty) ----------
if ($Action) {
    switch ($Action) {
        'clean' {
            Clean-Junk
        }
        'build' {
            $go = Find-Go
            if (-not $go) { Write-Error "Go not found. Install from https://go.dev/dl/"; exit 1 }
            Build-Exe $go
            Build-Site $go
            Write-Host "[common] build & compile done." -ForegroundColor Green
        }
        'serve' {
            $go = Find-Go
            if (-not $go) { Write-Error "Go not found. Install from https://go.dev/dl/"; exit 1 }
            Stop-Port $Port
            Build-Exe $go
            Build-Site $go
            Write-Host "[common] port $Port freed, build & compile done." -ForegroundColor Green
        }
        default {
            Write-Error "Unknown Action: $Action (use build / serve / clean)"
            exit 1
        }
    }
}
