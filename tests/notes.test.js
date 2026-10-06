const test = require('node:test');
const assert = require('node:assert/strict');
const { extractSalaryAmount } = require('../lib/salary');
const { deduplicate } = require('../lib/deduplicate');
const { evaluateJob } = require('../lib/scoring-engine');
const { extractSections } = require('../lib/section-extractor');
const { reviewReasons } = require('../lib/review');

const enoughText = 'You will work with our team and learn practical skills through real projects. We offer a modern office in Chișinău.';
const analyze = (title, text, metadata = {}) => evaluateJob(title, extractSections(text), { location: 'Chișinău', description_quality: 'verified', ...metadata });
const tags = result => JSON.parse(result.tags);

test('negotiable and advertised pay without a sum use the missing-amount state', () => {
  for (const salary of ['', 'Negociabil', 'Negotiable', 'Salariu competitiv']) {
    assert.equal(extractSalaryAmount({ salary, description: 'We offer a competitive salary and free training.' }), '');
  }
});

test('salary amounts are extracted from metadata, titles and salary paragraphs', () => {
  assert.equal(extractSalaryAmount({ salary: 'de la 15 000 MDL' }), 'de la 15 000 MDL');
  assert.equal(extractSalaryAmount({ salary: '1000' }), '1000');
  assert.equal(extractSalaryAmount({ title: 'Junior Analyst (800 USD)' }), '800 USD');
  assert.equal(extractSalaryAmount({ salary: 'Negociabil', description: 'Salariu: de la 12 000 lei pe lună.' }), 'de la 12 000 lei');
  assert.equal(extractSalaryAmount({ description: 'Salary: $1,200 - $1,500 per month.' }), '$1,200 - $1,500');
  assert.equal(extractSalaryAmount({ description: 'Зарплата:\n800–1000 EUR' }), '800–1000 EUR');
  assert.equal(extractSalaryAmount({ description: 'Salariu:\nstagiar: 10 000-14 000 lei;\nspecialist junior: 14 000-18 000 lei;\nTraining provided.' }), 'stagiar: 10 000-14 000 lei; specialist junior: 14 000-18 000 lei');
});

test('company figures, benefits, training costs and later employment are not current salary', () => {
  assert.equal(extractSalaryAmount({ description: 'Competitive salary.\nMedical insurance worth 15 000 MDL.\nTraining fee 500 lei.' }), '');
  assert.equal(extractSalaryAmount({ description: 'We have 13,000 employees and 12 years of experience.' }), '');
  assert.equal(extractSalaryAmount({ salary: '800 USD', quality_flags: '["INTERNSHIP_PAY_UNCLEAR"]' }), '');
  assert.equal(extractSalaryAmount({ description: 'After the internship, salary: 800 USD.' }), '');
  assert.equal(extractSalaryAmount({ salary: '800 USD', quality_flags: 'broken JSON' }), '800 USD');
});

test('student badge yields to mandatory or preferred prior experience', () => {
  for (const requirement of ['Minimum 1 year of experience.', '1 year of experience preferred.', '0–2 years of experience.', 'Previous work experience is preferred.']) {
    const result = analyze('Junior Developer', `Requirements:\nStudents welcome.\n${requirement}\nBenefits:\n${enoughText}`);
    assert.ok(!tags(result).includes('Students / Graduates Welcome'), requirement);
    assert.ok(!JSON.parse(result.reasons).some(reason => reason.label === 'Students or graduates are mentioned as applicants.'));
  }
});

test('OTP optional up-to-one-year experience removes the student badge without becoming mandatory', () => {
  const result = analyze('DevOps Engineer Junior', `Vom aprecia să ai:\nStudii superioare finalizate sau în curs de finalizare în domeniul IT.\nCunoștințe de bază Linux și Git.\nConstituie un avantaj:\nExperiență de până la 1 an într-un rol IT (Administrare Sisteme, Suport Tehnic, DevOps, Dezvoltare Software).\nBeneficii:\n${enoughText}`);
  assert.equal(result.entryFit, 'beginner');
  assert.equal(result.experienceMin, null);
  assert.ok(tags(result).includes('Experience Preferred'));
  assert.ok(!tags(result).includes('Students / Graduates Welcome'));
});

test('company age and training duration preserve genuine student acceptance', () => {
  const result = analyze('IT Internship', `About us:\nOur company has 12 years of experience.\nRequirements:\nStudents welcome. No experience required.\nBenefits:\nWe offer 6 months of training. ${enoughText}`);
  assert.ok(tags(result).includes('Students / Graduates Welcome'));
  assert.equal(result.entryFit, 'beginner');
});

test('unclear mandatory work experience removes student badge and remains reviewable', () => {
  const result = analyze('Junior QA', `Requirements:\nStudents welcome.\nPrevious work experience required.\nBenefits:\n${enoughText}`);
  assert.ok(!tags(result).includes('Students / Graduates Welcome'));
  assert.equal(result.entryFit, 'review');
  assert.ok(JSON.parse(result.qualityFlags).includes('EXPERIENCE_UNCLEAR'));
});

test('basic Russian tool experience and optional abbreviation clauses do not inflate review', () => {
  for (const requirement of [
    'Опыт работы с PHP (начальный уровень);\nОпыт работы с Git и базовые знания командной строки в Linux;',
    'Опыт работы с системами мониторинга: Nagios, Zabbix и т.д. является преимуществом;',
  ]) assert.equal(analyze('Junior Developer', `Требования:\n${requirement}\nУсловия:\n${enoughText}`).entryFit,'beginner');
  assert.equal(analyze('Junior Developer', `Требования:\nПредыдущий коммерческий опыт работы с PHP.\n${enoughText}`).entryFit,'review');
});

