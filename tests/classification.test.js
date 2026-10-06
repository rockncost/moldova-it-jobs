const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateJob } = require('../lib/scoring-engine');
const { extractSections } = require('../lib/section-extractor');
const { extractDetails, extractListing, cleanStoredDescription, safeJobLink } = require('../lib/job-extractor');
const { isCandidate } = require('../lib/scrape-source');

function analyze(title, text, extra = {}) {
  return evaluateJob(title, extractSections(text), { location: 'Chișinău', description_quality: 'verified', ...extra });
}
const enoughText = 'You will work with our team and learn practical skills through real projects. We offer a salary and a modern office in Chișinău.';

for (const [title, category] of [
  ['Junior Linux - Network Administrator', 'Systems & Networks'],
  ['DevOps Engineer Junior', 'Systems & Networks'],
  ['Junior QA Automation Python', 'QA & Testing'],
  ['Junior Data Scientist - Python Developer', 'Data & Analytics'],
  ['CRM Data Entry & Verification Specialist', 'Data Entry & Operations'],
  ['IT Product Manager Internship', 'Product & Project Assistance'],
  ['Junior Graphic Designer', 'Design & UX'],
  ['Asistent WordPress & Content', 'Web Content & E-commerce'],
  ['Junior SOC Analyst', 'Cybersecurity & Monitoring'],
  ['SEO specialist (junior)', 'Marketing & Web Tech'],
  ['Младший разработчик', 'Software Development'],
  ['Специалист ИТ-поддержки', 'IT Support & Helpdesk'],
  ['Internship IT', 'IT Internships'],
]) test(`role: ${title}`, () => assert.equal(analyze(title,enoughText).category, category));

