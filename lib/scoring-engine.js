const { CATEGORIES, SKILLS, LANGUAGES } = require('./concept-graph');
const { normalize, phrase } = require('./text');

const ANALYSIS_VERSION = 7;
const OPTIONAL = /preferred|nice to have|would be (?:a )?plus|great to have|not mandatory|welcomed|(?:an? )?advantage|avantaj|de preferat|constituie un plus|желательно|(?:будет|является) (?:плюсом|преимуществом)|приветствуется/u;
const NO_EXPERIENCE = /no (?:prior |previous |professional |work )?experience(?: (?:is )?required| needed| necessary)?|no need (?:of|for) (?:working )?experience|without (?:prior |previous )?experience|experience.{0,45}(?:not required|not necessary)|fara experienta|nu (?:este |e )?(?:necesara|nevoie de) experienta|experienta nu este (?:necesara|obligatorie)|без опыта|опыт.{0,25}не[ -]+(?:требуется|обязател[а-я]*|обязательно)/u;
const ENTRY = phrase('junior|intern(?:ship)?|trainee|entry[- ]level|beginner|stagiar[a-z]*|stagiere|incepator[a-z]*|стажер[а-я]*|стажировк[а-я]*|начинающ[а-я]*|джуниор');
const STUDENTS = /students? (?:welcome|accepted|can apply|in|of)|accept[a-z]*.{0,15}student|(?:sau|or) students?|pentru studenti|studii.{0,50}in curs|студент[а-я]*|выпускник[а-я]*|absolvent[a-z]*|graduates?/u;
const NON_TECH = phrase('accountant|contabil[a-z]*|financial manager|finance|purchasing|achizitii|recruiter|recrutare|office manager|asistent director|ceo assistant|travel assistant|paralegal|lector|profesor|sales|vanzari|account manager|bucatar|casier|водитель|бухгалтер[а-я]*');

function sentences(text) {
  return normalize(text).split(/[\n;!?]+|\.(?=\s+[a-zа-я])/u).map(s => s.trim()).filter(Boolean);
}

