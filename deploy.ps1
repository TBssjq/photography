# ================================================================
# 隋北摄影站 — 一键部署脚本（小白友好版）
# 用法: 在项目根目录右键 deploy.ps1 → "用 PowerShell 运行"
# 第一次会问你 GitHub 用户名和仓库名，之后一路回车即可。
# 前提是: ① 已装 Git  ② 有 GitHub 账号
# ================================================================

param(
    [string]$Message = "更新网站内容"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $ProjectRoot "backend"

# 复用共用构建逻辑（Go 定位 / 站点构建）
. "$ProjectRoot\scripts\common.ps1"

function WriteStep($n, $text) { Write-Host "[$n/4] $text" -ForegroundColor Yellow }
function WriteOk($t) { Write-Host $t -ForegroundColor Green }
function WriteErr($t) { Write-Host $t -ForegroundColor Red }

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   隋北摄影站 — 一键发布" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 Git 是否安装
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    WriteErr "没找到 Git。请先安装: https://git-scm.com/downloads （一直点下一步即可）"
    pause; exit 1
}

# 检查 Go 是否安装（复用 common.ps1 的定位逻辑）
$go = Find-Go
if (-not $go) {
    WriteErr "没找到 Go。请先安装: https://go.dev/dl/ （一直点下一步即可）"
    pause; exit 1
}
WriteOk "检测到 Go: $go"

# 检查是否已登录 GitHub（用 credential 是否配置判断）
$needAuth = $false
git config --get user.name 2>$null | Out-Null
if (-not (git config --get user.name)) { $needAuth = $true }

# 首次使用：询问用户名与仓库名，并记住到本地文件
$confFile = Join-Path $ProjectRoot ".deploy.conf"
if (Test-Path $confFile) {
    $conf = Get-Content $confFile -Raw | ConvertFrom-StringData
    $GHUser = $conf["GHUser"]
    $Repo   = $conf["Repo"]
} else {
    Write-Host "第一次发布需要填两样东西（之后会自动记住）:" -ForegroundColor White
    $GHUser = Read-Host "  你的 GitHub 用户名"
    $Repo   = Read-Host "  仓库名（建议 photography，没有的话会帮你新建）"
    "GHUser=$GHUser`nRepo=$Repo" | Set-Content $confFile -Encoding UTF8
    WriteOk "已记住，下次不用再填。"
    Write-Host ""
}

$remote = "https://github.com/$GHUser/$Repo.git"

# Step 1: 构建（复用 common.ps1 的 Build-Site）
WriteStep 1 "生成网站..."
try {
    Build-Site $go
} catch {
    WriteErr "构建失败: $_"
    pause; exit 1
}
WriteOk "网站已生成。"

# Step 2: 初始化 Git（如果还没）
WriteStep 2 "准备 Git 仓库..."
Set-Location $ProjectRoot
if (-not (Test-Path ".git")) {
    git init
    git branch -M main
    WriteOk "已初始化本地仓库。"
} else {
    WriteOk "本地仓库已存在。"
}
# 配置远程
$hasRemote = git remote get-url origin 2>$null
if (-not $hasRemote) {
    git remote add origin $remote
    WriteOk "已关联远程仓库 $remote"
} else {
    git remote set-url origin $remote
}

# 提示登录（若需要）
if ($needAuth) {
    Write-Host ""
    Write-Host "接下来请在弹出的浏览器里登录 GitHub（用于推送代码）。" -ForegroundColor White
    Write-Host "如果没弹窗，去 https://github.com/settings/tokens 生成一个 token，" -ForegroundColor White
    Write-Host "推送时用户名填你的账号、密码填那个 token 即可。" -ForegroundColor White
    Write-Host ""
}

# Step 3: 提交
WriteStep 3 "提交改动..."
git add .
git commit -m $Message 2>&1 | Out-Null

# Step 4: 推送（首次可能需登录）
WriteStep 4 "推送到 GitHub..."
$pushOk = $false
for ($i = 0; $i -lt 3; $i++) {
    git push -u origin main 2>&1
    if ($LASTEXITCODE -eq 0) { $pushOk = $true; break }
    Write-Host "推送被拒绝或需要登录，请按提示操作后再试..." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
}
if (-not $pushOk) {
    WriteErr "推送失败。常见原因: 远程仓库不存在，或没登录。"
    WriteErr "请在 GitHub 新建仓库: https://github.com/new  (名字用 $Repo，选 Public)"
    pause; exit 1
}

WriteOk ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   发布成功！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "开启自动上线（只需做一次）:" -ForegroundColor Cyan
Write-Host "  1. 打开 https://github.com/$GHUser/$Repo" -ForegroundColor White
Write-Host "  2. 点 Settings → Pages → Source 选 'GitHub Actions' → Save" -ForegroundColor White
Write-Host "  3. 等 1-2 分钟，访问: https://$GHUser.github.io/$Repo" -ForegroundColor White
Write-Host ""
Write-Host "以后每次更新: 在后台改完 → 双击这个 deploy.ps1 即可。" -ForegroundColor Cyan
Write-Host ""

pause
