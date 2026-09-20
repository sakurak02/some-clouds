import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptFile = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptFile), "..");
const notesDirectory = path.join(projectRoot, "notes");
const timelineDirectory = path.join(notesDirectory, "timeline");
const fragmentsDirectory = path.join(notesDirectory, "fragments");
const notesIndexFile = path.join(notesDirectory, "index.html");
const fragmentsIndexFile = path.join(fragmentsDirectory, "index.html");
const sitemapFile = path.join(projectRoot, "sitemap.xml");
const siteUrl = "https://sakurak02.github.io/some-clouds/";
const filePattern = /^(\d{4})(\d{2})(\d{2})\.md$/;
const dateHeadingPattern = /^##\s+date:\s*(\d{4}-\d{2}-\d{2})\s*$/im;
const googleTag = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-SSXKPMSF5X"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-SSXKPMSF5X');
</script>`;

function normalize(source) {
  return source.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeLinkUrl(value) {
  const url = value.trim();
  return /^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i.test(url) ? escapeHtml(url) : "#";
}

function renderText(value) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>");
}

function renderInline(value) {
  const linkPattern = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let html = "";
  let cursor = 0;

  for (const match of value.matchAll(linkPattern)) {
    html += renderText(value.slice(cursor, match.index));
    html += `<a href="${safeLinkUrl(match[2])}">${renderText(match[1])}</a>`;
    cursor = match.index + match[0].length;
  }

  return html + renderText(value.slice(cursor));
}

function renderMarkdown(markdown) {
  const lines = normalize(markdown).split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (/^\s*---\s*$/.test(line)) {
      blocks.push("<hr>");
      index += 1;
      continue;
    }

    const listItem = line.match(/^\s*[-+*]\s+(.+)$/);
    if (listItem) {
      const items = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*[-+*]\s+(.+)$/);
        if (!item) break;
        items.push(`<li>${renderInline(item[1].trim())}</li>`);
        index += 1;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    const paragraph = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^\s*---\s*$/.test(lines[index]) &&
      !/^\s*[-+*]\s+/.test(lines[index])
    ) {
      paragraph.push(renderInline(lines[index].trim()));
      index += 1;
    }
    blocks.push(`<p>${paragraph.join("<br>")}</p>`);
  }

  return blocks.join("\n");
}

function parseDate(source, fileName, yearName) {
  const normalized = normalize(source);
  const fileMatch = fileName.match(filePattern);
  if (!fileMatch) {
    throw new Error(`${fileName}: filename must use YYYYMMDD.md`);
  }

  const heading = normalized.match(dateHeadingPattern);
  if (!heading) {
    throw new Error(`${fileName}: add a date heading such as ## date: 2026-09-20`);
  }

  const [year, month, day] = heading[1].split("-").map(Number);
  const dateObject = new Date(Date.UTC(year, month - 1, day));
  if (
    dateObject.getUTCFullYear() !== year ||
    dateObject.getUTCMonth() !== month - 1 ||
    dateObject.getUTCDate() !== day
  ) {
    throw new Error(`${fileName}: date is not valid`);
  }

  const compactDate = heading[1].replaceAll("-", "");
  if (compactDate !== fileName.slice(0, 8)) {
    throw new Error(`${fileName}: filename and date heading do not match`);
  }
  if (String(year) !== yearName) {
    throw new Error(`${fileName}: move this file into the ${year} folder`);
  }

  return {
    normalized,
    date: heading[1],
    dateObject,
    year: String(year),
    displayDate: `${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}`,
  };
}

function extractSection(source, sectionName) {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => new RegExp(`^##\\s+${sectionName}\\s*$`, "i").test(line));
  if (start === -1) return "";

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n").trim();
}

function parseTimeline(source, fileName, yearName) {
  const dateData = parseDate(source, fileName, yearName);
  const news = extractSection(dateData.normalized, "NEWS");
  const personal = extractSection(dateData.normalized, "PERSONAL");
  if (!news && !personal) {
    throw new Error(`${fileName}: add a NEWS or PERSONAL section`);
  }
  return { ...dateData, news, personal };
}

function parseFragments(source, fileName, yearName) {
  const dateData = parseDate(source, fileName, yearName);
  const body = dateData.normalized
    .replace(/^\s*---\s*\n/, "")
    .replace(dateHeadingPattern, "")
    .trim();
  if (!body) {
    throw new Error(`${fileName}: add at least one fragment`);
  }
  return { ...dateData, body };
}

