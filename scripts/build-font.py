#!/usr/bin/env python3
"""画面で使う文字だけを Zen Maru Gothic から切り出し、index.html に埋め込む。

    pip install fonttools brotli
    python3 scripts/build-font.py

文言や作品名(art/catalog.json)を変えたら実行し直す。scripts/embed-game.cjs のあとに実行すること。
フォントは SIL Open Font License 1.1。元ファイルは npm の @expo-google-fonts/zen-maru-gothic から取得する。
"""
import base64, io, json, pathlib, re, subprocess, tarfile
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / 'node_modules' / '.cache' / 'neko-font'
PACKAGE = '@expo-google-fonts/zen-maru-gothic@0.4.2'
# (ファイル, CSSの font-weight の範囲)
WEIGHTS = [('500Medium/ZenMaruGothic_500Medium.ttf', '400 600'),
           ('700Bold/ZenMaruGothic_700Bold.ttf', '700 800'),
           ('900Black/ZenMaruGothic_900Black.ttf', '900')]

def sources():
    if not (CACHE / 'package').exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        name = subprocess.check_output(['npm', 'pack', PACKAGE, '--silent'], cwd=CACHE, text=True).strip().splitlines()[-1]
        with tarfile.open(CACHE / name) as tar:
            tar.extractall(CACHE)
    return [(CACHE / 'package' / f, w) for f, w in WEIGHTS]

def used_text(html):
    # 画像・音・フォントの埋め込みは文字として数えない
    text = re.sub(r'[A-Za-z0-9+/=]{200,}', '', html)
    text += ''.join(w['n'] + w.get('breed', '') for w in json.loads((ROOT / 'art/catalog.json').read_text(encoding='utf-8')))
    text += ''.join(chr(c) for c in range(0x20, 0x7f)) + '０１２３４５６７８９、。・「」！？…★☆×＋ー〜'
    return ''.join(sorted(set(ch for ch in text if ch >= ' ')))

def main():
    path = ROOT / 'index.html'
    html = path.read_text(encoding='utf-8')
    text = used_text(html)
    faces = []
    for src, weight in sources():
        opts = subset.Options()
        opts.flavor = 'woff2'; opts.layout_features = ['kern', 'palt', 'liga']; opts.name_IDs = [1, 2]; opts.notdef_outline = True
        font = TTFont(src); sub = subset.Subsetter(opts); sub.populate(text=text); sub.subset(font)
        out = io.BytesIO(); font.flavor = 'woff2'; font.save(out)
        faces.append("@font-face{font-family:'NekoMaru';font-weight:%s;font-display:swap;src:url(data:font/woff2;base64,%s) format('woff2')}"
                     % (weight, base64.b64encode(out.getvalue()).decode()))
        print(src.name, len(out.getvalue()), 'bytes')
    block = '/* FONT_START */\n' + '\n'.join(faces) + '\n/* FONT_END */'
    new, n = re.subn(r'/\* FONT_START \*/[\s\S]*?/\* FONT_END \*/', lambda m: block, html)
    assert n == 1, 'FONT block missing'
    path.write_text(new, encoding='utf-8')
    print(len(text), 'glyphs requested;', len(new.encode()), 'bytes total')

if __name__ == '__main__':
    main()
