# 埋め込みフォント

`index.html` に埋め込んでいるフォントは、Zen Maru Gothic の改変版です。

- 元のフォント：Zen Maru Gothic Version 1.001（Medium・Bold・Black）
- 上流：https://github.com/googlefonts/zen-marugothic
- 著作権表記（上流の `OFL.txt`）：Copyright 2021 The Zen Maru Gothic Project Authors (https://github.com/googlefonts/zen-marugothic)
- フォント内の著作権表記（name ID 0）：Copyright 2021 The Zen Maru Gothic Authors (https://github.com/googlefonts/zen-marugothic)
- ライセンス：SIL Open Font License, Version 1.1（全文は `OFL.txt`。上流の `OFL.txt` と同一）
- Reserved Font Name：上流の `OFL.txt` に宣言はありません
- 改変内容：ゲームで使う文字だけを残したサブセットにし、WOFF2形式に変換しています。字形は変えていません
- 取得元：npm の `@expo-google-fonts/zen-maru-gothic@0.4.2`（同梱の `LICENSE_FONT` が上流の `OFL.txt` と同一であることを確認済み）

サブセットには、元のフォントの著作権・ライセンス・作者などの情報（name テーブル）を残しています。`index.html` には、フォントの直前に著作権表記とOFL全文をコメントとして入れています。

作り直しは `python3 scripts/build-font.py`、同梱情報の確認は `python3 scripts/build-font.py --check` です。
