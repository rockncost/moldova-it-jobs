const axios = require('axios');
const cheerio = require('cheerio');

async function testScraper() {
  try {
    // Example target URL (Replace with a public Moldovan job board search page)
    const url = 'https://example-job-site.md/jobs/chisinau/it';
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    const jobs = [];

    // Select job card containers (CSS selector depends on target site structure)
    $('.job-card').each((index, element) => {
      const title = $(element).find('.job-title').text().trim();
      const company = $(element).find('.company-name').text().trim();
      const link = $(element).find('a').attr('href');

      // Filter for Junior / Intern / Entry-level titles
      const isEntryLevel = /junior|intern|trainee|no experience|student/i.test(title);

      if (isEntryLevel) {
        jobs.push({ title, company, link });
      }
    });

    console.log('Filtered Entry-Level IT Jobs:', jobs);
  } catch (error) {
    console.error('Error scraping jobs:', error.message);
  }
}

testScraper();