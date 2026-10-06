const express = require('express');
const path = require('node:path');
const db = require('./db');
const { runAnalysisPipeline } = require('./pipeline-analyze');
const { CATEGORIES } = require('./lib/concept-graph');
const { normalize } = require('./lib/text');
const { safeJobLink } = require('./lib/job-extractor');

function jsonArray(value) { try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }

function deduplicate(jobs) {
  const seen = new Map();
  for (const job of jobs) {
    if (!safeJobLink(job.link, job.source)) continue;
    let title = normalize(job.title).replace(/\([^)]*(?:usd|mdl|eur)[^)]*\)/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (/^(?:internship it|it internship)$/.test(title)) title = 'it internship';
    const company = normalize(job.company).replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/^(?:ics |ocn |o c n )|(?: srl|s r l| sa| s a)$/g, '').trim();
    // Unknown employers remain separate: title alone isn't enough evidence.
    const key = company && company !== 'n a' ? `${title}|${company}|${job.entry_fit}|${job.experience_min ?? ''}` : job.link;
    if (seen.has(key)) {
      seen.get(key).sources.push({ name: job.source, link: job.link });
    } else {
      seen.set(key, { ...job, tags: jsonArray(job.tags), quality_flags: jsonArray(job.quality_flags), reasons: jsonArray(job.reasons), sources: [{ name: job.source, link: job.link }] });
    }
  }
  return [...seen.values()];
}

function createApp(database = db) {
  runAnalysisPipeline(database, { onlyPending: true, quiet: true });
  const app = express();
  app.disable('x-powered-by');
  app.use(express.static(path.join(__dirname, 'public')));
  const getActiveJobs = () => deduplicate(database.prepare(`SELECT id,title,company,link,source,category,tags,
    quality_flags,scraped_at,last_seen_at,detail_checked_at,entry_fit,fit_score,experience_min,
    payment_status,reasons,location,work_mode,schedule,salary,description,description_quality
    FROM jobs WHERE status = 'active' ORDER BY fit_score DESC, scraped_at DESC`).all());

  app.get('/api/jobs', (req, res) => {
    try {
      runAnalysisPipeline(database, { onlyPending: true, quiet: true });
      const param = name => typeof req.query[name] === 'string' ? req.query[name].slice(0,250) : '';
      const fit = param('fit') || 'beginner';
      if (!['beginner', 'stretch', 'review', 'all'].includes(fit)) return res.status(400).json({ error: 'Unknown fit filter.' });
      const search = normalize(param('search'));
      const category = param('category'), tag = param('tag'), source = param('source'), mode = param('mode');
      const jobs = getActiveJobs().filter(job =>
        (fit === 'all' || job.entry_fit === fit)
        && (!category || job.category === category)
        && (!tag || job.tags.includes(tag))
        && (!source || job.sources.some(s => s.name === source))
        && (!mode || job.tags.includes(mode))
        && (!search || normalize(`${job.title} ${job.company} ${job.description || ''} ${job.tags.join(' ')}`).includes(search)));
      res.set('Cache-Control', 'no-store').json(jobs);
    } catch (error) { console.error(error); res.status(500).json({ error: 'Jobs could not be loaded. Please try again.' }); }
  });

  app.get('/api/filters', (req, res) => {
    try {
      runAnalysisPipeline(database, { onlyPending: true, quiet: true });
      const jobs = getActiveJobs();
      const counts = { beginner: 0, stretch: 0, review: 0, all: jobs.length };
      for (const job of jobs) counts[job.entry_fit]++;
      res.set('Cache-Control', 'no-store').json({
        categories: CATEGORIES.map(c => ({ name: c.name, count: jobs.filter(j => j.category === c.name).length })),
        tags: [...new Set(jobs.flatMap(j => j.tags))].sort(), sources: ['Rabota.md', 'Delucru.md', 'Lucru.md'],
        counts, excluded: database.prepare("SELECT count(*) n FROM jobs WHERE status = 'excluded'").get().n,
        lastVerified: database.prepare('SELECT max(detail_checked_at) date FROM jobs').get().date,
      });
    } catch (error) { console.error(error); res.status(500).json({ error: 'Filters could not be loaded.' }); }
  });
  app.get('/api/health', (req, res) => res.json({ status: 'ok', jobs: database.prepare('SELECT count(*) n FROM jobs').get().n }));
  return app;
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  createApp().listen(port, () => console.log(`Jobs website: http://localhost:${port}`));
}
module.exports = { createApp, deduplicate };
