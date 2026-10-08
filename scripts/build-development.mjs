import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptFile = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptFile), "..");
const developmentDirectory = path.join(projectRoot, "development");
const timelineDirectory = path.join(developmentDirectory, "timeline");
const journalDirectory = path.join(developmentDirectory, "journal");
const developmentIndexFile = path.join(developmentDirectory, "index.html");
const journalIndexFile = path.join(journalDirectory, "index.html");
const sitemapFile = path.join(projectRoot, "sitemap.xml");
const siteUrl = "https://sakurak02.github.io/some-clouds/";
const timelineFilePattern = /^t(\d{4})(\d{2})(\d{2})\.md$/;
const developmentFilePattern = /^d(\d{4})(\d{2})(\d{2})\.md$/;
const yamlFrontMatterPattern = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/;
const dateHeadingPattern = /^##\s+date:\s*(\d{4}-\d{2}-\d{2})\s*$/im;
const footerCredit = "sakurak02 · a project by K企画";
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

function parseImageLine(line, assetBase = "") {
  const obsidianImage = line.match(/^!\[\[([^|\]]+?)(?:\|([1-9]\d*))?\]\]\s*$/);
  if (obsidianImage) {
    const fileName = obsidianImage[1].trim().replaceAll("\\", "/");
    if (!fileName) return null;
    const base = assetBase.replace(/\/+$/, "") || ".";
    return {
      url: `${base}/images/${fileName}`,
      alt: fileName.split("/").at(-1),
      width: obsidianImage[2] || "",
    };
  }

  const markdownImage = line.match(/^!\[([^\]]*)\]\((.+?)\)\s*$/);
  if (!markdownImage) return null;
  const originalUrl = markdownImage[2].trim();
  const base = assetBase.replace(/\/+$/, "");
  const url = base && originalUrl.startsWith("./images/")
    ? `${base}/images/${originalUrl.slice("./images/".length)}`
    : originalUrl;
  return { url, alt: markdownImage[1], width: "" };
}

function renderImageBlock(image, className) {
  const width = image.width ? ` width="${image.width}"` : "";
  return `<figure class="${className}"><img src="${safeLinkUrl(image.url)}" alt="${escapeHtml(image.alt)}" loading="lazy"${width}></figure>`;
}

