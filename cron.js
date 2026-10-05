const cron = require('node-cron');
const { exec } = require('child_process');

console.log('Automated scraper scheduler started...');

// Run every day at 8:00 AM (0 8 * * *)
cron.schedule('0 8 * * *', () => {
  console.log('Running daily pipeline: Scrape -> Enrich -> Analyze...');

  exec(
    'node scraper-rabota.js && node scraper-delucru.js && node scraper-lucru.js && node enrich-jobs.js && node pipeline-analyze.js',
    (error, stdout, stderr) => {
      if (error) {
        console.error(`Pipeline error: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`Pipeline stderr: ${stderr}`);
        return;
      }
      console.log(`Pipeline output:\n${stdout}`);
    }
  );
});