const axios = require('axios');
const cheerio = require('cheerio');
const db = require('./db');

async function scrapeRabota() {
  const cleanText = (str) => (str ? str.replace(/\s+/g, ' ').trim() : '');

  const insertJob = db.prepare(`
    INSERT OR IGNORE INTO jobs (title, company, link, source, scraped_at)
    VALUES (@title, @company, @link, @source, @scrapedAt)
  `);

  let totalNewJobs = 0;
  const totalPagesToScrape = 5;

  for (let page = 1; page <= totalPagesToScrape; page++) {
    const url = `https://www.rabota.md/ro/jobs-chisinau-IT/page-${page}`;
    console.log(`Scraping page ${page} of Rabota.md...`);

    try {
      const { data } = await axios.get(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      });

      const $ = cheerio.load(data);
      let pageNewJobs = 0;

      $('.vacancyCardItem, .previewCard, div[class*="vacancyCard"]').each((_, element) => {
        const titleLink = $(element).find('a.vacancyShowPopup, a[href*="/locuri-de-munca/"]').first();
        const title = titleLink.text().trim();
        let link = titleLink.attr('href');

        if (link && !link.startsWith('http')) {
          link = `https://www.rabota.md${link}`;
        }

        let company = $(element)
          .find('a[href*="/company/"], .preview-card-company, .company')
          .first()
          .text();
        company = cleanText(company) || 'N/A';

        const entryLevelRegex =
          /junior|intern|trainee|fără experiență|fara experienta|student|stagiere|internship|no experience|support|help desk|asistent|assistant|beginner|entry|0-1|1 year|1 an/i;

        if (title && entryLevelRegex.test(title)) {
          const result = insertJob.run({
            title,
            company,
            link,
            source: 'Rabota.md',
            scrapedAt: new Date().toISOString(),
          });

          if (result.changes > 0) {
            totalNewJobs++;
            pageNewJobs++;
          }
        }
      });

      console.log(`Page ${page}: Found and inserted ${pageNewJobs} new matching jobs.`);
    } catch (error) {
      console.error(`Error scraping page ${page}:`, error.message);
      break;
    }
  }

  console.log(`\nScraping complete! Added ${totalNewJobs} new entry-level IT jobs across ${totalPagesToScrape} pages to SQLite.`);
}

scrapeRabota();