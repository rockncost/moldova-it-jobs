const express = require('express');
const path = require('node:path');
const db = require('./db');
const { runAnalysisPipeline } = require('./pipeline-analyze');
const { CATEGORIES } = require('./lib/concept-graph');
const { normalize } = require('./lib/text');
const { deduplicate } = require('./lib/deduplicate');
const { REVIEW_REASONS, reviewReasons } = require('./lib/review');
const { refreshStatus } = require('./lib/freshness');

function createApp(database = db) {
  runAnalysisPipeline(database, { onlyPending: true, quiet: true });
  const app = express();
  app.disable('x-powered-by');
  app.use(express.static(path.join(__dirname, 'public')));
  const getActiveJobs = () => deduplicate(database.prepare(`SELECT id,title,company,link,source,category,tags,
    quality_flags,scraped_at,last_seen_at,detail_checked_at,detail_attempted_at,detail_error,entry_fit,fit_score,experience_min,
    payment_status,reasons,location,work_mode,schedule,salary,description,description_quality,
    requirements_text,responsibilities_text,tag_evidence,flag_evidence,category_evidence FROM jobs WHERE status = 'active' ORDER BY fit_score DESC, scraped_at DESC`).all())
    .map(job => ({ ...job, review_reasons: reviewReasons(job) }));

  app.get('/api/jobs', (req, res) => {
    try {
      runAnalysisPipeline(database, { onlyPending: true, quiet: true });
      const param = name => typeof req.query[name] === 'string' ? req.query[name].slice(0,250) : '';
      const fit = param('fit') || 'beginner';
      if (!['beginner', 'stretch', 'review', 'other', 'all'].includes(fit)) return res.status(400).json({ error: 'Unknown fit filter.' });
      const search = normalize(param('search'));
      const category = param('category'), source = param('source'), mode = param('mode');
      const tags = [...new Set((Array.isArray(req.query.tag)?req.query.tag:[req.query.tag]).filter(tag=>typeof tag==='string'&&tag.trim()).map(tag=>tag.slice(0,250)))];
      if(tags.length>30)return res.status(400).json({error:'Too many tag filters.'});
      const review = param('review');
      if (review && !REVIEW_REASONS.some(reason => reason.value === review)) return res.status(400).json({ error: 'Unknown review reason.' });
      const jobs = getActiveJobs().filter(job =>
        (fit === 'all' || job.entry_fit === fit)
        && (!category || job.category === category)
        && tags.every(tag=>job.tags.includes(tag))
        && (!source || job.sources.some(s => s.name === source))
        && (!mode || job.tags.includes(mode))
        && (!review || job.review_reasons.includes(review))
        && (!search || normalize(`${job.title} ${job.company} ${job.description || ''} ${job.tags.join(' ')}`).includes(search)));
      res.set('Cache-Control', 'no-store').json(jobs);
    } catch (error) { console.error(error); res.status(500).json({ error: 'Jobs could not be loaded. Please try again.' }); }
  });

  app.get('/api/filters', (req, res) => {
    try {
      runAnalysisPipeline(database, { onlyPending: true, quiet: true });
      const jobs = getActiveJobs();
      const counts = { beginner: 0, stretch: 0, review: 0, other: 0, all: jobs.length };
      for (const job of jobs) counts[job.entry_fit]++;
      res.set('Cache-Control', 'no-store').json({
        categories: CATEGORIES.map(c => ({ name: c.name, count: jobs.filter(j => j.category === c.name).length })),
        tags: [...new Set(jobs.flatMap(j => j.tags))].sort(), sources: ['Rabota.md', 'Delucru.md', 'Lucru.md'],
        counts, excluded: database.prepare("SELECT count(*) n FROM jobs WHERE status = 'excluded'").get().n,
        reviewReasons: REVIEW_REASONS.map(reason => ({ value: reason.value, label: reason.label,
          count: jobs.filter(job => job.review_reasons.includes(reason.value)).length })),
        lastVerified: database.prepare('SELECT max(detail_checked_at) date FROM jobs').get().date,
      });
    } catch (error) { console.error(error); res.status(500).json({ error: 'Filters could not be loaded.' }); }
  });
  app.get('/api/health', (req, res) => res.json({ status: 'ok', jobs: database.prepare('SELECT count(*) n FROM jobs').get().n }));
  app.get('/api/refresh-status', (req,res) => res.set('Cache-Control','no-store').json({sources:refreshStatus(database)}));
  return app;
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  createApp().listen(port, () => console.log(`Jobs website: http://localhost:${port}`));
}
module.exports = { createApp, deduplicate };
