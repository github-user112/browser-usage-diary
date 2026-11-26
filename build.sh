#!/usr/bin/env bash
# 打包小米浏览器扩展 ZIP：根目录 manifest.json，纯前端静态资源
set -euo pipefail
cd "$(dirname "$0")"

FILES="manifest.json background.js popup.html popup.css popup.js icons/icon16.png icons/icon48.png icons/icon128.png"
rm -rf dist browser-usage-diary.zip
mkdir -p dist/icons
for f in $FILES; do mkdir -p "dist/$(dirname "$f")"; cp "$f" "dist/$f"; done

# 不依赖系统 zip 命令：用 Python 按固定时间戳打包，保证同一份源码重复打包字节一致
python3 - "$FILES" <<'PY'
import sys, zipfile
files = sys.argv[1].split()
with zipfile.ZipFile('browser-usage-diary.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for f in files:
        zi = zipfile.ZipInfo(f, date_time=(2026, 11, 26, 0, 0, 0))
        zi.compress_type = zipfile.ZIP_DEFLATED
        zi.external_attr = 0o644 << 16
        with open(f, 'rb') as fh:
            z.writestr(zi, fh.read())
PY

python3 - <<'PY'
import json, os, re, sys, zipfile
z = zipfile.ZipFile('browser-usage-diary.zip')
names = z.namelist()
issues = []
if 'manifest.json' not in names:
    issues.append('manifest.json 不在根目录')
for n in names:
    if n.startswith('/') or '..' in n.split('/'):
        issues.append('非法路径: ' + n)
    if re.search(r'\.(exe|sh|bat|cmd|php|jsp|pem|key)$', n, re.I):
        issues.append('禁止文件: ' + n)
icons_needed = ('icons/icon16.png','icons/icon48.png','icons/icon128.png')
for icon in icons_needed:
    if icon not in names:
        issues.append('缺少图标: ' + icon)

m = json.loads(z.read('manifest.json'))
if m.get('manifest_version') != 3:
    issues.append('manifest_version 不是 3')
if m.get('action', {}).get('default_popup') != 'popup.html':
    issues.append('popup 配置缺失')
if set(m.get('permissions', [])) != {'storage','tabs','alarms'}:
    issues.append('权限不是预期集合: ' + str(m.get('permissions')))
if not m.get('background', {}).get('service_worker'):
    issues.append('background service_worker 缺失')

banned = ['bookmarks','history','contextMenus','omnibox','notifications','tabGroups',
          'downloads','setBadgeText','getBadgeText','idle','proxy','debugger','webRequestBlocking']
for n in names:
    if n.endswith(('.js','.css','.html')):
        txt = z.read(n).decode('utf-8','ignore')
        patterns = [r'''(src|href)\s*=\s*['"]https?://''', r'@import\s+[^;]*https?://',
                    r'url\(\s*[\'"]?https?://', r'javascript:', r'\beval\s*\(',
                    r'new\s+Function\s*\(', r'on(click|load|error)\s*=']
        for p in patterns:
            if re.search(p, txt, re.I):
                issues.append('外部脚本/动态执行/inline 事件 %s: %s' % (n, p))
        for api in banned:
            if re.search(r'\bchrome\.' + api + r'\b', txt):
                issues.append('禁用 API %s in %s' % (api, n))

zsize = os.path.getsize('browser-usage-diary.zip')
usize = sum(i.file_size for i in z.infolist())
print('manifest:     ', 'PASS' if not issues else 'FAIL')
print('files:        ', len(names))
print('zip size:     ', zsize, 'bytes (limit 20971520)')
print('unpacked:     ', usize, 'bytes (limit 52428800)')
print('icons:        ', 'PASS' if all(i in names for i in icons_needed) else 'FAIL')
for i in issues: print('  -', i)
if issues or zsize > 20971520 or usize > 52428800: sys.exit(1)
print('\nZIP: ' + os.path.abspath('browser-usage-diary.zip'))
PY