async function loadCollection(directory, parser) {
  await mkdir(directory, { recursive: true });
  const directoryEntries = await readdir(directory, { withFileTypes: true });
  const yearDirectories = directoryEntries
    .filter((entry) => entry.isDirectory() && /^\d{4}$/.test(entry.name))
    .sort((a, b) => b.name.localeCompare(a.name));
  const entries = [];

  for (const yearEntry of yearDirectories) {
    const yearDirectory = path.join(directory, yearEntry.name);
    const files = (await readdir(yearDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name)
      .sort()
      .reverse();

    for (const fileName of files) {
      const source = await readFile(path.join(yearDirectory, fileName), "utf8");
      entries.push(parser(source, fileName, yearEntry.name));
    }
  }

  return entries.sort((a, b) => b.dateObject - a.dateObject);
}

function groupByYear(entries) {
  const groups = new Map();
  for (const entry of entries) {
    if (!groups.has(entry.year)) groups.set(entry.year, []);
    groups.get(entry.year).push(entry);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([year, yearEntries]) => [
      year,
      [...yearEntries].sort((a, b) => b.dateObject - a.dateObject),
    ]);
}

function renderTimelineDay(entry) {
  const news = entry.news
    ? `<section class="entry-side news"><h3>NEWS</h3>${renderMarkdown(entry.news)}</section>`
    : "";
  const personal = entry.personal
    ? `<section class="entry-side personal"><h3>PERSONAL</h3>${renderMarkdown(entry.personal)}</section>`
    : "";

  return `<details class="day">
  <summary><time datetime="${entry.date}">${entry.displayDate}</time></summary>
  <div class="day-content">
    ${news}
    <div class="axis" aria-hidden="true"><span>${entry.displayDate}</span><i></i></div>
    ${personal}
  </div>
</details>`;
}

function renderYearGroups(entries, renderDay) {
  if (entries.length === 0) return '<p class="empty">まだ記録はありません。</p>';
  return groupByYear(entries)
    .map(
      ([year, yearEntries]) => `<details class="year">
  <summary>${year}</summary>
  <div class="days">
    ${yearEntries.map(renderDay).join("\n")}
  </div>
</details>`,
    )
    .join("\n");
}

const sharedStyles = `
@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500&display=swap");
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:#fff;color:#222}
body{font-family:"Noto Sans JP","Hiragino Kaku Gothic ProN","Yu Gothic",Arial,sans-serif}
a{color:inherit}
.page{min-height:100dvh;padding:38px 50px 30px}
.top{display:flex;align-items:center;justify-content:space-between}
.brand{font-family:Georgia,"Times New Roman",serif;font-size:18px;letter-spacing:.07em;text-decoration:none}
.content{width:min(1040px,100%);margin:86px auto 100px}
h1{margin:0;font-family:Georgia,"Times New Roman",serif;font-size:clamp(34px,4vw,48px);font-weight:400;letter-spacing:.03em}
.section-name{margin:34px 0 0;font-family:Georgia,"Times New Roman",serif;font-size:15px;letter-spacing:.08em}
.tagline{margin:8px 0 0;font-size:12px;color:#777;letter-spacing:.05em}
.archive{margin-top:66px}
details>summary{list-style:none;cursor:pointer}
details>summary::-webkit-details-marker{display:none}
.year{border-top:1px solid #dadada}
.year:last-child{border-bottom:1px solid #dadada}
.year>summary{display:flex;align-items:center;justify-content:space-between;padding:19px 2px;font-family:Georgia,"Times New Roman",serif;font-size:18px;letter-spacing:.06em}
.year>summary::after,.day>summary::after{content:"＋";font-family:"Noto Sans JP",sans-serif;font-size:13px;font-weight:400;color:#777}
.year[open]>summary::after,.day[open]>summary::after{content:"−"}
.days{padding:0 0 18px 28px}
.day{border-top:1px solid #ededed}
.day>summary{display:flex;align-items:center;justify-content:space-between;padding:15px 2px;font-family:Georgia,"Times New Roman",serif;font-size:14px;letter-spacing:.07em}
.day>summary::after{font-size:11px}
.empty{margin:0;color:#888;font-size:12px}
.footer{margin-top:auto;text-align:center;font-family:Georgia,"Times New Roman",serif;font-size:10px;letter-spacing:.06em}
@media(max-width:700px){
  .page{padding:28px 22px 22px}
  .brand{font-size:16px}
  .content{margin:58px auto 72px}
  .section-name{margin-top:26px}
  .archive{margin-top:48px}
  .days{padding-left:14px}
}`;

function renderTimelinePage(entries) {
  const years = renderYearGroups(entries, renderTimelineDay);
  return `<!doctype html>
<html lang="ja">
<head>
${googleTag}
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="世界と、自分の記録。">
<title>Notes — some clouds</title>
<link rel="icon" href="../assets/cloud.svg" type="image/svg+xml">
<style>
${sharedStyles}
.fragments-link{position:relative;display:inline-flex;align-items:center;min-width:30px;min-height:30px;justify-content:center;text-decoration:none;font-family:Georgia,"Times New Roman",serif;font-size:18px;letter-spacing:.08em;color:#555}
.fragments-link::after{content:"fragments";position:absolute;right:34px;top:50%;transform:translateY(-50%);font-family:Georgia,"Times New Roman",serif;font-size:10px;letter-spacing:.08em;color:#999;opacity:0;transition:opacity .2s;pointer-events:none}
.fragments-link:hover::after,.fragments-link:focus-visible::after{opacity:1}
.day-content{display:grid;grid-template-columns:minmax(0,1fr) 92px minmax(0,1fr);gap:34px;padding:26px 14px 34px}
.entry-side{min-width:0;font-size:13px;line-height:1.95;letter-spacing:.02em;overflow-wrap:anywhere}
.entry-side h3{margin:0 0 16px;font-size:10px;font-weight:500;letter-spacing:.16em;color:#777}
.entry-side p{margin:0 0 14px}.entry-side p:last-child{margin-bottom:0}
.entry-side ul{margin:0;padding-left:1.25em}.entry-side li+li{margin-top:7px}
.news{grid-column:1}.personal{grid-column:3}
.axis{position:relative;grid-column:2;grid-row:1;display:flex;flex-direction:column;align-items:center;align-self:stretch;min-height:92px;font-family:Georgia,"Times New Roman",serif;font-size:10px;letter-spacing:.06em;color:#999}
.axis::before{content:"";position:absolute;top:25px;bottom:0;left:50%;width:1px;background:#dedede}
.axis i{position:relative;width:5px;height:5px;margin-top:11px;border:1px solid #aaa;border-radius:50%;background:#fff;z-index:1}
@media(max-width:700px){
  .fragments-link::after{display:none}
  .day-content{display:flex;flex-direction:column;gap:29px;padding:20px 4px 28px 12px}
  .entry-side{font-size:13px;line-height:1.9}
  .entry-side h3{margin-bottom:12px}
  .axis{display:none}
}
</style>
</head>
<body>
<div class="page">
  <header class="top">
    <a class="brand" href="../">some clouds</a>
    <a class="fragments-link" href="./fragments/" aria-label="Fragments" title="Fragments">…</a>
  </header>
  <main class="content">
    <h1>Notes</h1>
    <p class="section-name">Timeline</p>
    <p class="tagline">世界と、自分の記録。</p>
    <div class="archive">
      ${years}
    </div>
  </main>
  <footer class="footer">sakurak02 · a project by 桂園</footer>
</div>
</body>
</html>
`;
}

function renderFragmentDay(entry) {
  return `<details class="day">
  <summary><time datetime="${entry.date}">${entry.displayDate}</time></summary>
  <div class="fragment-body">
    ${renderMarkdown(entry.body)}
  </div>
</details>`;
}

function renderFragmentsPage(entries) {
  const years = renderYearGroups(entries, renderFragmentDay);
  return `<!doctype html>
<html lang="ja">
<head>
${googleTag}
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="短い言葉の断片。">
<title>Fragments — some clouds</title>
<link rel="icon" href="../../assets/cloud.svg" type="image/svg+xml">
<style>
${sharedStyles}
.back{font-family:Georgia,"Times New Roman",serif;font-size:12px;letter-spacing:.05em;text-decoration:none;color:#666}
.content{width:min(720px,100%)}
.content h1{font-size:clamp(30px,3vw,40px)}
.section-name{color:#777}
.fragment-body{padding:20px 16px 34px;font-size:14px;line-height:2;letter-spacing:.025em;overflow-wrap:anywhere}
.fragment-body p{margin:0;max-width:620px}
.fragment-body hr{width:36px;height:1px;margin:27px 0;border:0;background:#d3d3d3}
.fragment-body a{text-underline-offset:3px}
@media(max-width:700px){
  .fragment-body{padding:18px 4px 28px 12px;font-size:13px;line-height:1.95}
  .fragment-body hr{margin:23px 0}
}
</style>
</head>
<body>
<div class="page">
  <header class="top">
    <a class="brand" href="../../">some clouds</a>
    <a class="back" href="../">← Timeline</a>
  </header>
  <main class="content">
    <h1>Fragments</h1>
    <p class="section-name">短い言葉の断片。</p>
    <div class="archive">
      ${years}
    </div>
  </main>
  <footer class="footer">sakurak02 · a project by 桂園</footer>
</div>
</body>
</html>
`;
}

function renderSitemap() {
  const urls = [siteUrl, `${siteUrl}about/`, `${siteUrl}notes/`, `${siteUrl}notes/fragments/`];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${url}</loc></url>`).join("\n")}
</urlset>
`;
}

async function buildNotes() {
  const [timelineEntries, fragmentEntries] = await Promise.all([
    loadCollection(timelineDirectory, parseTimeline),
    loadCollection(fragmentsDirectory, parseFragments),
  ]);

  await mkdir(fragmentsDirectory, { recursive: true });
  await writeFile(notesIndexFile, renderTimelinePage(timelineEntries), "utf8");
  await writeFile(fragmentsIndexFile, renderFragmentsPage(fragmentEntries), "utf8");
  await writeFile(sitemapFile, renderSitemap(), "utf8");

  console.log(`Generated notes/index.html from ${timelineEntries.length} timeline file(s).`);
  console.log(`Generated notes/fragments/index.html from ${fragmentEntries.length} fragment file(s).`);
  console.log("Generated sitemap.xml.");
}

export {
  buildNotes,
  groupByYear,
  parseFragments,
  parseTimeline,
  renderFragmentsPage,
  renderMarkdown,
  renderSitemap,
  renderTimelinePage,
};

if (process.argv[1] && path.resolve(process.argv[1]) === scriptFile) {
  buildNotes().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
