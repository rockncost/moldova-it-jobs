const { normalize } = require('./text');

// Keep original spelling, accents, punctuation and casing. Classification uses
// a normalized copy; quotations always come from these original substrings.
function sentenceRecords(text = '', section = 'Vacancy text') {
  const records = [];
  let start = 0;
  for (const separator of String(text).matchAll(/[\n;!?]|\.(?=\s+\p{L})/gu)) {
    const end = separator.index + 1;
    if (separator[0] === '.' && /(?:т\s*\.\s*[дп]|[ei]\s*\.\s*[ge])\.$/iu.test(text.slice(start, end))) continue;
    const original = text.slice(start, end).trim();
    if (original) records.push({ text: original, section, normalized: normalize(original).replace(/[;.!?]+$/, '').trim() });
    start = end;
  }
  const original = text.slice(start).trim();
  if (original) records.push({ text: original, section, normalized: normalize(original).replace(/[;.!?]+$/, '').trim() });
  return records;
}

function createEvidenceCollector(title, sections, metadata) {
  const labels = { intro: 'Introduction', responsibilities: 'Responsibilities', requirements: 'Requirements', preferred: 'Preferred qualifications', benefits: 'Benefits' };
  const records = Object.entries(labels).flatMap(([key,label]) => sentenceRecords(sections[key] || '',label));
  // Unknown headers still retain their exact quotation, without inventing a
  // requirements/benefits label for text that was not separated reliably.
  const fullRecords = sentenceRecords(sections.fullText || '');
  const maps = { tags: {}, flags: {} };
  const quote = record => ({ text: record.text, section: record.section });
  const find = (predicate, candidates = fullRecords) => candidates.filter(record => predicate(record.normalized)).slice(0,3).map(record => {
    const sectionRecord = records.find(item => item.text === record.text);
    return quote(sectionRecord || record);
  });
  const match = (regex, candidates) => find(text => regex.test(text), candidates);
  const titleEvidence = () => [{ text: title, section: 'Job title' }];
  const field = name => metadata[name] ? [{text:String(metadata[name]),section:{location:'Location on source',work_mode:'Work arrangement on source',schedule:'Schedule on source',salary:'Salary on source'}[name] || name}] : [];
  const add = (kind, label, evidence) => {
    const values = (evidence || []).filter(item => item?.text);
    if (!values.length) return;
    maps[kind][label] = [...new Map([...(maps[kind][label] || []), ...values].map(item=>[`${item.section}|${item.text}`,item])).values()].slice(0,3);
  };
  return { ...maps, records, fullRecords, quote, find, match, titleEvidence, field, add };
}

module.exports = { sentenceRecords, createEvidenceCollector };
