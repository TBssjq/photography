#!/usr/bin/env python3
"""scripts/regen-site-data.py — 从 backend/content.json 重新生成根目录 site-data.js。

等价于 backend Go SSG 里「生成 site-data.js」那一步，但**只**产出 site-data.js，
不触碰 index.html（避免 Go build 用模板覆盖我们在 index.html 上的手工改动）。
在修改 content.json（如 hero 背景图改名）后运行，保持 site-data.js 与源数据同源。
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    with open(os.path.join(ROOT, 'backend', 'content.json'), encoding='utf-8') as f:
        data = json.load(f)
    js = (
        '// 由 build 自动从 content.json 生成，请勿手改\n'
        'window.SITE_DATA = ' + json.dumps(data, ensure_ascii=False) + ';\n'
    )
    out = os.path.join(ROOT, 'site-data.js')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(js)
    print(f'regenerated {out} ({len(js):,} bytes)')


if __name__ == '__main__':
    main()
