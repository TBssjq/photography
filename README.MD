# 隋北 · 光影作品集

一个暖调编辑美学的个人摄影作品集网站。采用 **前后端分离** 架构：Go 后端在本地生成纯静态网页，部署到 GitHub Pages。

## 架构概览

```
┌─────────────────────────────────────────────────────┐
│  本地开发 (你的电脑)                                  │
│                                                       │
│  backend/                     前端源码 (d:\project\)  │
│  ├── content.json  ◄────────── site-data.js (已转换) │
│  ├── templates/index.tmpl      ├── css/               │
│  ├── main.go (Go SSG)          ├── js/                │
│  └── go.mod                    └── assets/            │
│                                                       │
│  $ go run main.go build  ──►  dist/ (纯静态输出)      │
│                                 ├── index.html        │
│                                 ├── css/  js/  assets/│
│                                 └── .nojekyll         │
└─────────────────────────┬───────────────────────────┘
                          │ git push
                          ▼
              ┌───────────────────────┐
              │   GitHub Pages (免费)  │
              │   https://用户名.github.io/仓库名  │
              └───────────────────────┘
```

## 网站功能一览

网站采用暖调编辑美学，单页滚动式作品集，所有内容均来自 `backend/content.json`。主要区块从上到下依次为：

| 区块 | 说明 |
|------|------|
| **Hero 首屏** | 站点标题打字机动画、背景光斑缓慢漂移、滚动提示浮动；鼠标移动时图片视差、磁吸按钮。 |
| **光影精选 (Featured)** | 主图 + 两张侧图的非对称网格，鼠标悬停轻微 zoom、玻璃质感文字牌。点击任意图打开灯箱大图。 |
| **作品精选 (Showcase)** | 横向卡片轨道，可左右滑动浏览，信息层滑入。 |
| **画廊 (Gallery)** | 全部作品网格，支持分类筛选（Filters）、数量统计；卡片悬停图片轻微 zoom、标题上滑；点击打开灯箱。 |
| **引言 (Quote)** | 一句摄影箴言，引号弹入、细线展开、作者上滑。 |
| **归档 (Archives)** | 按时间/分类排列的作品清单，进入视口时逐行 stagger 入场。 |
| **关于 (About)** | 摄影师介绍，含视差头像、玻璃徽标、描边标题（stroke-reveal）、统计数字入场。 |
| **器材 (Gear)** | 摄影器材清单，卡片悬浮弹性放大、入场 stagger。 |
| **联系 (Contact)** | 联系方式列表（磁吸按钮），点击跳转对应渠道。 |
| **页脚 (Footer)** | 版权信息、致谢弹窗（footer credits）、滚动到底部的回弹动画。 |

**全局交互功能：**
- **灯箱 (Lightbox)**：点击任意作品图打开全屏灯箱，显示大图/视频、标题、标签、备注、外链，支持上一张/下一张、ESC 关闭、点遮罩关闭。
- **分享 (Share)**：灯箱内点「分享」弹出分享框，含复制链接、生成二维码、下载图片；打开时屏蔽底层灯箱交互以防点击穿透。
- **液态玻璃 (Liquid Glass)**：导航栏、精选文字牌、器材卡等玻璃组件叠加 SVG 边缘折射滤镜（`feDisplacementMap`），鼠标移上时玻璃内光晕跟随，模拟真实玻璃质感。
- **自定义光标**：小圆点 + 跟随圆环，悬停链接/按钮时放大，悬停图片时进入 VIEW 态（移动端自动禁用）。
- **樱花飘落 (Sakura)**：轻量樱花粒子装饰（性能友好，离屏暂停）。
- **3D 蜜蜂 (Bee3D)**：Three.js 实现的 3D 蜜蜂装饰元素。
- **滚动进度条**：顶部阅读进度指示。
- **滚动动画**：GSAP + ScrollTrigger 驱动的入场/视差/滚动文本（SplitText）；尊重 `prefers-reduced-motion`，关闭装饰性动画。
- **响应式**：桌面 / 平板 / 手机自适应，移动端禁用自定义光标、放大镜等。

## 前端模块详解

### `css/` 样式

| 文件 | 职责 |
|------|------|
| `base.css` | 全局基础：CSS 变量（配色/字体）、光标、预加载、按钮、基础排版。 |
| `site.css` | 页面布局：Hero / 光影精选 / 画廊 / 关于 / 灯箱 / 归档 / 联系 / 响应式，以及液态玻璃 `.lg` 与分享框 `.sp-modal` 样式。 |
| `effects.css` | 克制的玻璃与交互特效细节。 |
| `admin.css` | 后台管理页样式。 |

