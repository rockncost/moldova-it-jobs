const jobList = document.getElementById('jobList');
const resultCount = document.getElementById('resultCount');
const filterIds = { search: 'searchInput', category: 'categoryFilter', tag: 'tagFilter', source: 'sourceFilter' };
const filters = Object.fromEntries(Object.entries(filterIds).map(([name, id]) => [name, document.getElementById(id)]));
let fit = 'beginner';
let controller;
let debounce;
let requestSequence = 0;
const fitText = {
  beginner: "Explicit junior, student or no-experience signals, without a stated experience barrier. Check each employer's terms before applying.",
  stretch: 'Some experience is required, up to one year. Personal projects may help, but the employer decides what counts.',
  review: 'These adverts need closer reading: unclear beginner eligibility, degree requirements, mixed seniority or incomplete details.',
  all: 'Every relevant saved vacancy, including stretch roles and listings with unclear requirements. Excluded listings stay hidden.',
};
const warningLabels = {
  EXPERIENCE_INFLATION_2PLUS_YEARS: '2+ years stated', EXPERIENCE_REQUIREMENT_1YEAR: '1 year required',
  SOME_EXPERIENCE_REQUIRED: 'Some experience required', CONFLICTING_EXPERIENCE: 'Conflicting experience claims',
  EXPERIENCE_OR_STUDENTS: 'Experience or students: check', MIXED_SENIORITY: 'Junior / middle: check',
  DEGREE_REQUIRED: 'Completed degree requested', DESCRIPTION_UNVERIFIED: 'Details unverified', LOCATION_UNCONFIRMED: 'Location unconfirmed',
  ADVANCED_SKILLS_REQUESTED: 'Advanced skills requested', EXPERIENCE_UNCLEAR: 'Experience minimum unclear',
  INTERNSHIP_PAY_UNCLEAR: 'Internship pay unclear',
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function sourceLink(name, href) {
  const a = element('a', '', name);
  const url = new URL(href);
  if (url.protocol !== 'https:' || !['rabota.md','delucru.md','lucru.md'].includes(url.hostname.replace(/^www\./,''))) throw new Error('Invalid vacancy link');
  a.href = url.href; a.target = '_blank'; a.rel = 'noopener noreferrer';
  return a;
}
function badge(text, kind = '') { return element('span', `badge ${kind}`, text); }
function renderJob(job) {
  const card = element('article', 'job-card');
  const top = element('div', 'card-top');
  const main = element('div');
  const title = element('h3', 'job-title');
  title.append(sourceLink(job.title, job.link));
  main.append(title);
  const meta = element('div', 'job-meta');
  meta.append(element('strong', '', job.company === 'N/A' ? 'Employer not verified' : job.company));
  meta.append(document.createTextNode(` · ${job.location || 'Location not confirmed'}${job.schedule ? ` · ${job.schedule}` : ''}`));
  main.append(meta); top.append(main);
  top.append(element('span', `fit-label ${job.entry_fit}`, { beginner: 'BEGINNER SIGNALS', stretch: 'STRETCH ROLE', review: 'NEEDS CHECKING' }[job.entry_fit] || 'CHECK REQUIREMENTS'));
  card.append(top);
  const badges = element('div', 'badges');
  badges.append(badge(job.category, 'badge-category'));
  for (const tag of job.tags || []) badges.append(badge(tag));
  for (const flag of job.quality_flags || []) if (warningLabels[flag]) badges.append(badge(warningLabels[flag], 'badge-warning'));
  card.append(badges);
  const pay = job.payment_status === 'paid' ? `Pay advertised${job.salary ? ` · ${job.salary}` : ''}` : 'Pay not stated — confirm with the employer';
  card.append(element('p', 'pay-note', `${pay} · No applicant training fee found in the advert`));
  const detail = element('details', 'card-details');
  detail.append(element('summary', '', 'Why this appears & vacancy details'));
  const reasons = element('ul');
  for (const reason of job.reasons || []) {
    const li = element('li', '', reason.label);
    if (reason.evidence) li.append(element('blockquote', '', reason.evidence));
    reasons.append(li);
  }
  detail.append(reasons);
  if (job.description) detail.append(element('div', 'description-preview', job.description));
  detail.append(element('p', '', job.detail_checked_at ? `Details checked ${formatDate(job.detail_checked_at)}. Availability and terms may change.` : 'Vacancy details have not been verified on the source page.'));
  card.append(detail);
  const sources = element('div', 'sources');
  for (const source of job.sources || [{name:job.source,link:job.link}]) sources.append(sourceLink(`View on ${source.name} ↗`, source.link));
  card.append(sources);
  return card;
}
function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'unknown date' : new Intl.DateTimeFormat('en-GB', {day:'numeric',month:'short',year:'numeric',timeZone:'Europe/Chisinau'}).format(date);
}
function setFit(value) {
  fit = value;
  document.querySelectorAll('[data-fit]').forEach(button => {
    const active = button.dataset.fit === fit;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
  document.getElementById('fitDescription').textContent = fitText[fit];
}
async function fetchJobs() {
  const sequence = ++requestSequence;
  controller?.abort();
  controller = new AbortController();
  const params = new URLSearchParams({ fit });
  for (const [key, input] of Object.entries(filters)) if (input.value.trim()) params.set(key, input.value.trim());
  history.replaceState(null, '', `${location.pathname}?${params}`);
  jobList.setAttribute('aria-busy', 'true');
  resultCount.textContent = 'Loading opportunities…';
  try {
    const response = await fetch(`/api/jobs?${params}`, { signal: controller.signal });
    if (!response.ok) throw new Error('Could not load vacancies.');
    const jobs = await response.json();
    if (sequence !== requestSequence) return;
    if (!Array.isArray(jobs)) throw new Error('Unexpected response.');
    jobList.replaceChildren();
    const cards = document.createDocumentFragment();
    for (const job of jobs) cards.append(renderJob(job));
    jobList.append(cards);
    resultCount.textContent = `${jobs.length} ${jobs.length === 1 ? 'opportunity' : 'opportunities'}${fit === 'review' ? ' to check' : ''}`;
    if (!jobs.length) {
      const state = element('div', 'state', 'No vacancies match these filters. Try another role or look at listings that need checking.');
      const reset = element('button', '', 'Clear filters'); reset.type = 'button'; reset.addEventListener('click', resetFilters);
      state.append(element('br'), reset); jobList.append(state);
    }
  } catch (error) {
    if (error.name === 'AbortError' || sequence !== requestSequence) return;
    const state = element('div', 'state error', 'Vacancies could not be loaded. Please try again.');
    const retry = element('button', '', 'Try again'); retry.addEventListener('click', fetchJobs); state.append(element('br'),retry);
    jobList.replaceChildren(state); resultCount.textContent = 'Unable to load vacancies';
  } finally { if (sequence === requestSequence) jobList.setAttribute('aria-busy', 'false'); }
}
function resetFilters() { for (const input of Object.values(filters)) input.value = ''; setFit('beginner'); fetchJobs(); }
async function initialize() {
  const initial = new URLSearchParams(location.search);
  if (fitText[initial.get('fit')]) setFit(initial.get('fit'));
  filters.search.value = initial.get('search') || '';
  try {
    const response = await fetch('/api/filters');
    if (!response.ok) throw new Error();
    const data = await response.json();
    for (const c of data.categories) {
      const option = element('option', '', `${c.name} (${c.count})`); option.value = c.name; filters.category.append(option);
    }
    for (const name of ['tag','source']) for (const value of data[name === 'tag' ? 'tags' : 'sources']) {
      const option = element('option', '', value); option.value = value; filters[name].append(option);
    }
    for (const key of ['category','tag','source']) filters[key].value = initial.get(key) || '';
    for (const [key,count] of Object.entries(data.counts)) document.getElementById(`count-${key}`).textContent = count;
    document.getElementById('freshness').textContent = data.lastVerified ? `Latest detail check · ${formatDate(data.lastVerified)}` : 'Saved listings · details need checking';
    document.getElementById('exclusionCount').textContent = `${data.excluded} saved listings are currently excluded by these rules. Listings are preserved for reanalysis.`;
  } catch {
    document.getElementById('freshness').textContent = 'Filter options unavailable';
  }
  await fetchJobs();
}
document.getElementById('filters').addEventListener('submit', e => { e.preventDefault(); clearTimeout(debounce); fetchJobs(); });
filters.search.addEventListener('input', () => { clearTimeout(debounce); controller?.abort(); requestSequence++; debounce = setTimeout(fetchJobs, 250); });
for (const key of ['category','tag','source']) filters[key].addEventListener('change', () => { clearTimeout(debounce); fetchJobs(); });
document.querySelectorAll('[data-fit]').forEach(button => button.addEventListener('click', () => { clearTimeout(debounce); setFit(button.dataset.fit); fetchJobs(); }));
document.getElementById('clearFilters').addEventListener('click', resetFilters);
initialize();
