const axios = require('axios');
const cheerio = require('cheerio');
const db = require('./db');

// Helper delay function to avoid overwhelming job boards
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function enrichJobs() {
  const cleanText = (str) => (str ? str.replace(/\s+/g, ' ').trim() : '');

  // Select all jobs that haven't been enriched with full descriptions yet
  const pendingJobs = db.prepare('SELECT id, link, source, company FROM jobs WHERE description IS NULL').all();

  console.log(`Found ${pendingJobs.length} jobs requiring detailed page scraping...\n`);

  const updateJob = db.prepare(`
    UPDATE jobs
    SET description = @description,
        company = CASE WHEN @company <> 'N/A' AND @company <> '' THEN @company ELSE company END
    WHERE id = @id
  `);

  let enrichedCount = 0;

  for (const job of pendingJobs) {
    console.log(`[${job.source}] Fetching details for ID ${job.id}...`);

    try {
      const { data } = await axios.get(job.link, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        timeout: 10000,
      });

      const $ = cheerio.load(data);
      let descriptionText = '';
      let extractedCompany = 'N/A';

      if (job.source === 'Rabota.md') {
        descriptionText = cleanText($('.vacancy-description, .vacancy-body, .preview-card-body').text());
        extractedCompany = cleanText($('.vacancy-sidebar-company-name, a[href*="/company/"]').first().text());
      } else if (job.source === 'Delucru.md') {
        descriptionText = cleanText($('.job-description, .vacancy-description, article, .content').text());
        extractedCompany = cleanText($('.company-name, a[href*="/company/"]').first().text());
      } else if (job.source === 'Lucru.md') {
        descriptionText = cleanText($('.vacancy-content, .job-details, article').text());
        extractedCompany = cleanText($('.company-title, a[href*="/company/"]').first().text());
      }

      // Fallback selector if specific source wrapper yields empty text
      if (!descriptionText || descriptionText.length < 50) {
        descriptionText = cleanText($('body').text());
      }

      updateJob.run({
        id: job.id,
        description: descriptionText,
        company: extractedCompany,
      });

      enrichedCount++;
      console.log(`-> Enriched job ID ${job.id} (${descriptionText.length} characters extracted)`);

      // 1 second pause between HTTP requests
      await sleep(1000);
    } catch (error) {
      console.error(`Failed to enrich job ID ${job.id} (${job.link}): ${error.message}`);
    }
  }

  console.log(`\nDetailed Page Scraping complete! Enriched ${enrichedCount} out of ${pendingJobs.length} jobs.`);
}

enrichJobs();