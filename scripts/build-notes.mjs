import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptFile = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptFile), "..");
const entriesDirectory = path.join(projectRoot, "notes", "entries");
const postsDirectory = path.join(projectRoot, "notes", "posts");
const notesIndexFile = path.join(projectRoot, "notes", "index.html");
const entryFilePattern = /^(\d{8})-(\d{3})\.md$/;
const allowedTags = new Set(["雑記", "学習", "メモ", "考えごと"]);
const googleTag = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-SSXKPMSF5X"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-SSXKPMSF5X');
</script>`;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseScalar(value) {
  const trimmed = value.trim();
  const quoted = trimmed.match(/^(["'])(.*)\1$/);
  return quoted ? quoted[2] : trimmed;
}

function parseEntry(source, fileName) {
  const normalized = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const frontMatter = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);

  if (!frontMatter) {
    throw new Error(`${fileName}: front matter must start and end with ---`);
  }

  const metadata = {};
  for (const line of frontMatter[1].split("\n")) {
    if (!line.trim()) continue;
    const separator = line.indexOf(":");
    if (separator === -1) {
      throw new Error(`${fileName}: invalid front matter line: ${line}`);
    }
    const key = line.slice(0, separator).trim();
    if (Object.hasOwn(metadata, key)) {
      throw new Error(`${fileName}: duplicate front matter field: ${key}`);
    }
    metadata[key] = parseScalar(line.slice(separator + 1));
  }

  const requiredFields = ["date", "tag", "title", "excerpt"];
  for (const field of requiredFields) {
    if (!metadata[field]) {
      throw new Error(`${fileName}: missing front matter field: ${field}`);
    }
  }

  const unexpectedFields = Object.keys(metadata).filter((field) => !requiredFields.includes(field));
  if (unexpectedFields.length > 0) {
    throw new Error(`${fileName}: unsupported front matter field: ${unexpectedFields.join(", ")}`);
  }

  if (!allowedTags.has(metadata.tag)) {
    throw new Error(`${fileName}: tag must be one of ${[...allowedTags].join(" / ")}`);
  }

  const dateMatch = metadata.date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) {
    throw new Error(`${fileName}: date must use YYYY-MM-DD`);
  }

  const fileMatch = fileName.match(entryFilePattern);
  if (!fileMatch) {
    throw new Error(`${fileName}: filename must use YYYYMMDD-001.md`);
  }

  if (fileMatch[1] !== metadata.date.replaceAll("-", "")) {
    throw new Error(`${fileName}: filename date and front matter date do not match`);
  }

  const sequence = Number(fileMatch[2]);
  if (sequence === 0) {
    throw new Error(`${fileName}: filename sequence must start at 001`);
  }

  const [year, month, day] = dateMatch.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`${fileName}: date is not valid`);
  }

  return {
    ...metadata,
    slug: fileName.slice(0, -3),
    body: normalized.slice(frontMatter[0].length).trim(),
    dateObject: date,
    sequence,
  };
}

function renderTextFormatting(value) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/(^|[^_])_([^_\n]+?)_(?!_)/g, "$1<em>$2</em>");
}

function safeLinkUrl(value) {
  const url = value.trim();
  if (/^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i.test(url)) {
    return escapeHtml(url);
  }
  return "#";
}

function renderInline(value) {
  const linkPattern = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let html = "";
  let cursor = 0;

  for (const match of value.matchAll(linkPattern)) {
    html += renderTextFormatting(value.slice(cursor, match.index));
    html += `<a href="${safeLinkUrl(match[2])}">${renderTextFormatting(match[1])}</a>`;
    cursor = match.index + match[0].length;
  }

  return html + renderTextFormatting(value.slice(cursor));
}

function renderMarkdown(markdown) {
  const lines = markdown.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    if (!lines[index].trim()) {
      index += 1;
      continue;
    }

    const heading = lines[index].match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
      index += 1;
      continue;
    }

    const unordered = lines[index].match(/^\s*[-+*]\s+(.+)$/);
    const ordered = lines[index].match(/^\s*\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      const listTag = unordered ? "ul" : "ol";
      const itemPattern = unordered ? /^\s*[-+*]\s+(.+)$/ : /^\s*\d+\.\s+(.+)$/;
      const items = [];

      while (index < lines.length) {
        const item = lines[index].match(itemPattern);
        if (!item) break;
        items.push(`  <li>${renderInline(item[1].trim())}</li>`);
        index += 1;
      }

      blocks.push(`<${listTag}>\n${items.join("\n")}\n</${listTag}>`);
      continue;
    }

    const paragraph = [];
    while (index < lines.length && lines[index].trim()) {
      if (paragraph.length > 0 && /^(#{1,6})\s+|^\s*[-+*]\s+|^\s*\d+\.\s+/.test(lines[index])) {
        break;
      }
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
  }

  return blocks.join("\n\n");
}

function formatDate(date) {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

function renderPost(entry) {
  const title = escapeHtml(entry.title);
  const excerpt = escapeHtml(entry.excerpt);
  const tag = escapeHtml(entry.tag);

  return `<!doctype html>
