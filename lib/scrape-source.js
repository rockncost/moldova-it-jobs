const axios = require('axios');
const db = require('../db');
const { extractListing } = require('./job-extractor');
const { CATEGORIES } = require('./concept-graph');
const { normalize, phrase } = require('./text');

const SOURCES = {
  'Rabota.md': page => page === 1 ? 'https://www.rabota.md/ro/jobs-chisinau-IT' : `https://www.rabota.md/ro/jobs-chisinau-IT/page-${page}`,
  'Delucru.md': page => `https://www.delucru.md/jobs?category=118&region=158&page=${page}`,
  'Lucru.md': page => page === 1 ? 'https://www.lucru.md/ro/lucru-chisinau/category-it' : `https://www.lucru.md/ro/lucru-chisinau/category-it/page-${page}`,
};

function isCandidate(title) {
  const text = normalize(title);
  if (phrase('senior|principal|head of|team lead|lead developer|middle').test(text)
    && !phrase('junior|intern|trainee').test(text)) return false;
  // Do not demand "junior" in a title: many real starter roles omit it.
  return CATEGORIES.some(c => c.title.test(text)) || phrase('support|поддержк[а-я]*|suport|operator date').test(text);
}

async function scrapeSource(source, { pages = 5, database = db } = {}) {
  const save = database.prepare(`INSERT INTO jobs(title,company,link,source,scraped_at,last_seen_at)
    VALUES(@title,@company,@link,@source,@now,@now)
    ON CONFLICT(link) DO UPDATE SET last_seen_at = excluded.last_seen_at,
      analysis_version = CASE WHEN jobs.title <> excluded.title OR jobs.availability = 'closed' THEN 0 ELSE jobs.analysis_version END,
      availability = 'open', title = excluded.title`);
  let found = 0, failedPages = 0;
  for (let page = 1; page <= pages; page++) {
    try {
      const { data } = await axios.get(SOURCES[source](page), { timeout: 15000, maxContentLength: 5_000_000 });
      const listings = extractListing(data, source);
      if (!listings.length) throw new Error('No vacancy cards found; source layout may have changed.');
      const candidates = listings.filter(job => isCandidate(job.title));
      database.transaction(() => {
        for (const job of candidates) save.run({ ...job, now: new Date().toISOString() });
      })();
      found += candidates.length;
      console.log(`${source} page ${page}: ${listings.length} listings, ${candidates.length} candidates.`);
      if (page < pages) await new Promise(resolve => setTimeout(resolve, 350));
    } catch (error) {
      failedPages++;
      console.error(`${source} page ${page}: ${error.message}`);
      break;
    }
  }
  return { source, found, failedPages };
}

module.exports = { scrapeSource, SOURCES, isCandidate };
