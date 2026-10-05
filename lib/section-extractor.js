const cheerio = require('cheerio');

function cleanText(str) {
  return str ? str.replace(/\s+/g, ' ').trim() : '';
}

function extractSections(rawContent) {
  if (!rawContent) {
    return { responsibilities: '', requirements: '', benefits: '', fullText: '' };
  }

  // Strip residual HTML tags if present, otherwise clean spaces
  const text = rawContent.includes('<')
    ? cleanText(cheerio.load(rawContent)('body').text())
    : cleanText(rawContent);

  let responsibilities = '';
  let requirements = '';
  let benefits = '';

  // Multilingual Header Matchers (RO, EN, RU)
  const respRegex = /(?:responsabilită[țt]i|atribu[țt]ii|what you’ll do|what you will do|duties|responsibilities|обязанности|задачи):?/i;
  const reqRegex = /(?:cerin[țt]e|requirements|what we’re looking for|what we look for|qualifications|требования):?/i;
  const benRegex = /(?:oferta|beneficii|what we offer|extra benefits|extra benefits we offer|условия|мы предлагаем):?/i;

  const respMatch = text.match(respRegex);
  const reqMatch = text.match(reqRegex);
  const benMatch = text.match(benRegex);

  const matches = [];
  if (respMatch) matches.push({ type: 'resp', index: respMatch.index, length: respMatch[0].length });
  if (reqMatch) matches.push({ type: 'req', index: reqMatch.index, length: reqMatch[0].length });
  if (benMatch) matches.push({ type: 'ben', index: benMatch.index, length: benMatch[0].length });

  // Order matches sequentially as they appear in the description
  matches.sort((a, b) => a.index - b.index);

  if (matches.length > 0) {
    for (let i = 0; i < matches.length; i++) {
      const current = matches[i];
      const startPos = current.index + current.length;
      const endPos = i + 1 < matches.length ? matches[i + 1].index : text.length;
      const sectionContent = text.slice(startPos, endPos).trim();

      if (current.type === 'resp') responsibilities = sectionContent;
      if (current.type === 'req') requirements = sectionContent;
      if (current.type === 'ben') benefits = sectionContent;
    }
  } else {
    // Fallback if no explicit headers are found
    responsibilities = text;
  }

  return {
    responsibilities,
    requirements,
    benefits,
    fullText: text,
  };
}

module.exports = { extractSections };