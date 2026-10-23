import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  parseDevelopmentArticle,
  parseTimeline,
  renderDevelopmentArticlePage,
  renderDevelopmentJournalPage,
  renderMarkdown,
  renderSitemap,
  renderTimelinePage,
} from "./build-development.mjs";

const renderMarkdownWithHeadings = (source) => renderMarkdown(source, "", { headings: true });

test("Timeline renders Markdown heading levels beneath the page title", () => {
  assert.equal(renderMarkdownWithHeadings("# 大見出し\n## **中見出し**\n### [小見出し](https://example.com)\n#### 四段目\n##### 五段目\n###### 六段目"),
    '<h2>大見出し</h2>\n<h3><strong>中見出し</strong></h3>\n<h4><a href="https://example.com">小見出し</a></h4>\n<h5>四段目</h5>\n<h6>五段目</h6>\n<h6>六段目</h6>');
  assert.equal(renderMarkdownWithHeadings("段落\n# 見出し\n本文\n続き\n\n- **項目**\n- 次の項目\n\n最後の段落"),
    '<p>段落</p>\n<h2>見出し</h2>\n<p>本文<br>続き</p>\n<ul><li><strong>項目</strong></li><li>次の項目</li></ul>\n<p>最後の段落</p>');
});

test("Timeline headings escape HTML and preserve ordinary hash text", () => {
  assert.equal(renderMarkdownWithHeadings("  ## <script> & 見出し ##"), '<h3>&lt;script&gt; &amp; 見出し</h3>');
  assert.equal(renderMarkdownWithHeadings("#タグ\n####### 見出しではない\n文中の # 記号"), '<p>#タグ<br>####### 見出しではない<br>文中の # 記号</p>');
});

