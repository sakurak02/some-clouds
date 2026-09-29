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

## なぜ作り始めたのか

![画面](./images/screen.png)
`;

test("Development article metadata matches its filename and renders year-level images", () => {
  const article = parseDevelopmentArticle(articleSource, "d20261015.md", "2026");
  assert.equal(article.title, "Xcodeを開いた");
  assert.equal(article.displayDate, "2026.10.15");
  assert.doesNotMatch(article.body, /^#\s/);

  const page = renderDevelopmentArticlePage(article);
  assert.match(page, /<h1>Xcodeを開いた<\/h1>/);
  assert.match(page, /<h2>なぜ作り始めたのか<\/h2>/);
  assert.match(page, /src="\.\/images\/screen\.png"/);
});

test("Development index and sitemap use article metadata", () => {
  const older = parseDevelopmentArticle(
    articleSource.replaceAll("2026-10-15", "2026-10-14").replace("Xcodeを開いた", "準備した"),
    "d20261014.md",
    "2026",
  );
  const newer = parseDevelopmentArticle(articleSource, "d20261015.md", "2026");
  const entries = [newer, older];
  const indexPage = renderDevelopmentIndexPage(entries);
  assert.ok(indexPage.indexOf("Xcodeを開いた") < indexPage.indexOf("準備した"));
  assert.match(indexPage, /href="\.\/2026\/d20261015\.html"/);

  const sitemap = renderSitemap(entries);
  assert.match(sitemap, /development\/2026\/d20261015\.html/);
});

test("Development rejects mismatched article filenames", () => {
  assert.throws(
    () => parseDevelopmentArticle(articleSource, "d20261016.md", "2026"),
    /filename and date do not match/,
  );
});
