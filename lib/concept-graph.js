// Multilingual concept dictionary with weighted token matchers (RO, RU, EN)

const CONCEPTS = {
  CUSTOMER_INTERACTION: [
    { regex: /\b(call center|phone support|suport clienți|suport clienti|preluare apeluri|convorbiri telefonice)\b/i, weight: 3.0 },
    { regex: /\b(звонк|телефон|обращен|входящ|клиент|пользовател)\b/i, regex_ru: true, weight: 2.0 },
    { regex: /\b(tickets|ticketing|tichete|user support|client support|client guidance|end-user|helpdesk)\b/i, weight: 2.0 },
    { regex: /\b(client|customer|interacțiune|comunicare|support)\b/i, weight: 1.0 },
  ],

  SOFTWARE_DEV: [
    { regex: /\b(developer|programator|программист|software engineer|fullstack|frontend|backend)\b/i, weight: 3.0 },
    { regex: /\b(codebase|git|refactoring|scriere cod|разработка по|desarrollo)\b/i, weight: 2.0 },
    { regex: /\b(javascript|node\.js|react|vue|angular|python|java|c#|\.net|c\+\+|php)\b/i, weight: 1.5 },
  ],

  INFRASTRUCTURE_SYSADMIN: [
    { regex: /\b(sysadmin|system administrator|network administrator|rețele|сетей|администрирование)\b/i, weight: 3.0 },
    { regex: /\b(linux|windows server|active directory|hardware|ip|dhcp|dns|equipments|echipamente|trasare fizică)\b/i, weight: 2.0 },
  ],

  QA_TESTING: [
    { regex: /\b(qa engineer|quality assurance|test automation|manual testing|testare software|тестирование)\b/i, weight: 3.0 },
    { regex: /\b(bug report|test cases|selenium|cypress|playwright|postman)\b/i, weight: 2.0 },
  ],

  MARKETING_WEB: [
    { regex: /\b(seo specialist|smm|copywriter|digital marketing|linkbuilder|e-commerce)\b/i, weight: 3.0 },
    { regex: /\b(content|social media|marketing|wordpress|google analytics)\b/i, weight: 2.0 },
  ],

  EXPERIENCE_INFLATION: [
    { regex: /\b(2\+ (ani|years)|3\+ (ani|years)|minimum 2 years|cel puțin 2 ani|cel putin 2 ani|опыт от 2 лет|опыт от 3 лет)\b/i, weight: 3.0 },
  ],

  SHIFT_WORK: [
    { regex: /\b(rotational|24\/7|ture|смены|ночные смены|shift work)\b/i, weight: 2.5 },
  ],

  TRAINING_OFFERED: [
    { regex: /\b(instruire oferim|oferim instruire|training provided|paid training|asigurăm instruire|обучаем)\b/i, weight: 2.5 },
  ],
};

module.exports = { CONCEPTS };