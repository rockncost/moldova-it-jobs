const { phrase } = require('./text');

// Titles establish the role; company descriptions and benefits never establish it.
const CATEGORIES = [
  { name: 'Data Entry & Operations', title: phrase('data entry|data verification|operator (?:introducere|validare) date|ввод[а]? данных|оператор баз[ы]? данных'), body: phrase('data entry|verify.{0,25}records|introducerea datelor|ввод данных') },
  { name: 'QA & Testing', title: phrase('qa|tester|testare|test engineer|quality assurance|test automation|тестировщик[а-я]*|тестирование'), body: phrase('test cases|bug reports?|manual testing|testare software|тестирование (?:по|программ)|тест-кейс[а-я]*') },
  { name: 'Design & UX', title: phrase('ux|ui|web designer|graphic designer|designer grafic|design grafic|графический дизайнер|веб-дизайнер'), body: phrase('user interface design|user research|wireframes|prototyping|design de interfete') },
  { name: 'Product & Project Assistance', title: phrase('(?:it |technical |digital |junior |intern )?(?:product manager|product owner)|(?:it |digital )project (?:assistant|coordinator|manager)|(?:asistent|coordonator) proiecte (?:it|digitale)|business analyst|бизнес-аналитик|менеджер (?:it-?продукт[а-я]*|продукт[а-я]*)'), body: phrase('product requirements|user stories|cerinte de business|roadmap|требования к продукту') },
  { name: 'Cybersecurity & Monitoring', title: phrase('cybersecurity|security analyst|soc analyst|soc operator|information security|securitate cibernetica|аналитик.{0,15}безопасности'), body: phrase('security incident|siem|threat detection|incident de securitate') },
  { name: 'IT Support & Helpdesk', title: phrase('(?:it|technical|software|application|application management|systems?|billing systems|support license management) support|support (?:it|engineer|license management)|consultant functional erp|analist productie informatica|help ?desk|service desk|suport (?:it|tehnic)|asistenta tehnica|ит[- ]?поддержк[а-я]*|техническ[а-я]* поддержк[а-я]*|специалист ит'), body: phrase('application support|user access management|technical issues|software issues|password reset|ticketing|help ?desk|troubleshoot[a-z]*|suport(?:ul)? (?:functional|tehnic|angajatilor|utilizatorilor)|probleme (?:tehnice|software)|техническ[а-я]* поддержк[а-я]*') },
  { name: 'Systems & Networks', title: phrase('devops|sysadmin|linux|network administrator|system(?:s)? administrator|administrator (?:de )?(?:sistem[a-z]*|retele)|системн[а-я]* администратор|администратор сет[а-я]*'), body: phrase('active directory|windows server|dhcp|dns|administrare[a-z]*.{0,25}retele|системное администрирование|linux.{0,20}network') },
  { name: 'Data & Analytics', title: phrase('data (?:analyst|scientist|engineer)|analyst date|analytics|bi analyst|business intelligence|analist date|аналитик данных'), body: phrase('data analysis|data visualization|power bi|tableau|analiza datelor|анализ данных') },
  { name: 'Web Content & E-commerce', title: phrase('wordpress|web content|e-?commerce|content (?:editor|manager|assistant)|catalog(?:ue)?|suport web|administrat[a-z]*.{0,15}(?:site|web)|контент-менеджер'), body: phrase('wordpress|product listings|product catalog|cms|administrarea site|catalog de produse') },
  { name: 'Marketing & Web Tech', title: phrase('seo|smm|link ?builder|digital (?:marketing|specialist)|marketing digital|departament marketing|social media|copywriter|цифровой маркетинг'), body: phrase('seo|smm|google ads|social media|marketing digital|link building') },
  { name: 'Software Development', title: phrase('developer|programator|software engineer|software development|frontend|backend|full[- ]?stack|embedded|разработчик[а-я]*|программист[а-я]*'), body: phrase('software development|write.{0,15}code|codebase|dezvoltarea.{0,25}software|programare|программирование|разработка программного обеспечения') },
  { name: 'IT Internships', title: phrase('(?:it |software )internships?|internships? it|stagiu it|стажировк[а-я]*.{0,10}it'), body: phrase('internship it|it internship|stagiu it|стажировк[а-я]*.{0,10}it') },
  { name: 'General IT', title: phrase('it junior|junior it|entry-level it|it trainee|specialist it|specialist tic'), body: phrase('information technology|tehnologii informationale|domeniul tic') },
];

const SKILLS = [
  ['JavaScript / Node', phrase('javascript|typescript|node\\.?js|react|vue|angular')],
  ['Python', phrase('python')], ['Java', phrase('java')],
  ['C# / .NET', phrase('c#|\\.net|dotnet|asp\\.net')], ['C++', phrase('c\\+\\+')],
  ['PHP', phrase('php|laravel')], ['SQL / DB', phrase('sql|mysql|postgres(?:ql)?|sql server|mongodb')],
  ['Linux', phrase('linux|unix')], ['Git', phrase('git|github|gitlab')],
  ['Excel / Sheets', phrase('excel|google sheets')], ['WordPress / CMS', phrase('wordpress|cms')],
  ['Figma', phrase('figma')], ['Manual Testing', phrase('manual testing|testare manuala|ручное тестирование')],
  ['Test Automation', phrase('selenium|cypress|playwright|test automation|automation testing|автоматизация тестирования')],
];

const LANGUAGES = [
  ['English', 'english|englez[\\p{L}]*|английск[а-я]*'],
  ['Romanian', 'roman[ae]|romana|romanian|румынск[а-я]*'],
  ['Russian', 'rusa|ruse|russian|русск[а-я]*'],
  ['Italian', 'italian|italiana|итальянск[а-я]*'],
  ['German', 'german|germana|немецк[а-я]*'],
  ['French', 'french|franceza|французск[а-я]*'],
];

module.exports = { CATEGORIES, SKILLS, LANGUAGES };
