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
  cdataPropName: "__cdata",
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
    const description =
      (block.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || "";
    const pubDate =
      (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "";
    items.push({
      title: cleanText(title),
      link: cleanText(link),
      description: cleanText(description),
      pubDate: cleanText(pubDate),
    });
  }
  return items;
}

function cleanText(str) {
  return String(str)
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBankJob(title) {
  const lower = title.toLowerCase();
  return BANK_KEYWORDS.some((kw) => lower.includes(kw));
}

function extractLastDate(text) {
  const m = text.match(
    /(?:last date|apply by|closing date)[^0-9]{0,15}(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i
  );
  return m ? m[1] : "";
}

function extractVacancies(text) {
  const m = text.match(/(\d{1,5})\s*(?:vacancies|posts|vacancy|post)/i);
  return m ? m[1] : "";
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
        title: cleanText(it.title?.__cdata ?? it.title?.["#text"] ?? it.title ?? ""),
        link: cleanText(it.link?.["@_href"] ?? it.link?.["#text"] ?? it.link ?? ""),
        description: cleanText(
          it.description?.__cdata ??
            it["content:encoded"]?.__cdata ??
            it.description ??
            ""
        ),
        pubDate: cleanText(it.pubDate ?? it.published ?? it.updated ?? ""),
      }));
    } catch (parseErr) {
      items = regexFallbackParse(raw);
    }

    for (const item of items) {
      if (!item.title || !item.link) continue;
      if (!isBankJob(item.title)) continue;

      const combinedText = `${item.title} ${item.description}`;
      const domain = source.url.split("/")[2] || "";
      const isDirectLink = !item.link.includes(domain);

      jobs.push({
        title: item.title,
        teluguSummary: "",
        lastDate: extractLastDate(combinedText),
        vacancies: extractVacancies(combinedText),
        source: source.name,
        applyLink: item.link,
        link: item.link,
        isDirectLink,
        pubDate: item.pubDate,
      });
    }

    console.log(`${source.name}: ${jobs.length} bank job(s) found`);
  } catch (err) {
    console.log(`[skip] ${source.name} (${source.url}): ${err.message}`);
  }
  return jobs;
}

function loadExisting() {
  try {
    const raw = fs.readFileSync(OUTPUT_PATH, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data.jobs) ? data.jobs : [];
  } catch {
    return [];
  }
}

async function main() {
  const scraped = [];
  for (const source of SOURCES) {
    const jobs = await scrapeSource(source);
    scraped.push(...jobs);
  }

  const existing = loadExisting();
  const existingByLink = new Map(existing.map((j) => [j.link.trim().toLowerCase(), j]));

  const nowIso = new Date().toISOString();
  const merged = [];
  const seen = new Set();

  for (const job of scraped) {
    const key = job.link.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const prev = existingByLink.get(key);
    merged.push({
      ...job,
      postedDate: prev?.postedDate || nowIso,
    });
  }

  for (const job of existing) {
    const key = job.link.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(job);
  }

  merged.sort((a, b) => new Date(b.postedDate) - new Date(a.postedDate));

  const output = {
    updatedAt: nowIso,
    count: merged.length,
    jobs: merged,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

  console.log(
    `Saved ${merged.length} total bank jobs (${scraped.length} found this run) -> ${OUTPUT_PATH}`
  );
}

main().catch((err) => {
  console.error("Scraper failed:", err);
  process.exit(1);
});