function experienceRequirement(sections) {
  const required = [];
  const preferred = [];
  const alternatives = [];
  const yearPattern = /(?<![\p{L}\p{N}])(\d{1,2})(?:\s*(?:-|to|до)\s*(\d{1,2}))?\s*(?:\+|-х|-го)?\s*(years?|yrs?|ani|an|лет|года?|luni|months?|месяц[а-я]*)(?!\p{L})/gu;
  const requirementSentences = sentences(sections.requirements || '');
  for (const sentence of sentences(sections.fullText)) {
    // Company age, contracts and training duration are not applicant experience.
    const experienceContext = /experien[a-z]*|опыт[а-я]*/u.test(sentence);
    const implicitRequirement = requirementSentences.includes(sentence) && /minimum|minim|at least|cel putin|не менее|от \d/u.test(sentence);
    if ((!experienceContext && !implicitRequirement) || /(?:company|compania|компания|работаем).{0,80}(?:years?|ani|лет)/u.test(sentence)) continue;
    const numbers = {one:1,two:2,three:3,four:4,five:5,ten:10,un:1,doi:2,doua:2,trei:3,patru:4,cinci:5,одного:1,двух:2,трех:3,пяти:5};
    const numericSentence = sentence.replace(/\b(one|two|three|four|five|ten|un|doi|doua|trei|patru|cinci)(?=\s+(?:years?|ani|an)\b)|(?<!\p{L})(одного|двух|трех|пяти)(?=\s+(?:лет|года?))/gu, (_,latin,russian)=>numbers[latin || russian]);
    for (const match of numericSentence.matchAll(yearPattern)) {
      const vicinity = numericSentence.slice(Math.max(0, match.index - 100), match.index + match[0].length + 100);
      if (!/experien[a-z]*|опыт[а-я]*/u.test(vicinity) && !implicitRequirement) continue;
      if (/training|instruire|обучение/u.test(vicinity) && !/(?:years?|ani|лет).{0,20}(?:of )?experience|experienta.{0,40}\d|опыт.{0,40}\d/u.test(vicinity)) continue;
      const upperBound = /up to|pana la|до\s*$/u.test(numericSentence.slice(Math.max(0, match.index - 20),match.index));
      const amount = upperBound ? 0 : Number(match[1]) / (/luni|months?|месяц/u.test(match[3]) ? 12 : 1);
      const studentAlternative = /(?:or|sau)\s+student|или\s+студент/u.test(sentence);
      const isPreferred = OPTIONAL.test(vicinity) || normalize(sections.preferred || '').includes(sentence);
      (studentAlternative ? alternatives : isPreferred ? preferred : required).push({ years: amount, evidence: sentence });
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
  let exclusionReason = null;
  let category = CATEGORIES.find(c => c.title.test(title))?.name;
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

  const exp = experienceRequirement(sections);
  const noExperience = NO_EXPERIENCE.test(full);
  const entryTitle = ENTRY.test(title);
  const studentFriendly = STUDENTS.test(full);
  const internship = phrase('intern(?:ship)?|trainee|stagiar[a-z]*|stagiu|стажировк[а-я]*|стажер[а-я]*').test(`${title}\n${full}`);
  const senior = phrase('senior|middle|mid[- ]level|lead|principal|head of|team lead|ведущ[а-я]*|старший').test(title);
  const mixedLevel = senior && entryTitle;

  if (noExperience) tags.add('No Experience Required');
  if (studentFriendly) tags.add('Students / Graduates Welcome');
  if (entryTitle && !internship) tags.add('Junior / Entry Level');
  if (internship) tags.add('Internship / Trainee');
  if (exp.minimum !== null && exp.minimum >= 2) flags.add('EXPERIENCE_INFLATION_2PLUS_YEARS');
  else if (exp.minimum !== null && exp.minimum >= 1) flags.add('EXPERIENCE_REQUIREMENT_1YEAR');
  else if (exp.minimum > 0) flags.add('SOME_EXPERIENCE_REQUIRED');
  if (exp.preferred.length) tags.add('Experience Preferred');
  if (exp.alternatives.length) flags.add('EXPERIENCE_OR_STUDENTS');
  if (noExperience && exp.minimum > 0) flags.add('CONFLICTING_EXPERIENCE');
  if (mixedLevel) flags.add('MIXED_SENIORITY');
  const advancedSkills = /deep knowledge|extensive (?:knowledge|experience)|proven track record|expert[- ]level|cunostinte avansate|глубок[а-я]* знания|экспертн[а-я]* уров/u.test(relevant);
  const vagueExperience = sentences(sections.requirements || '').some(s => /(?:previous|professional|work) experience|experienced in|experienta (?:de lucru|profesionala)|опыт работы/u.test(s)
    && !NO_EXPERIENCE.test(s) && !OPTIONAL.test(s) && !/\d|students?|studenti/u.test(s));
  if (advancedSkills) flags.add('ADVANCED_SKILLS_REQUESTED');
  if (vagueExperience && exp.minimum === null) flags.add('EXPERIENCE_UNCLEAR');

  const feeEvidence = sentences(sections.fullText || '').find(s =>
    /curs(?:uri)? contra cost|taxa de (?:instruire|participare|inscriere)|training fee|tuition fee|(?:pay|purchase|buy).{0,35}(?:training|course)|(?:training|course).{0,35}(?:costs?|fee)|платн[а-я]* (?:обучение|курс[а-я]*)|оплат[а-я]*.{0,25}(?:обучение|курс[а-я]*)|взнос.{0,25}обучение/u.test(s)
      && !/no (?:training |tuition )?fees?|free (?:training|course)|no need to pay|do not (?:have to )?pay|without.{0,20}fee|fara tax[a-z]*|gratuit|бесплатн[а-я]*|не нужно платить|за счет (?:компании|работодателя)|company (?:pays|covers)|employer (?:pays|covers)/u.test(s));
  const courseAdvert = /(?:curs(?:uri)?|bootcamp|training course|курс[а-я]*)/u.test(title) && !/instructor|trainer/u.test(title);
  const unpaid = /unpaid (?:internship|training|position)|(?:internship|training) is unpaid|stagiu neremunerat|fara (?:salariu|remunerare)|неоплачиваем[а-я]* (?:стажировк[а-я]*|обучение)|стажировк[а-я]*.{0,20}без оплаты/u.test(full);
  const training = /(?:training|instruire|intruire) (?:provided|offered|oferim)|(?:we (?:offer|provide)|oferim|asiguram).{0,40}(?:training|instruire)|paid training|обучаем|предоставляем обучение|за счет.{0,20}обучение|instruire (?:personala|completa)/u.test(`${title}\n${full}`);
  const salaryText = normalize(metadata.salary || '');
  const internshipPaid = /paid (?:internship|training)|(?:internship|training).{0,25}(?:paid|salary)|salariu.{0,35}(?:instruire|stagiu)|программа.{0,30}оплачивается|оплачиваем[а-я]* стажировк[а-я]*/u.test(full);
  const futureEmployment = internship && /angajare ulterioara|последующим трудоустройством|after (?:the )?(?:internship|training).{0,50}(?:salary|job)|salariu.{0,20}in acest caz/u.test(full);
  const paid = internshipPaid || (!futureEmployment && /salary|salariu|remunerat|зарплата|заработн[а-я]* плат[а-я]*|compensation|\d.{0,20}(?:mdl|usd|eur|lei)/u.test(`${salaryText}\n${full}`));
  const paymentStatus = feeEvidence ? 'fee_required' : unpaid ? 'unpaid' : paid ? 'paid' : 'unknown';
  if (training) tags.add('Employer Training');
  if (internshipPaid && internship) tags.add('Paid Internship');
  if (futureEmployment && !internshipPaid) flags.add('INTERNSHIP_PAY_UNCLEAR');
  if (feeEvidence || courseAdvert) { exclusionReason = 'A course or applicant training fee is advertised.'; flags.add('TRAINING_FEE_OR_COURSE'); }
  if (unpaid) { exclusionReason = 'The listing explicitly advertises unpaid work or training.'; flags.add('UNPAID'); }
  if (paymentStatus === 'unknown') flags.add('PAY_NOT_STATED');

  const relocation = /(?:relocat[a-z]*|onboarding|internship|training|stagiu|обучение|стажировк[а-я]*|переезд).{0,60}(?:germany|germania|германи[а-я]*|abroad|strainatate)|(?:mandatory|required).{0,20}relocation|location:\s*[^\n]{0,50}(?:germany|германи[а-я]*)/u.test(`${title}\n${full}`)
    || (/internship|стажировк[а-я]*/u.test(title) && /travel costs reimbursement/u.test(full) && /free accommodation throughout the internship/u.test(full) && /after the internship.{0,70}chisinau/u.test(full));
  const location = metadata.location || '';
  const local = /chisinau|кишин[её]в/u.test(normalize(location));
  const mode = normalize(metadata.work_mode || '');
  const remote = /remote|telecommut|la distanta|дистанцион|удален/u.test(mode)
    || /(?:work|working|lucru|munca).{0,15}(?:remote|la distanta)|remote (?:work|position|role)|удаленн[а-я]* работ[а-я]*/u.test(full);
  const hybrid = /hybrid|hibrid|гибрид/u.test(mode || full);
  const remoteAllowed = remote && (!location || local || /moldova|worldwide|anywhere|молдова/u.test(normalize(location)));
  if (relocation) { exclusionReason = 'The programme requires onboarding or relocation abroad.'; flags.add('RELOCATION_REQUIRED'); }
  if (location && !local && !remoteAllowed) { exclusionReason = 'The advertised workplace is outside Chișinău.'; flags.add('OUTSIDE_CHISINAU'); }
  if (!location) flags.add('LOCATION_UNCONFIRMED');
  if (remote) tags.add('Remote');
  if (hybrid) tags.add('Hybrid');
  const schedule = normalize(metadata.schedule || '');
  if (/part[- ]time|jumatate de norma|неполный/u.test(`${schedule}\n${full}`)) tags.add('Part Time');
  if (/flexible (?:schedule|hours)|program flexibil|гибкий график/u.test(full)) tags.add('Flexible Schedule');
  if (/rotational|24\/7|shift work|night shifts?|rotating shifts?|lucru in ture|ночн[а-я]* смен[а-я]*|сменный график/u.test(full)) tags.add('Rotational Shifts');
  if (/permis(?:ul)? de conducere|permis.{0,20}cat\.?\s*b|driver'?s licen[cs]e|driving licen[cs]e|водительск[а-я]* (?:прав[а-я]*|удостоверение)/u.test(full)) tags.add("Driver's License");

  const noDegree = /no (?:degree|formal education|technical studies)|(?:degree|technical studies).{0,30}(?:not required|not necessary)|studii.{0,20}nu sunt obligatorii|без высшего образования/u.test(full);
  const degreeRequired = !noDegree && sentences(sections.requirements || '').some(s =>
    /bachelor'?s?|university|higher education|studii superioare|высшее (?:техническое )?образование/u.test(s)
    && !OPTIONAL.test(s) && !/or equivalent|or relevant experience|sau experienta|in curs|student|pursuing|currently studying|незаконченн[а-я]*|или опыт/u.test(s));
  if (noDegree) tags.add('No Degree Required');
  if (degreeRequired) flags.add('DEGREE_REQUIRED');
  if (/portfolio|portofoliu|портфолио/u.test(relevant)) tags.add('Portfolio');

  for (const [language, pattern] of LANGUAGES) {
    const languageRegex = phrase(pattern);
    if (languageRegex.test(title)) { tags.add(`${language} Required`); continue; }
    for (const s of sentences([sections.requirements, sections.preferred, sections.intro, sections.responsibilities].filter(Boolean).join('\n') || sections.fullText || '')) {
      if (!languageRegex.test(s)) continue;
      if (/courses?|cursuri|обучение|курсы/u.test(s) && !/required|knowledge|cuno[a-z]*|владение|знание/u.test(s)) continue;
      if (OPTIONAL.test(s) || normalize(sections.preferred || '').includes(s)) tags.add(`${language} Preferred`);
      else if (!/not required|not necessary|nu este obligator|не требуется/u.test(s) && /required|speak|knowledge|fluent|intermediate|advanced|good|skills|b[12]|c[12]|limb[a-z]*|cuno[a-z]*|nivel|владение|знание|уровень|язык/u.test(s)) tags.add(`${language} Required`);
    }
    if (tags.has(`${language} Required`)) tags.delete(`${language} Preferred`);
  }
  for (const [tag, regex] of SKILLS) if (regex.test(`${title}\n${relevant}`)) tags.add(tag);
  const customerFacing = /(?:phone|email|chat|tickets?|tichete|telefon|apeluri|клиент[а-я]*|пользовател[а-я]*).{0,50}(?:support|suport|поддержк[а-я]*)|(?:support|suport|поддержк[а-я]*).{0,50}(?:clients?|customers?|users?|clienti|клиент[а-я]*|пользовател[а-я]*)/u.test(relevant);
  if (customerFacing) tags.add('Customer Facing');

  const complete = full.length >= 100 && !['missing', 'contaminated'].includes(metadata.description_quality);
  let entryFit = 'review';
  let fitScore = 35;
  if (noExperience) { fitScore += 35; reasons.push({ label: 'The vacancy explicitly says experience is not required.' }); }
  if (entryTitle) { fitScore += 20; reasons.push({ label: 'The title advertises a junior, trainee or internship role.' }); }
  if (studentFriendly) { fitScore += 15; reasons.push({ label: 'Students or graduates are mentioned as applicants.' }); }
  if (training) { fitScore += 5; reasons.push({ label: 'Employer training is mentioned; confirm any conditions before accepting.' }); }
  if (exp.minimum !== null) reasons.push({ label: `At least ${Number(exp.minimum.toFixed(2))} year(s) of experience stated.`, evidence: exp.required.find(e => e.years === exp.minimum)?.evidence });
  if (exp.alternatives.length) reasons.push({ label: 'Experience is listed with a student alternative; confirm eligibility.', evidence: exp.alternatives[0].evidence });
  if (!complete) { flags.add('DESCRIPTION_UNVERIFIED'); reasons.push({ label: 'Full vacancy details could not be verified.' }); }
  if (!noExperience && !entryTitle && !studentFriendly) reasons.push({ label: 'The vacancy does not explicitly welcome beginners.' });
  if (degreeRequired) reasons.push({ label: 'A completed degree appears in the requirements; students should check eligibility.' });
  if (advancedSkills) reasons.push({ label: 'Advanced skills are requested despite the beginner signals.' });
  if (flags.has('INTERNSHIP_PAY_UNCLEAR')) reasons.push({ label: 'Only future employment pay is described; internship pay is not confirmed.' });
  if (vagueExperience && exp.minimum === null) reasons.push({ label: 'Previous work experience is requested without a clear minimum.' });
  if (complete && (noExperience || entryTitle || studentFriendly) && !mixedLevel && !degreeRequired && !advancedSkills && !(vagueExperience && exp.minimum === null) && !exp.alternatives.length && !flags.has('CONFLICTING_EXPERIENCE') && !flags.has('INTERNSHIP_PAY_UNCLEAR')) {
    entryFit = exp.minimum > 0 ? 'stretch' : 'beginner';
  }
  if (exp.minimum >= 2 && !flags.has('CONFLICTING_EXPERIENCE')) {
    exclusionReason = 'At least two years of experience are required.';
  }
  if (senior && !mixedLevel) { exclusionReason = 'The title advertises an experienced or senior role.'; flags.add('SENIOR_ROLE'); }
  if (metadata.availability === 'closed') { exclusionReason = 'The original vacancy page is no longer available.'; flags.add('VACANCY_CLOSED'); }
  if (exclusionReason) { entryFit = 'excluded'; fitScore = 0; reasons.unshift({ label: exclusionReason }); }
  if (entryFit === 'review') fitScore = Math.min(fitScore, 49);
  if (entryFit === 'stretch') fitScore = Math.min(fitScore, 65);
  if (flags.has('LOCATION_UNCONFIRMED') && entryFit === 'beginner') { entryFit = 'review'; fitScore = Math.min(fitScore, 49); reasons.push({ label: 'The workplace location is not confirmed.' }); }

  return {
    category, exposureScore: customerFacing ? 5 : 0,
    qualityFlags: JSON.stringify([...flags]), tags: JSON.stringify([...tags].sort()),
    entryFit, fitScore: Math.min(100, fitScore), experienceMin: exp.minimum,
    paymentStatus, reasons: JSON.stringify(reasons), exclusionReason,
    status: exclusionReason ? 'excluded' : 'active',
  };
}

module.exports = { evaluateJob, experienceRequirement, ANALYSIS_VERSION };
