# Bank Jobs Notice Board

Fully automated, free bank-job notification site. A daily script pulls job
listings from public RSS feeds, keeps only bank-related ones, generates a
Telugu one-line summary, and the site displays them — no manual work needed
after setup.

**Cost: ₹0** — GitHub (repo + Actions) and Vercel (hosting) are both free for this scale.

## How it works
```
GitHub Actions (daily cron, 8:30 AM IST)
      │
      ▼
scraper/scrape.js  →  reads scraper/sources.config.js RSS feeds
      │                filters for bank jobs, extracts last date/vacancies,
      │                writes Telugu summary
      ▼
public/jobs.json  →  committed back to the repo
      │
      ▼
Vercel auto-redeploys (it watches the repo)  →  site updates itself
```

## One-time setup (15–20 mins)

1. **Create a GitHub repo** (e.g. `bankjobs`) and push this whole folder to it.
   ```
   cd bankjobs
   git init
   git add .
   git commit -m "initial setup"
   git branch -M main
   git remote add origin https://github.com/<your-username>/bankjobs.git
   git push -u origin main
   ```

2. **Allow the workflow to push commits.**
   GitHub repo → Settings → Actions → General → "Workflow permissions" →
   select **Read and write permissions** → Save.
   (Without this, the daily job will scrape fine but fail to commit `jobs.json`.)

3. **Connect Vercel.**
   vercel.com → Add New Project → Import your `bankjobs` GitHub repo →
   Framework preset: **Other** (it's a plain static site, no build step needed) → Deploy.
   From now on, every commit to `main` (including the bot's daily commit) auto-redeploys.

4. **Test the scraper once, manually**, before trusting the daily cron:
   ```
   cd scraper
   npm install
   node scrape.js
   ```
   Check the console output — it'll print how many bank jobs each source found.
   If a source prints `[skip] ... ` with an error, that feed URL is dead or
   moved; remove or fix it in `sources.config.js`. RSS feed paths on these
   blogs occasionally change, so a light monthly check is worth doing.

5. **Trigger the GitHub Action manually** once (Actions tab → "Daily Bank Jobs
   Scrape" → Run workflow) to confirm it commits `public/jobs.json` correctly
   end to end. After that it just runs itself every day.

## Adding/removing sources
Edit `scraper/sources.config.js` — it's just a list of `{ name, url }` RSS
feed objects. Add any WordPress-based job blog's `/feed/` URL and it'll be
picked up automatically (filtered through the same bank-keyword check).

## Tuning what counts as a "bank job"
`BANK_KEYWORDS` at the top of `scraper/scrape.js` controls the filter. Add
specific bank names or terms you notice getting missed.

## Important note on sources
These RSS feeds are third-party job blogs, not official bank/RBI/IBPS feeds
directly — official sites don't expose feeds and block scraping. Always show
"verify on the official notification" language (already in the UI) since
aggregator info can occasionally be stale or wrong.

## Local preview of the site
Just open `index.html` in a browser, or run any static server, e.g.:
```
npx serve .
```
