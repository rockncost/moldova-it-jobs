const test = require('node:test');
const assert = require('node:assert/strict');
const {evaluateJob} = require('../lib/scoring-engine');
const {extractSections} = require('../lib/section-extractor');
const {sentenceRecords} = require('../lib/evidence');
const audit = require('./fixtures/classification-audit-2026-10-06.json');

for (const advert of audit.cases) test(`audited advert ${advert.id}: ${advert.title}`,()=>{
  const result = evaluateJob(advert.title,extractSections(advert.description),advert.metadata);
  assert.equal(result.entryFit,advert.expected.fit,advert.note);
  assert.equal(result.category,advert.expected.category,advert.note);
  if (Object.hasOwn(advert.expected,'experience')) assert.equal(result.experienceMin,advert.expected.experience,advert.note);
  const tags = JSON.parse(result.tags), flags = JSON.parse(result.qualityFlags);
  for(const tag of advert.expected.tags) assert.ok(tags.includes(tag),tag);
  for(const tag of advert.expected.absentTags) assert.ok(!tags.includes(tag),tag);
  for(const flag of advert.expected.flags) assert.ok(flags.includes(flag),flag);
  for(const flag of advert.expected.absentFlags) assert.ok(!flags.includes(flag),flag);
  const evidence = JSON.parse(result.tagEvidence);
  for (const tag of tags) {
    assert.ok(evidence[tag]?.length,`${tag} must have evidence`);
    for (const quote of evidence[tag]) {
      const source = quote.section==='Job title' ? advert.title : ({'Location on source':advert.metadata.location,'Work arrangement on source':advert.metadata.work_mode,'Schedule on source':advert.metadata.schedule,'Salary on source':advert.metadata.salary}[quote.section] ?? advert.description);
      assert.ok(source.includes(quote.text),`${tag} evidence must be an unchanged original substring`);
    }
  }
});

test('sentence records preserve original casing, accents, punctuation and abbreviations',()=>{
  const source='Cunoașterea limbii engleze constituie un avantaj;\nОпыт работы с Nagios и т.д. является преимуществом.\nNo experience required!';
  const records=sentenceRecords(source);
  assert.equal(records.length,3);
  assert.equal(records[0].text,'Cunoașterea limbii engleze constituie un avantaj;');
  assert.equal(records[1].text,'Опыт работы с Nagios и т.д. является преимуществом.');
  for(const record of records) assert.ok(source.includes(record.text));
});

test('optional-language evidence keeps its qualification section and does not quote a course benefit',()=>{
  const source='Requirements:\nEnglish required.\nNice to have:\nItalian skills are an asset.\nBenefits:\nFree English courses. We offer training and a modern office in Chișinău.';
  const result=evaluateJob('Junior Developer',extractSections(source),{location:'Chișinău',description_quality:'verified'});
  const evidence=JSON.parse(result.tagEvidence);
  assert.deepEqual(evidence['English Required'],[{text:'English required.',section:'Requirements'}]);
  assert.deepEqual(evidence['Italian Preferred'],[{text:'Italian skills are an asset.',section:'Preferred qualifications'}]);
});
