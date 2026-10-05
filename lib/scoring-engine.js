const { CONCEPTS } = require('./concept-graph');

function calculateSectionScore(sectionText, conceptRules) {
  if (!sectionText) return 0;
  let score = 0;

  conceptRules.forEach(({ regex, weight }) => {
    const matches = sectionText.match(new RegExp(regex.source, 'gi'));
    if (matches) {
      score += matches.length * weight;
    }
  });

  return score;
}

function evaluateJob(jobTitle, sections) {
  const sectionWeights = {
    title: 3.0,
    responsibilities: 2.0,
    requirements: 1.5,
    benefits: 0.5,
  };

  // 1. Calculate Exposure Score (Customer Interaction)
  const exposureScore =
    calculateSectionScore(jobTitle, CONCEPTS.CUSTOMER_INTERACTION) * sectionWeights.title +
    calculateSectionScore(sections.responsibilities, CONCEPTS.CUSTOMER_INTERACTION) * sectionWeights.responsibilities +
    calculateSectionScore(sections.requirements, CONCEPTS.CUSTOMER_INTERACTION) * sectionWeights.requirements +
    calculateSectionScore(sections.benefits, CONCEPTS.CUSTOMER_INTERACTION) * sectionWeights.benefits;

  // 2. Calculate Domain Category Scores
  const devScore =
    calculateSectionScore(jobTitle, CONCEPTS.SOFTWARE_DEV) * sectionWeights.title +
    calculateSectionScore(sections.responsibilities, CONCEPTS.SOFTWARE_DEV) * sectionWeights.responsibilities;

  const sysAdminScore =
    calculateSectionScore(jobTitle, CONCEPTS.INFRASTRUCTURE_SYSADMIN) * sectionWeights.title +
    calculateSectionScore(sections.responsibilities, CONCEPTS.INFRASTRUCTURE_SYSADMIN) * sectionWeights.responsibilities;

  const qaScore =
    calculateSectionScore(jobTitle, CONCEPTS.QA_TESTING) * sectionWeights.title +
    calculateSectionScore(sections.responsibilities, CONCEPTS.QA_TESTING) * sectionWeights.responsibilities;

  const marketingScore =
    calculateSectionScore(jobTitle, CONCEPTS.MARKETING_WEB) * sectionWeights.title +
    calculateSectionScore(sections.responsibilities, CONCEPTS.MARKETING_WEB) * sectionWeights.responsibilities;

  // 3. Determine Primary Category
  let category = 'General IT';
  const scores = [
    { cat: 'Software Development', score: devScore + sysAdminScore },
    { cat: 'IT Support & Helpdesk', score: exposureScore },
    { cat: 'QA & Testing', score: qaScore },
    { cat: 'Marketing & Web Tech', score: marketingScore },
  ];

  scores.sort((a, b) => b.score - a.score);
  if (scores[0].score > 2.0) {
    category = scores[0].cat;
  }

  // 4. Quality & Anti-Bait Rules
  const qualityFlags = [];
  const reqInflationScore = calculateSectionScore(sections.requirements, CONCEPTS.EXPERIENCE_INFLATION);

  if (reqInflationScore >= 3.0) {
    qualityFlags.push('EXPERIENCE_INFLATION_2PLUS_YEARS');
  }

  // 5. Dynamic Tag Generation
  const tags = new Set();
  if (exposureScore >= 3.5) tags.add('Customer Facing');

  const shiftScore =
    calculateSectionScore(sections.responsibilities, CONCEPTS.SHIFT_WORK) +
    calculateSectionScore(sections.requirements, CONCEPTS.SHIFT_WORK);
  if (shiftScore >= 2.0) tags.add('Rotational Shifts');

  const trainingScore =
    calculateSectionScore(sections.responsibilities, CONCEPTS.TRAINING_OFFERED) +
    calculateSectionScore(sections.benefits, CONCEPTS.TRAINING_OFFERED);
  if (trainingScore >= 2.0) tags.add('Training Offered');

  if (/\b(english|engleză|английский)\b/i.test(sections.fullText)) {
    tags.add('English Required');
  }

  return {
    category,
    exposureScore: parseFloat(exposureScore.toFixed(2)),
    qualityFlags: JSON.stringify(qualityFlags),
    tags: JSON.stringify(Array.from(tags)),
  };
}

module.exports = { evaluateJob };