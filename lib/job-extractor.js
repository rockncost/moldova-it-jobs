const cheerio = require('cheerio');
const { normalize, cleanText } = require('./text');
const { htmlToText } = require('./section-extractor');

const SOURCES = {
  'Rabota.md': { origin: 'https://www.rabota.md', path: /^\/(?:ro|ru)\/locuri-de-munca\/[^/]+\/\d+\/?$/ },
  'Lucru.md': { origin: 'https://www.lucru.md', path: /^\/(?:ro|ru)\/lucru\/[^/]+\/\d+\/?$/ },
  'Delucru.md': { origin: 'https://www.delucru.md', path: /^\/(?:ro\/)?job\/\d+\/?$/ },
};

function safeJobLink(link, source) {
  const config = SOURCES[source];
  if (!config) return null;
  try {
    const url = new URL(link, config.origin);
    if (url.protocol !== 'https:' || url.hostname.replace(/^www\./, '') !== new URL(config.origin).hostname.replace(/^www\./, '') || !config.path.test(url.pathname)) return null;
    return `${config.origin}${url.pathname.replace(/\/$/, '')}`;
  } catch { return null; }
}

function validCompany(value) {
  const text = cleanText(value).replace(/\s+/g, ' ');
  return text && text.length <= 150 && !/^(?:n\/a|linkedin|facebook|instagram|top angajator.*|[+\d\s]+)$/i.test(text) ? text : null;
}

function extractListing(html, source) {
  const $ = cheerio.load(html);
  const found = new Map();
  const selector = source === 'Delucru.md' ? '.job-title a.link-job' : 'a.vacancyShowPopup';
  $(selector).each((_, element) => {
    const link = safeJobLink($(element).attr('href'), source);
    const clone = $(element).clone();
    clone.find('svg,.badge,.salary').remove();
    const title = cleanText(clone.text()).replace(/\s+/g, ' ');
    if (!link || !title || title.length > 240) return;
    const card = $(element).closest('.job-item,.vacancyCardItem,.previewCard,div[data-vacancy-id]');
    const company = validCompany(card.find('a[href*="/compan"],.company-name,.preview-card-company').first().text());
    found.set(link, { title, link, company: company || 'N/A', source });
  });
  return [...found.values()];
}

function jobPosting($) {
  const posts = [];
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach(visit);
    if ([value['@type']].flat().includes('JobPosting')) posts.push(value);
    if (value['@graph']) visit(value['@graph']);
  };
  $('script[type="application/ld+json"]').each((_, e) => { try { visit(JSON.parse($(e).text())); } catch {} });
  return posts[0] || {};
}

function extractDetails(html, source) {
  const $ = cheerio.load(html);
  const structured = jobPosting($);
  const selectors = source === 'Delucru.md'
    ? ['#job-description .content-text', '#job-description', '[itemprop="description"]']
    : ['.vacancy-content', '.vacancy-description', '[itemprop="description"]'];
  let description = '';
  for (const selector of selectors) {
    const element = $(selector).first();
    if (element.length) description = htmlToText(element.html() || '');
    if (description.length >= 100) break;
  }
  if (description.length < 100 && structured.description) description = htmlToText(structured.description);
  if (description.length < 100 || description.length > 25000) throw new Error('Vacancy description could not be isolated; page content was not saved.');
  const title = cleanText(structured.title || $(source === 'Delucru.md' ? '.job-item-title' : '.vacancy-title').first().text()).replace(/\s+/g, ' ');
  const company = validCompany(structured.hiringOrganization?.name)
    || validCompany($(source === 'Delucru.md' ? '.page-head-detail a[href*="/company/"]' : '.vacancy-info a[href*="/companies/"]').first().text());
  let location = '', workMode = '', schedule = '', salary = '', education = '', experience = '';
  if (source === 'Delucru.md') {
    $('.text-muted3').each((_, e) => {
      const label = normalize($(e).text()).trim();
      const value = cleanText($(e).next().text() || $(e).parent().children().last().text());
      if (label === 'oras:') location = value;
      if (label === 'locatie:') workMode = value;
      if (label === 'program de lucru:') schedule = value;
      if (label === 'salariu:') salary = value;
      if (label === 'studii:') education = value;
      if (label === 'experienta:') experience = value;
    });
  } else {
    const summary = $('.vacancy-summary-item-mobile').map((_,e) => cleanText($(e).text())).get();
    [location, experience, schedule, education, workMode] = summary;
    salary = cleanText($('.vacancy-salary').first().text());
  }
  if (!location) {
    const addresses = [structured.jobLocation].flat().filter(Boolean).map(l => l.address?.addressLocality).filter(Boolean);
    location = addresses.join(', ');
  }
  if (structured.jobLocationType === 'TELECOMMUTE') workMode = 'Remote';
  return { title, description, company: company || 'N/A', location: location || '', work_mode: workMode || '', schedule: schedule || '', salary: salary || '', metadata: { education, experience, datePosted: structured.datePosted || null } };
}

// Repair older whole-page descriptions without interpreting menus or similar jobs.
function cleanStoredDescription(job) {
  const text = job.description || '';
  const normalized = normalize(text);
  if (!text) return { text: '', quality: 'missing' };
  if (job.description_quality === 'verified') return { text, quality: 'verified' };
  if (text.length > 25000) return { text: '', quality: 'contaminated' };
  if (job.source === 'Delucru.md') {
    const marker = 'descrierea pozitiei vacante';
    const start = normalized.lastIndexOf(marker);
    if (start >= 0) {
      const from = start + marker.length;
      const tail = normalized.slice(from);
      const end = tail.search(/trimite cv|despre companie|locuri de munca similare/u);
      return { text: cleanText(text.slice(from, end < 0 ? undefined : from + end)), quality: 'recovered' };
    }
    if (/cititi in intregime|top angajator|generator cv online/u.test(normalized)) return { text: '', quality: 'contaminated' };
  }
  return { text: cleanText(text), quality: 'recovered' };
}

module.exports = { SOURCES, safeJobLink, validCompany, extractListing, extractDetails, cleanStoredDescription };
