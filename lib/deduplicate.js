const { normalize } = require('./text');
const { safeJobLink } = require('./job-extractor');
const { extractSections } = require('./section-extractor');
const { extractSalaryAmount } = require('./salary');

function jsonArray(value) {
  if (Array.isArray(value)) return value;
  try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}
function jsonObject(value) {
  try { const parsed = typeof value==='string' ? JSON.parse(value) : value; return parsed && typeof parsed==='object' && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
}

const words = text => normalize(text || '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
function canonicalCompany(company) {
  return words(company).replace(/^(?:ics |ocn |o c n )|(?: srl|s r l| sa| s a)$/g, '').trim();
}
function canonicalTitle(title, company) {
  const employer = canonicalCompany(company);
  let clean = normalize(title || '').replace(/\([^)]*\)/g, block => {
    const content = words(block);
    return content === employer || /^(?:moldova|chisinau)$/.test(content) || /\d.{0,15}(?:usd|mdl|eur)/u.test(content) ? ' ' : block;
  });
  clean = clean.replace(/системный администратор|сис\.?\s*админ|administrator de sistem/gu, 'system administrator');
  clean = words(clean);
  if (employer && clean.endsWith(` ${employer}`)) clean = clean.slice(0, -employer.length).trim();
  clean = clean.replace(/(?:^|\s)(?:moldova|chisinau)$/u, '').trim();
  clean = clean.replace(/^(system administrator)(?: system administrator)+$/u, '$1');
  if (/^(?:internship it|it internship)$/.test(clean)) clean = 'it internship';
  return clean;
}
function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const value of a) if (b.has(value)) common++;
  return (2 * common) / (a.size + b.size);
}
function shingles(text) {
  const tokens = words(text).split(' ').filter(Boolean);
  const result = new Set();
  for (let i = 0; i + 4 < tokens.length; i++) result.add(tokens.slice(i, i + 5).join(' '));
  return result;
}
function prepare(job) {
  const sections = extractSections(job.description || '');
  const duties = [job.responsibilities_text || sections.responsibilities, job.requirements_text || sections.requirements].filter(Boolean).join('\n');
  const title = canonicalTitle(job.title, job.company);
  const tags = jsonArray(job.tags);
  return {
    job: { ...job, tags, quality_flags: jsonArray(job.quality_flags), reasons: jsonArray(job.reasons), salary_amount: extractSalaryAmount(job),
      tag_evidence:jsonObject(job.tag_evidence), flag_evidence:jsonObject(job.flag_evidence), category_evidence:jsonArray(job.category_evidence) },
    title, titleTokens: new Set(title.split(' ')),
    company: canonicalCompany(job.company), roleText: shingles(duties || job.description),
    requirements: tags.filter(t => (/ Required$/.test(t) && t !== 'No Experience Required') || ['Remote','Hybrid','Part Time','Rotational Shifts',"Driver's License"].includes(t)).sort().join('|'),
  };
}
function equivalent(a, b) {
  if (!a.company || a.company === 'n a' || a.company !== b.company) return false;
  if (a.job.entry_fit !== b.job.entry_fit || a.job.experience_min !== b.job.experience_min || a.job.category !== b.job.category || a.requirements !== b.requirements) return false;
  // Contradictory degree, experience and pay requirements remain separate adverts.
  const blockers = job => job.quality_flags.filter(f => !['PAY_NOT_STATED'].includes(f)).sort().join('|');
  if (blockers(a.job) !== blockers(b.job)) return false;
  if (a.title === b.title) return true;
  return similarity(a.titleTokens, b.titleTokens) >= 0.7
    && Math.min(a.roleText.size, b.roleText.size) >= 25
    && similarity(a.roleText, b.roleText) >= 0.88;
}
function chooseRepresentative(a, b) {
  const rank = record => [
    record.job.description_quality === 'verified' ? 1 : 0,
    Date.parse(record.job.detail_checked_at || '') || 0,
    Math.min(record.roleText.size, 500), record.job.salary_amount ? 1 : 0,
    -record.job.title.length, Number(record.job.id) || 0,
  ];
  const x = rank(a), y = rank(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] > y[i] ? a : b;
  return a.job.link.localeCompare(b.job.link) <= 0 ? a : b;
}
function deduplicate(jobs) {
  const groups = [];
  for (const job of jobs) {
    if (!safeJobLink(job.link, job.source)) continue;
    const record = prepare(job);
    // Checking every member prevents fuzzy matches from joining unrelated roles
    // through a chain of progressively weaker similarities.
    const group = groups.find(g => g.members.every(member => equivalent(record, member)));
    if (group) {
      group.members.push(record);
      group.primary = chooseRepresentative(group.primary, record);
    } else groups.push({ primary: record, members: [record] });
  }
  return groups.map(group => {
    const primary = group.primary.job;
    const sources = new Map([[primary.link, { name: primary.source, link: primary.link }]]);
    for (const record of group.members) sources.set(record.job.link, { name: record.job.source, link: record.job.link });
    return { ...primary, sources: [...sources.values()], duplicate_count: sources.size - 1 };
  }).sort((a,b) => b.fit_score - a.fit_score || (b.scraped_at || '').localeCompare(a.scraped_at || '') || a.link.localeCompare(b.link));
}

module.exports = { deduplicate, canonicalTitle, canonicalCompany };