test("October Timeline headings render while lists, emphasis and paragraphs remain", async () => {
  for (const [day, heading] of [
    ["15", "<h4>今日の成果</h4>"],
    ["16", "<h4>今日の成果</h4>"],
    ["22", "<h4>音楽制作、いよいよ本格始動</h4>"],
    ["23", "<h2>音楽制作の外堀工事が完成</h2>"],
  ]) {
    const filename = `t202610${day}.md`;
    const source = await readFile(new URL(`../development/timeline/2026/10/${filename}`, import.meta.url), "utf8");
    const entry = parseTimeline(source, filename, "2026", "10");
    const page = renderTimelinePage([entry]);
    assert.ok(page.includes(heading), filename);
    assert.doesNotMatch(page, /<p>#{1,6} /);
    if (day === "23") {
      assert.match(page, /<li><strong>Danceable<\/strong>：赤<\/li>/);
      assert.match(page, /<strong>ProRes 4444で透過MOVとして書き出し<\/strong>/);
      assert.match(page, /<p>some clouds music のYouTube動画制作に向けて/);
    }
  }
});

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

test("Timeline accepts legacy BOOK as WORK and renders filter controls", () => {
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
  assert.deepEqual(bothEntry.categories, ["APP", "WORK"]);
  const page = renderTimelinePage([appEntry, bothEntry]);
  assert.match(page, /data-category-filter="all"[^>]*aria-pressed="true">すべて/);
  assert.match(page, /data-category-filter="APP"/);
  assert.match(page, /data-category-filter="WORK"/);
  assert.match(page, /data-categories="APP WORK"/);
  assert.match(page, /<span class="development-categories">APP · WORK<\/span>/);
  assert.match(page, /function filterTimeline\(category\)/);
  assert.match(page, /href="\.\.\/assets\/site-footer\.css"/);
  assert.match(page, /<div class="footer-links">/);
  assert.match(page, /<div class="footer-credit">/);
});

test("Timeline accepts Obsidian list properties for categories", () => {
  const appEntry = parseTimeline(`---
date: 2026-10-10
categories:
  - APP
---

アプリを作った。
`, "t20261010.md", "2026", "10");
  const bothEntry = parseTimeline(`---
date: 2026-10-11
categories:
  - APP
  - BOOK
---

アプリと本を作った。
`, "t20261011.md", "2026", "10");

  assert.deepEqual(appEntry.categories, ["APP"]);
  assert.deepEqual(bothEntry.categories, ["APP", "WORK"]);
});

test("Timeline and Journal normalize WORK and legacy categories in existing YAML formats", () => {
  for (const categoryField of [
    "category: WORK",
    "categories: [WORK]",
    "categories:\n  - WORK",
    "categories: [APP, WORK]",
    "categories: [WORK, BOOK, WORKS]",
    "category: BOOK",
    "category: WORKS",
    "categories: [WORKS]",
    "categories:\n  - WORKS",
    "categories: [works, BOOK, APP, WORKS]",
    "categories:\n  - WORKS\n  - BOOK\n  - APP",
  ]) {
    const source = `---\ndate: 2026-10-17\ntitle: 作品制作\n${categoryField}\n---\n\n本文`;
    const timeline = parseTimeline(source, "t20261017.md", "2026", "10");
    const journal = parseDevelopmentArticle(source, "d20261017.md", "2026", "10");
    const expected = categoryField.includes("APP") ? ["APP", "WORK"] : ["WORK"];
    assert.deepEqual(timeline.categories, expected);
    assert.deepEqual(journal.categories, expected);
    const label = `<span class="development-categories">${expected.join(" · ")}</span>`;
    assert.ok(renderTimelinePage([timeline]).includes(label));
    assert.ok(renderDevelopmentJournalPage([journal]).includes(label));
    assert.ok(renderDevelopmentArticlePage(journal).includes(label));
    assert.match(renderTimelinePage([timeline]), /data-category-filter="WORK"/);
  }
});

test("SITE stays unsupported in both collections", () => {
  const source = "---\ndate: 2026-10-17\ntitle: 記録\ncategories: [SITE]\n---\n\n本文";
  assert.throws(() => parseTimeline(source, "t20261017.md", "2026", "10"), /categories must contain only APP, WORK/);
  assert.throws(() => parseDevelopmentArticle(source, "d20261017.md", "2026", "10"), /categories must contain only APP, WORK/);
});

test("October 17 Journal renders legacy WORKS as WORK with its existing title and date", async () => {
  const source = await readFile(new URL("../development/journal/2026/10/d20261017.md", import.meta.url), "utf8");
  const article = parseDevelopmentArticle(source, "d20261017.md", "2026", "10");
  assert.equal(article.title, "こくもたちのデビュー");
  assert.equal(article.date, "2026-10-17");
  assert.deepEqual(article.categories, ["WORK"]);
  assert.match(renderDevelopmentJournalPage([article]), /development-categories">WORK<\/span>/);
  assert.match(renderDevelopmentArticlePage(article), /development-categories">WORK<\/span>/);
});

test("Journal shares Timeline filter buttons and exposes categories without changing article links", () => {
  const article = parseDevelopmentArticle(
    "---\ndate: 2026-10-17\ntitle: こくもたちのデビュー\ncategories: [APP, WORKS]\n---\n\n本文",
    "d20261017.md", "2026", "10",
  );
  const page = renderDevelopmentJournalPage([article]);
  const buttons = (html) => html.match(/<div class="category-tabs"[\s\S]*?<\/div>/)[0];
  assert.equal(buttons(page), buttons(renderTimelinePage([])));
  assert.deepEqual([...page.matchAll(/data-category-filter="(.*?)"/g)].map((match) => match[1]), ["all", "APP", "WORK"]);
  assert.match(page, /data-category-filter="all" aria-pressed="true"/);
  assert.ok(page.indexOf('class="category-tabs"') < page.indexOf('<summary>2026</summary>'));
  assert.match(page, /<li class="entry" data-categories="APP WORK"><a href="\.\/2026\/d20261017\.html">/);
  assert.match(page, /<p class="filter-empty" hidden>該当する記事はありません。<\/p>/);
});

test("Timeline rejects unsupported categories", () => {
  assert.throws(
    () => parseTimeline("---\ndate: 2026-10-13\ncategories: [APP, OTHER]\n---\n\n記録", "t20261013.md", "2026", "10"),
    /categories must contain only APP, WORK/,
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
  assert.match(page, /href="\.\.\/\.\.\/assets\/site-footer\.css"/);
  assert.match(page, /<div class="footer-links">/);
  assert.match(page, /<div class="footer-credit">/);

  const sitemap = renderSitemap([newer]);
  assert.match(sitemap, /some-clouds\/shop\//);
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

test("Development article uses the shared top-page footer styles", () => {
  const article = parseDevelopmentArticle(articleSource, "d20261015.md", "2026", "10");
  const page = renderDevelopmentArticlePage(article);
  assert.match(page, /href="\.\.\/\.\.\/\.\.\/assets\/site-footer\.css"/);
});
