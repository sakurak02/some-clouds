import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHtml, renderFooter, renderMarkdown, sharedStyles } from "./build-development.mjs";

const scriptFile = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptFile), "..");
const bookFilePattern = /^r(\d{4,})\.md$/;
const generatedFilePattern = /^r\d{4,}\.html$/;

function readField(frontMatter, name, fileName) {
  const match = frontMatter.match(new RegExp(`^${name}:[ \\t]*(.*)$`, "m"));
  let value = match?.[1].trim() ?? "";
  if (value.startsWith('"')) {
    try {
      value = JSON.parse(value);
    } catch {
      throw new Error(`${fileName}: ${name} must be a valid quoted string`);
    }
  } else if (value.startsWith("'") && value.endsWith("'")) {
    value = value.slice(1, -1).replaceAll("''", "'");
  }
  return value;
}

function checkDate(value, field, fileName) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${fileName}: ${field} must use YYYY-MM-DD`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${fileName}: ${field} is not a valid date`);
  }
}

export function parseReadingBook(source, fileName) {
  const fileMatch = fileName.match(bookFilePattern);
  const number = Number(fileMatch?.[1]);
  if (!fileMatch || !Number.isSafeInteger(number) || number < 1) {
    throw new Error(`${fileName}: filename must use r0001.md with a positive registration number`);
  }
  const normalized = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const frontMatter = normalized.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  if (!frontMatter) throw new Error(`${fileName}: add YAML front matter`);
  const field = (name) => readField(frontMatter[1], name, fileName);
  const title = field("title");
  const author = field("author");
  const pageValue = field("pages");
  const pages = Number(pageValue);
  const start = field("start");
  const end = field("end");
  const status = field("status");
  if (!title || !author) throw new Error(`${fileName}: title and author are required`);
  if (!/^\d+$/.test(pageValue) || !Number.isSafeInteger(pages) || pages < 1) {
    throw new Error(`${fileName}: pages must be a positive integer`);
  }
  if (status !== "読書中" && status !== "読了") {
    throw new Error(`${fileName}: status must be 読書中 or 読了`);
  }
  checkDate(start, "start", fileName);
  if (end) {
    checkDate(end, "end", fileName);
    if (end < start) throw new Error(`${fileName}: end must not be before start`);
  }
  if (status === "読了" && !end) throw new Error(`${fileName}: a finished book needs end`);

  const pageNotes = new Map();
  let currentPage;
  let currentNote;
  const lines = normalized.slice(frontMatter[0].length).split("\n");
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    const heading = line.match(/^##[ \t]+(?:p\.[ \t]*)?(\d+)[ \t]*$/i);
    if (heading) {
      currentPage = Number(heading[1]);
      if (!Number.isSafeInteger(currentPage) || currentPage < 1 || currentPage > pages) {
        throw new Error(`${fileName}: note page must be between 1 and ${pages}`);
      }
      if (!pageNotes.has(currentPage)) pageNotes.set(currentPage, []);
      currentNote = undefined;
      continue;
    }
    const bullet = line.match(/^[ \t]*[-+*][ \t]+(.+)$/);
    if (bullet && currentPage !== undefined) {
      currentNote = { text: bullet[1].trim() };
      pageNotes.get(currentPage).push(currentNote);
    } else if (/^[ \t]+\S/.test(line) && currentNote) {
      currentNote.text += `\n${line.trim()}`;
    } else {
      throw new Error(`${fileName}: note line ${index + 1} must use ## p. 12 and bullet points`);
    }
  }
  return {
    number, slug: fileName.slice(0, -3), title, author, pages, start, end, status,
    notes: [...pageNotes.entries()]
      .sort(([a], [b]) => a - b)
      .filter(([, notes]) => notes.length)
      .map(([page, notes]) => ({ page, notes: notes.map((note) => note.text) })),
  };
}

const readingStyles = `
.content{width:min(720px,100%)}
.back{font-family:Georgia,"Times New Roman",serif;font-size:12px;letter-spacing:.05em;text-decoration:none;color:#666}
.bookshelf{margin:48px 0 0;padding:0;list-style:none;border-bottom:1px solid #dadada}
.shelf-book{border-top:1px solid #dadada}
.shelf-link{display:flex;align-items:baseline;justify-content:space-between;gap:24px;padding:24px 2px;text-decoration:none}
.shelf-info{min-width:0;overflow-wrap:anywhere}
.shelf-title{display:block;font-size:16px;line-height:1.8;font-weight:400}
.shelf-author{display:block;margin-top:6px;font-size:12px;color:#777;line-height:1.8}
.reading-status{flex-shrink:0;color:#777;font-size:11px;letter-spacing:.05em;white-space:nowrap}
.shelf-link:hover .shelf-title,.shelf-link:focus-visible .shelf-title{text-decoration:underline;text-underline-offset:4px;text-decoration-color:#aaa}
.reading-empty{margin:48px 0 0;padding:24px 2px;border-top:1px solid #dadada;border-bottom:1px solid #dadada;font-size:13px;line-height:1.9;color:#777}
.book-heading{font-family:"Noto Sans JP","Hiragino Kaku Gothic ProN","Yu Gothic",Arial,sans-serif;font-size:clamp(27px,4vw,38px);line-height:1.55;overflow-wrap:anywhere}
.book-author{margin:14px 0 0;color:#777;font-size:14px;line-height:1.8;overflow-wrap:anywhere}
.book-metadata{display:grid;grid-template-columns:100px minmax(0,1fr);gap:12px 24px;margin:30px 0 0;padding:28px 0;border-top:1px solid #dadada;border-bottom:1px solid #dadada;font-size:13px;line-height:1.8}
.book-metadata dt{color:#777}.book-metadata dd{margin:0;min-width:0;overflow-wrap:anywhere}
.reading-notes{margin-top:42px;font-size:14px;line-height:2;letter-spacing:.025em;overflow-wrap:anywhere}
.reading-notes h2{margin:0 0 28px;font-size:20px;font-weight:400}
.page-notes{margin-top:30px}.page-notes h3{margin:0 0 12px;color:#777;font-family:Georgia,"Times New Roman",serif;font-size:14px;font-weight:400;letter-spacing:.06em}
.page-notes ul{margin:0;padding-left:1.4em}.page-notes li+li{margin-top:10px}.page-notes p{margin:0}.page-notes a{text-underline-offset:3px}
.notes-empty{color:#777;font-size:13px}
@media(max-width:700px){
  .bookshelf,.reading-empty{margin-top:36px}
  .shelf-link{gap:16px;padding:20px 2px}.shelf-title{font-size:15px}
  .book-metadata{grid-template-columns:86px minmax(0,1fr);gap:10px 14px;font-size:12px;padding:23px 0}
  .reading-notes{margin-top:34px;font-size:13px;line-height:1.95}
}`;

