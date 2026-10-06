const { CATEGORIES, SKILLS, LANGUAGES } = require('./concept-graph');
const { normalize, phrase } = require('./text');
const { sentenceRecords, createEvidenceCollector } = require('./evidence');

const ANALYSIS_VERSION = 9;
const OPTIONAL = /preferred|nice to have|would be (?:a )?plus|(?:a|an) (?:plus|asset)|considered an? asset|optional|great to have|not mandatory|welcomed|(?:an? )?advantage|avantaj|de preferat|constituie un plus|желательно|(?:будет|является) (?:плюсом|преимуществом)|приветствуется/u;
const NO_EXPERIENCE = /no (?:prior |previous |professional |work )?experience(?: (?:is )?required| needed| necessary)?|no need (?:of|for) (?:working )?experience|without (?:prior |previous )?experience|experience.{0,45}(?:not required|not necessary|does not matter)|fara experienta|nu (?:este |e )?(?:necesara|nevoie de) experienta|experienta nu este (?:necesara|obligatorie)|experienta.{0,25}nu conteaza|без опыта|опыт.{0,45}не[ -]+(?:требуется|обязател[а-я]*|обязательно|име(?:ет|ют) значения)/u;
const ENTRY = phrase('junior|intern(?:ship)?|trainee|entry[- ]level|beginner|stagiar[a-z]*|stagiere|incepator[a-z]*|стажер[а-я]*|стажировк[а-я]*|начинающ[а-я]*|джуниор');
const BODY_ENTRY = /daca esti la inceput de (?:drum|cariera)|te putem invata restul|(?:acceptam|cautam).{0,25}incepatori|if you are.{0,30}(?:starting your career|a beginner)|beginner applicants (?:welcome|accepted)/u;
const STUDENTS = /students? (?:welcome|accepted|can apply|in|of)|accept[a-z]*.{0,15}student|(?:sau|or) students?|pentru studenti|studii.{0,50}in curs|студент[а-я]*|выпускник[а-я]*|absolvent[a-z]*|graduates?/u;
const NON_TECH = phrase('accountant|contabil[a-z]*|financial manager|finance|purchasing|achizitii|recruiter|recrutare|office manager|asistent director|ceo assistant|travel assistant|paralegal|lector|profesor|sales|vanzari|account manager|bucatar|casier|водитель|бухгалтер[а-я]*');
const DRIVER_LICENSE = /permis(?:ul)? de conducere|permis.{0,20}cat\.?\s*b|driver'?s licen[cs]e|driving licen[cs]e|водитель(?:ск|сик)[а-я]* (?:прав[а-я]*|удостоверение)/u;

function sentences(text) {
  return sentenceRecords(text).map(record => record.normalized);
}

