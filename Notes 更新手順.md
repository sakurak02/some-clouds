もちろん。Obsidianにそのまま貼れる形でまとめます。

````
# Notes 更新手順

## 1. 記事を書く場所

Notesの記事は、Obsidianで以下のフォルダに作成します。

```text
some-clouds/
└─ notes/
   └─ entries/
````

---

## 2. ファイル名

ファイル名は以下の形式にします。

```
YYYYMMDD-001.md
```

例：

```
20260902-001.md
```

同じ日に2本以上書く場合は、

```
20260902-002.md
20260902-003.md
```

のように番号を増やします。

---

## 3. 記事テンプレート

テンプレートは、

```
templates/note-template.md
```

にあります。

基本形は以下です。

```
---
date:
tag:
title:
excerpt:
---
```

---

## 4. front matter の書き方

例：

```
---
date: 2026-09-02
tag: 雑記
title: 今日は秋晴れだった
excerpt: 朝、窓を開けたら空が高かった。まだ暑いけれど、少しだけ秋の匂いがした。
---

朝、窓を開けたら空が高かった。

まだ暑いけれど、少しだけ秋の匂いがした。

こういう日は、何か特別なことがなくても、
それだけで一日を覚えておきたくなる。
```

---

## 5. タグ

タグは以下の4種類だけを使います。

```
雑記
学習
メモ
考えごと
```

1記事につき1タグです。

Notes一覧では、

```
すべて / 雑記 / 学習 / メモ / 考えごと
```

の順で表示されます。

---

## 6. excerpt について

`excerpt` は、Notes一覧の雲の中に表示される文章です。

本文から自動では作られません。

毎回、

```
この記事では、この部分を見せたい
```

と思う文章を自分で書きます。

例：

```
excerpt: 朝、窓を開けたら空が高かった。まだ暑いけれど、少しだけ秋の匂いがした。
```

長すぎない文章にしておくと、雲の中が見やすくなります。

目安は1〜2文程度。

---

# 公開手順

## 7. Obsidianで記事を書く

`notes/entries/` にMarkdownファイルを作り、記事を書きます。

保存できたら、Obsidian側の作業は終了です。

---

## 8. GitHub Desktopを開く

GitHub Desktopで、

```
some-clouds
```

リポジトリを開きます。

変更ファイルとして、新しく作ったMarkdownが表示されます。

---

## 9. Commit

左下のSummaryに、内容がわかる簡単なメッセージを書きます。

例：

```
Add Notes 20260902
```

または、

```
Add autumn note
```

そのあと、

```
Commit to main
```

を押します。

---

## 10. Push

Commit後、

```
Push origin
```

を押します。

ここまでで自分の作業は終了です。

---

# Push後に自動で行われること

GitHub Actionsが自動で以下を実行します。

```
Markdown
↓
個別記事ページ生成
↓
Notes一覧の雲カード生成
↓
タグ反映
↓
Calendar反映
↓
GitHub Pages更新
```

ローカルで、

```
npm run build:notes
```

を実行する必要はありません。

---

# Notesで自動生成されるもの

## Notes一覧

```
https://sakurak02.github.io/some-clouds/notes/
```

一覧には、

- 日付
- タグ
- タイトル
- excerpt
- tap to read →

が雲の中に表示されます。

雲全体をタップすると個別記事が開きます。

---

## 個別記事

Markdown

```
notes/entries/20260902-001.md
```

から、

```
notes/posts/20260902-001/
```

の個別記事ページが自動生成されます。

---

## Calendar

Markdownの `date` をもとに自動生成されます。

記事がある日に印がつきます。

その日をタップすると記事が開きます。

同じ日に複数記事がある場合は、その日の記事一覧が表示されます。

---

# 日常の更新はこれだけ

```
1. Obsidianで記事を書く
2. 保存
3. GitHub DesktopでCommit
4. Push origin
5. 自動公開
```

HTML、Calendar、Notes一覧を手動で編集する必要はありません。

---

# Notes フォルダ構成

```
some-clouds/
├─ index.html
├─ about/
│  └─ index.html
├─ notes/
│  ├─ index.html
│  ├─ entries/
│  │  ├─ 20260902-001.md
│  │  ├─ 20260903-001.md
│  │  └─ ...
│  └─ posts/
│     ├─ 20260902-001/
│     │  └─ index.html
│     └─ ...
├─ scripts/
│  └─ build-notes.mjs
├─ templates/
│  └─ note-template.md
├─ .github/
│  └─ workflows/
│     └─ deploy-pages.yml
├─ .gitignore
└─ package.json
```

---

# 注意

- `notes/entries/` のMarkdownが原稿です
- `notes/posts/` のHTMLは自動生成です
- `notes/index.html` も自動生成です
- `.obsidian/` はGitHubには保存しません
- タグは勝手に増やさず、4種類から選びます
- `excerpt` は毎回手動で決めます
- 公開後に修正したい場合は、Markdownを直して再度Commit & Pushします