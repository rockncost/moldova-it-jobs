const cheerio = require('cheerio');
const { cleanText, normalize } = require('./text');

function htmlToText(html) {
  const $ = cheerio.load(html);
  $('script,style,noscript,nav,footer,button,iframe').remove();
  $('br').replaceWith('\n');
  $('p,li,div,h1,h2,h3,h4,tr').each((_, e) => { $(e).append('\n'); });
  return cleanText($('body').text());
}

const HEADERS = [
  ['responsibilities', /responsabilitat(?:i|ile)(?: tale| candidatului)?|atributii|ce ai de facut|what you['’]?ll do|what you will do|(?:your )?duties(?: and responsibilities)?|(?:key |job )?responsibilities|(?:your )?role|чем вы будете заниматься|(?:ключевые )?обязанности(?: кандидата)?|задачи/gu],
  ['requirements', /cerinte(?:le)?(?: obligatorii| de calificare| fata de candidat)?|ce asteptam de la tine|vom aprecia sa ai|(?:job )?requirements|this is what we expect from you|what we['’]?re looking for|what we look for|(?:your skills, experience, and )?qualifications(?: required)?|your (?:profile|skills)|что мы ожидаем от кандидата|(?:обязательные )?требования(?: к кандидат[а-я]*)?/gu],
  ['benefits', /oferta(?: companiei)?|beneficii|ce (?:iti )?oferim|oferim|ce primiti|what (?:do )?we offer|why join us|(?:these are your |extra )?benefits(?: we offer)?|условия(?: работы)?|(?:что )?мы предлагаем|компания предлагает/gu],
  ['preferred', /(?:constituie|vor fi|va fi).{0,15}avantaj|nice to have|preferred qualifications|would be a plus|будет (?:плюсом|преимуществом)|желательно/gu],
];

function extractSections(rawContent) {
  const fullText = /<\/?[a-z][^>]*>/i.test(rawContent || '') ? htmlToText(rawContent) : cleanText(rawContent || '');
  const normalized = normalize(fullText);
  const sections = { intro: '', responsibilities: '', requirements: '', benefits: '', preferred: '', fullText };
  const matches = [];
  for (const [type, regex] of HEADERS) {
    for (const match of normalized.matchAll(regex)) {
      const before = normalized.slice(Math.max(0, match.index - 2), match.index);
      const after = normalized.slice(match.index + match[0].length, match.index + match[0].length + 5);
      if (match.index === 0 || /[\n.!?:]/.test(before) || /^\s*:/.test(after)) {
        matches.push({ type, index: match.index, length: match[0].length });
      }
    }
  }
  matches.sort((a, b) => a.index - b.index || b.length - a.length);
  const distinct = matches.filter((m, i) => !i || m.index >= matches[i - 1].index + matches[i - 1].length);
  sections.intro = fullText.slice(0, distinct[0]?.index ?? fullText.length).trim();
  for (let i = 0; i < distinct.length; i++) {
    const m = distinct[i];
    const content = fullText.slice(m.index + m.length, distinct[i + 1]?.index ?? fullText.length).replace(/^\s*[:\-]\s*/, '').trim();
    sections[m.type] += (sections[m.type] ? '\n' : '') + content;
  }
  if (!distinct.length) sections.responsibilities = fullText;
  return sections;
}

module.exports = { extractSections, htmlToText };
