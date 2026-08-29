#!/usr/bin/env python3
"""scripts/optimize-images.py — 用 Pillow 重新编码图片以减小体积（部署 GitHub Pages 友好）。

策略：
  · .webp  —— 有损重编码（quality=80, method=6），保留 ICC 色彩配置，动画 webp 用 save_all 保留帧
  · .png   —— 转 .webp（quality=85，保留透明通道）
  · .jpg   —— 有损重编码
仅当新文件比原文件小 ≥2%（MIN_SAVE_RATIO）才视为有效优化，避免无谓重编码损质。

默认 dry-run（只报告，不写盘）；--apply 才落地（覆盖 webp / png 改名 .webp 并删除原 png）。
所有原文件均在 git 跟踪中，误伤可用 `git checkout` 还原。
"""
import os
import io
import argparse
from PIL import Image, ImageSequence

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIRS = ['img', 'assets']
EXTS = ('.webp', '.png', '.jpg', '.jpeg')
WEBP_QUALITY = 80
PNG_QUALITY = 85
METHOD = 6
MIN_SAVE_RATIO = 0.98  # 新文件需 < 原 * 0.98（省 ≥2%）才替换


def collect():
    out = []
    for d in DIRS:
        base = os.path.join(ROOT, d)
        for root, _, files in os.walk(base):
            for f in files:
                if f.lower().endswith(EXTS):
                    out.append(os.path.join(root, f))
    return out


def optimize(path):
    """返回 (orig_bytes, new_bytes, note, data_or_None)。"""
    try:
        im = Image.open(path)
        im.load()
    except Exception as e:
        return (os.path.getsize(path) if os.path.exists(path) else 0, 0, f'SKIP open-error: {e}', None)
    orig = os.path.getsize(path)
    animated = getattr(im, 'is_animated', False)
    icc = im.info.get('icc_profile')
    is_png = path.lower().endswith('.png')
    buf = io.BytesIO()
    try:
        if animated:
            frames = [fr.convert('RGBA') for fr in ImageSequence.Iterator(im)]
            kwargs = {
                'save_all': True,
                'append_images': frames[1:],
                'duration': im.info.get('duration', 100),
                'loop': im.info.get('loop', 0),
                'method': METHOD,
                'quality': WEBP_QUALITY,
            }
            if icc:
                kwargs['icc_profile'] = icc
            frames[0].save(buf, 'WEBP', **kwargs)
        else:
            has_alpha = im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info)
            im2 = im.convert('RGBA' if has_alpha else 'RGB')
            kwargs = {'method': METHOD, 'quality': (PNG_QUALITY if is_png else WEBP_QUALITY)}
            if icc:
                kwargs['icc_profile'] = icc
            im2.save(buf, 'WEBP', **kwargs)
    except Exception as e:
        return (orig, 0, f'SKIP encode-error: {e}', None)
    new = buf.tell()
    if new < orig * MIN_SAVE_RATIO:
        return (orig, new, 'ok', buf.getvalue())
    return (orig, new, 'skip-no-gain', None)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true', help='写回磁盘（默认 dry-run）')
    args = ap.parse_args()

    files = collect()
    total_orig = total_new = 0
    changed = 0
    for p in sorted(files):
        orig, new, note, data = optimize(p)
        if note.startswith('SKIP'):
            print(f'{note}  {p}')
            continue
        if note == 'skip-no-gain':
            continue
        total_orig += orig
        total_new += new
        changed += 1
        print(f'{orig:>9} -> {new:>9}  ({100*(1-new/orig):4.1f}% 省)  {os.path.relpath(p, ROOT)}')
        if args.apply and data:
            if p.lower().endswith('.png'):
                dst = p[:-4] + '.webp'
                with open(dst, 'wb') as f:
                    f.write(data)
                os.remove(p)
                print(f'           -> 重命名为 {os.path.relpath(dst, ROOT)}')
            else:
                with open(p, 'wb') as f:
                    f.write(data)

    print(f'\n扫描 {len(files)} 个文件，可优化 {changed} 个')
    if changed:
        print(f'体积 {total_orig:,} -> {total_new:,} 字节（共省 {total_orig - total_new:,}，'
              f'{100*(1-total_new/total_orig):.1f}%）')
    if not args.apply:
        print('（dry-run，未写盘。加 --apply 落地）')


if __name__ == '__main__':
    main()
