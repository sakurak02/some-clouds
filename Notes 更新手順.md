# Notes 更新手順

Notes は、Timeline と Fragments の2種類のMarkdownから自動生成されます。

- Timeline: 世界の出来事と、その日の自分を並べる記録
- Fragments: その日の短い思いつきや言葉の断片

HTML、年一覧、日付一覧は手動で編集しません。

## Timelineを追加する

1. ObsidianでMarkdownを書く
2. ファイル名を `tYYYYMMDD.md` にする
3. `notes/timeline/YYYY/` にコピーする
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

1. ObsidianでMarkdownを書く
2. ファイル名を `fYYYYMMDD.md` にする
3. `notes/fragments/YYYY/` にコピーする
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

## 年が変わったとき

年フォルダを追加します。

```text
notes/timeline/2027/
notes/fragments/2027/
```

生成スクリプトが年フォルダと日付を自動的に新しい順で並べます。

## 自動生成

mainブランチへpushすると、GitHub Actionsが次のコマンドを実行します。

```text
npm run build:notes
```

このコマンドは次のファイルを生成します。

- `notes/index.html`: Timeline
- `notes/fragments/index.html`: Fragments
- `sitemap.xml`: 公開ページ一覧

ローカルで確認したい場合も、同じコマンドを実行してください。

ファイル名、日付見出し、年フォルダが一致しない場合は、誤った日付で公開されないようビルドがエラーになります。