<html lang="ja">
<head>
${googleTag}
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="${excerpt}">
<title>${title} — Notes</title>
<style>
@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500&display=swap");
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:#fff;color:#1f1f1f}
body{font-family:"Noto Sans JP","Yu Gothic",sans-serif}
.page{min-height:100dvh;padding:40px 52px 34px;display:flex;flex-direction:column}
.top{display:flex;justify-content:space-between;align-items:center}
.brand,.nav{font-size:12px;letter-spacing:.04em}
.brand{font-size:17px;color:#1f1f1f;text-decoration:none;letter-spacing:.06em}
.content{width:min(680px,100%);margin:90px auto 80px}
.meta{display:flex;gap:12px;align-items:center;margin-bottom:18px;font-size:10px;color:#666}
.tag{border:1px solid #bbb;padding:2px 6px}
h1{margin:0 0 42px;font-size:clamp(28px,4vw,40px);font-weight:500;line-height:1.5}
.article p{margin:0 0 1.8em;font-size:15px;line-height:2.1}
.article h2,.article h3,.article h4,.article h5,.article h6{margin:2.2em 0 1em;font-weight:500;line-height:1.7}
.article h2{font-size:22px}.article h3{font-size:18px}.article h4,.article h5,.article h6{font-size:16px}
.article ul,.article ol{margin:0 0 1.8em;padding-left:1.6em;font-size:15px;line-height:2.1}
.article a{color:#1f1f1f;text-underline-offset:3px}
.back{display:inline-block;margin-top:44px;color:#1f1f1f;text-decoration:none;font-size:11px;border-bottom:1px solid #1f1f1f;padding-bottom:2px}
.footer{margin-top:auto;text-align:center;font-size:10px;letter-spacing:.05em}
@media(max-width:700px){
  .page{padding:30px 24px 24px}
  .content{margin:62px auto 54px}
  h1{font-size:26px;margin-bottom:34px}
  .article p,.article ul,.article ol{font-size:14px;line-height:2}
}
</style>
</head>
<body>
<div class="page">
<header class="top">
  <a class="brand" href="https://sakurak02.github.io/some-clouds/">some clouds</a>
  <span class="nav">Notes</span>
</header>

<main class="content">
  <div class="meta">
    <span>${formatDate(entry.dateObject)}</span>
    <span class="tag">${tag}</span>
  </div>

  <h1>${title}</h1>

  <div class="article">
${renderMarkdown(entry.body).split("\n").map((line) => `    ${line}`).join("\n")}
  </div>

  <a class="back" href="https://sakurak02.github.io/some-clouds/notes/">← Notes</a>
</main>

<footer class="footer">sakurak02 · a project by K企画</footer>
</div>
</body>
</html>
`;
}

function sortEntries(entries) {
  return [...entries].sort(
    (first, second) =>
      second.dateObject.getTime() - first.dateObject.getTime() ||
      second.sequence - first.sequence,
  );
}

function buildCalendarData(entries) {
  const sortedEntries = sortEntries(entries);
  const latestEntry = sortedEntries[0];

  if (!latestEntry) {
    throw new Error("Calendar requires at least one note");
  }

  const articlesByDate = {};
  for (const entry of sortedEntries) {
    articlesByDate[entry.date] ??= [];
    articlesByDate[entry.date].push({
      title: entry.title,
      href: `./posts/${entry.slug}/`,
    });
  }

  return {
    initialYear: latestEntry.dateObject.getUTCFullYear(),
    initialMonth: latestEntry.dateObject.getUTCMonth(),
    articlesByDate,
  };
}

function serializeForScript(value) {
  return JSON.stringify(value)
    .replaceAll("&", "\\u0026")
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e");
}

function renderNoteCard(entry) {
  const tag = escapeHtml(entry.tag);
  const title = escapeHtml(entry.title);
  const excerpt = escapeHtml(entry.excerpt);

  return `    <a class="cloud-card" data-tag="${tag}" href="./posts/${entry.slug}/">
      <svg class="cloud-shape" viewBox="0 0 760 190" preserveAspectRatio="none" aria-hidden="true">
        <path d="M118 164
          C59 161,38 139,48 111
          C56 87,81 78,108 84
          C121 52,158 31,202 39
          C239 16,301 21,327 58
          C370 47,418 53,448 76
          C499 61,557 75,578 108
          C628 109,663 130,677 153
          C687 169,620 177,542 176
          C452 175,231 179,118 164Z"/>
      </svg>
      <div class="cloud-content">
        <div class="meta"><span>${formatDate(entry.dateObject)}</span><span class="entry-tag">${tag}</span></div>
        <h2>${title}</h2>
        <p class="excerpt">${excerpt}</p>
        <div class="read-more">tap to read →</div>
      </div>
    </a>`;
}

function renderNotesIndex(entries) {
  const cards = sortEntries(entries).map(renderNoteCard).join("\n\n");
  const calendarData = serializeForScript(buildCalendarData(entries));

  return `<!doctype html>
<html lang="ja">
<head>
${googleTag}
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Notes — some clouds</title>
<style>
@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500&display=swap");

*{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:#fff;color:#1f1f1f}
body{font-family:"Noto Sans JP","Yu Gothic",sans-serif}
.page{min-height:100dvh;padding:40px 52px 34px;display:flex;flex-direction:column}
.top{display:flex;justify-content:space-between;align-items:center}
.brand{font-size:17px;font-weight:400;letter-spacing:.06em;color:#1f1f1f;text-decoration:none}
.top-right{display:flex;align-items:center;gap:24px;font-size:12px;letter-spacing:.04em}
.calendar-wrap{position:relative}
.calendar-btn{border:0;background:transparent;padding:0;font:inherit;color:#1f1f1f;cursor:pointer}
.calendar-panel{position:absolute;right:0;top:26px;width:260px;max-width:calc(100vw - 48px);padding:18px;border:1px solid #1f1f1f;background:#fff;display:none;z-index:10}
.calendar-panel.open{display:block}
.calendar-title{display:grid;grid-template-columns:28px 1fr 28px;align-items:center;gap:8px;margin-bottom:12px;text-align:center;font-size:12px}
.month-nav{width:28px;height:28px;border:0;background:transparent;padding:0;font:inherit;font-size:18px;color:#1f1f1f;cursor:pointer}
.cal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px;text-align:center;font-size:11px}
.calendar-weekdays{margin-bottom:2px}
.dow{font-size:9px;color:#999;padding:3px 0}
.day{height:26px;display:flex;align-items:center;justify-content:center;border:0;background:transparent;padding:4px 0;font:inherit;font-size:11px;color:#1f1f1f;text-decoration:none}
.day.empty{visibility:hidden}
.day.marked{border-bottom:1px solid #1f1f1f;cursor:pointer}
.day-entries{margin-top:14px;padding-top:12px;border-top:1px solid #d8d8d8}
.day-entries-title{margin:0 0 7px;font-size:10px;color:#666}
.day-entries-list{display:flex;flex-direction:column;gap:6px}
.day-entries-list a{color:#1f1f1f;text-decoration:none;font-size:11px;line-height:1.5}
.content{width:min(760px,100%);margin:84px auto 70px}
.page-title{margin:0 0 16px;font-size:clamp(36px,5vw,56px);font-weight:400}
.intro{margin:0 0 28px;max-width:640px;font-size:14px;line-height:2;color:#555}
.tag-filter{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:44px}
.tag-filter button{background:#fff;border:1px solid #bdbdbd;padding:5px 10px 6px;font:inherit;font-size:11px;cursor:pointer}
.tag-filter button.active,.tag-filter button:hover{border-color:#1f1f1f}
.cloud-list{display:flex;flex-direction:column;gap:18px}
.cloud-card{position:relative;min-height:178px;width:100%;text-decoration:none;color:#1f1f1f;transition:transform .22s ease;display:block}
.cloud-card:hover{transform:translateY(-3px)}
.cloud-shape{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.cloud-shape path{fill:#fff;stroke:#d1d1d1;stroke-width:1.5;vector-effect:non-scaling-stroke}
.cloud-content{position:relative;z-index:1;padding:40px 74px 34px}
.meta{display:flex;align-items:center;gap:12px;margin-bottom:8px;font-size:10px;color:#666}
.entry-tag{border:1px solid #bbb;padding:2px 6px}
.cloud-card h2{margin:0 0 10px;font-size:19px;line-height:1.5;font-weight:500}
.excerpt{margin:0;font-size:13px;line-height:1.8;color:#444}
.read-more{margin-top:10px;font-size:10px;color:#777;letter-spacing:.03em}
.hidden{display:none}
.footer{margin-top:auto;text-align:center;font-size:10px;letter-spacing:.05em}

@media(max-width:700px){
  .page{padding:30px 24px 24px}
  .top-right{gap:14px}
  .calendar-panel{width:240px}
  .calendar-title{grid-template-columns:36px 1fr 36px}
  .month-nav{width:36px;height:36px}
  .content{margin:62px auto 54px}
  .intro{font-size:13px;line-height:1.9}
  .cloud-card{min-height:190px}
  .cloud-content{padding:44px 34px 34px}
  .cloud-card h2{font-size:17px}
  .excerpt{font-size:12px;line-height:1.75}
}
</style>
</head>
<body>
<div class="page">

<header class="top">
  <a class="brand" href="../">some clouds</a>
  <div class="top-right">
    <span>Notes</span>
    <div class="calendar-wrap">
      <button class="calendar-btn" type="button" aria-expanded="false" aria-controls="notes-calendar">Calendar ▾</button>
      <div class="calendar-panel" id="notes-calendar">
        <div class="calendar-title">
          <button class="month-nav previous-month" type="button" aria-label="前月">‹</button>
          <span class="calendar-month" aria-live="polite"></span>
          <button class="month-nav next-month" type="button" aria-label="次月">›</button>
        </div>
        <div class="cal-grid calendar-weekdays" aria-hidden="true">
          <span class="dow">M</span><span class="dow">T</span><span class="dow">W</span><span class="dow">T</span><span class="dow">F</span><span class="dow">S</span><span class="dow">S</span>
        </div>
        <div class="cal-grid calendar-days"></div>
        <div class="day-entries hidden">
          <p class="day-entries-title"></p>
          <div class="day-entries-list"></div>
        </div>
      </div>
    </div>
  </div>
</header>

<main class="content">
  <h1 class="page-title">Notes</h1>
  <p class="intro">
    学習記録、日々の雑記、あとで残しておきたいこと。<br>
    そのとき書いておきたいものを、ここに置いていきます。
  </p>

  <div class="tag-filter" aria-label="記事のタグ絞り込み">
    <button class="active" type="button" data-filter="all" aria-pressed="true">すべて</button>
    <button type="button" data-filter="雑記" aria-pressed="false">雑記</button>
    <button type="button" data-filter="学習" aria-pressed="false">学習</button>
    <button type="button" data-filter="メモ" aria-pressed="false">メモ</button>
    <button type="button" data-filter="考えごと" aria-pressed="false">考えごと</button>
  </div>

  <div class="cloud-list">
${cards}
  </div>
</main>

<footer class="footer">sakurak02 · a project by K企画</footer>
</div>

<script>
const calendarData=${calendarData};
const calendarButton=document.querySelector('.calendar-btn');
const calendarPanel=document.querySelector('.calendar-panel');
const calendarMonth=document.querySelector('.calendar-month');
const calendarDays=document.querySelector('.calendar-days');
const previousMonthButton=document.querySelector('.previous-month');
const nextMonthButton=document.querySelector('.next-month');
const dayEntries=document.querySelector('.day-entries');
const dayEntriesTitle=document.querySelector('.day-entries-title');
const dayEntriesList=document.querySelector('.day-entries-list');
const monthNames=['January','February','March','April','May','June','July','August','September','October','November','December'];
let displayedYear=calendarData.initialYear;
let displayedMonth=calendarData.initialMonth;
let selectedDate='';

function dateKey(year,month,day){
  return year+'-'+String(month+1).padStart(2,'0')+'-'+String(day).padStart(2,'0');
}

function closeDayEntries(){
  selectedDate='';
  dayEntries.classList.add('hidden');
  dayEntriesTitle.textContent='';
  dayEntriesList.replaceChildren();
  calendarDays.querySelectorAll('button.day').forEach(day=>day.setAttribute('aria-expanded','false'));
}

function showDayEntries(key,day,articles,button){
  if(selectedDate===key){
    closeDayEntries();
    return;
  }

  closeDayEntries();
  selectedDate=key;
  button.setAttribute('aria-expanded','true');
  dayEntriesTitle.textContent=monthNames[displayedMonth]+' '+day;
  articles.forEach(article=>{
    const link=document.createElement('a');
    link.href=article.href;
    link.textContent=article.title;
    dayEntriesList.append(link);
  });
  dayEntries.classList.remove('hidden');
}

function renderCalendar(){
  closeDayEntries();
  calendarMonth.textContent=monthNames[displayedMonth]+' '+displayedYear;
  calendarDays.replaceChildren();

  const firstWeekday=(new Date(Date.UTC(displayedYear,displayedMonth,1)).getUTCDay()+6)%7;
  const daysInMonth=new Date(Date.UTC(displayedYear,displayedMonth+1,0)).getUTCDate();

  for(let index=0;index<firstWeekday;index+=1){
    const empty=document.createElement('span');
    empty.className='day empty';
    calendarDays.append(empty);
  }

  for(let day=1;day<=daysInMonth;day+=1){
    const key=dateKey(displayedYear,displayedMonth,day);
    const articles=calendarData.articlesByDate[key]||[];
    let dayElement;

    if(articles.length===1){
      dayElement=document.createElement('a');
      dayElement.href=articles[0].href;
      dayElement.className='day marked';
      dayElement.setAttribute('aria-label',monthNames[displayedMonth]+' '+day+', '+displayedYear+': '+articles[0].title);
    }else if(articles.length>1){
      dayElement=document.createElement('button');
      dayElement.type='button';
      dayElement.className='day marked';
      dayElement.setAttribute('aria-label',monthNames[displayedMonth]+' '+day+', '+displayedYear+': '+articles.length+'件の記事');
      dayElement.setAttribute('aria-expanded','false');
      dayElement.addEventListener('click',()=>showDayEntries(key,day,articles,dayElement));
    }else{
      dayElement=document.createElement('span');
      dayElement.className='day';
      dayElement.setAttribute('aria-hidden','true');
    }

    dayElement.textContent=day;
    calendarDays.append(dayElement);
  }
}

calendarButton.addEventListener('click',()=>{
  const open=calendarPanel.classList.toggle('open');
  calendarButton.textContent=open?'Calendar ▴':'Calendar ▾';
  calendarButton.setAttribute('aria-expanded',String(open));
});

previousMonthButton.addEventListener('click',()=>{
  displayedMonth-=1;
  if(displayedMonth<0){displayedMonth=11;displayedYear-=1;}
  renderCalendar();
});

nextMonthButton.addEventListener('click',()=>{
  displayedMonth+=1;
  if(displayedMonth>11){displayedMonth=0;displayedYear+=1;}
  renderCalendar();
});

renderCalendar();

const buttons=document.querySelectorAll('.tag-filter button');
const cards=document.querySelectorAll('.cloud-card');

buttons.forEach(button=>{
  button.addEventListener('click',()=>{
    buttons.forEach(item=>{
      item.classList.remove('active');
      item.setAttribute('aria-pressed','false');
    });
    button.classList.add('active');
    button.setAttribute('aria-pressed','true');
    const filter=button.dataset.filter;
    cards.forEach(card=>{
      card.classList.toggle('hidden',filter!=='all'&&card.dataset.tag!==filter);
    });
  });
});
</script>
</body>
</html>
`;
}

async function buildNotes() {
  const directoryEntries = await readdir(entriesDirectory, { withFileTypes: true });
  const markdownFiles = directoryEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();

  if (markdownFiles.length === 0) {
    throw new Error(`No Markdown entries found in ${path.relative(projectRoot, entriesDirectory)}`);
  }

  const entries = [];

  for (const fileName of markdownFiles) {
    if (!entryFilePattern.test(fileName)) {
      throw new Error(`${fileName}: filename must use YYYYMMDD-001.md`);
    }

    const source = await readFile(path.join(entriesDirectory, fileName), "utf8");
    const entry = parseEntry(source, fileName);
    entries.push(entry);
  }

  const sortedEntries = sortEntries(entries);

  for (const entry of sortedEntries) {
    const outputDirectory = path.join(postsDirectory, entry.slug);
    const outputFile = path.join(outputDirectory, "index.html");

    await mkdir(outputDirectory, { recursive: true });
    await writeFile(outputFile, renderPost(entry), "utf8");
    console.log(`Generated notes/posts/${entry.slug}/index.html`);
  }

  await writeFile(notesIndexFile, renderNotesIndex(sortedEntries), "utf8");
  console.log("Generated notes/index.html");

  console.log(`Built ${markdownFiles.length} note${markdownFiles.length === 1 ? "" : "s"}.`);
}

export { buildCalendarData, buildNotes, parseEntry, renderMarkdown, renderNotesIndex, renderPost, sortEntries };

if (process.argv[1] && path.resolve(process.argv[1]) === scriptFile) {
  buildNotes().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
