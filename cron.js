const cron = require('node-cron');
const { exec } = require('child_process');

console.log('Automated scraper scheduler started...');

// Run every day at 8:00 AM (0 8 * * *)
cron.schedule('0 8 * * *', () => {
  console.log('Running daily Rabota.md scraper...');
  
  exec('node scraper-rabota.js', (error, stdout, stderr) => {
    if (error) {
      console.error(`Scraper error: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`Scraper stderr: ${stderr}`);
      return;
    }
    console.log(`Scraper output:\n${stdout}`);
  });
});