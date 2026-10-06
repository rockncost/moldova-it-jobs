const axios = require('axios');
const db = require('./db');
const { extractDetails, safeJobLink } = require('./lib/job-extractor');
const { runAnalysisPipeline } = require('./pipeline-analyze');

async function enrichJobs({ force = false, limit = 300, delay = 350, database = db } = {}) {
  const pending = database.prepare(`SELECT * FROM jobs ${force ? '' : "WHERE description IS NULL OR description_quality <> 'verified' OR detail_checked_at < datetime('now', '-7 days')"} ORDER BY description IS NULL DESC, scraped_at DESC LIMIT ?`).all(limit);
  const update = database.prepare(`UPDATE jobs SET description = @description,
    raw_description = COALESCE(raw_description, description), description_quality = 'verified',
    company = CASE WHEN @company <> 'N/A' THEN @company ELSE company END,
    title = CASE WHEN @title <> '' THEN @title ELSE title END,
    location = @location, work_mode = @work_mode, schedule = @schedule, salary = @salary,
    source_metadata = @metadata, detail_checked_at = @now, detail_error = NULL, availability = 'open',
    analysis_version = 0 WHERE id = @id`);
  const fail = database.prepare('UPDATE jobs SET detail_error = ?, availability = CASE WHEN ? THEN \'closed\' ELSE availability END, analysis_version = 0 WHERE id = ?');
  let enriched = 0;
  for (const job of pending) {
    try {
      if (!safeJobLink(job.link, job.source)) throw new Error('Invalid source URL');
      const { data } = await axios.get(job.link, { timeout: 15000, maxContentLength: 5_000_000,
        headers: { 'User-Agent': 'MoldovaEntryJobs/1.0', 'Accept-Language': 'ro,en;q=0.8' } });
      const details = extractDetails(data, job.source);
      update.run({ ...details, metadata: JSON.stringify(details.metadata), id: job.id, now: new Date().toISOString() });
      enriched++;
    } catch (error) {
      fail.run(error.message.slice(0,300), [404,410].includes(error.response?.status) ? 1 : 0, job.id);
      console.error(`[${job.source}] #${job.id}: ${error.message}`);
    }
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    if ((enriched % 20 === 0 && enriched) || enriched === pending.length) console.log(`Verified ${enriched}/${pending.length} vacancy pages.`);
  }
  runAnalysisPipeline(database, { onlyPending: true });
  console.log(`Detail refresh: ${enriched}/${pending.length} verified.`);
  return { enriched, attempted: pending.length };
}

if (require.main === module) enrichJobs({ force: process.argv.includes('--force') }).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { enrichJobs };