function renderMarkdown(markdown, assetBase = "") {
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

    const image = parseImageLine(line, assetBase);
    if (image) {
      blocks.push(renderImageBlock(image, "content-image"));
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
      !parseImageLine(lines[index], assetBase) &&
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

    const image = parseImageLine(line, assetMonth ? `./${assetMonth}` : "");
    if (image) {
      blocks.push(renderImageBlock(image, "article-image"));
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
      !parseImageLine(lines[index], assetMonth ? `./${assetMonth}` : "") &&
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
    month: expectedMonth,
    displayDate: `${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}`,
  };
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
  const body = dateData.bodySource.trim();
  if (!body) {
    throw new Error(`${fileName}: add a development note`);
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
  await mkdir(journalDirectory, { recursive: true });
  const directoryEntries = await readdir(journalDirectory, { withFileTypes: true });
  const yearDirectories = directoryEntries
    .filter((entry) => entry.isDirectory() && /^\d{4}$/.test(entry.name))
    .sort((a, b) => b.name.localeCompare(a.name));
  const entries = [];

  for (const yearEntry of yearDirectories) {
    const yearDirectory = path.join(journalDirectory, yearEntry.name);
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
  const assetBase = `./timeline/${entry.year}/${entry.month}`;
  return `<details class="day">
  <summary><time datetime="${entry.date}">${entry.displayDate}</time></summary>
  <div class="day-content">
    ${renderMarkdown(entry.body, assetBase)}
  </div>
</details>`;
}

function renderYearGroups(entries, renderDay) {
  if (entries.length === 0) return '<p class="empty">まだ記録はありません。</p>';
  return groupByYear(entries)
    .map(
      ([year, yearEntries]) => {
        const months = new Map();
        for (const entry of yearEntries) {
          if (!months.has(entry.month)) months.set(entry.month, []);
          months.get(entry.month).push(entry);
        }
        const monthGroups = [...months.entries()]
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([month, monthEntries]) => `<details class="month">
  <summary>${Number(month)}月</summary>
  <div class="days">
    ${[...monthEntries]
      .sort((a, b) => b.dateObject - a.dateObject)
      .map(renderDay)
      .join("\n")}
  </div>
</details>`)
          .join("\n");
        return `<details class="year">
  <summary>${year}</summary>
  <div class="months">
    ${monthGroups}
  </div>
</details>`;
      },
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
.year>summary::after,.month>summary::after,.day>summary::after{content:"＋";font-family:"Noto Sans JP",sans-serif;font-size:13px;font-weight:400;color:#777}
.year[open]>summary::after,.month[open]>summary::after,.day[open]>summary::after{content:"−"}
.months{padding:0 0 18px 28px}
.month{border-top:1px solid #ededed}
.month>summary{display:flex;align-items:center;justify-content:space-between;padding:15px 2px;font-size:13px;letter-spacing:.07em;color:#555}
.month>summary::after{font-size:11px}
.days{padding:0 0 14px 20px}
.day{border-top:1px solid #ededed}
.day>summary{display:flex;align-items:center;justify-content:space-between;padding:15px 2px;font-family:Georgia,"Times New Roman",serif;font-size:14px;letter-spacing:.07em}
.day>summary::after{font-size:11px}
.content-image{margin:18px 0}
.content-image img{display:block;max-width:100%;height:auto}
.empty{margin:0;color:#888;font-size:12px}
.footer{margin-top:auto;text-align:center;font-family:Georgia,"Times New Roman",serif;font-size:10px;letter-spacing:.06em}
@media(max-width:700px){
  .page{padding:28px 22px 22px}
  .brand{font-size:16px}
  .content{margin:58px auto 72px}
  .section-name{margin-top:26px}
  .archive{margin-top:48px}
  .months{padding-left:14px}
  .days{padding-left:12px}
}`;

function renderTimelinePage(entries) {
  const years = renderYearGroups(entries, renderTimelineDay);
  return `<!doctype html>
<html lang="ja">
<head>
${googleTag}
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="日々の短い開発メモ。">
<title>Development — some clouds</title>
<link rel="icon" href="../assets/cloud.svg" type="image/svg+xml">
<style>
${sharedStyles}
.journal-link{position:relative;display:inline-flex;align-items:center;min-width:30px;min-height:30px;justify-content:center;text-decoration:none;font-family:Georgia,"Times New Roman",serif;font-size:18px;letter-spacing:.08em;color:#555}
.journal-link::after{content:"開発日記";position:absolute;right:34px;top:50%;transform:translateY(-50%);font-family:"Noto Sans JP",sans-serif;font-size:10px;letter-spacing:.08em;color:#999;opacity:0;transition:opacity .2s;pointer-events:none;white-space:nowrap}
.journal-link:hover::after,.journal-link:focus-visible::after{opacity:1}
.content{position:relative}
.timeline-kuumo-group{position:absolute;top:-10px;right:clamp(14px,4vw,58px);display:flex;align-items:center;gap:8px}
.timeline-kuumo-copy{width:clamp(190px,23vw,270px)}
.timeline-kuumo-name{margin:0 0 8px;font-size:13px;font-weight:500;letter-spacing:.06em}
.timeline-kuumo-description{margin:0;color:#777;font-size:10px;line-height:1.8;letter-spacing:.04em}
.timeline-kuumo{display:block;flex:0 0 auto;width:230px;height:auto;pointer-events:none;user-select:none}
.day-content{padding:22px 14px 30px;font-size:13px;line-height:1.95;letter-spacing:.02em;overflow-wrap:anywhere}
.day-content p{margin:0 0 14px;max-width:720px}.day-content p:last-child{margin-bottom:0}
.day-content ul{margin:0;padding-left:1.25em}.day-content li+li{margin-top:7px}
.day-content hr{width:36px;height:1px;margin:25px 0;border:0;background:#d3d3d3}
@media(max-width:700px){
  .journal-link::after{display:none}
  .timeline-kuumo-group{position:static;display:grid;grid-template-columns:minmax(0,1fr) 130px;gap:4px;width:100%;margin:14px 0 -22px}
  .timeline-kuumo-copy{width:auto;min-width:0}
  .timeline-kuumo-name{margin-bottom:6px;font-size:12px}
  .timeline-kuumo-description{font-size:9.5px;line-height:1.75}
  .timeline-kuumo{width:130px}
  .day-content{padding:19px 4px 27px 12px;font-size:13px;line-height:1.9}
}
</style>
</head>
<body>
<div class="page">
  <header class="top">
    <a class="brand" href="../">some clouds</a>
    <a class="journal-link" href="./journal/" aria-label="開発日記" title="開発日記">…</a>
  </header>
  <main class="content">
    <h1>Development</h1>
    <p class="section-name">Timeline</p>
    <p class="tagline">日々の短い開発メモ。</p>
    <div class="timeline-kuumo-group">
      <div class="timeline-kuumo-copy">
        <p class="timeline-kuumo-name">くもも</p>
        <p class="timeline-kuumo-description">some clouds からちぎれて生まれた、<br>クーモの仲間。<br>日々の記録や、つくっているものの<br>そばにいます。</p>
      </div>
      <img class="timeline-kuumo" src="../assets/kuumo/Timeline.png" alt="" aria-hidden="true" draggable="false">
    </div>
    <div class="archive">
      ${years}
    </div>
  </main>
  <footer class="footer">${footerCredit}</footer>
</div>
</body>
</html>
`;
}

function renderDevelopmentJournalPage(entries) {
  const archive = entries.length > 0
    ? groupByYear(entries)
      .map(([year, yearEntries]) => {
        const months = new Map();
        for (const entry of yearEntries) {
          if (!months.has(entry.month)) months.set(entry.month, []);
          months.get(entry.month).push(entry);
        }
        const monthGroups = [...months.entries()]
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([month, monthEntries]) => `<details class="month">
  <summary>${month}</summary>
  <ol class="entries">
    ${monthEntries
      .sort((a, b) => b.dateObject - a.dateObject)
      .map((entry) => `<li class="entry"><a href="./${entry.year}/${entry.slug}.html"><time datetime="${entry.date}">${entry.displayDate.slice(5)}</time><span>${escapeHtml(entry.title)}</span></a></li>`)
      .join("\n    ")}
  </ol>
</details>`)
          .join("\n");
        return `<details class="year">
  <summary>${year}</summary>
  <div class="months">
    ${monthGroups}
  </div>
</details>`;
      })
      .join("\n")
    : '<p class="status">まだ記事はありません。</p>';

  return `<!doctype html>
<html lang="ja">
<head>
${googleTag}
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="アプリができるまでの記録。">
<title>開発日記 — Development — some clouds</title>
<link rel="icon" href="../../assets/cloud.svg" type="image/svg+xml">
<style>
${sharedStyles}
.back{font-family:Georgia,"Times New Roman",serif;font-size:12px;letter-spacing:.05em;text-decoration:none;color:#666}
.content{position:relative;width:min(720px,100%)}
.content h1{font-size:clamp(30px,3vw,40px)}
.section-name{color:#777}
.journal-kuumo{position:absolute;top:-18px;right:clamp(4px,3vw,28px);display:block;width:174px;height:auto;pointer-events:none;user-select:none}
.months{padding:0 0 18px 28px}
.month{border-top:1px solid #ededed}
.month>summary{display:flex;align-items:center;justify-content:space-between;padding:15px 2px;font-family:Georgia,"Times New Roman",serif;font-size:14px;letter-spacing:.07em}
.month>summary::after{content:"＋";font-size:11px;font-weight:400;color:#777}
.month[open]>summary::after{content:"−"}
.entries{margin:0;padding:0 0 12px 18px;list-style:none}
.entry{border-top:1px solid #f0f0f0}
.entry a{display:grid;grid-template-columns:74px minmax(0,1fr);gap:20px;align-items:baseline;padding:14px 2px;color:#222;text-decoration:none}
.entry time{color:#777;font-family:Georgia,"Times New Roman",serif;font-size:11px;letter-spacing:.07em}
.entry span{font-size:13px;line-height:1.75}
.entry a:hover span{text-decoration:underline;text-decoration-color:#aaa;text-underline-offset:4px}
.status{margin:0;padding:22px 2px 23px;border-top:1px solid #dadada;border-bottom:1px solid #dadada;color:#888;font-size:12px}
@media(max-width:700px){
  .journal-kuumo{top:5px;right:0;width:112px}
  .months{padding-left:14px}
  .entries{padding-left:10px}
  .status{padding:19px 2px 20px}
  .entry a{display:block;padding:16px 2px}
  .entry time{display:block;margin-bottom:7px;font-size:11px}
  .entry span{font-size:13px}
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
    <h1>開発日記</h1>
    <p class="section-name">アプリができるまでの記録。</p>
    <img class="journal-kuumo" src="../../assets/kuumo/Fragments.png" alt="" aria-hidden="true" draggable="false">
    <div class="archive">
      ${archive}
    </div>
  </main>
  <footer class="footer">${footerCredit}</footer>
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
<title>${escapeHtml(entry.title)} — 開発日記 — some clouds</title>
<link rel="icon" href="../../../assets/cloud.svg" type="image/svg+xml">
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
  <header class="top"><a class="brand" href="../../../">some clouds</a><a class="back" href="../">← 開発日記</a></header>
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
  <footer class="footer">${footerCredit}</footer>
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
    `${siteUrl}development/journal/`,
    ...developmentEntries.map((entry) => `${siteUrl}development/journal/${entry.year}/${entry.slug}.html`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${url}</loc></url>`).join("\n")}
</urlset>
`;
}

async function buildDevelopment() {
  const [timelineEntries, developmentEntries] = await Promise.all([
    loadCollection(timelineDirectory, parseTimeline),
    loadDevelopmentArticles(),
  ]);

  await mkdir(journalDirectory, { recursive: true });
  await writeFile(developmentIndexFile, renderTimelinePage(timelineEntries), "utf8");
  await writeFile(journalIndexFile, renderDevelopmentJournalPage(developmentEntries), "utf8");
  for (const entry of developmentEntries) {
    const articleYearDirectory = path.join(journalDirectory, entry.year);
    await mkdir(articleYearDirectory, { recursive: true });
    const articleHtmlFile = path.join(articleYearDirectory, `${entry.slug}.html`);
    await writeFile(articleHtmlFile, renderDevelopmentArticlePage(entry), "utf8");
  }
  await writeFile(sitemapFile, renderSitemap(developmentEntries), "utf8");

  console.log(`Generated development/index.html from ${timelineEntries.length} timeline file(s).`);
  console.log(`Generated development/journal/index.html and ${developmentEntries.length} article page(s).`);
  console.log("Generated sitemap.xml.");
}

export {
  buildDevelopment,
  groupByYear,
  parseDevelopmentArticle,
  parseTimeline,
  renderDevelopmentArticlePage,
  renderDevelopmentJournalPage,
  renderMarkdown,
  renderSitemap,
  renderTimelinePage,
};

if (process.argv[1] && path.resolve(process.argv[1]) === scriptFile) {
  buildDevelopment().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
