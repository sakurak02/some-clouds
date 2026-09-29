obi# Notes 更新手順

このObsidian保管庫では、Timeline、Fragments、DevelopmentのMarkdownから公開ページを自動生成します。

- Timeline: 世界の出来事と、その日の自分を並べる記録
- Fragments: その日の短い思いつきや言葉の断片

HTML、年一覧、日付一覧は手動で編集しません。

## Timelineを追加する

1. この保管庫のObsidianでMarkdownを作成する
2. ファイル名を `tYYYYMMDD.md` にする
3. `notes/timeline/YYYY/MM/` に直接保存する
4. commit & pushする

例: `notes/timeline/2026/09/t20260920.md`

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
3. `notes/fragments/YYYY/MM/` に直接保存する
4. commit & pushする

例: `notes/fragments/2026/09/f20260920.md`

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

1. テンプレートをコピーし、`development/YYYY/MM/dYYYYMMDD.md` として保存する
2. ChatGPTで編集した完成記事を本文へ貼り付ける
3. 必要な画像は同じ月フォルダの `images/` に置く
4. commit & pushする

例: `development/2026/10/d20261015.md`

```markdown
---
date: 2026-10-15
title: Xcodeを開いた
---

# Xcodeを開いた

本文を書きます。
```

記事ごとの見出し構成は自由です。画像はMarkdownから次のように参照できます。

```markdown
![画像の説明](./images/screen.png)
```

画像ファイルは `development/2026/10/images/d20261015-01.webp` のように管理できます。画像がない記事では `images/` は不要です。

テンプレートは `templates/development.md` にあります。Developmentの一覧と記事ページは日付の新しい順で自動生成されます。日々の生メモはこのリポジトリへ置かず、公開用の完成Markdownだけを保存します。

## 年・月が変わったとき

年フォルダの中に2桁の月フォルダを追加します。

```text
notes/timeline/2027/01/
notes/fragments/2027/01/
development/2027/01/
```

生成スクリプトが年・月フォルダを読み取り、front matterの `date` を基準に自動的に新しい順で並べます。

## 自動生成

mainブランチへpushすると、GitHub Actionsが次のコマンドを実行します。

```text
npm run build
```

このコマンドは次のファイルを生成します。

- `notes/index.html`: Timeline
- `notes/fragments/index.html`: Fragments
- `development/index.html`: Development一覧
- `development/YYYY/dYYYYMMDD.html`: Development記事
- `sitemap.xml`: 公開ページ一覧

ローカルで確認したい場合も、同じコマンドを実行してください。

Timeline / Fragments / Developmentではファイル名・front matterの日付・年フォルダ・月フォルダが一致しない場合、誤った日付で公開されないようビルドがエラーになります。Developmentの保存場所は月フォルダですが、公開URLは従来どおり `development/YYYY/dYYYYMMDD.html` です。
