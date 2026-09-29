import assert from "node:assert/strict";
import test from "node:test";

import {
  parseDevelopmentArticle,
  parseFragments,
  parseTimeline,
  renderDevelopmentArticlePage,
  renderDevelopmentIndexPage,
  renderSitemap,
} from "./build-notes.mjs";

test("Timeline Markdown in its year folder keeps the existing format", () => {
  const entry = parseTimeline(`---
date: 2026-09-29
---

## NEWS

- ニュース

## PERSONAL

- 記録
`, "t20260929.md", "2026");
  assert.equal(entry.displayDate, "09.29");
  assert.match(entry.news, /ニュース/);
  assert.match(entry.personal, /記録/);
});

test("Fragments Markdown in its year folder keeps the existing format", () => {
  const entry = parseFragments(`---
date: 2026-09-29
---

短い文章。
`, "f20260929.md", "2026");
  assert.equal(entry.displayDate, "09.29");
  assert.equal(entry.body, "短い文章。");
});

const articleSource = `---
date: 2026-10-15
title: Xcodeを開いた
---

# Xcodeを開いた

本文を書きます。

## その日やったこと

![画面](./images/screen.png)
`;

test("Development article metadata matches its folder and renders local images", () => {
  const article = parseDevelopmentArticle(articleSource, "index.md", "20261015", "2026");
  assert.equal(article.title, "Xcodeを開いた");
  assert.equal(article.displayDate, "2026.10.15");
  assert.doesNotMatch(article.body, /^#\s/);

  const page = renderDevelopmentArticlePage(article);
  assert.match(page, /<h1>Xcodeを開いた<\/h1>/);
  assert.match(page, /<h2>その日やったこと<\/h2>/);
  assert.match(page, /src="\.\/images\/screen\.png"/);
});

test("Development index and sitemap use article metadata", () => {
  const older = parseDevelopmentArticle(
    articleSource.replaceAll("2026-10-15", "2026-10-14").replace("Xcodeを開いた", "準備した"),
    "index.md",
    "20261014",
    "2026",
  );
  const newer = parseDevelopmentArticle(articleSource, "index.md", "20261015", "2026");
  const entries = [newer, older];
  const indexPage = renderDevelopmentIndexPage(entries);
  assert.ok(indexPage.indexOf("Xcodeを開いた") < indexPage.indexOf("準備した"));
  assert.match(indexPage, /href="\.\/2026\/20261015\/"/);

  const sitemap = renderSitemap(entries);
  assert.match(sitemap, /development\/2026\/20261015\//);
});

test("Development rejects mismatched article folders", () => {
  assert.throws(
    () => parseDevelopmentArticle(articleSource, "index.md", "20261016", "2026"),
    /folder name and date do not match/,
  );
});
