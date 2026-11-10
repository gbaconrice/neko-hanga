#!/usr/bin/env python3
"""画面で使う文字だけを Zen Maru Gothic から切り出し、index.html に埋め込む。

    pip install fonttools brotli
    python3 scripts/build-font.py

    python3 scripts/build-font.py --check   # 埋め込み済みの著作権・ライセンス情報を確かめる

文言や作品名(art/catalog.json)を変えたら実行し直す。scripts/embed-game.cjs のあとに実行すること。

フォントは Zen Maru Gothic (SIL Open Font License 1.1、Reserved Font Name の宣言なし)。
サブセットは「改変版」の再配布にあたるので、次の3つを必ず一緒に配る:
  1. フォント内の著作権・ライセンス情報(name テーブル)。サブセット時に消さない
  2. fonts/OFL.txt (上流の著作権表記とOFL全文)
  3. index.html のフォント直前のコメント(2と同じ文)。HTMLだけを配る場合のため
元ファイルは npm の @expo-google-fonts/zen-maru-gothic から取得する。
"""
import base64, io, json, pathlib, re, subprocess, sys, tarfile
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

LICENSE = ROOT / 'fonts' / 'OFL.txt'
# 残す name ID: 0=著作権 1,2,16,17=書体名 3=固有ID 4=完全名 5=版 6=PostScript名 8=製造者 9=作者 11,12=URL 13=ライセンス 14=ライセンスURL
KEEP_NAMES = [0, 1, 2, 3, 4, 5, 6, 8, 9, 11, 12, 13, 14, 16, 17]
REQUIRED_NAMES = {0: 'Copyright 2021 The Zen Maru Gothic Authors', 13: 'SIL Open Font License, Version 1.1', 14: 'https://scripts.sil.org/OFL'}

def notice():
    text = LICENSE.read_text(encoding='utf-8').replace('\r\n', '\n').strip('\n')
    assert '*/' not in text
    return ('/* 埋め込みフォント: Zen Maru Gothic 1.001 の改変版(このゲームで使う文字だけのサブセット、WOFF2)。\n'
            '   以下は上流の著作権表記とライセンス全文。Reserved Font Name の宣言はない。\n\n' + text + '\n*/')

def names(font):
    return {n.nameID: n.toUnicode() for n in font['name'].names if n.platformID == 3}

def check():
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    block = re.search(r'/\* FONT_START \*/([\s\S]*?)/\* FONT_END \*/', html).group(1)
    assert notice() in block, 'index.html に著作権表記とOFL全文がない'
    assert 'SIL OPEN FONT LICENSE Version 1.1' in block and 'Copyright 2021 The Zen Maru Gothic Project Authors' in block
    upstream = CACHE / 'package' / 'LICENSE_FONT'
    if upstream.exists():
        assert upstream.read_text(encoding='utf-8').replace('\r\n', '\n') == LICENSE.read_text(encoding='utf-8').replace('\r\n', '\n'), 'fonts/OFL.txt が上流と違う'
    faces = re.findall(r"font-weight:([\d ]+);[^}]*?base64,([A-Za-z0-9+/=]+)\)", block)
    assert len(faces) == len(WEIGHTS), 'フォントの数が合わない'
    for weight, data in faces:
        got = names(TTFont(io.BytesIO(base64.b64decode(data))))
        for key, value in REQUIRED_NAMES.items():
            assert value in got.get(key, ''), 'font-weight %s の name ID %d がない' % (weight, key)
        assert all(k in got for k in (1, 2, 4, 5, 6, 9)), 'font-weight %s の書体情報が欠けている' % weight
        print('font-weight', weight, '|', got[4], '|', got[5], '|', got[0])
    print('OK: 著作権表記・OFL全文・フォント内のライセンス情報がそろっています')

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
        opts.flavor = 'woff2'; opts.layout_features = ['kern', 'palt', 'liga']; opts.name_IDs = KEEP_NAMES; opts.name_languages = ['*']; opts.name_legacy = True; opts.notdef_outline = True
        font = TTFont(src); sub = subset.Subsetter(opts); sub.populate(text=text); sub.subset(font)
        for key, value in REQUIRED_NAMES.items():
            assert value in names(font).get(key, ''), 'name ID %d が消えた' % key
        out = io.BytesIO(); font.flavor = 'woff2'; font.save(out)
        faces.append("@font-face{font-family:'NekoMaru';font-weight:%s;font-display:swap;src:url(data:font/woff2;base64,%s) format('woff2')}"
                     % (weight, base64.b64encode(out.getvalue()).decode()))
        print(src.name, len(out.getvalue()), 'bytes')
    block = '/* FONT_START */\n' + notice() + '\n' + '\n'.join(faces) + '\n/* FONT_END */'
    new, n = re.subn(r'/\* FONT_START \*/[\s\S]*?/\* FONT_END \*/', lambda m: block, html)
    assert n == 1, 'FONT block missing'
    path.write_text(new, encoding='utf-8')
    print(len(text), 'glyphs requested;', len(new.encode()), 'bytes total')

if __name__ == '__main__':
    check() if '--check' in sys.argv else main()
