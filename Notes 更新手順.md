# Notes 更新手順

このObsidian保管庫では、Timeline、Fragments、DevelopmentのMarkdownから公開ページを自動生成します。

- Timeline: 世界の出来事と、その日の自分を並べる記録
- Fragments: その日の短い思いつきや言葉の断片

HTML、年一覧、日付一覧は手動で編集しません。

## Timelineを追加する

1. この保管庫のObsidianでMarkdownを作成する
2. ファイル名を `tYYYYMMDD.md` にする
3. `notes/timeline/YYYY/` に直接保存する
4. commit & pushする

例: `notes/timeline/2026/t20260920.md`

```markdown
---
date: 2026-09-20
---

## NEWS

- 気になったニュース

## PERSONAL

- その日の学習
```

NEWSまたはPERSONALの片方だけでも構いません。使わない見出しは削除してください。

テンプレートは `templates/timeline-template.md` にあります。

## Fragmentsを追加する

1. この保管庫のObsidianでMarkdownを作成する
2. ファイル名を `fYYYYMMDD.md` にする
3. `notes/fragments/YYYY/` に直接保存する
4. commit & pushする

例: `notes/fragments/2026/f20260920.md`

```markdown
---
date: 2026-09-20
---

短い文章を書く。

---

次の短い文章を書く。
```

本文中の `---` が、表示時に短い区切り線になります。

テンプレートは `templates/fragment-template.md` にあります。

## Development記事を追加する

1. `development/YYYY/YYYYMMDD/` フォルダを作る
2. テンプレートをコピーし、同フォルダへ `index.md` として保存する
3. 必要な画像は同フォルダの `images/` に置く
4. commit & pushする

例: `development/2026/20261015/index.md`

```markdown
---
date: 2026-10-15
title: Xcodeを開いた
---

# Xcodeを開いた

本文を書きます。
```

画像はMarkdownから次のように参照できます。

```markdown
![画像の説明](./images/screen.png)
```

テンプレートは `templates/development.md` にあります。Developmentの一覧と記事ページは日付の新しい順で自動生成されます。

## 年が変わったとき

年フォルダを追加します。

```text
notes/timeline/2027/
notes/fragments/2027/
development/2027/
```

生成スクリプトが年フォルダと日付を自動的に新しい順で並べます。

## 自動生成

mainブランチへpushすると、GitHub Actionsが次のコマンドを実行します。

```text
npm run build
```

このコマンドは次のファイルを生成します。

- `notes/index.html`: Timeline
- `notes/fragments/index.html`: Fragments
- `development/index.html`: Development一覧
- `development/YYYY/YYYYMMDD/index.html`: Development記事
- `sitemap.xml`: 公開ページ一覧

ローカルで確認したい場合も、同じコマンドを実行してください。

Timeline / Fragmentsではファイル名・日付・年フォルダ、Developmentでは日付フォルダ・front matterの日付・年フォルダが一致しない場合、誤った日付で公開されないようビルドがエラーになります。
