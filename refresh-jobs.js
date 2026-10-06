const { scrapeSource, SOURCES } = require('./lib/scrape-source');
const { enrichJobs } = require('./enrich-jobs');
const { runAnalysisPipeline } = require('./pipeline-analyze');

let running = false;
async function refreshJobs({ pages = 5 } = {}) {
  if (running) return;
  running = true;
  try {
    const results = [];
    for (const source of Object.keys(SOURCES)) results.push(await scrapeSource(source, { pages }));
    // Every source gets a chance; a failed source doesn't cancel analysis.
    await enrichJobs();
    runAnalysisPipeline(undefined, { onlyPending: true });
    console.log('Refresh complete:', results);
    if (results.every(r => r.failedPages)) throw new Error('All listing sources failed. Existing jobs were preserved.');
    return results;
  } finally { running = false; }
}
if (require.main === module) {
  const pages = Number(process.argv.find(a => a.startsWith('--pages='))?.split('=')[1] || 5);
  refreshJobs({ pages: Math.min(10, Math.max(1, pages || 5)) }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { refreshJobs };