test('experience-does-not-matter variants are explicit beginner signals', () => {
  for (const requirement of ['Предыдущий опыт работы и образование не имеют значения.', 'Experiența nu contează.', 'Previous work experience does not matter.']) {
    const result = analyze('Software Developer', `Requirements:\n${requirement}\n${enoughText}`);
    assert.equal(result.entryFit,'beginner');
    assert.ok(tags(result).includes('No Experience Required'));
  }
});

test('a Russian degree-or-current-students alternative is not a completed-degree barrier', () => {
  const result = analyze('Administrator de sistem', `Требования:\nВысшее образование в области информационных технологий или студенты последнего курса;\n${enoughText}`);
  assert.equal(result.entryFit,'beginner');
  assert.ok(tags(result).includes('Students / Graduates Welcome'));
  assert.ok(!JSON.parse(result.qualityFlags).includes('DEGREE_REQUIRED'));
});

test('generic IT adverts are other roles, while a clear one-year minimum is a stretch role', () => {
  const generic = analyze('Software Developer', `Requirements:\nPython and SQL.\n${enoughText}`);
  assert.equal(generic.entryFit, 'other');
  assert.ok(JSON.parse(generic.qualityFlags).includes('BEGINNER_ELIGIBILITY_UNCONFIRMED'));
  assert.equal(analyze('Software Developer', `Requirements:\nMinimum 1 year of experience.\n${enoughText}`).entryFit, 'stretch');
  assert.equal(analyze('Software Developer', `Requirements:\nMinimum 1 year of experience.\n${enoughText}`, { location: '' }).entryFit, 'review');
});

test('review reasons expose specific obstacles instead of generic non-beginner roles', () => {
  assert.deepEqual(reviewReasons({ entry_fit: 'review', quality_flags: ['DEGREE_REQUIRED','EXPERIENCE_UNCLEAR'] }), ['experience','degree']);
  assert.deepEqual(reviewReasons({ entry_fit: 'review', quality_flags: ['INTERNSHIP_PAY_UNCLEAR','DESCRIPTION_UNVERIFIED'] }), ['pay','details']);
  assert.deepEqual(reviewReasons({ entry_fit: 'other', quality_flags: ['EXPERIENCE_UNCLEAR'] }), []);
});

const roleText = 'Analyze contractual terms and address internal and external customer queries. Deliver license keys on time and maintain accurate documentation for the team. Work with sales, commercial and legal stakeholders to support the customer license function. Use Microsoft Excel for tracking records and validating license information. Communicate clearly with customers and colleagues in Italian. Students in the last year of university can apply.';
function advert(id, title, extra = {}) {
  return { id, title, company: 'Cedacri International', category: 'IT Support & Helpdesk', source: 'Delucru.md', link: `https://www.delucru.md/job/${id}`, entry_fit: 'beginner', experience_min: null, fit_score: 50, tags: '["Italian Required","Students / Graduates Welcome"]', quality_flags: '["PAY_NOT_STATED"]', reasons: '[]', description_quality: 'verified', description: roleText, detail_checked_at: '2026-10-06T10:00:00Z', ...extra };
}

test('Cedacri employer and location title variants produce one representative with all source links', () => {
  const first = advert(1, 'Support License Management Specialist (Moldova)');
  const second = advert(2, 'Support License Management Specialist, Moldova, (Cedacri International)', { source: 'Lucru.md', link: 'https://www.lucru.md/ro/lucru/support/2', detail_checked_at: '2026-10-06T09:00:00Z' });
  for (const input of [[first, second], [second, first]]) {
    const output = deduplicate(input);
    assert.equal(output.length, 1);
    assert.equal(output[0].title, first.title);
    assert.equal(output[0].duplicate_count, 1);
    assert.deepEqual(output[0].sources.map(source => source.name), ['Delucru.md', 'Lucru.md']);
  }
});

test('near-identical duties group slightly different titles from the same employer', () => {
  const first = advert(1, 'Junior Technical Support Specialist');
  const second = advert(2, 'Junior Technical Support Agent', { description: roleText + ' Apply today.' });
  assert.equal(deduplicate([first, second]).length, 1);
  assert.equal(deduplicate([first, { ...second, description: 'Provide desktop hardware repairs, install operating systems and configure computer network equipment in the office.' }]).length, 2);
});

test('abbreviated and bilingual system administrator titles share a duplicate group', () => {
  const first = advert(1, 'Сис. админ | Administrator de sistem');
  const second = advert(2, 'Administrator de sistem/Системный администратор');
  assert.equal(deduplicate([first,second]).length,1);
});

test('duplicate grouping preserves different experience, languages, schedules and employers', () => {
  const first = advert(1, 'Support License Management Specialist');
  for (const changes of [
    { experience_min: 1 }, { entry_fit: 'stretch' }, { tags: '["English Required"]' },
    { tags: '["Italian Required","Part Time"]' }, { quality_flags: '["DEGREE_REQUIRED"]' },
    { company: 'Another employer' }, { company: 'N/A' },
  ]) assert.equal(deduplicate([first, advert(2, first.title, changes)]).length, 2, JSON.stringify(changes));
  assert.equal(deduplicate([advert(1, first.title, {company:'N/A'}), advert(2, first.title, {company:'N/A'})]).length, 2);
});

test('fresh verified details win over a stale or unverified duplicate', () => {
  const old = advert(1, 'Junior Support');
  const fresh = advert(2, 'Junior Support', { detail_checked_at: '2026-10-06T11:00:00Z' });
  const unverified = advert(3, 'Junior Support', { detail_checked_at: '2026-10-06T12:00:00Z', description_quality: 'missing' });
  assert.equal(deduplicate([old, fresh, unverified])[0].id, 2);
});