function experienceRequirement(sections) {
  const required = [];
  const preferred = [];
  const alternatives = [];
  const yearPattern = /(?<![\p{L}\p{N}])(\d{1,2})(?:\s*(?:-|to|до)\s*(\d{1,2}))?\s*(?:\+|-х|-го)?\s*(years?|yrs?|ani|an|лет|года?|luni|months?|месяц[а-я]*)(?!\p{L})/gu;
  const requirementSentences = sentences(sections.requirements || '');
  for (const record of sentenceRecords(sections.fullText)) {
    const sentence = record.normalized;
    // Company age, contracts and training duration are not applicant experience.
    const experienceContext = /experien[a-z]*|опыт[а-я]*/u.test(sentence);
    const implicitRequirement = requirementSentences.includes(sentence) && /minimum|minim|at least|cel putin|не менее|от \d/u.test(sentence);
    if ((!experienceContext && !implicitRequirement) || /(?:company|compania|компания|работаем).{0,80}(?:years?|ani|лет)/u.test(sentence)) continue;
    // Mentor tenure and driving history are not years of applicant IT employment.
    if (/mana dreapta a unui|mentored by|under (?:the )?(?:guidance|supervision) of|под руководством.{0,40}(?:наставника|коллеги)/u.test(sentence)
      || /стаж[а-я]* вождения|driving experience|experienta (?:de |in )?conducere/u.test(sentence)) continue;
    const numbers = {one:1,two:2,three:3,four:4,five:5,ten:10,un:1,doi:2,doua:2,trei:3,patru:4,cinci:5,одного:1,двух:2,трех:3,пяти:5};
    const numericSentence = sentence.replace(/\b(one|two|three|four|five|ten|un|doi|doua|trei|patru|cinci)(?=\s+(?:years?|ani|an)\b)|(?<!\p{L})(одного|двух|трех|пяти)(?=\s+(?:лет|года?))/gu, (_,latin,russian)=>numbers[latin || russian]);
    for (const match of numericSentence.matchAll(yearPattern)) {
      const vicinity = numericSentence.slice(Math.max(0, match.index - 100), match.index + match[0].length + 100);
      if (!/experien[a-z]*|опыт[а-я]*/u.test(vicinity) && !implicitRequirement) continue;
      if (/training|instruire|обучение/u.test(vicinity) && !/(?:years?|ani|лет).{0,20}(?:of )?experience|experienta.{0,40}\d|опыт.{0,40}\d/u.test(vicinity)) continue;
      const upperBound = /up to|pana la|до\s*$/u.test(numericSentence.slice(Math.max(0, match.index - 20),match.index));
      const amount = upperBound ? 0 : Number(match[1]) / (/luni|months?|месяц/u.test(match[3]) ? 12 : 1);
      const studentAlternative = /(?:or|sau)\s+student|или\s+студент/u.test(sentence);
      // An optional domain/tool in parentheses does not make the main minimum
      // optional: "1 year as an analyst (e-commerce experience is a plus)".
      const qualifierText = numericSentence.replace(/\([^)]*\)/g, block=>block.includes(match[0]) ? block : '');
      const isPreferred = OPTIONAL.test(qualifierText) || normalize(sections.preferred || '').includes(sentence);
      const mentionedYears = Number(match[2] || match[1]) / (/luni|months?|месяц/u.test(match[3]) ? 12 : 1);
      (studentAlternative ? alternatives : isPreferred ? preferred : required).push({ years: amount, mentionedYears, evidence: record.text });
    }
  }
  return { minimum: required.length ? Math.max(...required.map(r => r.years)) : null, required, preferred, alternatives };
}