### `js/` 脚本

| 文件 | 职责 |
|------|------|
| `data.js` | **数据层核心**：从嵌入/生成的 `site-data.js` 读取内容，渲染各区块（光影精选、画廊、归档、关于、器材、联系等），并负责灯箱（Lightbox）的打开/切换/大图加载与失败占位。 |
| `ui.js` | **交互层**：滚动进度条、导航、返回顶部、磁吸按钮、视差、下划线绘制（rules）等通用 UI。 |
| `cursor.js` | 自定义光标（圆点 + 跟随圆环）及 VIEW 态。 |
| `share.js` | 分享框：复制链接、生成二维码、下载媒体；打开时屏蔽底层灯箱点击穿透。 |
| `liquid-glass.js` | 液态玻璃边缘折射：自动套用到玻璃组件，含鼠标光晕跟随（复用 SVG `feDisplacementMap` 算法）。 |
| `animations.js` | 大量 GSAP 动画（入场/视差/滚动文本/悬浮），纯增强、尊重 reduced-motion、含性能兜底。 |
| `split-reveal.js` | 标题逐词/逐字拆分入场（与 GSAP rolling text 协同，避免双重动画）。 |
| `sakura.js` | 樱花飘落粒子装饰。 |
| `bee3d.js` | Three.js 3D 蜜蜂装饰。 |
| `toast-pop.js` | 轻量 Toast 提示弹出。 |
| `footer-bounce.js` | 页脚致谢弹窗与滚动回弹动画。 |
| `admin.js` | 后台逻辑：拖拽上传图片、可视化编辑内容、保存写回服务器、导出整站 ZIP。 |

### `backend/` 后端

| 文件 | 职责 |
|------|------|
| `main.go` | Go 静态网站生成器（SSG）兼本地服务器：读取 `content.json` → 渲染 `templates/index.tmpl` → 输出 `dist/`；提供 `serve` 静态服务与 `/api/*` 接口（内容读写、重建、上传、导出 ZIP）。路径基于可执行文件定位，不依赖工作目录。 |
| `content.json` | 全站内容数据源（文字、图片路径、作品/精选/器材/联系等）。 |
| `templates/index.tmpl` | 首页 HTML 模板（Go template 语法，构建时注入内容）。 |
| `go.mod` | Go 模块定义。 |

### 其它根目录文件

| 文件 | 职责 |
|------|------|
| `site-data.js` | 由 `content.json` 自动生成的浏览器端数据（供 `data.js` 读取），构建时同时写入根目录与 `dist/`。 |
| `index.html` / `admin.html` | 首页与后台的源文件（根目录为直接双击运行用；部署以 `dist/` 为准）。 |
| `start.bat` | 一键编译并启动本地服务器（每次重新编译保证最新代码）。 |
| `deploy.ps1` | 一键部署到 GitHub Pages 的 PowerShell 脚本。 |
| `assets/` / `img/` | 图片与视频资源目录（构建时复制到 `dist/`）。 |
| `dist/` | 构建输出目录，**部署用此目录内容**。 |

## 文件结构

```text
backend/                    Go 后端 — 静态网站生成器 (SSG)
  ├── main.go               核心程序：读取 JSON → 渲染模板 → 输出 dist/
  ├── content.json          所有网站内容数据（文字、图片路径、作品列表）
  ├── templates/
  │   └── index.tmpl        HTML 模板（Go template 语法）
  └── go.mod                Go 模块定义

dist/                       构建输出 — 部署用这个目录的内容
  ├── index.html            预渲染的完整 HTML
  ├── css/                  样式文件
  ├── js/                   脚本文件
  ├── assets/               图片资源
  └── .nojekyll             GitHub Pages 配置文件

css/                        前端源码
  ├── base.css              全局基础（变量 / 字体 / 光标 / 预加载 / 按钮）
  ├── site.css              页面布局（Hero / 画廊 / 关于 / 灯箱 / 响应式）
  ├── effects.css           克制的玻璃与交互特效
  └── admin.css             后台样式

js/                         前端源码
  ├── data.js               数据层核心：渲染各区块 + 灯箱
  ├── ui.js                 交互层（滚动进度 / 导航 / 磁吸 / 视差）
  ├── cursor.js             自定义光标
  ├── share.js              分享 / 下载 / 二维码
  ├── liquid-glass.js       液态玻璃边缘折射
  ├── animations.js         GSAP 滚动动画（纯增强）
  ├── split-reveal.js       标题逐词/逐字入场
  ├── sakura.js             樱花飘落装饰
  ├── bee3d.js              Three.js 3D 蜜蜂
  ├── toast-pop.js          Toast 提示
  ├── footer-bounce.js      页脚致谢弹窗与回弹
  └── admin.js              后台逻辑（上传 / 存本地 / 导出整站）

assets/                     图片与视频存放目录
.nojekyll                   GitHub Pages 用（避免忽略下划线资源）
```

