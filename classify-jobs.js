const db = require('./db');

function classifyJobs() {
  const jobs = db.prepare('SELECT id, title, company, description, link FROM jobs WHERE description IS NOT NULL').all();

  console.log(`Analyzing and classifying ${jobs.length} enriched jobs stored in SQLite...\n`);

  const updateJob = db.prepare(`
    UPDATE jobs
    SET category = @category,
        tags = @tags,
        status = @status
    WHERE id = @id
  `);

  // Target ONLY true relocation programs or paid course requirements
  const excludeProgramRegex = /icg engineering|\biaw\b|onboarding in germany|internship in germany|relocation to germany/i;
  const excludeFeeRegex = /curs contra cost|taxă de instruire|taxa de instruire|taxă de participare/i;

  let activeCount = 0;
  let excludedCount = 0;

  for (const job of jobs) {
    const titleText = (job.title || '').toLowerCase();
    const companyText = (job.company || '').toLowerCase();
    const descText = (job.description || '').toLowerCase();

    const titleAndCompany = `${titleText} ${companyText}`;

    // Soft delete check
    const isExcluded = excludeProgramRegex.test(titleAndCompany) || excludeFeeRegex.test(descText);
    const status = isExcluded ? 'excluded' : 'active';

    if (isExcluded) {
      excludedCount++;
    } else {
      activeCount++;
    }

    let category = 'General IT';
    const tagsSet = new Set();

    // 1. Precise Title-Based Categorization
    if (/qa|tester|test automation|quality assurance|manual test/i.test(titleText)) {
      category = 'QA & Testing';
    } else if (/developer|programator|software|frontend|backend|fullstack|web engineer|coder|c\+\+|c#|java|php|python|embedded|devops|linux|network admin|administrator/i.test(titleText)) {
      category = 'Software Development';
    } else if (/support|help desk|service desk|asistență tehnică|helpdesk|customer support|client support/i.test(titleText)) {
      category = 'IT Support & Helpdesk';
    } else if (/seo|smm|copywriter|content|marketing|digital specialist|linkbuilder|product manager|e-commerce/i.test(titleText)) {
      category = 'Marketing & Web Tech';
    } else if (/data|sql|analyst|analytics|bi|data scientist|data entry/i.test(titleText)) {
      category = 'Data & Analytics';
    } else {
      if (/\b(qa engineer|quality assurance|test automation)\b/i.test(descText)) {
        category = 'QA & Testing';
      } else if (/\b(software developer|full stack|frontend developer|backend developer)\b/i.test(descText)) {
        category = 'Software Development';
      } else if (/\b(helpdesk|technical support|l1 support|l2 support)\b/i.test(descText)) {
        category = 'IT Support & Helpdesk';
      } else if (/\b(seo specialist|smm specialist|digital marketing)\b/i.test(descText)) {
        category = 'Marketing & Web Tech';
      }
    }

    // 2. Skill & Work Condition Tag Extraction
    const titleAndDesc = `${titleText} ${descText}`;

    const conditionRules = [
      { tag: 'Customer Facing', regex: /\b(call center|phone support|suport clienți|client communication|client guidance)\b/i },
      { tag: 'Rotational Shifts', regex: /\b(rotational|shifts|24\/7|ture)\b/i },
      { tag: 'English Required', regex: /\b(english|engleză)\b/i },
      { tag: 'Training Offered', regex: /\b(instruire oferim|training provided|instruire|cursuri)\b/i },
    ];

    conditionRules.forEach(({ tag, regex }) => {
      if (regex.test(titleAndDesc)) {
        tagsSet.add(tag);
      }
    });

    const techCategories = ['Software Development', 'QA & Testing', 'IT Support & Helpdesk', 'Data & Analytics'];
    
    if (techCategories.includes(category)) {
      const techRules = [
        { tag: 'JavaScript / Node', regex: /\b(javascript|node\.js|nodejs|react|vue|angular)\b/i },
        { tag: 'Python', regex: /\bpython\b/i },
        { tag: 'Java', regex: /\bjava\b(?!script)/i },
        { tag: 'C# / .NET', regex: /\b(c#|\.net)\b/i },
        { tag: 'C++', regex: /\bc\+\+\b/i },
        { tag: 'SQL / DB', regex: /\b(sql|postgres|mysql|mongodb|database)\b/i },
      ];

      techRules.forEach(({ tag, regex }) => {
        if (regex.test(titleAndDesc)) {
          tagsSet.add(tag);
        }
      });
    }

    updateJob.run({
      id: job.id,
      category,
      tags: JSON.stringify(Array.from(tagsSet)),
      status,
    });
  }

  console.log(`Classification complete! Active jobs: ${activeCount}, Excluded jobs: ${excludedCount}. Zero database rows were deleted.`);
}

classifyJobs();