function renderReadingPage(title, content, isBook = false) {
  const root = isBook ? "../../" : "../";
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="${escapeHtml(title)} — some clouds の読書記録。">
<title>${escapeHtml(title)} — some clouds</title>
<link rel="icon" href="${root}assets/cloud.svg" type="image/svg+xml">
<style>
${sharedStyles}
${readingStyles}
</style>
<link rel="stylesheet" href="${root}assets/site-footer.css">
</head>
<body>
<div class="page">
  <header class="top"><a class="brand" href="${root}">some clouds</a><a class="back" href="../">${isBook ? "← Reading" : "← Home"}</a></header>
  <main class="content">
    ${content}
  </main>
  <footer class="footer">${renderFooter(`${root}characters/`)}</footer>
</div>
</body>
</html>
`;
}

export function renderReadingIndex(books) {
  const shelf = [...books].sort((a, b) => b.number - a.number).map((book) =>
    `<li class="shelf-book"><a class="shelf-link" href="./notes/${book.slug}.html"><span class="shelf-info"><span class="shelf-title">${escapeHtml(book.title)}</span><span class="shelf-author">${escapeHtml(book.author)}</span></span><span class="reading-status">${book.status}</span></a></li>`).join("\n      ");
  return renderReadingPage("Reading", `<h1>Reading</h1>
    <p class="section-name">本棚</p>
    ${books.length ? `<ol class="bookshelf">${shelf}</ol>` : '<p class="reading-empty">本はまだ登録されていません。</p>'}`);
}

function renderDate(value) {
  return value ? `<time datetime="${value}">${value.replaceAll("-", ".")}</time>` : "";
}

export function renderReadingBook(book) {
  const notes = book.notes.map(({ page, notes }) => `<section class="page-notes" aria-labelledby="page-${page}">
      <h3 id="page-${page}">p. ${page}</h3>
      <ul>${notes.map((note) => `<li>${renderMarkdown(note, "../books")}</li>`).join("")}</ul>
    </section>`).join("\n    ");
  return renderReadingPage(`${book.title} — Reading`, `<article>
    <h1 class="book-heading">${escapeHtml(book.title)}</h1>
    <p class="book-author">${escapeHtml(book.author)}</p>
    <dl class="book-metadata">
      <dt>通し番号</dt><dd>${String(book.number).padStart(4, "0")}</dd>
      <dt>総ページ数</dt><dd>${book.pages}ページ</dd>
      <dt>読書開始日</dt><dd>${renderDate(book.start)}</dd>
      <dt>読書終了日</dt><dd>${renderDate(book.end)}</dd>
      <dt>読書状態</dt><dd>${book.status}</dd>
    </dl>
    <section class="reading-notes" aria-labelledby="notes-heading">
      <h2 id="notes-heading">読書メモ</h2>
      ${notes || '<p class="notes-empty">読書メモはまだありません。</p>'}
    </section>
  </article>`, true);
}

export async function buildReading(root = projectRoot) {
  const readingDirectory = path.join(root, "reading");
  const sourceDirectory = path.join(readingDirectory, "books");
  const outputDirectory = path.join(readingDirectory, "notes");
  await mkdir(sourceDirectory, { recursive: true });
  const files = (await readdir(sourceDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name);
  const books = [];
  const numbers = new Set();
  for (const file of files) {
    const book = parseReadingBook(await readFile(path.join(sourceDirectory, file), "utf8"), file);
    if (numbers.has(book.number)) throw new Error(`${file}: registration number ${book.number} is duplicated`);
    numbers.add(book.number);
    books.push(book);
  }
  books.sort((a, b) => b.number - a.number);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(readingDirectory, "index.html"), renderReadingIndex(books), "utf8");
  const generatedFiles = new Set();
  for (const book of books) {
    const file = `${book.slug}.html`;
    generatedFiles.add(file);
    await writeFile(path.join(outputDirectory, file), renderReadingBook(book), "utf8");
  }
  // This dedicated directory contains generated pages; deleting a source removes its page.
  for (const entry of await readdir(outputDirectory, { withFileTypes: true })) {
    if (entry.isFile() && generatedFilePattern.test(entry.name) && !generatedFiles.has(entry.name)) {
      await unlink(path.join(outputDirectory, entry.name));
    }
  }
  console.log(`Generated reading/index.html and ${books.length} reading note page(s).`);
  return books;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptFile) {
  buildReading().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
