// scrape.js
// Pulls job-notification RSS feeds, keeps only bank-related postings,
// pulls out last date / vacancy count where possible, and writes
// public/jobs.json for the site to read.
//
// Run manually:   cd scraper && npm install && node scrape.js
// Run daily:      handled by .github/workflows/scrape.yml (GitHub Actions)

const fs = require('fs');
const path = require('path');
const Parser = require('rss-parser');
const sources = require('./sources.config');

const parser = new Parser({ timeout: 15000 });

// Keywords used to decide "is this a bank job". Add more as you notice
// misses (e.g. specific bank names, "RRB" for regional rural banks, etc.)
const BANK_KEYWORDS = [
  'bank', 'ibps', 'sbi', 'rbi', 'nabard', 'idbi', 'pnb', 'canara',
  'union bank', 'bank of baroda', 'bob ', 'sidbi', 'rrb', 'nabfins',
  'co-operative bank', 'cooperative bank', 'grameen bank', 'sbo ',
  'specialist officer', 'bank clerk', 'bank po', 'nicl', 'lic ',
];

function isBankJob(text) {
  const t = text.toLowerCase();
  return BANK_KEYWORDS.some((k) => t.includes(k));
}

// --- Alias maps for dedup ---
// Different sources phrase the same bank/post differently ("SBI" vs "State
// Bank of India", "PO" vs "Probationary Officer"). Plain word-overlap dedup
// misses these since the words don't literally match. These maps normalize
// both sides to the same canonical tag before comparing.
// Add more entries here whenever you spot a duplicate slipping through.
const BANK_ALIASES = {
  sbi: ['sbi', 'state bank of india'],
  ibps: ['ibps', 'institute of banking personnel selection'],
  iob: ['iob', 'indian overseas bank'],
  pnb: ['pnb', 'punjab national bank'],
  bob: ['bank of baroda', 'bob'],
  canara: ['canara bank', 'canara'],
  union: ['union bank of india', 'union bank'],
  idbi: ['idbi bank', 'idbi'],
  rbi: ['reserve bank of india', 'rbi'],
  nabard: ['nabard', 'national bank for agriculture'],
  central_bank: ['central bank of india'],
  indian_bank: ['indian bank'],
  uco: ['uco bank', 'uco'],
  boi: ['bank of india'],
  bom: ['bank of maharashtra'],
  psb: ['punjab and sind bank'],
  federal: ['federal bank'],
  south_indian: ['south indian bank'],
  karur_vysya: ['karur vysya bank'],
  nicl: ['nicl', 'national insurance'],
  sidbi: ['sidbi'],
};

const POST_TYPE_ALIASES = {
  po: ['probationary officer', ' po ', ' po-', '-po', 'po online', 'po recruitment'],
  so: ['specialist officer', ' so ', ' so-', '-so'],
  clerk: ['clerk', 'junior associate'],
  apprentice: ['apprentice'],
  je: ['junior engineer', ' je '],
  lbo: ['local bank officer', ' lbo '],
  security_manager: ['security manager'],
  jaiib: ['jaiib'],
  office_assistant: ['office assistant'],
};

function canonicalTag(text, aliasMap, fallback) {
  const padded = ` ${text.toLowerCase()} `;
  for (const [tag, variants] of Object.entries(aliasMap)) {
    if (variants.some((v) => padded.includes(v))) return tag;
  }
  return fallback;
}