## 一、环境准备

### 1. 安装 Go

- 下载地址：https://go.dev/dl/
- Windows：下载 `.msi` 安装包，双击安装即可
- 验证安装：打开终端输入 `go version`，应显示版本号

### 2. 安装 Git（部署到 GitHub 需要）

- 下载地址：https://git-scm.com/downloads
- Windows：下载 `.exe` 安装包，双击安装
- 验证安装：打开终端输入 `git --version`

## 二、本地开发流程

### 1. 修改内容

编辑 `backend/content.json`，修改文字、图片路径、作品列表等。

```json
{
  "site": {
    "title": "隋北 · 光影作品集",
    "description": "隋北的个人摄影作品集"
  },
  "hero": {
    "kicker": "Photography Portfolio · 2026",
    "typewriter": [
      { "text": "在这一" },
      { "text": "春天", "em": true },
      { "text": "\n" },
      { "text": "学会了等一束光" }
    ]
  },
  "photos": [
    {
      "cat": "portrait",
      "title": "逆光少女",
      "tag": "人像",
      "date": "2026-03",
      "src": "assets/photo-01.jpg",
      "tags": ["人像", "逆光"]
    }
  ]
}
```

### 2. 添加图片

把照片文件放入 `assets/` 目录，然后在 `content.json` 中引用路径（如 `"src": "assets/photo-01.jpg"`）。

### 3. 构建静态网站

打开终端，进入 backend 目录：

```bash
cd d:\project\photography\backend

# 方式一：用 go run（需要安装 Go）
go run main.go build

# 方式二：用编译好的 exe（无需安装 Go）
.\photography-ssg.exe build

# 方式三：构建并启动本地预览服务器
go run main.go serve              # 默认 8080 端口
go run main.go serve -port 3000   # 指定端口
```

构建完成后，`dist/` 目录包含所有静态文件。

### 4. 本地预览

- 方式一：用 `serve` 命令启动预览服务器，浏览器访问 `http://localhost:8080`
- 方式二：直接双击 `dist/index.html` 用浏览器打开

### 5. 用后台可视化编辑（推荐，无需懂代码）

前后端已打通：**后台 `admin.html` 直接调用 Go 服务器**，改动实时写回 `content.json` 并自动重建 `dist/`。

1. 先按上面方式用 `go run main.go serve` 启动服务器（保持运行）。
2. 浏览器打开 `http://localhost:8080/admin.html`（注意走 8080/你的端口，不是双击本地文件）。
3. 后台会自动连上 Go 服务器，右上角状态显示「已连接服务器 · 改动自动保存」。
4. 在后台拖入图片、改文字，**改动会自动 POST 给服务器并重建**；点「保存并预览」会强制保存并打开首页，刷新首页即所见即所得。
5. 若后台没连上服务器（例如直接双击本地 `admin.html`），会自动退回「本地模式」：改动存浏览器 localStorage，可点「导出整站 ZIP」发布。

> 核心接口（供进阶使用）：
> - `GET  /api/content` 返回当前 `content.json`
> - `POST /api/content` 接收 JSON，写回 `content.json` 并自动重建 `dist/`
> - `POST /api/rebuild` 手动触发重建

## 三、部署到 GitHub Pages

### 方法 A：手动部署（简单直接）

1. **创建 GitHub 仓库**
   - 打开 https://github.com/new
   - 仓库名随意（如 `photography`），选 **Public**
   - 点 Create repository

2. **初始化 Git 并推送**

   ```bash
   cd d:\project\photography

   # 初始化仓库
   git init
   git add .
   git commit -m "初始提交"

   # 关联远程仓库（替换成你的地址）
   git remote add origin https://github.com/你的用户名/photography.git
   git branch -M main
   git push -u origin main
   ```