function evaluateJob(jobTitle, sections = {}, metadata = {}) {
  const title = normalize(jobTitle);
  const full = normalize(sections.fullText || '');
  const relevant = normalize([sections.intro, sections.responsibilities, sections.requirements].filter(Boolean).join('\n') || sections.fullText || '');
  const flags = new Set();
  const tags = new Set();
  const reasons = [];
  const evidence = createEvidenceCollector(jobTitle, sections, metadata);
  const tagEvidence = (tag, values) => evidence.add('tags', tag, values);
  const flagEvidence = (flag, values) => evidence.add('flags', flag, values);
  let exclusionReason = null;
  let category = CATEGORIES.find(c => c.title.test(title))?.name;
  // An explicit coding occupation takes priority over a platform such as Linux.
  if (phrase('developer|programator|программист[а-я]*|разработчик[а-я]*').test(title)
    && !/data (?:entry|scientist|engineer)|wordpress|qa|test|1c/u.test(title)) category = 'Software Development';
  // Generic support must demonstrate technical duties; "customer" alone isn't IT.
  if (!category && !NON_TECH.test(title)) category = CATEGORIES.find(c => c.body.test(relevant))?.name;
  if (category === 'General IT') {
    category = CATEGORIES.find(c => !['General IT', 'IT Internships'].includes(c.name) && c.body.test(relevant))?.name || category;
  }
  if (!category || NON_TECH.test(title)) {
    category = 'General IT';
    exclusionReason = 'The vacancy does not describe an IT or digital role.';
    flags.add('NOT_RELEVANT');
  }
  if (/programat[a-z]*.{0,25}productie/u.test(title) && /planificarea|comenzilor de productie/u.test(relevant)
    && !/scriere.{0,20}cod|dezvoltare.{0,20}software/u.test(relevant)) {
    category = 'General IT'; exclusionReason = 'The vacancy describes production scheduling rather than software development.'; flags.add('NOT_RELEVANT');
  }
  const categoryRule = CATEGORIES.find(c=>c.name===category);
  const categoryEvidence = categoryRule?.title.test(title) ? evidence.titleEvidence() : evidence.match(categoryRule?.body || /(?!)/u);

  const exp = experienceRequirement(sections);
  const noExperience = NO_EXPERIENCE.test(full);
  const entryTitle = ENTRY.test(title);
  const entryBody = BODY_ENTRY.test(full);
  const entrySignal = entryTitle || entryBody;
  const studentFriendly = STUDENTS.test(full);
  const internship = phrase('intern(?:ship)?|trainee|stagiar[a-z]*|stagiu|стажировк[а-я]*|стажер[а-я]*').test(`${title}\n${full}`);
  const senior = phrase('senior|middle|mid[- ]level|lead|principal|head of|team lead|ведущ[а-я]*|старший').test(title);
  const mixedLevel = senior && entryTitle;
  const priorExperienceMentioned = [...exp.required, ...exp.preferred, ...exp.alternatives].some(e => e.mentionedYears > 0);
  const studentBadge = studentFriendly && !priorExperienceMentioned;

  if (noExperience) tags.add('No Experience Required');
  if (noExperience) tagEvidence('No Experience Required', evidence.match(NO_EXPERIENCE));
  if (studentBadge) tags.add('Students / Graduates Welcome');
  if (studentBadge) tagEvidence('Students / Graduates Welcome', evidence.match(STUDENTS));
  if (entryTitle && !internship) tags.add('Junior / Entry Level');
  if (entryBody && !internship) tags.add('Junior / Entry Level');
  if (tags.has('Junior / Entry Level')) tagEvidence('Junior / Entry Level', entryTitle ? evidence.titleEvidence() : evidence.match(BODY_ENTRY));
  if (internship) tags.add('Internship / Trainee');
  if (internship) tagEvidence('Internship / Trainee', /intern|trainee|stagiar|стаж/u.test(title) ? evidence.titleEvidence() : evidence.match(phrase('intern(?:ship)?|trainee|stagiar[a-z]*|stagiu|стажировк[а-я]*|стажер[а-я]*')));
  if (exp.minimum !== null && exp.minimum >= 2) flags.add('EXPERIENCE_INFLATION_2PLUS_YEARS');
  else if (exp.minimum !== null && exp.minimum >= 1) flags.add('EXPERIENCE_REQUIREMENT_1YEAR');
  else if (exp.minimum > 0) flags.add('SOME_EXPERIENCE_REQUIRED');
  if (exp.preferred.length) tags.add('Experience Preferred');
  const experienceQuotes = records => evidence.fullRecords.filter(r=>records.some(e=>e.evidence===r.text)).flatMap(r=>evidence.find(s=>s===r.normalized));
  if (exp.preferred.length) tagEvidence('Experience Preferred', experienceQuotes(exp.preferred));
  const workQuotes = experienceQuotes(exp.required);
  for (const flag of ['EXPERIENCE_INFLATION_2PLUS_YEARS','EXPERIENCE_REQUIREMENT_1YEAR','SOME_EXPERIENCE_REQUIRED','CONFLICTING_EXPERIENCE']) if (flags.has(flag)) flagEvidence(flag, workQuotes);
  if (exp.alternatives.length) flags.add('EXPERIENCE_OR_STUDENTS');
  if (exp.alternatives.length) flagEvidence('EXPERIENCE_OR_STUDENTS', experienceQuotes(exp.alternatives));
  if (noExperience && exp.minimum > 0) flags.add('CONFLICTING_EXPERIENCE');
  if (mixedLevel) flags.add('MIXED_SENIORITY');
  if (mixedLevel) flagEvidence('MIXED_SENIORITY', evidence.titleEvidence());
  const advancedSkills = /deep knowledge|extensive (?:knowledge|experience)|proven track record|expert[- ]level|cunostinte avansate|глубок[а-я]* знания|экспертн[а-я]* уров/u.test(relevant);
  const priorWorkExperience = s => /(?:previous|professional|work) experience|experienced in|experienta (?:de lucru|profesionala)|опыт работы/u.test(s)
    && !NO_EXPERIENCE.test(s)
    // "Опыт работы с Git" describes using a tool, including in personal projects.
    && (!/опыт работы с\s|experienta (?:de lucru )?cu\s/u.test(s) || /предыдущ|профессиональн|коммерческ|profesionala/u.test(s));
  const vagueExperience = sentences(sections.requirements || '').some(s => priorWorkExperience(s)
    && !OPTIONAL.test(s) && !/\d|students?|studenti/u.test(s));
  const priorWorkMentioned = sentences([sections.requirements, sections.preferred].filter(Boolean).join('\n')).some(priorWorkExperience);
  const optionalExperience = evidence.records.filter(r=> /experience|experienta|опыт/u.test(r.normalized)
    && (OPTIONAL.test(r.normalized) || r.section==='Preferred qualifications')
    && !/(?:company|compania|компания).{0,50}(?:years?|ani|лет)/u.test(r.normalized));
  if (optionalExperience.length) { tags.add('Experience Preferred'); tagEvidence('Experience Preferred', optionalExperience.map(evidence.quote)); }
  if (advancedSkills) flags.add('ADVANCED_SKILLS_REQUESTED');
  if (advancedSkills) flagEvidence('ADVANCED_SKILLS_REQUESTED', evidence.match(/deep knowledge|extensive (?:knowledge|experience)|proven track record|expert[- ]level|cunostinte avansate|глубок[а-я]* знания|экспертн[а-я]* уров/u));
  if (vagueExperience && exp.minimum === null) flags.add('EXPERIENCE_UNCLEAR');
  if (flags.has('EXPERIENCE_UNCLEAR')) flagEvidence('EXPERIENCE_UNCLEAR', evidence.find(s=>priorWorkExperience(s)&&!OPTIONAL.test(s),evidence.records.filter(r=>r.section==='Requirements')));
  if (priorWorkMentioned) tags.delete('Students / Graduates Welcome');

  const feeEvidence = sentences(sections.fullText || '').find(s =>
    /curs(?:uri)? contra cost|taxa de (?:instruire|participare|inscriere)|training fee|tuition fee|(?:pay|purchase|buy).{0,35}(?:training|course)|(?:training|course).{0,35}(?:costs?|fee)|платн[а-я]* (?:обучение|курс[а-я]*)|оплат[а-я]*.{0,25}(?:обучение|курс[а-я]*)|взнос.{0,25}обучение/u.test(s)
      && !/no (?:training |tuition )?fees?|free (?:training|course)|no need to pay|do not (?:have to )?pay|without.{0,20}fee|fara tax[a-z]*|gratuit|бесплатн[а-я]*|не нужно платить|за счет (?:компании|работодателя)|company (?:pays|covers)|employer (?:pays|covers)/u.test(s));
  const courseAdvert = /(?:curs(?:uri)?|bootcamp|training course|курс[а-я]*)/u.test(title) && !/instructor|trainer/u.test(title);
  const unpaid = /unpaid (?:internship|training|position)|(?:internship|training) is unpaid|stagiu neremunerat|fara (?:salariu|remunerare)|неоплачиваем[а-я]* (?:стажировк[а-я]*|обучение)|стажировк[а-я]*.{0,20}без оплаты/u.test(full);
  const trainingRule = /(?:training|instruire|intruire) (?:provided|offered|oferim)|(?:we (?:will )?(?:offer|provide)|oferim|asiguram).{0,80}(?:training|instruire)|paid training|обучаем|предоставляем обучение|за счет.{0,20}обучение|обучение.{0,30}за счет|instruire (?:personala|completa|si mentorat)/u;
  const training = trainingRule.test(`${title}\n${full}`);
  const salaryText = normalize(metadata.salary || '');
  const internshipPaid = /paid (?:internship|training)|(?:internship|training).{0,25}(?:paid|salary)|salariu.{0,35}(?:instruire|stagiu)|программа.{0,30}оплачивается|оплачиваем[а-я]* стажировк[а-я]*/u.test(full);
  const futureEmployment = internship && /angajare ulterioara|последующим трудоустройством|after (?:the )?(?:internship|training).{0,50}(?:salary|job)|salariu.{0,20}in acest caz/u.test(full);
  const paid = internshipPaid || (!futureEmployment && /salary|salariu|remunerat|зарплата|заработн[а-я]* плат[а-я]*|compensation|\d.{0,20}(?:mdl|usd|eur|lei)/u.test(`${salaryText}\n${full}`));
  const paymentStatus = feeEvidence ? 'fee_required' : unpaid ? 'unpaid' : paid ? 'paid' : 'unknown';
  if (training) tags.add('Employer Training');
  if (training) tagEvidence('Employer Training', trainingRule.test(title) ? evidence.titleEvidence() : evidence.match(trainingRule));
  if (internshipPaid && internship) tags.add('Paid Internship');
  if (tags.has('Paid Internship')) tagEvidence('Paid Internship', evidence.match(/paid (?:internship|training)|(?:internship|training).{0,25}(?:paid|salary)|salariu.{0,35}(?:instruire|stagiu)|программа.{0,30}оплачивается|оплачиваем[а-я]* стажировк[а-я]*/u));
  if (futureEmployment && !internshipPaid) flags.add('INTERNSHIP_PAY_UNCLEAR');
  if (flags.has('INTERNSHIP_PAY_UNCLEAR')) flagEvidence('INTERNSHIP_PAY_UNCLEAR', evidence.match(/angajare ulterioara|последующим трудоустройством|after (?:the )?(?:internship|training).{0,50}(?:salary|job)|salariu.{0,20}in acest caz/u));
  if (feeEvidence || courseAdvert) { exclusionReason = 'A course or applicant training fee is advertised.'; flags.add('TRAINING_FEE_OR_COURSE'); }
  if (flags.has('TRAINING_FEE_OR_COURSE')) flagEvidence('TRAINING_FEE_OR_COURSE', courseAdvert ? evidence.titleEvidence() : evidence.find(s=>s===feeEvidence));
  if (unpaid) { exclusionReason = 'The listing explicitly advertises unpaid work or training.'; flags.add('UNPAID'); }
  if (paymentStatus === 'unknown') flags.add('PAY_NOT_STATED');

  const relocation = /(?:relocat[a-z]*|onboarding|internship|training|stagiu|обучение|стажировк[а-я]*|переезд).{0,60}(?:germany|germania|германи[а-я]*|abroad|strainatate)|(?:mandatory|required).{0,20}relocation|location:\s*[^\n]{0,50}(?:germany|германи[а-я]*)/u.test(`${title}\n${full}`)
    || (/internship|стажировк[а-я]*/u.test(title) && /travel costs reimbursement/u.test(full) && /free accommodation throughout the internship/u.test(full) && /after the internship.{0,70}chisinau/u.test(full));
  const location = metadata.location || '';
  const local = /chisinau|кишин[её]в/u.test(normalize(location));
  const mode = normalize(metadata.work_mode || '');
  const remote = /remote|telecommut|la distanta|дистанцион|удален/u.test(mode)
    || /(?:work|working|lucru|munca).{0,15}(?:remote|la distanta)|remote (?:work|position|role)|work from (?:your )?home|удаленн[а-я]* работ[а-я]*/u.test(full);
  const hybrid = /hybrid|hibrid|гибрид/u.test(mode || full);
  const remoteAllowed = remote && (!location || local || /moldova|worldwide|anywhere|молдова/u.test(normalize(location)));
  if (relocation) { exclusionReason = 'The programme requires onboarding or relocation abroad.'; flags.add('RELOCATION_REQUIRED'); }
  if (relocation) flagEvidence('RELOCATION_REQUIRED', /germany|germania|германи/u.test(title) ? evidence.titleEvidence() : evidence.match(/germany|germania|германи|abroad|strainatate|travel costs reimbursement/u));
  if (location && !local && !remoteAllowed) { exclusionReason = 'The advertised workplace is outside Chișinău.'; flags.add('OUTSIDE_CHISINAU'); }
  if (flags.has('OUTSIDE_CHISINAU')) flagEvidence('OUTSIDE_CHISINAU', evidence.field('location'));
  if (!location) flags.add('LOCATION_UNCONFIRMED');
  if (remote) tags.add('Remote');
  if (remote) tagEvidence('Remote', /remote|telecommut|la distanta|дистанцион|удален/u.test(mode) ? evidence.field('work_mode') : evidence.match(/(?:work|working|lucru|munca).{0,15}(?:remote|la distanta)|remote (?:work|position|role)|work from (?:your )?home|удаленн[а-я]* работ[а-я]*/u));
  if (hybrid) tags.add('Hybrid');
  if (hybrid) tagEvidence('Hybrid', /hybrid|hibrid|гибрид/u.test(mode) ? evidence.field('work_mode') : evidence.match(/hybrid|hibrid|гибрид/u));
  const schedule = normalize(metadata.schedule || '');
  if (/part[- ]time|jumatate de norma|неполный/u.test(`${schedule}\n${full}`)) tags.add('Part Time');
  if (tags.has('Part Time')) tagEvidence('Part Time', /part[- ]time|jumatate de norma|неполный/u.test(schedule) ? evidence.field('schedule') : evidence.match(/part[- ]time|jumatate de norma|неполный/u));
  if (/flexible (?:schedule|hours)|program flexibil|гибкий график/u.test(full)) tags.add('Flexible Schedule');
  if (tags.has('Flexible Schedule')) tagEvidence('Flexible Schedule', evidence.match(/flexible (?:schedule|hours)|program flexibil|гибкий график/u));
  if (/rotational|24\/7|24x7|shift work|night shifts?|rotating shifts?|lucru in ture|ночн[а-я]* смен[а-я]*|сменный график/u.test(full)) tags.add('Rotational Shifts');
  if (tags.has('Rotational Shifts')) tagEvidence('Rotational Shifts', evidence.match(/rotational|24\/7|24x7|shift work|night shifts?|rotating shifts?|lucru in ture|ночн[а-я]* смен[а-я]*|сменный график/u));
  if (DRIVER_LICENSE.test(full)) tags.add("Driver's License");
  if (tags.has("Driver's License")) tagEvidence("Driver's License", evidence.match(DRIVER_LICENSE));

  const noDegree = /no (?:degree|formal education|technical studies)|(?:degree|technical studies).{0,30}(?:not required|not necessary)|studii.{0,20}nu sunt obligatorii|без высшего образования/u.test(full);
  const degreeRequired = !noDegree && sentences(sections.requirements || '').some(s =>
    /bachelor'?s?|university|higher education|completed degree|studii superioare|высшее (?:техническое )?образование/u.test(s)
    && !OPTIONAL.test(s) && !/or equivalent|or relevant experience|sau experienta|in curs|student|pursuing|currently studying|незаконченн[а-я]*|студент[а-я]*|или опыт/u.test(s));
  if (noDegree) tags.add('No Degree Required');
  if (noDegree) tagEvidence('No Degree Required', evidence.match(/no (?:degree|formal education|technical studies)|(?:degree|technical studies).{0,30}(?:not required|not necessary)|studii.{0,20}nu sunt obligatorii|без высшего образования/u));
  if (degreeRequired) flags.add('DEGREE_REQUIRED');
  if (degreeRequired) flagEvidence('DEGREE_REQUIRED', evidence.find(s=>/bachelor'?s?|university|higher education|completed degree|studii superioare|высшее (?:техническое )?образование/u.test(s)&&!OPTIONAL.test(s)&&!/or equivalent|or relevant experience|sau experienta|in curs|student|pursuing|currently studying|незаконченн[а-я]*|студент[а-я]*|или опыт/u.test(s),evidence.records.filter(r=>r.section==='Requirements')));
  if (/portfolio|portofoliu|портфолио/u.test(relevant)) tags.add('Portfolio');
  if (tags.has('Portfolio')) tagEvidence('Portfolio', evidence.match(/portfolio|portofoliu|портфолио/u));

  for (const [language, pattern] of LANGUAGES) {
    const languageRegex = phrase(pattern);
    if (languageRegex.test(title)) { tags.add(`${language} Required`); tagEvidence(`${language} Required`, evidence.titleEvidence()); continue; }
    for (const record of sentenceRecords([sections.requirements, sections.preferred, sections.intro, sections.responsibilities].filter(Boolean).join('\n') || sections.fullText || '')) {
      const s = record.normalized;
      if (!languageRegex.test(s)) continue;
      if (/courses?|cursuri|обучение|курсы/u.test(s) && !/required|knowledge|cuno[a-z]*|владение|знание/u.test(s)) continue;
      if (OPTIONAL.test(s) || normalize(sections.preferred || '').includes(s)) { tags.add(`${language} Preferred`); tagEvidence(`${language} Preferred`, evidence.find(text=>text===s)); }
      else if (!/not required|not necessary|nu este obligator|не требуется/u.test(s) && /required|speak|knowledge|proficiency|fluent|intermediate|advanced|good|skills|perfect.{0,20}scris|b[12]|c[12]|limb[a-z]*|cuno[a-z]*|nivel|владение|знание|уровень|язык/u.test(s)) { tags.add(`${language} Required`); tagEvidence(`${language} Required`, evidence.find(text=>text===s)); }
    }
    if (tags.has(`${language} Required`)) tags.delete(`${language} Preferred`);
  }
  for (const [tag, regex] of SKILLS) {
    const skillRecords = evidence.records.filter(r=>r.section!=='Benefits' && regex.test(r.normalized)
      && !(tag==='JavaScript / Node' && /react\s+to/u.test(r.normalized) && !/javascript|typescript|node\.?js|vue|angular|React/u.test(r.text)));
    if (regex.test(title) || skillRecords.length) { tags.add(tag); tagEvidence(tag, regex.test(title) ? evidence.titleEvidence() : skillRecords.slice(0,3).map(evidence.quote)); }
  }
  const customerFacing = /(?:phone|email|chat|tickets?|tichete|telefon|apeluri|клиент[а-я]*|пользовател[а-я]*).{0,50}(?:support|suport|поддержк[а-я]*)|(?:support|suport|поддержк[а-я]*).{0,50}(?:clients?|customers?|users?|clienti|клиент[а-я]*|пользовател[а-я]*)/u.test(relevant);
  if (customerFacing) tags.add('Customer Facing');
  if (customerFacing) tagEvidence('Customer Facing', evidence.match(/(?:phone|email|chat|tickets?|tichete|telefon|apeluri|клиент[а-я]*|пользовател[а-я]*).{0,50}(?:support|suport|поддержк[а-я]*)|(?:support|suport|поддержк[а-я]*).{0,50}(?:clients?|customers?|users?|clienti|клиент[а-я]*|пользовател[а-я]*)/u));

  const complete = full.length >= 100 && !['missing', 'contaminated'].includes(metadata.description_quality);
  let entryFit = 'review';
  let fitScore = 35;
  if (noExperience) { fitScore += 35; reasons.push({ label: 'The vacancy explicitly says experience is not required.' }); }
  if (entryTitle) { fitScore += 20; reasons.push({ label: 'The title advertises a junior, trainee or internship role.' }); }
  else if (entryBody) { fitScore += 20; reasons.push({ label: 'The vacancy explicitly offers a starting route for beginners.', evidence:evidence.match(BODY_ENTRY)[0]?.text }); }
  if (studentBadge && !priorWorkMentioned) { fitScore += 15; reasons.push({ label: 'Students or graduates are mentioned as applicants.' }); }
  else if (studentFriendly) reasons.push({ label: 'Students are mentioned alongside prior experience; experience criteria take priority.' });
  if (training) { fitScore += 5; reasons.push({ label: 'Employer training is mentioned; confirm any conditions before accepting.' }); }
  if (exp.minimum !== null) reasons.push({ label: `At least ${Number(exp.minimum.toFixed(2))} year(s) of experience stated.`, evidence: exp.required.find(e => e.years === exp.minimum)?.evidence });
  if (exp.alternatives.length) reasons.push({ label: 'Experience is listed with a student alternative; confirm eligibility.', evidence: exp.alternatives[0].evidence });
  if (!complete) { flags.add('DESCRIPTION_UNVERIFIED'); reasons.push({ label: 'Full vacancy details could not be verified.' }); }
  if (!noExperience && !entrySignal && !studentFriendly) reasons.push({ label: 'The vacancy does not explicitly welcome beginners.' });
  if (degreeRequired) reasons.push({ label: 'A completed degree appears in the requirements; students should check eligibility.' });
  if (advancedSkills) reasons.push({ label: 'Advanced skills are requested despite the beginner signals.' });
  if (flags.has('INTERNSHIP_PAY_UNCLEAR')) reasons.push({ label: 'Only future employment pay is described; internship pay is not confirmed.' });
  if (vagueExperience && exp.minimum === null) reasons.push({ label: 'Previous work experience is requested without a clear minimum.' });
  if (complete && (noExperience || entrySignal || studentFriendly) && !mixedLevel && !degreeRequired && !advancedSkills && !(vagueExperience && exp.minimum === null) && !exp.alternatives.length && !flags.has('CONFLICTING_EXPERIENCE') && !flags.has('INTERNSHIP_PAY_UNCLEAR')) {
    entryFit = exp.minimum > 0 ? 'stretch' : 'beginner';
  }
  // A clear one-year minimum can be assessed as a stretch role without a junior
  // title. Roles with no beginner evidence belong in their own optional view.
  if (complete && exp.minimum > 0 && exp.minimum < 2 && !mixedLevel && !degreeRequired && !advancedSkills && !exp.alternatives.length && !flags.has('CONFLICTING_EXPERIENCE') && !flags.has('INTERNSHIP_PAY_UNCLEAR')) entryFit = 'stretch';
  if (entryFit === 'review' && !noExperience && !entrySignal && !studentFriendly) {
    entryFit = 'other';
    flags.add('BEGINNER_ELIGIBILITY_UNCONFIRMED');
  }
  if (exp.minimum >= 2 && !flags.has('CONFLICTING_EXPERIENCE')) {
    exclusionReason = 'At least two years of experience are required.';
  }
  if (senior && !mixedLevel) { exclusionReason = 'The title advertises an experienced or senior role.'; flags.add('SENIOR_ROLE'); }
  if (metadata.availability === 'closed') { exclusionReason = 'The original vacancy page is no longer available.'; flags.add('VACANCY_CLOSED'); }
  if (exclusionReason) { entryFit = 'excluded'; fitScore = 0; reasons.unshift({ label: exclusionReason }); }
  if (['review','other'].includes(entryFit)) fitScore = Math.min(fitScore, entryFit === 'other' ? 30 : 49);
  if (entryFit === 'stretch') fitScore = Math.min(fitScore, 65);
  if (flags.has('LOCATION_UNCONFIRMED') && ['beginner','stretch'].includes(entryFit)) { entryFit = 'review'; fitScore = Math.min(fitScore, 49); reasons.push({ label: 'The workplace location is not confirmed.' }); }

  return {
    category, exposureScore: customerFacing ? 5 : 0,
    qualityFlags: JSON.stringify([...flags]), tags: JSON.stringify([...tags].sort()),
    entryFit, fitScore: Math.min(100, fitScore), experienceMin: exp.minimum,
    paymentStatus, reasons: JSON.stringify(reasons), exclusionReason,
    status: exclusionReason ? 'excluded' : 'active',
    tagEvidence: JSON.stringify(Object.fromEntries(Object.entries(evidence.tags).filter(([tag])=>tags.has(tag)))),
    flagEvidence: JSON.stringify(Object.fromEntries(Object.entries(evidence.flags).filter(([flag])=>flags.has(flag)))),
    categoryEvidence: JSON.stringify(categoryEvidence),
  };
}

module.exports = { evaluateJob, experienceRequirement, ANALYSIS_VERSION };
