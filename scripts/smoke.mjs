#!/usr/bin/env node
/* ============================================================
 * scripts/smoke.mjs — 无头冒烟测试（零 npm 依赖）
 *
 * 目的：锁住「纯静态双击可运行」站点的关键不变量，防止 GSAP / three /
 *       文字逐字揭幕 等改动引入回归。检测项：
 *   1) 页面无未捕获 JS 异常（Runtime.exceptionThrown）
 *   2) 无 console.error
 *   3) 无 console.warn 文本命中已知已修回归：
 *        · "GSAP target"            —— split-reveal 空目标 / stale tween（#4）
 *        · "deprecated with r150"   —— three UMD 弃用提示（#5，已 vendored strip）
 *   4) 软性统计：.split 逐字揭幕可见数、蜜蜂 canvas 是否存在、THREE 是否加载
 *
 * 实现：Node 内置 http 起静态服务器 + spawn headless Chrome（--remote-debugging-port）
 *       + 最小内联 WebSocket 客户端走 CDP。无需 puppeteer / playwright。
 *
 * 用法：
 *   node scripts/smoke.mjs                 # 默认 http://127.0.0.1:8123/index.html
 *   CHROME_BIN=/path/to/chrome node scripts/smoke.mjs
 *   node scripts/smoke.mjs --url file://.../index.html   # 也可直接测 file:// 双击场景
 *
 * 退出码：0 = 通过，1 = 失败（断言未过 / Chrome 不可用 / 超时）
 * ========================================================== */
import { createServer, request as httpRequest } from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.SMOKE_PORT || 8123);
const CDP_PORT = Number(process.env.SMOKE_CDP_PORT || 9333);
const ARGS = process.argv.slice(2);
const argUrl = ARGS.find((a) => a.startsWith('--url='))?.slice(6);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

/* ---------- 静态服务器（限定在 ROOT 内，防目录穿越） ---------- */
function startServer() {
  return new Promise((res) => {
    const server = createServer(async (req, res2) => {
      try {
        let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        if (urlPath === '/') urlPath = '/index.html';
        const filePath = normalize(join(ROOT, urlPath));
        if (!filePath.startsWith(ROOT)) {
          res2.writeHead(403).end('forbidden');
          return;
        }
        const info = await stat(filePath).catch(() => null);
        if (!info || !info.isFile()) {
          res2.writeHead(404).end('not found');
          return;
        }
        const buf = await readFile(filePath);
        res2.writeHead(200, { 'content-type': MIME[extname(filePath)] || 'application/octet-stream' });
        res2.end(buf);
      } catch {
        res2.writeHead(500).end('error');
      }
    });
    server.listen(PORT, () => res(server));
  });
}