3. **开启 GitHub Pages**
   - 进入仓库页面 → Settings → Pages
   - Source 选 **Deploy from a branch**
   - Branch 选 `main`，文件夹选 `/ (root)`
   - 点 Save

4. **访问网站**
   - 等待 1-2 分钟
   - 网址：`https://你的用户名.github.io/photography`

### 方法 B：GitHub Actions 自动部署（推荐）

项目已内置 `.github/workflows/deploy.yml`，推送代码后自动构建部署：

1. 确保 `.github/workflows/deploy.yml` 存在（见下方）
2. GitHub 仓库 → Settings → Pages → Source 选 **GitHub Actions**
3. 以后每次 `git push`，GitHub 会自动用 Go 构建并部署

```bash
git add .
git commit -m "更新内容"
git push
```

### 以后更新内容的完整流程

```
编辑 content.json → 放图片到 assets/ → go run main.go build → git push → 自动上线
```

## 四、命令参考

| 命令 | 说明 |
|------|------|
| `go run main.go` | 构建静态网站到 dist/（等同于 build） |
| `go run main.go build` | 同上 |
| `go run main.go serve` | 构建 + 启动本地预览服务器 (8080) |
| `go run main.go serve -port 3000` | 使用指定端口预览 |
| `go run main.go help` | 显示帮助信息 |
| `go build -o photography-ssg.exe` | 编译为可执行文件 |

## 五、常见问题

**Q: 没有安装 Go 能构建吗？**
A: 能部署。发布用项目根目录的 `deploy.ps1` 一键脚本即可（它会在需要时调用 Go 构建）；纯本地预览则需安装 Go 运行 `go run main.go serve`。

**Q: 图片太多 GitHub 放不下怎么办？**
A: GitHub 单文件限制 100MB，仓库建议 1GB 以内。大量高清图建议压缩后再上传，或用图床（如阿里云 OSS）后把 URL 填入 content.json。

**Q: 构建报错 "content.json not found"？**
A: 确保在 `backend/` 目录下运行命令，且 `content.json` 文件存在。

**Q: 网站打开是空白页？**
A: 检查浏览器控制台（F12）是否有报错。最常见原因是 CSS/JS 路径不对——确保 `dist/` 目录结构完整。

**Q: GitHub Pages 打开后样式丢失？**
A: 如果部署在子路径（如 `/photography/`），确保 `.nojekyll` 文件存在。项目已自动生成。

---

## 六、小白第一次怎么做（零基础也能行）

整个过程只需：一台电脑 + 一个 GitHub 账号 + 安装两个免费软件（Git、Go）。

**第 1 步：装两个软件（只需一次）**
- Git：https://git-scm.com/downloads → 下载 Windows 版，一路「下一步」装完。
- Go：https://go.dev/dl/ → 下载 `.msi`，一路「下一步」装完。
- 装好后，按 `Win + R` 输入 `cmd` 回车，分别输入 `git --version` 和 `go version`，能看到版本号就成功了。

**第 2 步：把网站发到网上（只需一次）**
- 去 https://github.com/new 注册并新建一个仓库，名字随意（如 `photography`），选 **Public**。
- 回到电脑，进入本项目的文件夹，找到 `deploy.ps1`，右键 →「用 PowerShell 运行」。
- 脚本会问你 **GitHub 用户名** 和 **仓库名**，照实填回车即可。第一次可能弹浏览器让你登录 GitHub，登录授权就行。
- 成功后脚本会告诉你网站地址（形如 `https://你的用户名.github.io/photography`）。

**第 3 步：以后怎么改内容**
1. 启动本地服务器：在本项目 `backend` 文件夹地址栏输入 `cmd`，回车，输入 `go run main.go serve`，保持这个窗口开着。
2. 浏览器打开 `http://localhost:8080/admin.html` —— 这就是你的「后台」。
3. 在「作品」里把照片**拖进虚线框**就能上传；在其他标签改文字。
4. 改完点右上角 **「保存并预览」**，再点 **「打开站点」** 就能看到效果。
5. 想让网上也更新：关掉后台，双击 `deploy.ps1` 即可重新发布。

> 提示：后台顶部有操作引导条，看一眼就知道怎么用；不想看关掉即可，下次不再弹。

**常见问题**
- 后台打不开 / 按钮没反应？先确认第 3 步的「本地服务器窗口」还开着；改完代码或重启后，浏览器按 `Ctrl+F5` 强制刷新。
- 图片传不上去？检查文件是不是常见格式（jpg/png/mp4），单张别超过 200MB。

