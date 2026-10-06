const axios = require('axios');
const cheerio = require('cheerio');
const db = require('../db');
const { extractListing } = require('./job-extractor');
const { CATEGORIES } = require('./concept-graph');
const { normalize, phrase } = require('./text');

const SOURCES = {
  'Rabota.md': page => page === 1 ? 'https://www.rabota.md/ro/jobs-chisinau-IT' : `https://www.rabota.md/ro/jobs-chisinau-IT/page-${page}`,
  'Delucru.md': page => `https://www.delucru.md/jobs?category=118&region=158&page=${page}`,
  'Lucru.md': page => page === 1 ? 'https://www.lucru.md/ro/lucru-chisinau/category-it' : `https://www.lucru.md/ro/lucru-chisinau/category-it/page-${page}`,
};
const paged = base => page => page===1?base:base.includes('delucru.md')?`${base}${base.includes('?')?'&':'?'}page=${page}`:`${base}/page-${page}`;
const FEEDS = {
  'Rabota.md':[SOURCES['Rabota.md'],paged('https://www.rabota.md/ro/vacancies/category/internship'),paged('https://www.rabota.md/ro/jobs-chisinau-junior')],
  'Lucru.md':[SOURCES['Lucru.md'],paged('https://www.lucru.md/ro/posturi-vacante/categorie/internship'),paged('https://www.lucru.md/ro/lucru-chisinau-junior')],
  'Delucru.md':[SOURCES['Delucru.md'],paged('https://www.delucru.md/jobs/internship-programmes'),paged('https://www.delucru.md/jobs/jobs-where-experience-is-not-required'),paged('https://www.delucru.md/jobs/entry-level')],
};

function isCandidate(title) {
  const text = normalize(title);
  if (phrase('senior|principal|head of|team lead|lead developer|middle').test(text)
    && !phrase('junior|intern|trainee').test(text)) return false;
  // Do not demand "junior" in a title: many real starter roles omit it.
  return CATEGORIES.some(c => c.title.test(text)) || phrase('support|поддержк[а-я]*|suport|operator date').test(text);
}

async function scrapeSource(source, { pages = 5, database = db, request = axios.get, delay = 350, feeds = FEEDS[source] } = {}) {
  const save = database.prepare(`INSERT INTO jobs(title,company,link,source,scraped_at,last_seen_at)
    VALUES(@title,@company,@link,@source,@now,@now)
    ON CONFLICT(link) DO UPDATE SET last_seen_at = excluded.last_seen_at,
      analysis_version = CASE WHEN jobs.title <> excluded.title THEN 0 ELSE jobs.analysis_version END,
      title = excluded.title`);
  let found = 0, failedPages = 0, successfulPages = 0; const errors=[];
  for (const feed of feeds) {
  for (let page = 1; page <= pages; page++) {
    try {
      const { data } = await request(feed(page), { timeout: 15000, maxContentLength: 5_000_000 });
      const listings = extractListing(data, source);
      if (!listings.length) throw new Error('No vacancy cards found; source layout may have changed.');
      const candidates = listings.filter(job => isCandidate(job.title));
      database.transaction(() => {
        for (const job of candidates) save.run({ ...job, now: new Date().toISOString() });
      })();
      found += candidates.length;
      successfulPages++;
      console.log(`${source} page ${page}: ${listings.length} listings, ${candidates.length} candidates.`);
      const $=cheerio.load(data);
      const next=$('a[href]').toArray().some(e=>{try{const url=new URL($(e).attr('href'),feed(page));return url.href===feed(page+1)||url.pathname.endsWith(`/page-${page+1}`)||url.searchParams.get('page')===String(page+1);}catch{return false;}});
      if(!next)break;
      if (page < pages && delay) await new Promise(resolve => setTimeout(resolve, delay));
    } catch (error) {
      failedPages++;
      errors.push(`${feed(page)}: ${error.message}`.slice(0,400));
      console.error(`${source} page ${page}: ${error.message}`);
      break;
    }
  }
  }
  return { source, found, failedPages, successfulPages, errors };
}

module.exports = { scrapeSource, SOURCES, FEEDS, isCandidate };