test('sales and office internships at an IT company are unrelated', () => {
  for (const title of ['Junior Recruiter Specialist','Junior Account Manager','Asistent director / Office Manager','Finance & Accounting Controller (intern)']) {
    assert.equal(analyze(title, `We are a software development company. ${enoughText}`).entryFit, 'excluded');
  }
});
test('customer support needs technical work to qualify', () => {
  assert.equal(analyze('Customer Support Representative', `Handle travel bookings and customer complaints. ${enoughText}`).status, 'excluded');
  assert.equal(analyze('Customer Support Representative', `No experience required. Help users with technical issues and software issues. ${enoughText}`).category, 'IT Support & Helpdesk');
});
test('benefits and company introduction do not change a title category', () => {
  const job = analyze('Junior PHP Developer', `Responsibilities:\nWrite code for our website.\nBenefits:\nEnglish courses, marketing activities and a customer support team. ${enoughText}`);
  assert.equal(job.category, 'Software Development');
  assert.ok(!JSON.parse(job.tags).includes('English Required'));
});
for (const requirement of ['Minimum 2 years of experience.', 'Experiență de cel puțin 2 ani.', 'Опыт работы не менее 2-х лет.', '3+ years of experience.', 'Experiență de 5 ani.', 'At least 10 years of experience.']) {
  test(`required experience excludes: ${requirement}`, () => {
    const result = analyze('Junior Developer', `Requirements:\n${requirement}\n${enoughText}`);
    assert.equal(result.entryFit, 'excluded');
    assert.ok(JSON.parse(result.qualityFlags).includes('EXPERIENCE_INFLATION_2PLUS_YEARS'));
  });
}
test('preferred experience is not a hard requirement', () => {
  const result = analyze('Junior Developer', `Requirements:\nNo experience required.\nNice to have:\n2 years of experience preferred.\nBenefits:\n${enoughText}`);
  assert.equal(result.entryFit, 'beginner');
  assert.equal(result.experienceMin, null);
});
test('student alternative preserves ambiguity', () => {
  const result = analyze('Junior Developer', `Cerințe:\nExperiență de cel puțin 2 ani sau studenți.\n${enoughText}`);
  assert.equal(result.entryFit, 'review');
  assert.ok(JSON.parse(result.qualityFlags).includes('EXPERIENCE_OR_STUDENTS'));
});
test('contradictory no-experience claim does not produce beginner match', () => {
  assert.equal(analyze('Junior Developer', `No experience required. Requirements:\nAt least 2 years of experience. ${enoughText}`).entryFit, 'review');
});
test('range lower bound and months are parsed', () => {
  assert.equal(analyze('Junior Developer', `Requirements:\n0-2 years of experience. ${enoughText}`).entryFit, 'beginner');
  assert.equal(analyze('Junior Developer', `Requirements:\n1-3 years of experience. ${enoughText}`).entryFit, 'stretch');
  assert.equal(analyze('Junior Developer', `Requirements:\n6 months of experience. ${enoughText}`).experienceMin, 0.5);
});
test('company age and training duration do not become work experience', () => {
  assert.equal(analyze('Internship IT', `Our company has 12 years of experience. We offer 6 months of training. ${enoughText}`).experienceMin, null);
});
test('mandatory training fees in all languages are excluded', () => {
  for (const text of ['A training fee is required.', 'Taxă de instruire: 500 lei.', 'Платное обучение перед началом работы.']) {
    assert.equal(analyze('Junior IT Support', `${text} ${enoughText}`).status, 'excluded');
  }
});
test('free employer training and paid internships are kept', () => {
  for (const text of ['No training fee. Training provided.', 'Training fee covered: company pays all costs.', 'Бесплатное обучение за счет работодателя.']) {
    assert.equal(analyze('IT Internship', `${text} ${enoughText}`).status, 'active');
  }
  assert.equal(analyze('IT Internship', `This is a paid internship. ${enoughText}`).paymentStatus, 'paid');
  assert.equal(analyze('IT Internship', `This is an unpaid internship. ${enoughText}`).entryFit, 'excluded');
});
test('Germany mentioned in benefits does not imply relocation', () => {
  assert.equal(analyze('Junior Developer', `Benefits:\nGerman language courses, clients in Germany. ${enoughText}`).status, 'active');
  assert.equal(analyze('Junior Java Developer with onboarding in Germany', enoughText).status, 'excluded');
});
test('location and remote eligibility are separate', () => {
  assert.equal(analyze('Junior Developer', enoughText, {location:'Bălți'}).status, 'excluded');
  assert.equal(analyze('Junior Developer', enoughText, {location:'Moldova',work_mode:'Remote'}).status, 'active');
  assert.equal(analyze('Junior Developer', enoughText, {location:'Romania',work_mode:'Remote'}).status, 'excluded');
  assert.equal(analyze('Junior Developer', enoughText, {location:''}).entryFit, 'review');
});
test('Romanian and Russian language requirements work; preferred languages stay optional', () => {
  const result = analyze('Junior IT Support', `Cerințe:\nCunoașterea limbii engleze nivel B2. Знание русского языка.\nNice to have:\nGerman language preferred.\nBenefits:\nFree French courses. ${enoughText}`);
  const tags = JSON.parse(result.tags);
  assert.ok(tags.includes('English Required')); assert.ok(tags.includes('Russian Required'));
  assert.ok(tags.includes('German Preferred')); assert.ok(!tags.includes('French Required'));
});
test('C#, .NET and C++ match literal punctuation without matching JavaScript as Java', () => {
  const tags = JSON.parse(analyze('Junior C# / .NET Developer', `Requirements:\nC++, JavaScript, Python and SQL. ${enoughText}`).tags);
  for (const tag of ['C# / .NET','C++','JavaScript / Node','Python','SQL / DB']) assert.ok(tags.includes(tag), tag);
  assert.ok(!tags.includes('Java'));
});
test('incomplete descriptions and mixed seniority stay reviewable', () => {
  assert.equal(analyze('Junior Developer','').entryFit, 'review');
  assert.equal(analyze('Programator 1C (Junior / Middle)',enoughText).entryFit, 'review');
});
test('degree requirement is distinct from explicit no-degree acceptance', () => {
  assert.equal(analyze('Junior SEO Specialist', `Requirements:\nStudii superioare. ${enoughText}`).entryFit,'review');
  const result = analyze('IT Support (Entry Level)', `Previous experience or technical studies are not required. ${enoughText}`);
  assert.equal(result.entryFit,'beginner'); assert.ok(JSON.parse(result.tags).includes('No Degree Required'));
});
test('repeated multilingual headers and HTML lists preserve sections', () => {
  const result = extractSections('<h2>Cerințe:</h2><ul><li>SQL</li></ul><h2>Responsabilități:</h2><p>Write code</p><h2>Requirements:</h2><p>English required</p><h2>Benefits:</h2><p>Free courses</p>');
  assert.match(result.requirements,/SQL/); assert.match(result.requirements,/English/);
  assert.match(result.responsibilities,/Write code/); assert.doesNotMatch(result.requirements,/Free courses/);
});
test('listing span titles are retained and navigation URLs ignored', () => {
  const result = extractListing('<a class="vacancyShowPopup" href="/ro/lucru/junior-qa/123"><svg></svg><span>Junior QA</span></a><a href="/ro/locuri-de-munca/orase">Jobs</a>', 'Lucru.md');
  assert.equal(result.length,1); assert.equal(result[0].title,'Junior QA');
  assert.equal(safeJobLink('https://evil.test/ro/lucru/job/123','Lucru.md'),null);
});
test('vacancy extraction excludes scripts, articles, related jobs and social links', () => {
  const html = `<script type="application/ld+json">{"@type":"JobPosting","hiringOrganization":{"name":"Good Employer"}}</script><nav>5 years of experience</nav><div class="vacancy-content"><h2>Requirements:</h2><p>No experience required. ${enoughText}</p></div><article>Unrelated blog</article><a href="/company/facebook">LinkedIn</a><script>evil()</script>`;
  const result = extractDetails(html,'Lucru.md');
  assert.equal(result.company,'Good Employer');
  assert.doesNotMatch(result.description,/evil|Unrelated|5 years/);
  assert.throws(()=>extractDetails('<body>A blog and a menu only</body>','Delucru.md'));
});
test('corrupt stored whole-page data is quarantined and Delucru boundaries recovered', () => {
  assert.equal(cleanStoredDescription({source:'Rabota.md',description:'x'.repeat(100000)}).quality,'contaminated');
  const result = cleanStoredDescription({source:'Delucru.md',description:'Menu Germany Descrierea poziției vacante links Descrierea poziției vacante No experience required. Trimite CV Despre companie 10 years of experience.'});
  assert.equal(result.text,'No experience required.');
});
test('candidate discovery includes untitled beginner domains, excludes obvious senior titles', () => {
  assert.ok(isCandidate('Data Entry Specialist')); assert.ok(isCandidate('Stagiar SEO'));
  assert.equal(isCandidate('Senior Golang Engineer'),false);
});
test('advanced or unquantified work experience stays in needs checking', () => {
  assert.equal(analyze('Junior Java Developer', `Requirements:\nDeep knowledge of Spring Boot. ${enoughText}`).entryFit,'review');
  assert.equal(analyze('Junior Developer', `Requirements:\nPrevious work experience in development. ${enoughText}`).entryFit,'review');
});
test('numbers written as words and upper limits are distinguished', () => {
  for (const requirement of ['Two years of experience required.','Experiență de doi ani.','Опыт работы не менее двух лет.']) {
    assert.equal(analyze('Junior Developer',`Requirements:\n${requirement} ${enoughText}`).experienceMin,2);
  }
  assert.equal(analyze('Junior Developer',`Requirements:\nUp to 1 year of experience. ${enoughText}`).experienceMin,0);
});
test('current students satisfy an unfinished degree alternative', () => {
  const result = analyze('Junior DevOps Engineer', `Vom aprecia să ai:\nStudii superioare finalizate sau în curs de finalizare.\nCunoștințe de bază Linux. ${enoughText}`);
  assert.equal(result.entryFit,'beginner');
  assert.ok(JSON.parse(result.tags).includes('Students / Graduates Welcome'));
});
test('foreign internship with a later local job is excluded', () => {
  const result = analyze('C++ internship',`Travel costs reimbursement. Free accommodation throughout the internship. After the internship, a well-paid job in Chisinau. ${enoughText}`);
  assert.equal(result.status,'excluded');
});
test('expired source pages and junior-labelled course advertisements are excluded', () => {
  assert.equal(analyze('Junior Developer',enoughText,{availability:'closed'}).status,'excluded');
  assert.equal(analyze('QA training course for juniors',enoughText).status,'excluded');
});
test('generic entry IT titles use the actual duties above the requirements header', () => {
  const result = analyze('Entry-Level IT Job (Training Provided)', `Provide support to clients regarding technical issues and password reset.\nRequirements:\nEnglish advanced level.\n${enoughText}`);
  assert.equal(result.category,'IT Support & Helpdesk');
  assert.ok(JSON.parse(result.tags).includes('English Required'));
});
test('Russian optional experience and no-experience variants remain beginner friendly', () => {
  assert.equal(analyze('Junior Linux Administrator',`Требования к кандидатам:\nОпыт работы с Linux является преимуществом.\nОпыт работы - не обязательно.\n${enoughText}`).entryFit,'beginner');
});
test('Russian technical degree requirements are not lost under alternative headers', () => {
  const result = analyze('Инженер технической поддержки',`Что мы ожидаем от кандидата\nВысшее техническое образование.\nОпыт работы не обязателен.\n${enoughText}`);
  assert.equal(result.entryFit,'review'); assert.ok(JSON.parse(result.qualityFlags).includes('DEGREE_REQUIRED'));
});
test('future job salary does not imply a paid internship', () => {
  const result = analyze('Stagiar SEO',`Oferim stagiere cu angajare ulterioară.\nCerințe:\nCunoștințe SEO de bază.\nBeneficii:\nPosibilitatea de angajare și salariu foarte competitiv în acest caz.`);
  assert.equal(result.paymentStatus,'unknown'); assert.equal(result.entryFit,'review');
  assert.ok(!JSON.parse(result.tags).includes('Paid Internship'));
});
test('Cyrillic й and ё survive accent normalization', () => {
  const { normalize } = require('../lib/text');
  assert.equal(normalize('Кишинёв, английский; Chișinău'),'кишинёв, английский; chisinau');
  const result = analyze('Junior IT Support',`Требования:\nЗнание английского языка.\n${enoughText}`);
  assert.ok(JSON.parse(result.tags).includes('English Required'));
  assert.equal(analyze('Стажер SEO',`Мы предлагаем стажировку с последующим трудоустройством.\n${enoughText}`).entryFit,'review');
});
