// List of RSS feeds to pull job notifications from.
// These are general govt-job blogs — the scraper filters out
// everything that isn't bank-related (see BANK_KEYWORDS in scrape.js).
//
// Verified reachable as of setup (returns application/rss+xml):
//   - govtjobsdiary.com
// The rest are well-known WordPress job blogs likely to expose the same
// /feed/ path — test each after first run (see README "Testing sources").
// Add/remove freely; a bad feed just gets skipped with a console warning.

module.exports = [
  { name: 'Govt Jobs Diary', url: 'https://www.govtjobsdiary.com/feed/' },
  { name: 'Govt Jobs Blog', url: 'https://www.govtjobsblog.in/feed/' },
  { name: 'Sarkari Naukri Blog', url: 'https://www.sarkarinaukriblog.com/feed/' },
  { name: 'India Sarkari Naukri', url: 'https://www.indiasarkarinaukri.com/feed/' },
  { name: 'Career Power Blog', url: 'https://www.careerpower.in/blog/feed/' },
];
