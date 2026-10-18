import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildReading, parseReadingBook, renderReadingBook, renderReadingIndex } from "./build-reading.mjs";
import { renderSitemap } from "./build-development.mjs";

const fixture = await readFile(new URL("./fixtures/reading/r0001.md", import.meta.url), "utf8");

test("Reading parses one fictional book and merges repeated pages in numeric order", () => {
  const book = parseReadingBook(fixture, "r0001.md");
  assert.equal(book.number, 1);
  assert.equal(book.title, "テスト用の架空本：雲のしおり");
  assert.equal(book.author, "架空の著者（テスト用）");
  assert.equal(book.pages, 144);
  assert.equal(book.start, "2026-10-01");
  assert.equal(book.end, "");
  assert.equal(book.status, "読書中");
  assert.deepEqual(book.notes.map((group) => group.page), [8, 15, 32]);
  assert.equal(book.notes[0].notes.length, 2);
  assert.match(book.notes[1].notes[0], /\nこの行も同じメモの続き。$/);
  assert.equal(book.notes[2].notes.length, 2);
  assert.match(book.notes[2].notes[0], /^架空の街/);
  assert.match(book.notes[2].notes[1], /^追記。/);
  assert.deepEqual(parseReadingBook(fixture.replaceAll("\n", "\r\n"), "r0001.md"), book);
});

test("Reading bookshelf uses registration number rather than reading dates or input order", () => {
  const book = parseReadingBook(fixture, "r0001.md");
  // A second registration of the same fictional fixture exercises ordering without a real book.
  const newer = { ...book, number: 10, slug: "r0010", start: "2025-01-01", status: "読了" };
  const html = renderReadingIndex([book, newer]);
  assert.ok(html.indexOf("./notes/r0010.html") < html.indexOf("./notes/r0001.html"));
  assert.match(html, /架空の著者（テスト用）/);
  assert.match(html, /読書中/);
  assert.match(html, /読了/);
  assert.match(renderReadingIndex([]), /本はまだ登録されていません。/);
  const sitemap = renderSitemap([], [book]);
  assert.match(sitemap, /some-clouds\/reading\/<\/loc>/);
  assert.match(sitemap, /reading\/notes\/r0001\.html/);
});

test("Reading book renders all metadata and bullet notes using existing Markdown rendering", () => {
  const book = parseReadingBook(fixture, "r0001.md");
  const html = renderReadingBook(book);
  assert.match(html, /<dt>通し番号<\/dt><dd>0001<\/dd>/);
  assert.match(html, /<dt>総ページ数<\/dt><dd>144ページ<\/dd>/);
  assert.match(html, /<time datetime="2026-10-01">2026\.10\.01<\/time>/);
  assert.match(html, /<dt>読書終了日<\/dt><dd><\/dd>/);
  assert.match(html, /<dt>読書状態<\/dt><dd>読書中<\/dd>/);
  assert.ok(html.indexOf('id="page-8"') < html.indexOf('id="page-15"'));
  assert.ok(html.indexOf('id="page-15"') < html.indexOf('id="page-32"'));
  assert.equal((html.match(/<li>/g) || []).length, 5);
  assert.match(html, /<strong>自分の言葉<\/strong>/);
  assert.match(html, /<br>この行も同じメモの続き。/);
  assert.equal((html.match(/<time /g) || []).length, 1);
  assert.match(html, /href="\.\.\/">← Reading/);
  assert.match(html, /href="\.\.\/\.\.\/assets\/site-footer\.css"/);
  const finished = parseReadingBook(fixture.replace("end:", "end: 2026-10-18").replace("status: 読書中", "status: 読了"), "r0001.md");
  assert.match(renderReadingBook(finished), /<time datetime="2026-10-18">2026\.10\.18<\/time>/);
});

test("Reading safely renders quoted metadata, Markdown and an empty notebook", () => {
  const source = fixture.replace("title: テスト用の架空本：雲のしおり", 'title: "架空の本 <script> & \\"しおり\\""');
  const book = parseReadingBook(source, "r0001.md");
  const html = renderReadingBook({ ...book, notes: [{ page: 1, notes: ['<script>alert(1)</script> [危険](javascript:alert)'] }] });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /href="#"/);
  assert.match(renderReadingBook({ ...book, notes: [] }), /読書メモはまだありません。/);
});

test("Reading rejects incomplete metadata, invalid dates, pages and ambiguous notes", () => {
  for (const [before, after, error] of [
    ["author: 架空の著者（テスト用）", "author:", /title and author/],
    ["pages: 144", "pages: 0", /pages must/],
    ["pages: 144", "pages: 1.5", /pages must/],
    ["start: 2026-10-01", "start: 2026-02-30", /valid date/],
    ["end:", "end: 2026-09-30", /end must not/],
    ["status: 読書中", "status: 読了", /finished book needs end/],
    ["status: 読書中", "status: 未読", /status must/],
    ["## p. 8", "## p. 0", /note page must/],
    ["## p. 8", "## p. 145", /note page must/],
    ["## p. 32", "メモの見出しなし", /note line/],
  ]) {
    assert.throws(() => parseReadingBook(fixture.replace(before, after), "r0001.md"), error);
  }
  assert.throws(() => parseReadingBook(fixture, "r0000.md"), /filename must/);
  assert.throws(() => parseReadingBook(fixture, "book.md"), /filename must/);
  assert.throws(() => parseReadingBook("本文だけ", "r0001.md"), /front matter/);
});

test("Reading build excludes test fixtures, updates books, and removes stale generated pages after source deletion", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "reading-build-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await buildReading(root);
  assert.match(await readFile(path.join(root, "reading/index.html"), "utf8"), /本はまだ登録されていません。/);
  const source = path.join(root, "reading/books/r0001.md");
  const output = path.join(root, "reading/notes/r0001.html");
  await writeFile(source, fixture);
  const books = await buildReading(root);
  assert.equal(books.length, 1);
  assert.match(await readFile(output, "utf8"), /テスト用の架空本/);
  await writeFile(source, fixture + "\n## p. 8\n\n- テストの追加メモ。\n");
  await buildReading(root);
  assert.match(await readFile(output, "utf8"), /テストの追加メモ。/);
  await writeFile(path.join(root, "reading/notes/keep.html"), "manually managed");
  await unlink(source);
  await buildReading(root);
  await assert.rejects(access(output), { code: "ENOENT" });
  assert.doesNotMatch(await readFile(path.join(root, "reading/index.html"), "utf8"), /r0001\.html/);
  assert.equal(await readFile(path.join(root, "reading/notes/keep.html"), "utf8"), "manually managed");
});

test("Reading rejects duplicate registration numbers before writing output", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "reading-duplicate-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "reading/books");
  await mkdir(source, { recursive: true });
  await writeFile(path.join(source, "r0001.md"), fixture);
  await writeFile(path.join(source, "r00001.md"), fixture);
  await assert.rejects(buildReading(root), /registration number 1 is duplicated/);
  await assert.rejects(access(path.join(root, "reading/index.html")), { code: "ENOENT" });
});
