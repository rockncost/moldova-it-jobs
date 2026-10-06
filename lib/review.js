const REVIEW_REASONS = [
  { value: 'experience', label: 'Experience & skills', flags: ['EXPERIENCE_UNCLEAR','CONFLICTING_EXPERIENCE','EXPERIENCE_OR_STUDENTS','MIXED_SENIORITY','ADVANCED_SKILLS_REQUESTED'] },
  { value: 'degree', label: 'Completed degree requested', flags: ['DEGREE_REQUIRED'] },
  { value: 'pay', label: 'Internship pay unclear', flags: ['INTERNSHIP_PAY_UNCLEAR'] },
  { value: 'details', label: 'Missing vacancy details or location', flags: ['DESCRIPTION_UNVERIFIED','LOCATION_UNCONFIRMED'] },
];

function reviewReasons(job) {
  if (job.entry_fit !== 'review') return [];
  return REVIEW_REASONS.filter(reason => reason.flags.some(flag => job.quality_flags.includes(flag))).map(reason => reason.value);
}

module.exports = { REVIEW_REASONS, reviewReasons };