function extractLastDate(text) {
  // "Last Date : 10/08/2026" or "Last Date: 26 July 2026"
  let m = text.match(/last date[^:0-9a-z]*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
  if (m) return m[1];
  m = text.match(/last date[^:0-9a-z]*[:\-]?\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
  if (m) return m[1];
  return null;
}

function extractVacancies(text) {
  const m = text.match(/(\d{1,6})\s*(?:posts?|vacanc(?:y|ies))/i);
  return m ? m[1] : null;
}

function detectBankName(text) {
  const lower = text.toLowerCase();
  const found = BANK_KEYWORDS.find((k) => lower.includes(k) && k.trim().length > 2);
  if (!found) return 'Bank';
  // Title-case the matched keyword for display, e.g. "sbi" -> "SBI"
  return found.toUpperCase().trim();
}

function teluguSummary({ bankName, title, vacancies, lastDate }) {
  let s = `${bankName} బ్యాంక్ సంబంధిత పోస్టుకు నోటిఫికేషన్ విడుదలైంది (${title}).`;
  if (vacancies) s += ` మొత్తం ${vacancies} ఖాళీలు ఉన్నాయి.`;
  if (lastDate) s += ` దరఖాస్తుకు చివరి తేదీ: ${lastDate}.`;
  s += ' పూర్తి వివరాల కోసం అధికారిక నోటిఫికేషన్ చూడండి.';
  return s;
}

// Domains that are almost certainly the *official* source (govt/bank sites),
// as opposed to the aggregator blog itself. Add more as you notice misses.
const OFFICIAL_DOMAIN_HINTS = [
  '.gov.in', '.nic.in', 'ibps.in', 'sbi.co.in', 'rbi.org.in', 'nabard.org',
  'idbibank.in', 'pnbindia.in', 'canarabank.com', 'unionbankofindia.co.in',
  'bankofbaroda.in', 'iob.in', 'centralbankofindia.co.in', 'ucobank.com',
  'bankofindia.co.in', 'bankofmaharashtra.in', 'psbindia.in', 'federalbank.co.in',
  'southindianbank.com', 'kvb.co.in', 'sidbi.in',
];
// Words in the anchor text itself that suggest "this is the apply/official link"
const APPLY_TEXT_HINTS = ['apply', 'official website', 'official notification', 'notification pdf', 'download notification'];

// Best-effort: pull an official/apply link out of the article's HTML body.
// RSS "link" always points at the aggregator's own article page — this looks
// *inside* that article for an outbound link to the real bank/govt site.
// Not guaranteed to find one; falls back to the article link itself.
function extractOfficialLink(item, articleHostname) {
  const html = item.content || item['content:encoded'] || '';
  if (!html) return { url: item.link, isDirect: false };

  const anchors = [...html.matchAll(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis)];
  let best = null;
  let bestScore = 0;

  for (const [, href, innerHtml] of anchors) {
    if (!/^https?:\/\//i.test(href)) continue;
    let hostname;
    try { hostname = new URL(href).hostname; } catch { continue; }
    if (hostname.includes(articleHostname)) continue; // skip links back to the same blog

    const text = innerHtml.replace(/<[^>]+>/g, ' ').toLowerCase();
    let score = 0;
    if (OFFICIAL_DOMAIN_HINTS.some((d) => hostname.includes(d))) score += 3;
    if (APPLY_TEXT_HINTS.some((t) => text.includes(t))) score += 2;
    if (score > bestScore) { bestScore = score; best = href; }
  }

  return best ? { url: best, isDirect: true } : { url: item.link, isDirect: false };
}

async function scrapeSource(source) {
  try {
    const feed = await parser.parseURL(source.url);
    const articleHostname = new URL(source.url).hostname;
    const jobs = [];
    for (const item of feed.items || []) {
      const title = (item.title || '').trim();
      const summary = (item.contentSnippet || item.content || '').trim();
      const combined = `${title} ${summary}`;
      if (!title || !item.link) continue;
      if (!isBankJob(combined)) continue;

      const lastDate = extractLastDate(combined);
      const vacancies = extractVacancies(combined);
      const bankName = detectBankName(combined);
      const { url: applyLink, isDirect } = extractOfficialLink(item, articleHostname);

      jobs.push({
        title,
        link: item.link,
        applyLink,
        isDirectLink: isDirect,
        source: source.name,
        publishedAt: item.isoDate || item.pubDate || null,
        lastDate,
        vacancies,
        englishSummary: summary || title,
        teluguSummary: teluguSummary({ bankName, title, vacancies, lastDate }),
        scrapedAt: new Date().toISOString(),
      });
    }
    return jobs;
  } catch (err) {
    console.error(`[skip] ${source.name} (${source.url}): ${err.message}`);
    return [];
  }
}

// Words that don't help tell two job posts apart — stripped before comparing.
const STOPWORDS = new Set([
  'online', 'form', 'recruitment', 'notification', 'apply', 'out', 'the',
  'for', 'a', 'an', 'of', 'and', 'in', 'to', 'new', 'latest', 'post', 'posts',
  'vacancy', 'vacancies', 'exam', 'jobs', 'job', 'update', 'released', 'date',
  'extend', 'extended', 'reopen', 'application', 'applications',
]);

function tokenSet(title) {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w && !STOPWORDS.has(w) && !/^\d{4}$/.test(w)) // also drop bare years like "2026"
  );
}

function jaccard(setA, setB) {
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

// De-dupe strategy (two layers, since one source says "SBI PO" and another
// says "State Bank of India Probationary Officer" — same job, zero shared
// words):
//   1. PRIMARY: same canonical bank tag + same canonical post-type tag
//      (via the alias maps above) => same job, regardless of phrasing.
//   2. FALLBACK: if either side has no recognized post-type tag, fall back
//      to same bank + word-overlap on the remaining title text, so unusual
//      post names still get a chance at matching.
// Keeps whichever version of a duplicate has more filled-in fields
// (lastDate/vacancies present beats one missing them).
function dedupeJobs(jobs) {
  const kept = [];
  for (const job of jobs) {
    const bankTag = canonicalTag(job.title, BANK_ALIASES, detectBankName(job.title));
    const postTag = canonicalTag(job.title, POST_TYPE_ALIASES, null);
    const tokens = tokenSet(job.title);

    let matchIdx = -1;
    for (let i = 0; i < kept.length; i++) {
      const other = kept[i];
      if (other._bankTag !== bankTag) continue;

      if (postTag && other._postTag) {
        if (postTag === other._postTag) { matchIdx = i; break; }
        continue; // same bank, different recognized post type -> not a duplicate
      }
      // fallback: word overlap
      if (jaccard(tokens, other._tokens) >= 0.5) { matchIdx = i; break; }
    }

    const enriched = { ...job, _tokens: tokens, _bankTag: bankTag, _postTag: postTag };
    if (matchIdx === -1) {
      kept.push(enriched);
    } else {
      const existing = kept[matchIdx];
      const existingScore = (existing.lastDate ? 1 : 0) + (existing.vacancies ? 1 : 0);
      const newScore = (job.lastDate ? 1 : 0) + (job.vacancies ? 1 : 0);
      if (newScore > existingScore) kept[matchIdx] = enriched;
    }
  }
  return kept.map(({ _tokens, _bankTag, _postTag, ...rest }) => rest);
}

async function main() {
  let allJobs = [];
  for (const source of sources) {
    const jobs = await scrapeSource(source);
    console.log(`${source.name}: ${jobs.length} bank job(s) found`);
    allJobs = allJobs.concat(jobs);
  }

  const deduped = dedupeJobs(allJobs);

  // Newest first
  deduped.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));

  const outDir = path.join(__dirname, '..', 'public');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'jobs.json');

  fs.writeFileSync(
    outPath,
    JSON.stringify({ updatedAt: new Date().toISOString(), count: deduped.length, jobs: deduped }, null, 2)
  );
  console.log(`\nSaved ${deduped.length} bank jobs -> ${outPath}`);
}

main();
