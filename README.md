# ねこ版画

三色の版を合わせて猫の絵を刷る、GRAVITY向けのパズルゲームです。

細かい規則と数値は [docs/spec.md](docs/spec.md)（現行仕様）にあります。この README は概要だけです。

## 遊び方

- つまみを回すか、左右をタップして版を動かします。四すみの＋印がすべて重なったら「刷る」を押します。
- 版は三色です。枚数が進むと、回転・連動・拡大縮小のつまみが加わります。
- ライフは肉球3つ。ずれたまま刷る・時間切れで1つ減ります。5枚続けて刷ると1つ戻ります。
- 早く刷るほど得点が高く、残り時間の一部が次の紙に持ち越されます。
- 刷り上がりには、絵を見た猫の気持ちの判子「ごろごろ・うっとり・めろめろ」が付きます。
- 5枚続けて刷るとフィーバー（次の3枚は得点2倍）。肉球がなくなると、1回だけラストチャンスがあります。
- おたすけ（1か所を自動で合わせる）は最初1つ。5枚刷るごとに1つ増え、上限は3つです。
- 10枚刷るごとに記念の300点が入ります。
- ときどき★特色（色違い）の絵が出ます。★かどうかは刷るまで分かりません。
- 結果画面は絵本です。その回に刷った絵を1枚1ページでめくれます。

保存データはありません。開くたびに新しいゲームです。

## 操作と音

- つまみ領域だけでタッチの既定動作を止め、連打による拡大を防いでいます。
- 画面や紙が替わった直後の0.4秒は、主なボタンを受け付けません（連打の誤爆防止）。
- 絵本は左右ボタン・スワイプ・矢印キーでめくれます。絵をタップすると猫の動きをもう一度見られます（鳴きません）。
- 右上の「音」ボタンで音を切り替えます。プレイ中は合成のオルゴールが鳴ります。
- 鳴き声は録音1種類を、高さ3通りで鳴らします。出典と規約は [sounds/README.md](sounds/README.md)。
- iPhone/iPadでは最初の操作で音を有効にします。Web AudioとHTMLAudioで補い合います。

## 構成

`index.html` 1つに、絵・猫の連続コマ・完成背景・音声・フォントをすべて埋め込んでいます。素材サーバーへの接続は要りません。

| 場所 | 中身 |
|---|---|
| `index.html` | ゲーム本体（約12MB） |
| `gravity-entry.html` | GRAVITYへ小さく渡すための入口 |
| `art/catalog.json` | 作品名・ファイル名・猫種・姿勢（153場面） |
| `art/*.png` | 三色＋紙色の原画 |
| `art/finish/*.webp` | 完成時に加わる背景 |
| `art/animation/` | 猫の連続コマ（3列×2行）と制作素材 |
| `scripts/` | 素材の取り込み・埋め込み・フォント作成 |
| `fonts/` | 丸ゴシック（Zen Maru Gothic、SIL OFL 1.1）の情報 |
| `sounds/` | 鳴き声と出典 |
| `tests/` | ブラウザでの自動テスト |
| `docs/` | 仕様・経緯・完成条件・相棒の受け入れ |

素材の追加手順は [art/README.md](art/README.md)、連続コマの作り直しは [art/animation/README.md](art/animation/README.md) にあります。

文言や作品名を変えたら、素材の埋め込み（`node scripts/build-art.cjs --embed`）のあとに `python3 scripts/build-font.py` を実行します（`pip install fonttools brotli` が必要）。入っていない文字は端末の書体で出ます。

## テストの動かし方

```sh
npm install --no-save playwright sharp
mkdir -p /workspace/scratch          # 一部のテストがここに画面写真を書く
python3 -m http.server 4173 &        # リポジトリの直下で
python3 scripts/build-font.py --check
node tests/animation.cjs
node tests/game.cjs
node tests/touch.cjs
node tests/finish.cjs
node tests/polish.cjs
node tests/fun.cjs
node tests/hook.cjs
node tests/joy.cjs
node tests/qa.cjs
node tests/ux.cjs
node tests/timing.cjs
```

Chromiumは `CHROMIUM_PATH`、`/usr/bin/chromium`、Playwright付属のものの順に使います。GitHub Actions（`.github/workflows/test.yml`）でも、プルリクエストと main への push ごとに同じものを実行します。

`?debug=1` を付けると `window.__pz` に状態が出ます。テストはこれを使います。

## GRAVITY連携

- AgentSDK 1.0.2。プロフィールの取得は4秒で打ち切り、失敗しても遊べます。
- ランキングは1つだけです。終了時に `window.parent.postMessage({ type: 'gameOver', score }, '*')` で得点を送ります。
- 埋め込み時の上部余白は暫定値です（高さ812px以上で98px、それ未満で74px）。`?top=数値` で変えられます。単体で開くと0pxです。
- `gravity-entry.html` は約1,700文字の入口です。GitHub Pagesから `index.html` を取得し、iframeを使わずに展開します。
- 題字を5回続けてタップするか `?check=1` で、動作確認の画面が出ます。

GRAVITY上での動作、ランキングの受理、iPhone実機の音は未確認です。状況は [docs/done.md](docs/done.md) にあります。
