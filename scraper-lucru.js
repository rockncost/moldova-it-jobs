const { scrapeSource } = require('./lib/scrape-source');
if (require.main === module) scrapeSource('Lucru.md').catch(error => { console.error(error); process.exitCode = 1; });
