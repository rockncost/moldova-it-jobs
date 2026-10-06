const jobList = document.getElementById('jobList');
const resultCount = document.getElementById('resultCount');
const filterIds = { search: 'searchInput', category: 'categoryFilter', tag: 'tagFilter', source: 'sourceFilter', review: 'reviewFilter' };
const filters = Object.fromEntries(Object.entries(filterIds).map(([name, id]) => [name, document.getElementById(id)]));
let fit = 'beginner';
let controller;
let debounce;
let requestSequence = 0;
let view = 'browse';
let loadedJobs = [];
let globalFitCounts = {};
const selectedTags = new Set();
const applicant = ApplicantStore.create({getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)},()=>{
  const notice=document.getElementById('storageNotice');notice.hidden=false;
  notice.textContent='Browser storage is unavailable or damaged. New choices stay on this page but may be lost when you close it.';
});
const statusLabels = {'':'Not applied',applied:'Applied',interview:'Interview',offer:'Offer',rejected:'Rejected',withdrawn:'Withdrawn'};
const fitText = {
  beginner: "Explicit junior, student or no-experience signals, without a stated experience barrier. Check each employer's terms before applying.",
  stretch: 'These roles state an experience minimum below two years. Personal projects may help, but the employer decides what counts.',
  review: 'Beginner adverts with specific questions about experience, degrees, internship pay or missing details. Filter by the reason that matters to you.',
  other: 'Relevant IT roles without an explicit junior, student or no-experience signal. Their suitability for a first job is unconfirmed.',
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
let evidenceSequence = 0;
function renderJob(job) {
  const card = element('article', 'job-card');
  card.dataset.jobLink=job.link;
  const top = element('div', 'card-top');
  const main = element('div');
  const title = element('h3', 'job-title');
  title.append(sourceLink(job.title, job.link));
  main.append(title);
  const meta = element('div', 'job-meta');
  meta.append(element('strong', '', job.company === 'N/A' ? 'Employer not verified' : job.company));
  meta.append(document.createTextNode(` · ${job.location || 'Location not confirmed'}${job.schedule ? ` · ${job.schedule}` : ''}`));
  main.append(meta); top.append(main);
  top.append(element('span', `fit-label ${job.entry_fit}`, { beginner: 'BEGINNER SIGNALS', stretch: 'STRETCH ROLE', review: 'NEEDS CHECKING', other: 'BEGINNER FIT UNCONFIRMED' }[job.entry_fit] || 'CHECK REQUIREMENTS'));
  card.append(top);
  const evidencePanel = element('div', 'tag-evidence');
  evidencePanel.id = `advert-evidence-${++evidenceSequence}`;
  evidencePanel.hidden = true;
  evidencePanel.setAttribute('role','region');
  evidencePanel.setAttribute('aria-live','polite');
  const evidenceButtons = [];
  function evidenceBadge(label, kind, quotes) {
    if (!Array.isArray(quotes) || !quotes.some(quote=>quote?.text)) return badge(label,kind);
    const button = element('button', `badge evidence-badge ${kind}`, label);
    button.type = 'button';
    button.setAttribute('aria-expanded','false');
    button.setAttribute('aria-controls',evidencePanel.id);
    button.title = `Show advert evidence for ${label}`;
    evidenceButtons.push(button);
    const close = () => {
      evidencePanel.hidden = true;
      for (const item of evidenceButtons) { item.setAttribute('aria-expanded','false'); item.classList.remove('badge-selected'); }
    };
    button.addEventListener('click',()=>{
      const alreadyOpen = button.getAttribute('aria-expanded')==='true';
      close();
      if (alreadyOpen) return;
      button.setAttribute('aria-expanded','true');button.classList.add('badge-selected');
      evidencePanel.replaceChildren();
      evidencePanel.setAttribute('aria-label',`Evidence for ${label}`);
      const heading = element('div','evidence-heading');
      heading.append(element('strong','',label));
      const closeButton = element('button','evidence-close','Close');closeButton.type='button';closeButton.setAttribute('aria-label','Close advert evidence');
      closeButton.addEventListener('click',()=>{close();button.focus();});heading.append(closeButton);
      evidencePanel.append(heading,element('p','evidence-caption','Quoted from this advert:'));
      for (const quote of quotes.filter(quote=>quote?.text)) {
        evidencePanel.append(element('div','evidence-source',quote.section || 'Vacancy text'),element('blockquote','',quote.text));
      }
      evidencePanel.hidden = false;
    });
    return button;
  }
  const badges = element('div', 'badges');
  badges.append(evidenceBadge(job.category, 'badge-category',job.category_evidence));
  for (const tag of job.tags || []) badges.append(evidenceBadge(tag,'',job.tag_evidence?.[tag]));
  for (const flag of job.quality_flags || []) if (warningLabels[flag]) badges.append(evidenceBadge(warningLabels[flag], 'badge-warning',job.flag_evidence?.[flag]));
  card.append(badges,evidencePanel);
  const pay = job.salary_amount ? `Salary: ${job.salary_amount}` : 'Salary amount not stated';
  card.append(element('p', 'pay-note', pay));
  const stale=!job.detail_checked_at || Date.now()-Date.parse(job.detail_checked_at)>=7*86400000;
  if(job.detail_error||stale)card.append(element('p','freshness-warning',job.detail_error?'Latest source check failed — showing the last saved details. Availability is unconfirmed.':job.detail_checked_at?`Details last checked ${formatDate(job.detail_checked_at)} — due for a recheck.`:'Source details have not yet been verified.'));
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
  const state = applicant.state(job);
  if (job.saved_snapshot) card.append(element('p','local-note','Saved snapshot — no longer in current listings. Check availability on the source.'));
  if (state.hidden) card.append(element('p','local-note','Hidden from Browse jobs.'));
  const actions=element('div','applicant-actions');
  const save=element('button','save-job',state.saved?'Saved ✓':'Save job');save.type='button';save.setAttribute('aria-pressed',String(state.saved));
  save.addEventListener('click',()=>{applicant.update(job,{saved:!state.saved});renderResults();});
  const hide=element('button','hide-job',state.hidden?'Show in browse':'Hide job');hide.type='button';
  hide.addEventListener('click',()=>{
    const wasHidden=state.hidden;
    applicant.update(job,{hidden:!wasHidden});
    const notice=document.getElementById('actionNotice');notice.replaceChildren(document.createTextNode(wasHidden?'Job restored to Browse jobs.':'Job hidden from Browse jobs. '));notice.hidden=false;
    if(!wasHidden){const undo=element('button','','Undo');undo.type='button';undo.addEventListener('click',()=>{applicant.update(job,{hidden:false});notice.hidden=true;renderResults();});notice.append(undo);}
    renderResults();
  });
  const tracking=element('div','application-control');
  const label=element('label','','Application');const select=element('select','application-status');select.setAttribute('aria-label',`Application status for ${job.title}`);
  for(const [value,name] of Object.entries(statusLabels)){const option=element('option','',name);option.value=value;select.append(option);}select.value=state.status;
  select.addEventListener('change',()=>{applicant.update(job,{status:select.value});renderResults();});label.append(select);tracking.append(label);
  if(state.appliedAt)tracking.append(element('span','application-date',`Started ${formatDate(state.appliedAt)}`));
  actions.append(save,hide,tracking);card.append(actions);
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
  document.getElementById('reviewControls').hidden = fit !== 'review';
  if (fit !== 'review') filters.review.value = '';
}
async function fetchJobs() {
  const sequence = ++requestSequence;
  controller?.abort();
  controller = new AbortController();
  const params = new URLSearchParams({ fit });
  for (const [key, input] of Object.entries(filters)) if (key !== 'tag' && input.value.trim() && (key !== 'review' || fit === 'review')) params.set(key, input.value.trim());
  for(const tag of selectedTags)params.append('tag',tag);
  if(view!=='browse')params.set('view',view);
  history.replaceState(null, '', `${location.pathname}?${params}`);
  jobList.setAttribute('aria-busy', 'true');
  resultCount.textContent = 'Loading opportunities…';
  try {
    const response = await fetch(`/api/jobs?${view==='browse'?params:'fit=all'}`, { signal: controller.signal });
    if (!response.ok) throw new Error('Could not load vacancies.');
    const jobs = await response.json();
    if (sequence !== requestSequence) return;
    if (!Array.isArray(jobs)) throw new Error('Unexpected response.');
    loadedJobs=jobs;renderResults();
  } catch (error) {
    if (error.name === 'AbortError' || sequence !== requestSequence) return;
    const state = element('div', 'state error', 'Vacancies could not be loaded. Please try again.');
    const retry = element('button', '', 'Try again'); retry.addEventListener('click', fetchJobs); state.append(element('br'),retry);
    if(view!=='browse'){loadedJobs=[];renderResults();resultCount.textContent+=' · Live listings unavailable; showing saved snapshots';}
    else {jobList.replaceChildren(state); resultCount.textContent = 'Unable to load vacancies';}
  } finally { if (sequence === requestSequence) jobList.setAttribute('aria-busy', 'false'); }
}
function renderResults(){
  const focused=document.activeElement;
  const focusedLink=focused?.closest('.job-card')?.dataset.jobLink;
  const focusedControl=['save-job','hide-job','application-status'].find(name=>focused?.classList.contains(name));
  const counts=applicant.counts();for(const [key,count] of Object.entries(counts))document.getElementById(`personal-${key}`).textContent=count;
  let jobs;
  if(view==='browse')jobs=loadedJobs.filter(job=>!applicant.state(job).hidden);
  else {
    const normalize=value=>String(value||'').normalize('NFKD').replace(/(\p{Script=Latin})\p{M}+/gu,'$1').normalize('NFC').toLowerCase().replace(/[’‘]/g,"'").replace(/[–—]/g,'-').replace(/\u00a0/g,' ');
    jobs=applicant.jobs(view).map(snapshot=>loadedJobs.find(job=>applicant.state(job)===applicant.state(snapshot))||{...snapshot,saved_snapshot:true});
    const personalCounts={beginner:0,stretch:0,review:0,other:0,all:jobs.length};for(const job of jobs)if(Object.hasOwn(personalCounts,job.entry_fit))personalCounts[job.entry_fit]++;
    for(const [key,count] of Object.entries(personalCounts))document.getElementById(`count-${key}`).textContent=count;
    jobs=jobs.filter(job=>(fit==='all'||job.entry_fit===fit)&&(!filters.category.value||job.category===filters.category.value)&&[...selectedTags].every(tag=>job.tags.includes(tag))&&(!filters.source.value||(job.sources||[{name:job.source}]).some(source=>source.name===filters.source.value))&&(!filters.review.value||(job.review_reasons||[]).includes(filters.review.value))&&(!filters.search.value.trim()||normalize(`${job.title} ${job.company} ${job.description||''} ${job.tags.join(' ')}`).includes(normalize(filters.search.value.trim())))).sort((a,b)=>b.fit_score-a.fit_score);
  }
  if(view==='browse')for(const [key,count] of Object.entries(globalFitCounts))document.getElementById(`count-${key}`).textContent=count;
  document.getElementById('fitDescription').textContent=view==='browse'?fitText[fit]:`Your ${view} jobs. Fit counts refer to this personal list. ${fit==='all'?'All fit levels are shown, including saved snapshots.':fitText[fit]}`;
  jobList.replaceChildren(...jobs.map(renderJob));
  resultCount.textContent=`${jobs.length} ${jobs.length===1?'opportunity':'opportunities'}${fit==='review'?' to check':''}`;
  if(!jobs.length){const state=element('div','state',view==='browse'?'No vacancies match these filters. Hidden jobs are available in Hidden.':`No ${view} jobs match. Use the controls on job cards to build your list, or clear your filters.`);const reset=element('button','','Clear filters');reset.type='button';reset.addEventListener('click',resetFilters);state.append(element('br'),reset);jobList.append(state);}
  if(focusedLink&&focusedControl){const card=[...jobList.querySelectorAll('.job-card')].find(item=>item.dataset.jobLink===focusedLink);(card?.querySelector(`.${focusedControl}`)||document.querySelector('#actionNotice:not([hidden]) button')||jobList.querySelector(`.${focusedControl}`)||document.querySelector('[data-view].active'))?.focus({preventScroll:true});}
}
function renderTags(){document.getElementById('selectedTags').replaceChildren(...[...selectedTags].map(tag=>{const button=element('button','tag-chip',`${tag} ×`);button.type='button';button.setAttribute('aria-label',`Remove filter ${tag}`);button.addEventListener('click',()=>{selectedTags.delete(tag);renderTags();fetchJobs();});return button;}));}
function setView(value){view=value;document.querySelectorAll('[data-view]').forEach(button=>{const active=button.dataset.view===view;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});}
function resetFilters() { for (const input of Object.values(filters)) input.value = '';selectedTags.clear();renderTags();setFit(view==='browse'?'beginner':'all');fetchJobs(); }
async function initialize() {
  const initial = new URLSearchParams(location.search);
  if(['saved','applications','hidden'].includes(initial.get('view'))){setView(initial.get('view'));setFit('all');}
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
    for (const reason of data.reviewReasons || []) {
      if (!reason.count) continue;
      const option = element('option', '', `${reason.label} (${reason.count})`); option.value = reason.value; filters.review.append(option);
    }
    for (const key of ['category','source']) filters[key].value = initial.get(key) || '';
    if (fit === 'review') filters.review.value = initial.get('review') || '';
    globalFitCounts=data.counts;
    for (const [key,count] of Object.entries(data.counts)) document.getElementById(`count-${key}`).textContent = count;
    document.getElementById('freshness').textContent = data.lastVerified ? `Latest detail check · ${formatDate(data.lastVerified)}` : 'Saved listings · details need checking';
    document.getElementById('exclusionCount').textContent = `${data.excluded} saved listings are currently excluded by these rules. Listings are preserved for reanalysis.`;
  } catch {
    document.getElementById('freshness').textContent = 'Filter options unavailable';
  }
  for(const tag of initial.getAll('tag').filter(Boolean).slice(0,30))selectedTags.add(tag);renderTags();
  await fetchJobs();
}
document.getElementById('filters').addEventListener('submit', e => { e.preventDefault(); clearTimeout(debounce); fetchJobs(); });
filters.search.addEventListener('input', () => { clearTimeout(debounce); controller?.abort(); requestSequence++; debounce = setTimeout(fetchJobs, 250); });
for (const key of ['category','source','review']) filters[key].addEventListener('change', () => { clearTimeout(debounce); fetchJobs(); });
filters.tag.addEventListener('change',()=>{if(filters.tag.value)selectedTags.add(filters.tag.value);filters.tag.value='';renderTags();clearTimeout(debounce);fetchJobs();});
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{clearTimeout(debounce);setView(button.dataset.view);resetFilters();}));
window.addEventListener('storage',event=>{if(event.key===ApplicantStore.KEY||event.key===null){applicant.reload();renderResults();}});
document.querySelectorAll('[data-fit]').forEach(button => button.addEventListener('click', () => { clearTimeout(debounce); setFit(button.dataset.fit); fetchJobs(); }));
document.getElementById('clearFilters').addEventListener('click', resetFilters);
initialize();
async function loadRefreshStatus(){
  const target=document.getElementById('sourceHealth');
  try{const response=await fetch('/api/refresh-status');if(!response.ok)throw Error();const data=await response.json();target.replaceChildren(...data.sources.map(source=>{
    const row=element('div','source-health-row');row.append(element('strong','',source.source),element('p','',`${{never:'Not refreshed yet',running:'Refresh in progress',success:'Refresh succeeded',partial:'Some checks failed',failed:'Refresh failed'}[source.status]||source.status}${source.finished_at?` · ${formatDate(source.finished_at)}`:''}`));
    row.append(element('p','',`${source.verified} details verified · ${source.closed} closed · ${source.failed} failed in the latest run. ${source.stale||0} visible adverts due for rechecking; ${source.detail_failures||0} have unresolved check failures.`));
    if(source.last_success)row.append(element('p','',`Last fully successful refresh: ${formatDate(source.last_success)}`));
    for(const error of source.errors)row.append(element('p','refresh-error',error));return row;
  }));}catch{target.textContent='Source refresh status could not be loaded.';}
}
loadRefreshStatus();setInterval(loadRefreshStatus,60000);