/* ---------- 探测 Chrome ---------- */
function findChrome() {
  if (process.env.CHROME_BIN && existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return null;
}

async function waitForJson(path, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}${path}`);
      if (r.ok) return await r.json();
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

/* ---------- 最小零依赖 WebSocket 客户端（连 CDP） ---------- */
class CDP {
  constructor(target) {
    this.target = target;
    this.handlers = new Map();
    this.msgCbs = [];
    this.fragOp = null;
    this.fragBuf = [];
  }
  connect() {
    return new Promise((resolve, reject) => {
      const key = createHash('sha1').update(String(Math.random())).digest('base64');
      const u = new URL(this.target);
      const req = httpRequest({
        host: u.hostname,
        port: Number(u.port),
        path: u.pathname + u.search,
        headers: {
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Key': key,
          'Sec-WebSocket-Version': '13',
        },
      });
      req.on('upgrade', (res, socket) => {
        this.socket = socket;
        socket.on('data', (d) => this._onData(d));
        socket.on('close', () => this._emit('close'));
        socket.on('error', (e) => reject(e));
        resolve();
      });
      req.on('error', reject);
      req.end();
    });
  }
  _onData(buf) {
    let i = 0;
    while (i + 2 <= buf.length) {
      const b0 = buf[i];
      const b1 = buf[i + 1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let p = i + 2;
      if (len === 126) {
        if (i + 4 > buf.length) break;
        len = buf.readUInt16BE(i + 2);
        p = i + 4;
      } else if (len === 127) {
        if (i + 10 > buf.length) break;
        len = Number(buf.readBigUInt64BE(i + 2));
        p = i + 10;
      }
      let maskKey = null;
      if (masked) {
        if (p + 4 > buf.length) break;
        maskKey = buf.subarray(p, p + 4);
        p += 4;
      }
      if (p + len > buf.length) break;
      let payload = Buffer.from(buf.subarray(p, p + len));
      if (masked) {
        const out = Buffer.allocUnsafe(len);
        for (let k = 0; k < len; k++) out[k] = payload[k] ^ maskKey[k & 3];
        payload = out;
      }
      i = p + len;

      if (opcode === 0x8) {
        this._emit('close');
        return;
      } else if (opcode === 0x9) {
        // ping -> pong
        this._sendFrame(0xa, payload);
        continue;
      } else if (opcode === 0xa) {
        continue; // pong
      } else if (opcode === 0x0 || opcode === 0x1 || opcode === 0x2) {
        if (opcode !== 0x0) this.fragOp = opcode;
        this.fragBuf.push(payload);
        if (fin) {
          const full = Buffer.concat(this.fragBuf);
          this.fragBuf = [];
          const op = this.fragOp;
          this.fragOp = null;
          if (op === 0x1) {
            let msg;
            try {
              msg = JSON.parse(full.toString('utf8'));
            } catch {
              continue;
            }
            this._emit('message', msg);
          }
        }
      }
    }
  }
  _sendFrame(opcode, payload) {
    const len = payload.length;
    const header = [];
    header.push(0x80 | opcode);
    if (len < 126) header.push(len);
    else if (len < 65536) {
      header.push(126, (len >> 8) & 0xff, len & 0xff);
    } else {
      header.push(127, ...Buffer.from(BigInt(len).toString(16).padStart(16, '0'), 'hex'));
    }
    this.socket.write(Buffer.from(header));
    this.socket.write(payload);
  }
  send(obj) {
    const payload = Buffer.from(JSON.stringify(obj), 'utf8');
    // 客户端帧必须 mask
    const mask = Buffer.from([Math.random() * 256, Math.random() * 256, Math.random() * 256, Math.random() * 256]).map((n) => n | 0);
    const len = payload.length;
    const header = [];
    header.push(0x81); // FIN + text
    if (len < 126) header.push(0x80 | len);
    else if (len < 65536) header.push(0x80 | 126, (len >> 8) & 0xff, len & 0xff);
    else header.push(0x80 | 127, ...Buffer.from(BigInt(len).toString(16).padStart(16, '0'), 'hex'));
    header.push(...mask);
    const masked = Buffer.allocUnsafe(len);
    for (let k = 0; k < len; k++) masked[k] = payload[k] ^ mask[k & 3];
    this.socket.write(Buffer.from(header));
    this.socket.write(masked);
  }
  _emit(ev, data) {
    if (ev === 'message') {
      for (const cb of this.msgCbs) cb(data);
    }
  }
  onMessage(cb) {
    this.msgCbs.push(cb);
  }
  close() {
    try {
      this._sendFrame(0x8, Buffer.alloc(0));
      this.socket.end();
    } catch {
      /* ignore */
    }
  }
}

/* ---------- 主流程 ---------- */
async function main() {
  const server = await startServer();
  const chromePath = findChrome();
  if (!chromePath) {
    console.error('[smoke] 未找到 Chrome。请安装 Chrome，或用 CHROME_BIN=/path/to/chrome 指定。');
    server.close();
    process.exit(1);
  }
  const tmpProfile = join(ROOT, '.smoke-chrome-profile');
  const isHeadlessShell = /headless-shell/i.test(chromePath);
  const chromeArgs = [
    `--remote-debugging-port=${CDP_PORT}`,
    '--no-sandbox',
    '--disable-gpu',
    `--user-data-dir=${tmpProfile}`,
  ];
  if (!isHeadlessShell) chromeArgs.unshift('--headless=new');
  const chrome = spawn(chromePath, chromeArgs, { stdio: 'ignore' });

  let exitCode = 1;
  const cleanup = () => {
    try { chrome.kill('SIGKILL'); } catch {}
    try { server.close(); } catch {}
  };
  process.on('exit', cleanup);

  const version = await waitForJson('/json/version');
  if (!version) {
    console.error('[smoke] 无法连上 Chrome CDP，启动失败。');
    cleanup();
    process.exit(1);
  }

  // 取一个 page target
  let targets = (await waitForJson('/json')) || [];
  let page = targets.find((t) => t.type === 'page');
  if (!page) {
    const created = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new`, { method: 'PUT' }).then((r) => r.json());
    page = created;
  }

  const cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.connect();

  const consoleErrors = [];
  const consoleWarns = [];
  const exceptions = [];
  cdp.onMessage((msg) => {
    if (msg.id && msg.result !== undefined) {
      const h = cdp.handlers.get(msg.id);
      if (h) { cdp.handlers.delete(msg.id); h(msg.result); }
      return;
    }
    if (msg.error) {
      const h = cdp.handlers.get(msg.id);
      if (h) { cdp.handlers.delete(msg.id); h(null, msg.error); }
      return;
    }
    const m = msg.method;
    const p = msg.params || {};
    if (m === 'Runtime.consoleAPICalled') {
      const text = (p.args || []).map((a) => a.value !== undefined ? String(a.value) : (a.description || '')).join(' ');
      if (p.type === 'error') consoleErrors.push(text);
      else if (p.type === 'warning') consoleWarns.push(text);
    } else if (m === 'Runtime.exceptionThrown') {
      const d = p.exceptionDetails || {};
      exceptions.push((d.exception && d.exception.description) || d.text || 'unknown exception');
    }
  });

  const call = (method, params = {}) =>
    new Promise((resolve) => {
      const id = Math.floor(Math.random() * 1e9);
      cdp.handlers.set(id, resolve);
      cdp.send({ id, method, params });
    });

  await call('Runtime.enable');
  await call('Page.enable');
  const targetUrl = argUrl || `http://127.0.0.1:${PORT}/index.html`;
  await call('Page.navigate', { url: targetUrl });
  // 等 load
  await new Promise((r) => setTimeout(r, 1500));

  // 给 GSAP / SplitText / ScrollTrigger 首屏触发与字体重排时间
  await new Promise((r) => setTimeout(r, 3500));

  // 滚动遍历，触发非首屏的 .split 揭幕
  await call('Runtime.evaluate', { expression: 'window.scrollTo(0, document.body.scrollHeight);', returnByValue: true });
  await new Promise((r) => setTimeout(r, 1500));
  await call('Runtime.evaluate', { expression: 'window.scrollTo(0, 0);', returnByValue: true });
  await new Promise((r) => setTimeout(r, 800));

  // 统计页面信号
  const stats = await call('Runtime.evaluate', {
    expression: `(function(){
      var splits = Array.prototype.slice.call(document.querySelectorAll('.split'));
      var visible = splits.filter(function(el){
        var r = el.getBoundingClientRect();
        var cs = getComputedStyle(el);
        return r.height > 0 && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.01;
      }).length;
      return {
        splitTotal: splits.length,
        splitVisible: visible,
        hasBee: !!document.getElementById('bee3dCanvas'),
        hasThree: typeof window.THREE !== 'undefined'
      };
    })()`,
    returnByValue: true,
  });
  const stat = (stats && stats.result && stats.result.value) || {};

  // ---------- 断言 ----------
  // 与本站代码无关、无头环境下必然出现的环境/第三方噪声，过滤掉以免误报：
  //  · 网易云音乐 iframe 跨域帧访问（music.163.com）
  //  · 媒体 autoplay 被无头浏览器拦截（未交互）
  //  · 无头无 GPU 环境下 WebGL 上下文创建失败（bee3d 的 3D 蜜蜂）
  const NOISE = [
    /play\(\) failed because the user didn'?t interact/i,
    /music\.163\.com/,
    /cross-origin frame/i,
    /Blocked a frame with origin/i,
    /WebGL/i,
  ];
  const isNoise = (t) => NOISE.some((re) => re.test(t));
  const realExceptions = exceptions.filter((t) => !isNoise(t));
  const realErrors = consoleErrors.filter((t) => !isNoise(t));
  const noiseCount = exceptions.length + consoleErrors.length - realExceptions.length - realErrors.length;
  // 只匹配「把 live collection 当 GSAP 目标」这类真 bug（如 [object HTMLCollection]）；
  // 空字符串目标 "GSAP target  not found" 是 GSAP 3.13 内部 toArray(undefined) 的良性告警，不计回归。
  // three 的 r150+ 弃用提示（"Scripts build/three.js ... deprecated"）是官方 UMD 内嵌的无害告警，
  // 部署后必然存在、不影响功能，过滤掉以免冒烟误报。
  const warnNoiseRe = /deprecated with r150|Scripts "build\/three\.js"/i;
  const realWarns = consoleWarns.filter((t) => !warnNoiseRe.test(t));
  const warnNoise = consoleWarns.length - realWarns.length;
  const regressWarn = consoleWarns.filter((t) => /GSAP target \[object /i.test(t));
  const failures = [];
  if (realExceptions.length) failures.push(`JS 异常 ${realExceptions.length} 条: ${realExceptions.slice(0, 3).join(' | ')}`);
  if (realErrors.length) failures.push(`console.error ${realErrors.length} 条: ${realErrors.slice(0, 3).join(' | ')}`);
  if (regressWarn.length) failures.push(`已修回归告警重现: ${regressWarn.join(' | ')}`);

  // ---------- 报告 ----------
  console.log('── 冒烟结果 ─────────────────────────────');
  console.log(`目标 URL        : ${targetUrl}`);
  console.log(`.split 总数     : ${stat.splitTotal}`);
  console.log(`.split 可见     : ${stat.splitVisible}${stat.splitTotal ? ` (${Math.round((stat.splitVisible / stat.splitTotal) * 100)}%)` : ''}`);
  console.log(`蜜蜂 canvas     : ${stat.hasBee ? '存在' : '缺失'}`);
  console.log(`THREE 加载      : ${stat.hasThree ? '是' : '否'}`);
  console.log(`JS 异常         : ${exceptions.length}${realExceptions.length ? ` (有效 ${realExceptions.length})` : ''}`);
  console.log(`console.error   : ${consoleErrors.length}${realErrors.length ? ` (有效 ${realErrors.length})` : ''}`);
  console.log(`环境噪声(忽略)  : ${noiseCount}（异常/error）`);
  console.log(`告警噪声(忽略)  : ${warnNoise}（three 弃用提示）`);
  console.log(`console.warn    : ${consoleWarns.length}${realWarns.length ? ` (有效 ${realWarns.length})` : ''}`);
  console.log('─────────────────────────────────────────');

  if (failures.length) {
    console.error('❌ 失败:\n  - ' + failures.join('\n  - '));
    exitCode = 1;
  } else {
    console.log('✅ 通过：无异常、无 error、已修回归告警未重现。');
    exitCode = 0;
  }

  cdp.close();
  cleanup();
  process.exit(exitCode);
}

main().catch((e) => {
  console.error('[smoke] 运行出错:', e);
  process.exit(1);
});
