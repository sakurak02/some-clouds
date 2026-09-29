import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptFile = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptFile), "..");
const notesDirectory = path.join(projectRoot, "notes");
const timelineDirectory = path.join(notesDirectory, "timeline");
const fragmentsDirectory = path.join(notesDirectory, "fragments");
const developmentDirectory = path.join(projectRoot, "development");
const notesIndexFile = path.join(notesDirectory, "index.html");
const fragmentsIndexFile = path.join(fragmentsDirectory, "index.html");
const developmentIndexFile = path.join(developmentDirectory, "index.html");
const sitemapFile = path.join(projectRoot, "sitemap.xml");
const siteUrl = "https://sakurak02.github.io/some-clouds/";
const timelineFilePattern = /^t(\d{4})(\d{2})(\d{2})\.md$/;
const fragmentFilePattern = /^f(\d{4})(\d{2})(\d{2})\.md$/;
const developmentFilePattern = /^d(\d{4})(\d{2})(\d{2})\.md$/;
const yamlFrontMatterPattern = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/;
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

function renderArticleMarkdown(markdown, assetMonth = "") {
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

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = Math.max(heading[1].length, 2);
      blocks.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
      index += 1;
      continue;
    }

    const image = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/);
    if (image) {
      const imageUrl = assetMonth && image[2].startsWith("./images/")
        ? `./${assetMonth}/images/${image[2].slice("./images/".length)}`
        : image[2];
      blocks.push(`<figure class="article-image"><img src="${safeLinkUrl(imageUrl)}" alt="${escapeHtml(image[1])}" loading="lazy"></figure>`);
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
      !/^(#{1,3})\s+/.test(lines[index]) &&
      !/^!\[[^\]]*\]\([^)\s]+\)\s*$/.test(lines[index]) &&
      !/^\s*[-+*]\s+/.test(lines[index])
    ) {
      paragraph.push(renderInline(lines[index].trim()));
      index += 1;
    }
    blocks.push(`<p>${paragraph.join("<br>")}</p>`);
  }

  return blocks.join("\n");
}

