package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"html"
	"html/template"
	"io"
	"log"
	"math/rand"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ================================================================
// 数据结构 — 与 content.json 对应
// ================================================================

type SiteData struct {
	Site       Site        `json:"site"`
	Hero       Hero        `json:"hero"`
	Featured   []Featured  `json:"featured"`
	Quote      Quote       `json:"quote"`
	About      About       `json:"about"`
	Gear       Gear        `json:"gear"`
	Categories []Category  `json:"categories"`
	Photos     []Photo     `json:"photos"`
	Contact    Contact     `json:"contact"`
	Footer     Footer      `json:"footer"`
}

type Site struct {
	Name        string `json:"name"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Author      string `json:"author"`
}

type TypewriterSegment struct {
	Text string `json:"text"`
	Em   bool   `json:"em,omitempty"`
}

type Hero struct {
	Kicker       string              `json:"kicker"`
	Typewriter   []TypewriterSegment `json:"typewriter"`
	Subtitle     string              `json:"subtitle"`
	BtnPrimary   string              `json:"btnPrimary"`
	BtnSecondary string              `json:"btnSecondary"`
	Bg           string              `json:"bg"`
}

type Featured struct {
	Img    string `json:"img"`
	Kicker string `json:"kicker"`
	Title  string `json:"title"`
	Desc   string `json:"desc"`
}

type Quote struct {
	Text      string `json:"text"`
	Emphasize string `json:"emphasize"`
	Author    string `json:"author"`
}

type Stat struct {
	Value string `json:"value"`
	Label string `json:"label"`
}

type About struct {
	SecNum     string   `json:"secNum"`
	Kicker     string   `json:"kicker"`
	Title      string   `json:"title"`
	Paragraphs []string `json:"paragraphs"`
	Img        string   `json:"img"`
	ImgTag     string   `json:"imgTag"`
	Stats      []Stat   `json:"stats"`
}

type GearItem struct {
	Name  string `json:"name"`
	Value string `json:"value"`
	SVG   string `json:"svg,omitempty"`
}

type Gear struct {
	SecNum string     `json:"secNum"`
	Kicker string     `json:"kicker"`
	Title  string     `json:"title"`
	Desc   string     `json:"desc"`
	Items  []GearItem `json:"items"`
}

type Category struct {
	Key   string `json:"key"`
	Label string `json:"label"`
}

type Photo struct {
	Cat   string   `json:"cat"`
	Title string   `json:"title"`
	Tag   string   `json:"tag"`
	Date  string   `json:"date"`
	Tags  []string `json:"tags"`
	Src   string   `json:"src"`
	Note  string   `json:"note,omitempty"`
	Type  string   `json:"type,omitempty"`
	Links []string `json:"links,omitempty"`
}

type ContactItem struct {
	Label string `json:"label"`
	Value string `json:"value"`
	URL   string `json:"url"`
}

type Contact struct {
	Title      string        `json:"title"`
	Subtitle   string        `json:"subtitle"`
	Dedication string        `json:"dedication"`
	Contacts   []ContactItem `json:"contacts"`
}

type Footer struct {
	Copyright string `json:"copyright"`
}

// ================================================================
// 模板数据
// ================================================================

type TemplateData struct {
	Data           SiteData
	JSON           template.JS // 内联到 <script id="site-data">，需为 JS 类型以免 html/template 转义引号
	TypewriterJSON string
}

// ================================================================
// 模板辅助函数
// ================================================================

// quoteHTML 将引言文字中需要强调的部分用 <em> 标签包裹
func quoteHTML(text, emphasize string) template.HTML {
	if emphasize == "" {
		return template.HTML(html.EscapeString(text))
	}
	idx := strings.Index(text, emphasize)
	if idx < 0 {
		return template.HTML(html.EscapeString(text))
	}
	before := html.EscapeString(text[:idx])
	em := html.EscapeString(emphasize)
	after := html.EscapeString(text[idx+len(emphasize):])
	return template.HTML(before + "<em>" + em + "</em>" + after)
}

// ================================================================
// 路径配置
// ================================================================

var (
	// 基于可执行文件位置解析目录，避免依赖进程工作目录（CWD）
	// 这样无论从哪个目录启动 server.exe，都能正确定位前端与数据源。
	// 注：go run 时 exe 在系统临时目录，无 content.json，此时回退到 CWD（backend/）。
	exePath, _   = os.Executable()
	_exeDir      = filepath.Dir(exePath)
	backendDir   = _exeDir
	projectDir   = filepath.Dir(backendDir)
	templateDir  = filepath.Join(backendDir, "templates")
	contentFile  = filepath.Join(backendDir, "content.json")
	distDir      = filepath.Join(projectDir, "dist")
)

func init() {
	// go run 临时目录回退：若 exe 同级不存在 content.json，则使用当前工作目录作为 backend 目录
	if _, err := os.Stat(filepath.Join(_exeDir, "content.json")); err != nil {
		backendDir = "."
		projectDir = ".."
		templateDir = "templates"
		contentFile = "content.json"
		distDir = filepath.Join(projectDir, "dist")
	}
}

// 需要复制到 dist/ 的静态资源目录
var staticDirs = []string{"css", "js", "assets", "img"}

// 需要复制到 dist/ 的单个文件（site-data.js 由 build 从 content.json 生成，不在此列）
var staticFiles = []string{"admin.html"}

// ================================================================
// 构建逻辑
// ================================================================

func build() error {
	startTime := time.Now()

	// 1. 读取 content.json
	log.Println("正在读取 content.json ...")
	contentPath := filepath.Join(contentFile)
	raw, err := os.ReadFile(contentPath)
	if err != nil {
		return fmt.Errorf("读取 content.json 失败: %w", err)
	}

	var data SiteData
	if err := json.Unmarshal(raw, &data); err != nil {
		return fmt.Errorf("解析 content.json 失败: %w", err)
	}
	log.Printf("  内容加载完成: %d 张作品, %d 个分类\n", len(data.Photos), len(data.Categories))

	// 2. 准备模板数据
	jsonBytes, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("序列化 JSON 失败: %w", err)
	}

	twBytes, err := json.Marshal(data.Hero.Typewriter)
	if err != nil {
		return fmt.Errorf("序列化打字机数据失败: %w", err)
	}

	tmplData := TemplateData{
		Data:           data,
		JSON:           template.JS(jsonBytes),
		TypewriterJSON: string(twBytes),
	}

	// 3. 解析模板
	log.Println("正在解析模板 ...")
	funcMap := template.FuncMap{
		"quoteHTML": quoteHTML,
	}
	tmplPath := filepath.Join(templateDir, "index.tmpl")
	tmpl, err := template.New("index.tmpl").Funcs(funcMap).ParseFiles(tmplPath)
	if err != nil {
		return fmt.Errorf("解析模板失败: %w", err)
	}

	// 4. 清理并创建 dist 目录
	// 注意：若 server.exe 自身正用 http.FileServer 托管 dist/（serve 模式下），
	// os.RemoveAll 会因目录被占用而失败。此时跳过清理，直接覆盖写入即可
	// （Windows 上 FileServer 以只读共享模式打开文件，覆盖同名文件不受影响）。
	log.Println("正在清理 dist/ 目录 ...")
	if err := os.RemoveAll(distDir); err != nil {
		log.Printf("  警告: 无法清理 dist/ (%s)，将跳过清理并覆盖写入\n", err)
	}
	if err := os.MkdirAll(distDir, 0755); err != nil {
		return fmt.Errorf("创建 dist/ 失败: %w", err)
	}

	// 5. 渲染模板到缓冲区
	log.Println("正在生成 index.html ...")
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, tmplData); err != nil {
		return fmt.Errorf("渲染模板失败: %w", err)
	}

	// 5.1 写入 dist/index.html（SSG 模式：内嵌 JSON，部署用）
	if err := os.WriteFile(filepath.Join(distDir, "index.html"), buf.Bytes(), 0644); err != nil {
		return fmt.Errorf("创建 dist/index.html 失败: %w", err)
	}

	// 5.2 生成根目录 index.html（开发模式：用 site-data.js 替换内嵌 JSON，支持双击直接打开）
	rootHTML := buf.String()
	tagStart := `<script type="application/json" id="site-data">`
	tagEnd := `</script>`
	if startIdx := strings.Index(rootHTML, tagStart); startIdx >= 0 {
		endIdx := strings.Index(rootHTML[startIdx:], tagEnd)
		if endIdx >= 0 {
			endIdx += startIdx + len(tagEnd)
			rootHTML = rootHTML[:startIdx] + `<script src="site-data.js"></script>` + rootHTML[endIdx:]
		}
	}
	log.Println("正在生成根目录 index.html ...")
	if err := os.WriteFile(filepath.Join(projectDir, "index.html"), []byte(rootHTML), 0644); err != nil {
		return fmt.Errorf("生成根目录 index.html 失败: %w", err)
	}

	// 6. 复制静态资源目录
	for _, dir := range staticDirs {
		srcPath := filepath.Join(projectDir, dir)
		dstPath := filepath.Join(distDir, dir)
		log.Printf("正在复制 %s/ ...\n", dir)
		if err := copyDir(srcPath, dstPath); err != nil {
			return fmt.Errorf("复制 %s/ 失败: %w", dir, err)
		}
	}

	// 6.1 生成 site-data.js（始终由 content.json 生成，确保与后端同源，消除双数据源漂移）
	// 同时写入根目录（供双击 index.html 直接运行）与 dist/（供构建产物）
	log.Println("正在生成 site-data.js ...")
	siteDataJS := "// 由 build 自动从 content.json 生成，请勿手改\nwindow.SITE_DATA = " + string(jsonBytes) + ";\n"
	if err := os.WriteFile(filepath.Join(distDir, "site-data.js"), []byte(siteDataJS), 0644); err != nil {
		return fmt.Errorf("生成 site-data.js 失败: %w", err)
	}
	if err := os.WriteFile(filepath.Join(projectDir, "site-data.js"), []byte(siteDataJS), 0644); err != nil {
		return fmt.Errorf("生成根 site-data.js 失败: %w", err)
	}

	// 6.2 复制单个文件（admin.html 等）
	for _, file := range staticFiles {
		srcPath := filepath.Join(projectDir, file)
		dstPath := filepath.Join(distDir, file)
		log.Printf("正在复制 %s ...\n", file)
		if err := copyFile(srcPath, dstPath); err != nil {
			return fmt.Errorf("复制 %s 失败: %w", file, err)
		}
	}

	// 7. 创建 .nojekyll（GitHub Pages 需要）
	nojekyllPath := filepath.Join(distDir, ".nojekyll")
	if err := os.WriteFile(nojekyllPath, []byte{}, 0644); err != nil {
		return fmt.Errorf("创建 .nojekyll 失败: %w", err)
	}

	elapsed := time.Since(startTime)
	log.Printf("构建完成! 耗时 %s, 输出目录: %s\n", elapsed.Round(time.Millisecond), distDir)
	return nil
}

// copyDir 递归复制目录
func copyDir(src, dst string) error {
	info, err := os.Stat(src)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return copyFile(src, dst)
	}
	if err := os.MkdirAll(dst, 0755); err != nil {
		return err
	}
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		srcPath := filepath.Join(src, entry.Name())
		dstPath := filepath.Join(dst, entry.Name())
		if entry.IsDir() {
			if err := copyDir(srcPath, dstPath); err != nil {
				return err
			}
		} else {
			if err := copyFile(srcPath, dstPath); err != nil {
				return err
			}
		}
	}
	return nil
}

// copyFile 复制单个文件
func copyFile(src, dst string) error {
	srcFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer srcFile.Close()

	dstFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer dstFile.Close()

	_, err = io.Copy(dstFile, srcFile)
	return err
}

// ================================================================
// 本地预览服务器
// ================================================================

func serve(port int) {
	// 先构建
	if err := build(); err != nil {
		log.Fatalf("构建失败: %v", err)
	}

	absDist, _ := filepath.Abs(distDir)
	log.Printf("本地预览服务器启动: http://localhost:%d\n", port)
	log.Printf("提供文件: %s\n", absDist)
	log.Println("按 Ctrl+C 停止")

	fs := http.FileServer(http.Dir(distDir))
	// 包一层：给静态资源加 no-cache，避免浏览器缓存旧的 admin.js / index.html
	// （后台改完代码或重启后，用户不必手动清缓存就能用到最新逻辑）
	noCache := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		fs.ServeHTTP(w, r)
	})
	mux := http.NewServeMux()
	mux.Handle("/", noCache)
	mux.HandleFunc("/api/content", apiContent)
	mux.HandleFunc("/api/rebuild", apiRebuild)
	mux.HandleFunc("/api/upload", apiUpload)
	mux.HandleFunc("/api/export-zip", apiExportZip)

	srv := &http.Server{
		Addr:    fmt.Sprintf(":%d", port),
		Handler: mux,
	}

	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("服务器错误: %v", err)
	}
}

// apiContent 处理后台读写内容：
//   GET  -> 返回 content.json（供后台初始化）
//   POST -> 接收 JSON 写回 content.json 并自动重建 dist/
func apiContent(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	contentPath := filepath.Join(contentFile)
	switch r.Method {
	case "GET":
		raw, err := os.ReadFile(contentPath)
		if err != nil {
			http.Error(w, "读取内容失败", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Write(raw)

	case "POST":
		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "读取请求体失败", http.StatusBadRequest)
			return
		}
		// 校验为合法 JSON
		var probe interface{}
		if err := json.Unmarshal(body, &probe); err != nil {
			http.Error(w, "内容不是合法 JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
		// 写回 content.json（带缩进，便于版本管理）
		pretty, _ := json.MarshalIndent(probe, "", "  ")
		if err := os.WriteFile(contentPath, pretty, 0644); err != nil {
			http.Error(w, "写入 content.json 失败: "+err.Error(), http.StatusInternalServerError)
			return
		}
		// 自动重建 dist/
		if err := build(); err != nil {
			http.Error(w, "保存成功但重建失败: "+err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Write([]byte(`{"ok":true,"msg":"已保存并重建"}`))

	default:
		http.Error(w, "不支持的方法", http.StatusMethodNotAllowed)
	}
}

// apiRebuild 供后台手动触发重建（例如直接改了 assets 后）
func apiRebuild(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	if r.Method != "POST" {
		http.Error(w, "仅支持 POST", http.StatusMethodNotAllowed)
		return
	}
	if err := build(); err != nil {
		http.Error(w, "重建失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Write([]byte(`{"ok":true,"msg":"已重建"}`))
}

// apiUpload 接收后台上传的图片/视频文件，保存到 assets/works/ 下，
// 返回可访问的相对路径。这样 content.json 只存轻量路径，不被 base64 撑爆。
func apiUpload(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != "POST" {
		http.Error(w, "仅支持 POST", http.StatusMethodNotAllowed)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 200*1024*1024) // 上限 200MB
	if err := r.ParseMultipartForm(200 * 1024 * 1024); err != nil {
		http.Error(w, "解析上传失败: "+err.Error(), http.StatusBadRequest)
		return
	}
	files := r.MultipartForm.File["file"]
	if len(files) == 0 {
		http.Error(w, "没有收到文件", http.StatusBadRequest)
		return
	}

	worksDir := filepath.Join(projectDir, "assets", "works")
	if err := os.MkdirAll(worksDir, 0755); err != nil {
		http.Error(w, "创建上传目录失败: "+err.Error(), http.StatusInternalServerError)
		return
	}

	type savedFile struct {
		Path string `json:"path"`
		Name string `json:"name"`
	}
	saved := make([]savedFile, 0, len(files))

	for _, fh := range files {
		// 仅允许图片/视频类型
		ct := fh.Header.Get("Content-Type")
		if !strings.HasPrefix(ct, "image/") && !strings.HasPrefix(ct, "video/") {
			continue
		}
		// 安全扩展名
		ext := strings.ToLower(filepath.Ext(fh.Filename))
		switch ext {
		case ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".mp4", ".webm", ".ogg", ".mov", ".m4v":
		default:
			ext = ".bin"
		}
		// 唯一文件名：时间戳_随机_随机，避免同一秒内批量上传碰撞导致覆盖
		var outPath string
		for {
			stamp := time.Now().Format("20060102_150405")
			randSuffix := fmt.Sprintf("%04d%04d", rand.Intn(10000), rand.Intn(10000))
			outName := fmt.Sprintf("%s_%s%s", stamp, randSuffix, ext)
			outPath = filepath.Join(worksDir, outName)
			if _, err := os.Stat(outPath); os.IsNotExist(err) {
				break
			}
		}

		src, err := fh.Open()
		if err != nil {
			http.Error(w, "打开上传文件失败: "+err.Error(), http.StatusInternalServerError)
			return
		}
		dst, err := os.Create(outPath)
		if err != nil {
			src.Close()
			http.Error(w, "保存文件失败: "+err.Error(), http.StatusInternalServerError)
			return
		}
		if _, err := io.Copy(dst, src); err != nil {
			src.Close()
			dst.Close()
			http.Error(w, "写入文件失败: "+err.Error(), http.StatusInternalServerError)
			return
		}
		src.Close()
		dst.Close()

		// 返回相对站点根的路径（前端用此路径即可访问，build 会复制 assets/）
		saved = append(saved, savedFile{
			Path: "assets/works/" + filepath.Base(outPath),
			Name: fh.Filename,
		})
	}

	if len(saved) == 0 {
		http.Error(w, "没有合法的文件被保存", http.StatusBadRequest)
		return
	}
	// 上传完成后自动重建 dist/，确保新文件被复制到 dist/assets/works/ 供预览
	if err := build(); err != nil {
		log.Printf("上传成功但重建 dist 失败: %v", err)
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "files": saved})
}

// apiExportZip 把构建好的 dist/ 目录整体用标准库 archive/zip 打包，
// 返回二进制 ZIP 流（比前端手写 ZIP 稳定，绝不损坏）。
func apiExportZip(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != "POST" && r.Method != "GET" {
		http.Error(w, "仅支持 POST/GET", http.StatusMethodNotAllowed)
		return
	}

	// 确保 dist/ 是最新的（有人可能直接改了 assets 还没保存）
	if err := build(); err != nil {
		http.Error(w, "重建 dist 失败: "+err.Error(), http.StatusInternalServerError)
		return
	}

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	err := filepath.Walk(distDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		// 计算相对 dist/ 的路径（作为 ZIP 内条目名）
		rel, err := filepath.Rel(distDir, path)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)
		// 跳过 .nojekyll 之外的隐藏文件可在此过滤，这里全打包
		f, err := zw.Create(rel)
		if err != nil {
			return err
		}
		src, err := os.Open(path)
		if err != nil {
			return err
		}
		defer src.Close()
		_, err = io.Copy(f, src)
		return err
	})
	if err != nil {
		http.Error(w, "打包失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if err := zw.Close(); err != nil {
		http.Error(w, "收尾 ZIP 失败: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", "attachment; filename=suibei-photography.zip")
	w.Header().Set("Content-Length", fmt.Sprintf("%d", buf.Len()))
	w.Write(buf.Bytes())
}

// ================================================================
// 主入口
// ================================================================

func main() {
	// 确保工作目录正确（兼容 go run、编译后运行、从项目根目录运行）
	// 1. 当前目录已有 content.json → 无需切换
	if _, err := os.Stat(contentFile); err != nil {
		// 2. 尝试从可执行文件所在目录查找（编译后的 .exe 场景）
		if exe, err := os.Executable(); err == nil {
			exeDir := filepath.Dir(exe)
			if _, err := os.Stat(filepath.Join(exeDir, contentFile)); err == nil {
				_ = os.Chdir(exeDir)
			}
		}
		// 3. 仍找不到 → 尝试 backend/ 子目录（从项目根目录运行 go run 的场景）
		if _, err := os.Stat(contentFile); err != nil {
			if _, err := os.Stat(filepath.Join("backend", contentFile)); err == nil {
				_ = os.Chdir("backend")
			}
		}
	}

	// 子命令
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "build":
			buildCmd := flag.NewFlagSet("build", flag.ExitOnError)
			buildCmd.Parse(os.Args[2:])
			if err := build(); err != nil {
				log.Fatalf("构建失败: %v", err)
			}
			return
		case "serve":
			serveCmd := flag.NewFlagSet("serve", flag.ExitOnError)
			port := serveCmd.Int("port", 8080, "预览服务器端口")
			serveCmd.Parse(os.Args[2:])
			serve(*port)
			return
		case "help", "-h", "--help":
			printUsage()
			return
		}
	}

	// 默认: 构建并启动本地预览服务器（双击 server.exe 即可用）
	if err := build(); err != nil {
		log.Fatalf("构建失败: %v", err)
	}
	serve(8080)
}

func printUsage() {
	fmt.Println(`
隋北摄影站 — Go 静态网站生成器 (SSG)
=====================================

用法:
  go run main.go [命令] [参数]

命令:
  build     生成静态网站到 dist/ 目录 (默认)
  serve     生成并提供本地预览服务器
  help      显示帮助信息

参数:
  serve -port <端口号>   指定预览端口 (默认 8080)

示例:
  go run main.go              # 构建静态网站
  go run main.go build        # 同上
  go run main.go serve        # 构建 + 本地预览
  go run main.go serve -port 3000  # 使用 3000 端口预览

输出:
  dist/                       # 生成的静态网站目录
    ├── index.html            # 预渲染的 HTML
    ├── css/                  # 样式文件
    ├── js/                   # 脚本文件
    ├── assets/               # 图片资源
    └── .nojekyll             # GitHub Pages 配置

部署到 GitHub Pages:
  1. 将 dist/ 目录内容推送到 GitHub 仓库
  2. 在仓库 Settings → Pages 中选择 main 分支
  3. 等待几分钟后即可访问你的网站
`)
}
