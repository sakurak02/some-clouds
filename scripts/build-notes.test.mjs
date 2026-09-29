import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  parseDevelopmentArticle,
  parseFragments,
  parseTimeline,
  renderDevelopmentArticlePage,
  renderDevelopmentIndexPage,
  renderFragmentsPage,
  renderSitemap,
  renderTimelinePage,
} from "./build-notes.mjs";

test("Timeline Markdown in its year and month folders keeps the existing format", () => {
  const entry = parseTimeline(`---
date: 2026-09-29
---

## NEWS

- ニュース

## PERSONAL

- 記録
`, "t20260929.md", "2026", "09");
  assert.equal(entry.displayDate, "09.29");
  assert.match(entry.news, /ニュース/);
  assert.match(entry.personal, /記録/);
});

test("Fragments Markdown in its year and month folders keeps the existing format", () => {
  const entry = parseFragments(`---
date: 2026-09-29
---

短い文章。
`, "f20260929.md", "2026", "09");
  assert.equal(entry.displayDate, "09.29");
  assert.equal(entry.body, "短い文章。");
});

test("the existing Fragments Obsidian image renders from its month images folder", () => {
  const source = readFileSync(
    new URL("../notes/fragments/2026/09/f20260929.md", import.meta.url),
    "utf8",
  );
  const entry = parseFragments(source, "f20260929.md", "2026", "09");
  const page = renderFragmentsPage([entry]);
  assert.doesNotMatch(page, /!\[\[くもも脚あり\.png\|153\]\]/);
  assert.match(page, /src="\.\/2026\/09\/images\/くもも脚あり\.png"/);
  assert.match(page, /width="153"/);
  assert.match(page, /\.content-image img\{display:block;max-width:100%;height:auto\}/);
});

test("Timeline uses the same Obsidian image handling", () => {
  const entry = parseTimeline(`---
date: 2026-09-29
---

## PERSONAL

![[sample image.png|400]]
`, "t20260929.md", "2026", "09");
  const page = renderTimelinePage([entry]);
  assert.match(page, /src="\.\/timeline\/2026\/09\/images\/sample image\.png"/);
  assert.match(page, /width="400"/);
});

const articleSource = `---
date: 2026-10-15
title: Xcodeを開いた
---

# Xcodeを開いた

本文を書きます。

## なぜ作り始めたのか

![画面](./images/screen.png)

![[sample.png]]
`;

test("Development article metadata matches its filename and renders month-level images", () => {
  const article = parseDevelopmentArticle(articleSource, "d20261015.md", "2026", "10");
  assert.equal(article.title, "Xcodeを開いた");
  assert.equal(article.displayDate, "2026.10.15");
  assert.doesNotMatch(article.body, /^#\s/);

  const page = renderDevelopmentArticlePage(article);
  assert.match(page, /<h1>Xcodeを開いた<\/h1>/);
  assert.match(page, /<h2>なぜ作り始めたのか<\/h2>/);
  assert.match(page, /<img src="\.\/10\/images\/screen\.png" alt="画面" loading="lazy">/);
  assert.match(page, /<img src="\.\/10\/images\/sample\.png" alt="sample\.png" loading="lazy">/);
  assert.doesNotMatch(page, /!\[\[sample\.png\]\]/);
});

test("Development index and sitemap use article metadata", () => {
  const older = parseDevelopmentArticle(
    articleSource.replaceAll("2026-10-15", "2026-10-14").replace("Xcodeを開いた", "準備した"),
    "d20261014.md",
    "2026",
    "10",
  );
  const newer = parseDevelopmentArticle(articleSource, "d20261015.md", "2026", "10");
  const nextMonth = parseDevelopmentArticle(
    articleSource.replaceAll("2026-10-15", "2026-11-02").replaceAll("Xcodeを開いた", "11月の記事"),
    "d20261102.md",
    "2026",
    "11",
  );
  const entries = [older, nextMonth, newer];
  const indexPage = renderDevelopmentIndexPage(entries);
  assert.ok(indexPage.indexOf("Xcodeを開いた") < indexPage.indexOf("準備した"));
  assert.ok(indexPage.indexOf("<summary>11</summary>") < indexPage.indexOf("<summary>10</summary>"));
  assert.match(indexPage, /<h1>Development<\/h1>/);
  assert.match(indexPage, /つくっている途中の記録。/);
  assert.match(indexPage, /src="\.\.\/assets\/kuumo\/kumomo-development\.png"/);
  assert.match(indexPage, /<a class="back" href="\.\.\/">← Home<\/a>/);
  assert.match(indexPage, /<details class="year">\s*<summary>2026<\/summary>/);
  assert.match(indexPage, /<details class="month">\s*<summary>10<\/summary>/);
  assert.match(indexPage, /href="\.\/2026\/d20261015\.html"/);

  const sitemap = renderSitemap(entries);
  assert.match(sitemap, /development\/2026\/d20261015\.html/);
});

test("Development rejects mismatched article filenames", () => {
  assert.throws(
    () => parseDevelopmentArticle(articleSource, "d20261016.md", "2026", "10"),
    /filename and date do not match/,
  );
});

test("Entries reject a month folder that does not match their date", () => {
  assert.throws(
    () => parseDevelopmentArticle(articleSource, "d20261015.md", "2026", "11"),
    /move this article into the 10 month folder/,
  );
});
