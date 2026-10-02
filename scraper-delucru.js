const axios = require('axios');
const cheerio = require('cheerio');
const db = require('./db');

async function scrapeDelucru() {
  const url = 'https://www.delucru.md/jobs/it-software/chisinau';
  const cleanText = (str) => (str ? str.replace(/\s+/g, ' ').trim() : '');

  const insertJob = db.prepare(`
    INSERT OR IGNORE INTO jobs (title, company, link, source, scraped_at)
    VALUES (@title, @company, @link, @source, @scrapedAt)
  `);

  try {
    console.log('Scraping Delucru.md (Chișinău IT)...');

    const { data } = await axios.get(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    const $ = cheerio.load(data);
    const jobs = [];

    // Find all links targeting actual job vacancies
    $('a').each((_, element) => {
      let link = $(element).attr('href');
      let title = cleanText($(element).text());

      if (!link) return;

      // Filter for actual vacancy URLs while ignoring category/navigation links
      const isVacancyLink =
        (link.includes('/vacanc') || link.includes('/job/') || link.includes('/ro/job/')) &&
        !link.includes('/jobs/') &&
        !link.includes('/by-');

      if (isVacancyLink && title.length > 5) {
        if (!link.startsWith('http')) {
          link = `https://www.delucru.md${link}`;
        }

        // Parent container lookup for company name
        const container = $(element).closest('article, div[class*="card"], div[class*="item"], li');
        let company = container
          .find('[class*="company"], a[href*="/company/"]')
          .first()
          .text();
        company = cleanText(company) || 'N/A';

        const entryLevelRegex =
          /junior|intern|trainee|fără experiență|fara experienta|student|stagiere|internship|no experience|support|help desk|asistent|assistant|beginner|entry|0-1|1 year|1 an/i;

        if (entryLevelRegex.test(title)) {
          jobs.push({ title, company, link });
        }
      }
    });

    let newJobsCount = 0;
    for (const job of jobs) {
      const result = insertJob.run({
        title: job.title,
        company: job.company,
        link: job.link,
        source: 'Delucru.md',
        scrapedAt: new Date().toISOString(),
      });

      if (result.changes > 0) {
        newJobsCount++;
      }
    }

    console.log(`Delucru.md scraping complete. Added ${newJobsCount} new entry-level IT jobs to SQLite.`);
  } catch (error) {
    console.error('Failed to scrape Delucru.md:', error.message);
  }
}

scrapeDelucru();