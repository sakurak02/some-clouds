import test from "node:test";
import assert from "node:assert/strict";

import {
  parseDevelopmentArticle,
  parseTimeline,
  renderDevelopmentArticlePage,
  renderDevelopmentJournalPage,
  renderSitemap,
  renderTimelinePage,
} from "./build-development.mjs";

test("Timeline accepts one-column development notes", () => {
  const entry = parseTimeline(`---
date: 2026-10-08
---

Xcodeで画面遷移を試した。
`, "t20261008.md", "2026", "10");

  assert.equal(entry.date, "2026-10-08");
  assert.equal(entry.body, "Xcodeで画面遷移を試した。");
  assert.deepEqual(entry.categories, []);
  const page = renderTimelinePage([entry]);
  assert.match(page, /<h1>Development<\/h1>/);
  assert.match(page, /<p class="section-name">Timeline<\/p>/);
  assert.doesNotMatch(page, /NEWS|PERSONAL/);
});

test("Timeline accepts APP and BOOK categories and renders filter controls", () => {
  const appEntry = parseTimeline(`---
date: 2026-10-11
categories: [APP]
---

アプリを作った。
`, "t20261011.md", "2026", "10");
  const bothEntry = parseTimeline(`---
date: 2026-10-12
categories: [APP, BOOK]
---

アプリと本を作った。
`, "t20261012.md", "2026", "10");

  assert.deepEqual(appEntry.categories, ["APP"]);
  assert.deepEqual(bothEntry.categories, ["APP", "BOOK"]);
  const page = renderTimelinePage([appEntry, bothEntry]);
  assert.match(page, /data-category-filter="all"[^>]*aria-pressed="true">すべて/);
  assert.match(page, /data-category-filter="APP"/);
  assert.match(page, /data-category-filter="BOOK"/);
  assert.match(page, /data-categories="APP BOOK"/);
  assert.match(page, /<span class="day-categories">APP · BOOK<\/span>/);
  assert.match(page, /function filterTimeline\(category\)/);
});

test("Timeline rejects unsupported categories", () => {
  assert.throws(
    () => parseTimeline("---\ndate: 2026-10-13\ncategories: [APP, OTHER]\n---\n\n記録", "t20261013.md", "2026", "10"),
    /categories must contain only APP and\/or BOOK/,
  );
});

test("Timeline renders Obsidian images from the same month images folder", () => {
  const entry = parseTimeline(`---
date: 2026-10-08
---

![[Xcode 画面.png|320]]
`, "t20261008.md", "2026", "10");
  const page = renderTimelinePage([entry]);
  assert.match(page, /src="\.\/timeline\/2026\/10\/images\/Xcode 画面\.png"/);
  assert.match(page, /width="320"/);
});

test("Timeline groups entries by descending year, month, and day", () => {
  const entries = [
    parseTimeline("---\ndate: 2026-09-30\n---\n\n9月30日", "t20260930.md", "2026", "09"),
    parseTimeline("---\ndate: 2026-10-01\n---\n\n10月1日", "t20261001.md", "2026", "10"),
    parseTimeline("---\ndate: 2026-10-02\n---\n\n10月2日", "t20261002.md", "2026", "10"),
  ];
  const page = renderTimelinePage(entries);
  assert.ok(page.indexOf("10月") < page.indexOf("9月"));
  assert.ok(page.indexOf("10.02") < page.indexOf("10.01"));
});

test("Development keeps Kokumo and links to the development journal", () => {
  const page = renderTimelinePage([]);
  assert.match(page, /src="\.\.\/assets\/kuumo\/Timeline\.png"/);
  assert.match(page, /<p class="timeline-kuumo-name">こくも<\/p>/);
  assert.doesNotMatch(page, /くもも/);
  assert.match(page, /some clouds からちぎれて生まれた、<br>クーモの仲間。/);
  assert.match(page, /href="\.\/journal\/"/);
});

const articleSource = `---
date: 2026-10-15
title: Xcodeを開いた
---

# Xcodeを開いた

本文です。

![[初日の画面.png|400]]
`;

test("Development journal metadata and month-level images render", () => {
  const article = parseDevelopmentArticle(articleSource, "d20261015.md", "2026", "10");
  assert.equal(article.title, "Xcodeを開いた");
  const page = renderDevelopmentArticlePage(article);
  assert.match(page, /src="\.\/10\/images\/初日の画面\.png"/);
  assert.match(page, /width="400"/);
  assert.match(page, /← 開発日記/);
});

test("Development journal uses the former Fragments atmosphere and newest-first archive", () => {
  const older = parseDevelopmentArticle(
    articleSource.replaceAll("2026-10-15", "2026-10-01").replaceAll("Xcodeを開いた", "準備した"),
    "d20261001.md",
    "2026",
    "10",
  );
  const newer = parseDevelopmentArticle(articleSource, "d20261015.md", "2026", "10");
  const page = renderDevelopmentJournalPage([older, newer]);
  assert.ok(page.indexOf("Xcodeを開いた") < page.indexOf("準備した"));
  assert.match(page, /<h1>開発日記<\/h1>/);
  assert.match(page, /アプリができるまでの記録。/);
  assert.match(page, /src="\.\.\/\.\.\/assets\/kuumo\/Fragments\.png"/);
  assert.match(page, /<details class="year">\s*<summary>2026<\/summary>/);
  assert.match(page, /href="\.\/2026\/d20261015\.html"/);

  const sitemap = renderSitemap([newer]);
  assert.match(sitemap, /some-clouds\/books\//);
  assert.match(sitemap, /development\/journal\/2026\/d20261015\.html/);
  assert.doesNotMatch(sitemap, /\/notes\//);
});

test("Development journal rejects mismatched filenames and month folders", () => {
  assert.throws(
    () => parseDevelopmentArticle(articleSource, "d20261016.md", "2026", "10"),
    /filename and date do not match/,
  );
  assert.throws(
    () => parseDevelopmentArticle(articleSource, "d20261015.md", "2026", "11"),
    /move this article into the 10 month folder/,
  );
});
