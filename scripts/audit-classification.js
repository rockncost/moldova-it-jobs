const fs = require('node:fs');
const path = require('node:path');
const { evaluateJob, ANALYSIS_VERSION } = require('../lib/scoring-engine');
const { extractSections } = require('../lib/section-extractor');
const snapshot = require('../tests/fixtures/classification-audit-2026-10-06.json');

const rows = snapshot.cases.map(advert => {
  const result = evaluateJob(advert.title,extractSections(advert.description),advert.metadata);
  const tags=JSON.parse(result.tags), flags=JSON.parse(result.qualityFlags);
  const errors=[];
  if(result.entryFit!==advert.expected.fit) errors.push(`fit: ${result.entryFit}, expected ${advert.expected.fit}`);
  if(result.category!==advert.expected.category) errors.push(`category: ${result.category}, expected ${advert.expected.category}`);
  if(Object.hasOwn(advert.expected,'experience')&&result.experienceMin!==advert.expected.experience) errors.push('experience minimum');
  for(const [values,wanted,present] of [[tags,advert.expected.tags,true],[tags,advert.expected.absentTags,false],[flags,advert.expected.flags,true],[flags,advert.expected.absentFlags,false]]) {
    for(const value of wanted) if(values.includes(value)!==present) errors.push(value);
  }
  const quotes=JSON.parse(result.tagEvidence);
  for(const tag of tags) if(!quotes[tag]?.length) errors.push(`missing evidence: ${tag}`);
  return {advert,result,errors};
});
const changed=rows.filter(row=>row.advert.before.fit!==row.result.entryFit||row.advert.before.category!==row.result.category);
const failed=rows.filter(row=>row.errors.length);
const cell=text=>String(text).replace(/\|/g,'\\|').replace(/\n/g,' ');
const table = rows.map(({advert,result,errors}) => `| ${advert.id} | [${cell(advert.title)}](${advert.link}) | ${advert.before.fit} | ${result.entryFit} | ${cell(result.category)} | ${errors.length ? 'FAIL: '+cell(errors.join(', ')) : 'Pass'} | ${cell(advert.note)} |`).join('\n');
const text=`# Classification audit — ${snapshot.date}

Reviewed **51 saved advert snapshots**: all **19 representative beginner cards** from analysis version 8, **12 Other-role samples**, and **20 excluded samples**. The excluded sample includes suspected misses, senior/experience barriers, unrelated work, a closed page and foreign onboarding. Some snapshots are differently titled variants of the same advert; 51 is a count of reviewed adverts, not unique vacancies.

The labels in the fixture were assigned by reading the saved advert, before checking the corrected classifier. This is a targeted audit, not a random sample or an estimate of market-wide accuracy. Availability and employer terms were not reverified online.

## Result

- Analysis version: **${ANALYSIS_VERSION}**.
- Expected fit/category and selected tag/flag checks: **${rows.length-failed.length}/${rows.length} pass**.
- Reviewed adverts with a corrected fit or category: **${changed.length}**. Additional tag corrections do not change fit/category.
- Each emitted tag has original advert or source-field evidence. Regression tests also check that quotes are unchanged substrings.
- All original beginner cards retain beginner eligibility under the advert-signal policy; this does not establish a probability of hiring.

## Findings and changes

- Moldflowers' mentor has ten years of experience; four applicant adverts were wrongly excluded. Their text explicitly offers a beginner internship. Required Romanian/Russian writing and optional English now have distinct evidence.
- Three years of driving history no longer becomes IT employment experience. The support advert remains Other because of its degree barrier and lack of an explicit beginner invitation.
- English headings such as “what we are looking for” now expose a five-year DevOps requirement. A mandatory one-year analytical minimum stays mandatory when optional e-commerce familiarity appears in parentheses.
- Explicit C/C++ programmer titles take priority over Linux. Manufacturing production scheduling is excluded from software jobs. Application-management, ERP and banking-application support are recognized as relevant roles, without assuming they accept first-job applicants.
- The verb “react to” no longer produces a React/JavaScript skill tag. Language “assets,” work-from-home statements, optional unquantified experience and employer training now receive appropriate tags and original evidence.
- A basic-hardware advert saying “te putem învăța restul” is recognized as a beginner route without inventing a no-experience promise.

## Remaining limits

The four recovered Moldflowers variants share body text but have different titles/categories; conservative duplicate rules retain them separately. The audit does not assert complete coverage, employer honesty or current availability. Unknown and incomplete statements stay uncertain; absence of a statement is never given a fabricated quote.

## Reviewed snapshots

| ID | Advert | Before fit | Audited fit | Category | Checks | Decision |
| --- | --- | --- | --- | --- | --- | --- |
${table}

## Repeat the check

Run \`npm run audit\` to compare the saved independently labelled fixtures with the current rules and regenerate this report. Run \`npm test\` for the full regression suite. The fixture is \`tests/fixtures/classification-audit-2026-10-06.json\`; later audits should add new snapshots and judgements rather than derive expected values from the classifier.
`;
const target=path.join(__dirname,'../docs/classification-audit-2026-10-06.md');
fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text);
console.log(`Audit: ${rows.length-failed.length}/${rows.length} snapshots passed; ${changed.length} corrected fit/category decisions. Report: ${target}`);
if(failed.length) { console.error(failed.map(row=>`${row.advert.id}: ${row.errors.join(', ')}`).join('\n'));process.exitCode=1; }
