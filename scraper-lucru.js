const axios = require('axios');
const cheerio = require('cheerio');
const db = require('./db');

async function scrapeLucru() {
  const cleanText = (str) => (str ? str.replace(/\s+/g, ' ').trim() : '');

  const insertJob = db.prepare(`
    INSERT OR IGNORE INTO jobs (title, company, link, source, scraped_at)
    VALUES (@title, @company, @link, @source, @scrapedAt)
  `);

  let totalNewJobs = 0;
  const totalPagesToScrape = 5;

  for (let page = 1; page <= totalPagesToScrape; page++) {
    // Lucru's /page-N path routing structure
    const url =
      page === 1
        ? 'https://www.lucru.md/ro/lucru-chisinau/category-it'
        : `https://www.lucru.md/ro/lucru-chisinau/category-it/page-${page}`;

    console.log(`Scraping page ${page} of Lucru.md...`);

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

      $('a').each((_, element) => {
        let link = $(element).attr('href');
        let title = cleanText($(element).text());

        if (!link) return;

        const isVacancyLink =
          link.includes('/ro/lucru/') &&
          !link.includes('/category-') &&
          !link.includes('/lucru-chisinau');

        if (isVacancyLink && title.length > 3) {
          if (!link.startsWith('http')) {
            link = `https://www.lucru.md${link}`;
          }

          const entryLevelRegex =
            /junior|intern|trainee|fără experiență|fara experienta|student|stagiere|internship|no experience|support|help desk|asistent|assistant|beginner|entry|0-1|1 year|1 an/i;

          if (entryLevelRegex.test(title)) {
            const result = insertJob.run({
              title,
              company: 'N/A',
              link,
              source: 'Lucru.md',
              scrapedAt: new Date().toISOString(),
            });

            if (result.changes > 0) {
              totalNewJobs++;
              pageNewJobs++;
            }
          }
        }
      });

      console.log(`Page ${page}: Found and inserted ${pageNewJobs} new matching jobs.`);
    } catch (error) {
      console.error(`Error scraping page ${page} of Lucru.md:`, error.message);
      break;
    }
  }

  console.log(`\nLucru.md scraping complete! Added ${totalNewJobs} new entry-level IT jobs across ${totalPagesToScrape} pages to SQLite.`);
}

scrapeLucru();