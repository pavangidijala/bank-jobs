// scraper/scrape.js
const fs = require("fs");
const path = require("path");
const { XMLParser } = require("fast-xml-parser");

const OUTPUT_PATH = path.join(__dirname, "..", "public", "jobs.json");

const SOURCES = [
  { name: "Govt Jobs Diary", url: "https://www.govtjobsdiary.com/feed/" },
  { name: "Govt Jobs Blog", url: "https://www.govtjobsblog.com/feed/" },
  { name: "Sarkari Naukri Blog", url: "https://sarkarinaukriblog.com/feed/" },
  { name: "India Sarkari Naukri", url: "https://www.indiasarkarinaukri.com/feed/" },
  { name: "Career Power Blog", url: "https://www.careerpower.in/blog/feed/" },
];

const BANK_KEYWORDS = [
  "bank", "rbi", "sbi", "ibps", "nabard", "sidbi",
  "cooperative bank", "gramin bank",
];

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/rss+xml, application/xml, text/xml, */*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  processEntities: true,
  htmlEntities: true,
  allowBooleanAttributes: true,
  parseTagValue: true,
  trimValues: true,
});

async function fetchText(url) {
  const res = await fetch(url, { headers: HEADERS, redirect: "follow" });
  if (!res.ok) throw new Error(`Status code ${res.status}`);
  return res.text();
}

function sanitizeXml(xml) {
  return xml
    .replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;)/g, "&amp;")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

function regexFallbackParse(xml) {
  const items = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/g) || [];
  for (const block of itemBlocks) {
    const title = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
    const link = (block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || "";
    const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "";
    items.push({ title: cleanText(title), link: cleanText(link), pubDate: cleanText(pubDate) });
  }
  return items;
}

function cleanText(str) {
  return str.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim();
}

function isBankJob(title) {
  const lower = title.toLowerCase();
  return BANK_KEYWORDS.some((kw) => lower.includes(kw));
}

async function scrapeSource(source) {
  const jobs = [];
  try {
    const raw = await fetchText(source.url);
    let items = [];

    try {
      const clean = sanitizeXml(raw);
      const parsed = parser.parse(clean);
      const rssItems = parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? [];
      items = Array.isArray(rssItems) ? rssItems : [rssItems];
      items = items.map((it) => ({
        title: cleanText(String(it.title?.["#text"] ?? it.title ?? "")),
        link: cleanText(String(it.link?.["@_href"] ?? it.link?.["#text"] ?? it.link ?? "")),
        pubDate: cleanText(String(it.pubDate ?? it.published ?? it.updated ?? "")),
      }));
    } catch (parseErr) {
      items = regexFallbackParse(raw);
    }

    for (const item of items) {
      if (!item.title || !item.link) continue;
      if (!isBankJob(item.title)) continue;

      const postedDate = item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString();

      jobs.push({
        title: item.title,
        link: item.link,
        source: source.name,
        postedDate,
        type: item.link.includes(source.url.split("/")[2]) ? "VIEW_DETAILS" : "APPLY",
      });
    }

    console.log(`${source.name}: ${jobs.length} bank job(s) found`);
  } catch (err) {
    console.log(`[skip] ${source.name} (${source.url}): ${err.message}`);
  }
  return jobs;
}

function dedupe(jobs) {
  const seen = new Set();
  const result = [];
  for (const job of jobs) {
    const key = job.link.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(job);
  }
  return result;
}

function loadExistingJobs() {
  try {
    const raw = fs.readFileSync(OUTPUT_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function main() {
  const allNew = [];
  for (const source of SOURCES) {
    const jobs = await scrapeSource(source);
    allNew.push(...jobs);
  }

  const existing = loadExistingJobs();
  const merged = dedupe([...allNew, ...existing]).sort(
    (a, b) => new Date(b.postedDate) - new Date(a.postedDate)
  );

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(merged, null, 2));

  console.log(`Saved ${merged.length} total bank jobs (${allNew.length} found this run) -> ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("Scraper failed:", err);
  process.exit(1);
});