function extractDateMetadata(normalized, fileName) {
  const frontMatter = normalized.match(yamlFrontMatterPattern);
  if (frontMatter) {
    const dateField = frontMatter[1].match(
      /^date:\s*["']?(\d{4}-\d{2}-\d{2})["']?\s*$/im,
    );
    if (dateField) {
      return {
        date: dateField[1],
        bodySource: normalized.slice(frontMatter[0].length),
      };
    }
  }

  // Compatibility for entries created before YAML front matter was adopted.
  const heading = normalized.match(dateHeadingPattern);
  if (heading) {
    return {
      date: heading[1],
      bodySource: normalized
        .replace(/^---[ \t]*\n/, "")
        .replace(dateHeadingPattern, ""),
    };
  }

  throw new Error(
    `${fileName}: add YAML front matter with date: YYYY-MM-DD`,
  );
}

function parseDate(source, fileName, yearName, monthName, filePattern, expectedFileName) {
  const normalized = normalize(source);
  const fileMatch = fileName.match(filePattern);
  if (!fileMatch) {
    throw new Error(`${fileName}: filename must use ${expectedFileName}`);
  }

  const metadata = extractDateMetadata(normalized, fileName);
  const [year, month, day] = metadata.date.split("-").map(Number);
  const dateObject = new Date(Date.UTC(year, month - 1, day));
  if (
    dateObject.getUTCFullYear() !== year ||
    dateObject.getUTCMonth() !== month - 1 ||
    dateObject.getUTCDate() !== day
  ) {
    throw new Error(`${fileName}: date is not valid`);
  }

  const compactDate = metadata.date.replaceAll("-", "");
  const fileDate = fileMatch.slice(1).join("");
  if (compactDate !== fileDate) {
    throw new Error(`${fileName}: filename and date heading do not match`);
  }
  if (String(year) !== yearName) {
    throw new Error(`${fileName}: move this file into the ${year} folder`);
  }
  const expectedMonth = String(month).padStart(2, "0");
  if (expectedMonth !== monthName) {
    throw new Error(`${fileName}: move this file into the ${expectedMonth} month folder`);
  }

  return {
    normalized,
    bodySource: metadata.bodySource,
    date: metadata.date,
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

function parseTimeline(source, fileName, yearName, monthName) {
  const dateData = parseDate(
    source,
    fileName,
    yearName,
    monthName,
    timelineFilePattern,
    "tYYYYMMDD.md",
  );
  const news = extractSection(dateData.normalized, "NEWS");
  const personal = extractSection(dateData.normalized, "PERSONAL");
  if (!news && !personal) {
    throw new Error(`${fileName}: add a NEWS or PERSONAL section`);
  }
  return { ...dateData, news, personal };
}

function parseFragments(source, fileName, yearName, monthName) {
  const dateData = parseDate(
    source,
    fileName,
    yearName,
    monthName,
    fragmentFilePattern,
    "fYYYYMMDD.md",
  );
  const body = dateData.bodySource.trim();
  if (!body) {
    throw new Error(`${fileName}: add at least one fragment`);
  }
  return { ...dateData, body };
}

function parseDevelopmentArticle(source, fileName, yearName, monthName) {
  const fileMatch = fileName.match(developmentFilePattern);
  if (!fileMatch) {
    throw new Error(`${fileName}: Development article filename must use dYYYYMMDD.md`);
  }

  const normalized = normalize(source);
  const frontMatter = normalized.match(yamlFrontMatterPattern);
  if (!frontMatter) {
    throw new Error(`${fileName}: add YAML front matter`);
  }
  const dateField = frontMatter[1].match(/^date:\s*["']?(\d{4}-\d{2}-\d{2})["']?\s*$/im);
  const titleField = frontMatter[1].match(/^title:\s*(.+?)\s*$/im);
  if (!dateField || !titleField) {
    throw new Error(`${fileName}: add date and title to YAML front matter`);
  }

  const date = dateField[1];
  const [year, month, day] = date.split("-").map(Number);
  const dateObject = new Date(Date.UTC(year, month - 1, day));
  if (
    dateObject.getUTCFullYear() !== year ||
    dateObject.getUTCMonth() !== month - 1 ||
    dateObject.getUTCDate() !== day
  ) {
    throw new Error(`${fileName}: date is not valid`);
  }
  const compactDate = date.replaceAll("-", "");
  const fileDate = fileMatch.slice(1).join("");
  if (compactDate !== fileDate) {
    throw new Error(`${fileName}: filename and date do not match`);
  }
  if (String(year) !== yearName) {
    throw new Error(`${fileName}: move this article into the ${year} folder`);
  }
  const expectedMonth = String(month).padStart(2, "0");
  if (expectedMonth !== monthName) {
    throw new Error(`${fileName}: move this article into the ${expectedMonth} month folder`);
  }

  let title = titleField[1].trim();
  if ((title.startsWith('"') && title.endsWith('"')) || (title.startsWith("'") && title.endsWith("'"))) {
    title = title.slice(1, -1).trim();
  }
  if (!title) {
    throw new Error(`${fileName}: title must not be empty`);
  }

  let body = normalized.slice(frontMatter[0].length).trim();
  const firstHeading = body.match(/^#\s+(.+?)(?:\n|$)/);
  if (firstHeading && firstHeading[1].trim() === title) {
    body = body.slice(firstHeading[0].length).trim();
  }
  if (!body) {
    throw new Error(`${fileName}: add article content`);
  }

  return {
    date,
    dateObject,
    year: String(year),
    month: expectedMonth,
    compactDate,
    slug: fileName.slice(0, -3),
    displayDate: `${year}.${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}`,
    title,
    body,
  };
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
    const monthDirectories = (await readdir(yearDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && /^(0[1-9]|1[0-2])$/.test(entry.name))
      .sort((a, b) => b.name.localeCompare(a.name));

    for (const monthEntry of monthDirectories) {
      const monthDirectory = path.join(yearDirectory, monthEntry.name);
      const files = (await readdir(monthDirectory, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map((entry) => entry.name)
        .sort()
        .reverse();

      for (const fileName of files) {
        const source = await readFile(path.join(monthDirectory, fileName), "utf8");
        entries.push(parser(source, fileName, yearEntry.name, monthEntry.name));
      }
    }
  }

  return entries.sort((a, b) => b.dateObject - a.dateObject);
}

async function loadDevelopmentArticles() {
  await mkdir(developmentDirectory, { recursive: true });
  const directoryEntries = await readdir(developmentDirectory, { withFileTypes: true });
  const yearDirectories = directoryEntries
    .filter((entry) => entry.isDirectory() && /^\d{4}$/.test(entry.name))
    .sort((a, b) => b.name.localeCompare(a.name));
  const entries = [];

  for (const yearEntry of yearDirectories) {
    const yearDirectory = path.join(developmentDirectory, yearEntry.name);
    const monthDirectories = (await readdir(yearDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && /^(0[1-9]|1[0-2])$/.test(entry.name))
      .sort((a, b) => b.name.localeCompare(a.name));

    for (const monthEntry of monthDirectories) {
      const monthDirectory = path.join(yearDirectory, monthEntry.name);
      const articleFiles = (await readdir(monthDirectory, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && developmentFilePattern.test(entry.name))
        .map((entry) => entry.name)
        .sort((a, b) => b.localeCompare(a));

      for (const fileName of articleFiles) {
        const source = await readFile(path.join(monthDirectory, fileName), "utf8");
        entries.push(parseDevelopmentArticle(source, fileName, yearEntry.name, monthEntry.name));
      }
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
.content{position:relative}
.timeline-kuumo-group{position:absolute;top:-10px;right:clamp(14px,4vw,58px);display:flex;align-items:center;gap:8px}
.timeline-kuumo-copy{width:clamp(190px,23vw,270px)}
.timeline-kuumo-name{margin:0 0 8px;font-size:13px;font-weight:500;letter-spacing:.06em}
.timeline-kuumo-description{margin:0;color:#777;font-size:10px;line-height:1.8;letter-spacing:.04em}
.timeline-kuumo{display:block;flex:0 0 auto;width:230px;height:auto;pointer-events:none;user-select:none}
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
  .timeline-kuumo-group{position:static;display:grid;grid-template-columns:minmax(0,1fr) 130px;gap:4px;width:100%;margin:14px 0 -22px}
  .timeline-kuumo-copy{width:auto;min-width:0}
  .timeline-kuumo-name{margin-bottom:6px;font-size:12px}
  .timeline-kuumo-description{font-size:9.5px;line-height:1.75}
  .timeline-kuumo{width:130px}
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
    <div class="timeline-kuumo-group">
      <div class="timeline-kuumo-copy">
        <p class="timeline-kuumo-name">くもも</p>
        <p class="timeline-kuumo-description">some clouds からちぎれて生まれた、クーモの仲間。<br>Notesで、日々の記録や言葉の断片のそばにいます。</p>
      </div>
      <img class="timeline-kuumo" src="../assets/kuumo/Timeline.png" alt="" aria-hidden="true" draggable="false">
    </div>
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
.content{position:relative;width:min(720px,100%)}
.content h1{font-size:clamp(30px,3vw,40px)}
.section-name{color:#777}
.fragments-kuumo{position:absolute;top:-18px;right:clamp(4px,3vw,28px);display:block;width:174px;height:auto;pointer-events:none;user-select:none}
.fragment-body{padding:20px 16px 34px;font-size:14px;line-height:2;letter-spacing:.025em;overflow-wrap:anywhere}
.fragment-body p{margin:0;max-width:620px}
.fragment-body hr{width:36px;height:1px;margin:27px 0;border:0;background:#d3d3d3}
.fragment-body a{text-underline-offset:3px}
@media(max-width:700px){
  .fragments-kuumo{top:5px;right:0;width:112px}
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
    <img class="fragments-kuumo" src="../../assets/kuumo/Fragments.png" alt="" aria-hidden="true" draggable="false">
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

function renderDevelopmentIndexPage(entries) {
  const entryList = entries.length > 0
    ? `<ol class="entries">
      ${entries.map((entry) => `<li class="entry"><a href="./${entry.year}/${entry.slug}.html"><time datetime="${entry.date}">${entry.displayDate}</time><span>${escapeHtml(entry.title)}</span></a></li>`).join("\n      ")}
    </ol>`
    : '<p class="status">開発日記は、もうすぐ始まります。</p>';

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="some clouds の開発日記。">
<title>Development — some clouds</title>
<link rel="icon" href="../assets/cloud.svg" type="image/svg+xml">
<style>
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:#fff;color:#202020}
body{font-family:Georgia,"Times New Roman",serif}
.page{min-height:100dvh;padding:38px 50px 30px;display:flex;flex-direction:column}
.top{display:flex;align-items:center;justify-content:space-between}
.brand{color:#202020;font-size:18px;letter-spacing:.07em;text-decoration:none}
.back{color:#666;font-size:12px;letter-spacing:.05em;text-decoration:none}
.content{width:min(720px,100%);margin:82px auto 100px}
.intro{text-align:center}
.cloud{display:block;width:76px;margin:0 auto 24px}
.cloud path{fill:#fff;stroke:#2c2c2c;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}
h1{margin:0;font-size:clamp(34px,5vw,48px);font-weight:400;letter-spacing:.04em}
.lead{margin:13px 0 0;color:#777;font-size:13px;font-style:italic;letter-spacing:.05em}
.description,.status{margin:28px 0 0;font-family:"Hiragino Kaku Gothic ProN","Yu Gothic",Arial,sans-serif;font-size:13px;letter-spacing:.04em}
.entries{margin:62px 0 0;padding:0;border-top:1px solid #dadada;list-style:none;text-align:left}
.entry{border-bottom:1px solid #ededed}
.entry a{display:grid;grid-template-columns:112px minmax(0,1fr);gap:24px;align-items:baseline;padding:18px 2px;color:#202020;text-decoration:none}
.entry time{color:#777;font-size:12px;letter-spacing:.06em}
.entry span{font-family:"Hiragino Kaku Gothic ProN","Yu Gothic",Arial,sans-serif;font-size:14px;line-height:1.7}
.entry a:hover span{text-decoration:underline;text-decoration-color:#aaa;text-underline-offset:4px}
.footer{margin-top:auto;text-align:center;font-size:10px;letter-spacing:.06em;color:#666}
@media(max-width:700px){
  .page{padding:28px 22px 22px}
  .brand{font-size:16px}
  .content{margin:58px auto 72px}
  .cloud{width:68px;margin-bottom:20px}
  .entries{margin-top:48px}
  .entry a{display:block;padding:16px 2px}
  .entry time{display:block;margin-bottom:7px;font-size:11px}
  .entry span{font-size:13px}
}
</style>
</head>
<body>
<div class="page">
  <header class="top"><a class="brand" href="../">some clouds</a><a class="back" href="../">← Home</a></header>
  <main class="content">
    <section class="intro" aria-labelledby="page-title">
      <svg class="cloud" viewBox="0 0 180 105" aria-hidden="true"><path d="M31 77 C16 72,15 56,26 48 C33 43,40 43,47 46 C53 27,72 18,88 26 C100 11,124 14,131 32 C148 32,159 44,158 57 C170 63,165 79,151 84 C138 88,47 87,31 77Z"/></svg>
      <h1 id="page-title">Development</h1>
      <p class="lead">building, breaking, trying again.</p>${entries.length > 0 ? '\n      <p class="description">開発の記録。</p>' : ""}
    </section>
    ${entryList}
  </main>
  <footer class="footer">sakurak02 · a project by 桂園</footer>
</div>
</body>
</html>
`;
}

function renderDevelopmentArticlePage(entry) {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="${escapeHtml(entry.title)}">
<title>${escapeHtml(entry.title)} — Development — some clouds</title>
<link rel="icon" href="../../assets/cloud.svg" type="image/svg+xml">
<style>
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:#fff;color:#202020}
body{font-family:Georgia,"Times New Roman",serif}
.page{min-height:100dvh;padding:38px 50px 30px;display:flex;flex-direction:column}
.top{display:flex;align-items:center;justify-content:space-between}
.brand{color:#202020;font-size:18px;letter-spacing:.07em;text-decoration:none}
.back{color:#666;font-size:12px;letter-spacing:.05em;text-decoration:none}
.content{width:min(720px,100%);margin:84px auto 110px}
.article-header{padding-bottom:28px;border-bottom:1px solid #dadada}
h1{margin:0;font-family:"Hiragino Kaku Gothic ProN","Yu Gothic",Arial,sans-serif;font-size:clamp(27px,4vw,38px);font-weight:500;line-height:1.55;letter-spacing:.02em}
.date{display:block;margin-top:14px;color:#777;font-size:11px;letter-spacing:.08em}
.article-body{padding-top:34px;font-family:"Hiragino Kaku Gothic ProN","Yu Gothic",Arial,sans-serif;font-size:14px;line-height:2;letter-spacing:.025em;overflow-wrap:anywhere}
.article-body h2,.article-body h3,.article-body h4{margin:42px 0 16px;font-family:Georgia,"Times New Roman",serif;font-weight:400;line-height:1.6}
.article-body h2{font-size:22px}.article-body h3{font-size:18px}.article-body h4{font-size:16px}
.article-body p{margin:0 0 22px}
.article-body ul{margin:0 0 22px;padding-left:1.4em}
.article-body li+li{margin-top:6px}
.article-body hr{width:38px;height:1px;margin:38px 0;border:0;background:#d3d3d3}
.article-body a{color:inherit;text-underline-offset:3px}
.article-image{margin:30px 0}
.article-image img{display:block;max-width:100%;height:auto;margin:auto}
.footer{margin-top:auto;text-align:center;font-size:10px;letter-spacing:.06em;color:#666}
@media(max-width:700px){
  .page{padding:28px 22px 22px}
  .brand{font-size:16px}
  .content{margin:58px auto 76px}
  .article-header{padding-bottom:23px}
  .article-body{padding-top:27px;font-size:13px;line-height:1.95}
  .article-body h2,.article-body h3,.article-body h4{margin-top:34px}
}
</style>
</head>
<body>
<div class="page">
  <header class="top"><a class="brand" href="../../">some clouds</a><a class="back" href="../">← Development</a></header>
  <main class="content">
    <article>
      <header class="article-header">
        <h1>${escapeHtml(entry.title)}</h1>
        <time class="date" datetime="${entry.date}">${entry.displayDate}</time>
      </header>
      <div class="article-body">
        ${renderArticleMarkdown(entry.body, entry.month)}
      </div>
    </article>
  </main>
  <footer class="footer">sakurak02 · a project by 桂園</footer>
</div>
</body>
</html>
`;
}

function renderSitemap(developmentEntries = []) {
  const urls = [
    siteUrl,
    `${siteUrl}about/`,
    `${siteUrl}apps/`,
    `${siteUrl}development/`,
    ...developmentEntries.map((entry) => `${siteUrl}development/${entry.year}/${entry.slug}.html`),
    `${siteUrl}notes/`,
    `${siteUrl}notes/fragments/`,
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${url}</loc></url>`).join("\n")}
</urlset>
`;
}

async function buildNotes() {
  const [timelineEntries, fragmentEntries, developmentEntries] = await Promise.all([
    loadCollection(timelineDirectory, parseTimeline),
    loadCollection(fragmentsDirectory, parseFragments),
    loadDevelopmentArticles(),
  ]);

  await mkdir(fragmentsDirectory, { recursive: true });
  await writeFile(notesIndexFile, renderTimelinePage(timelineEntries), "utf8");
  await writeFile(fragmentsIndexFile, renderFragmentsPage(fragmentEntries), "utf8");
  await writeFile(developmentIndexFile, renderDevelopmentIndexPage(developmentEntries), "utf8");
  for (const entry of developmentEntries) {
    const articleHtmlFile = path.join(developmentDirectory, entry.year, `${entry.slug}.html`);
    await writeFile(articleHtmlFile, renderDevelopmentArticlePage(entry), "utf8");
  }
  await writeFile(sitemapFile, renderSitemap(developmentEntries), "utf8");

  console.log(`Generated notes/index.html from ${timelineEntries.length} timeline file(s).`);
  console.log(`Generated notes/fragments/index.html from ${fragmentEntries.length} fragment file(s).`);
  console.log(`Generated development/index.html and ${developmentEntries.length} article page(s).`);
  console.log("Generated sitemap.xml.");
}

export {
  buildNotes,
  groupByYear,
  parseDevelopmentArticle,
  parseFragments,
  parseTimeline,
  renderDevelopmentArticlePage,
  renderDevelopmentIndexPage,
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
