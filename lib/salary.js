const { cleanText, normalize } = require('./text');

const NUMBER = '\\d+(?:[ .,\\u00a0]\\d{3})*(?:[.,]\\d{1,2})?';
const CURRENCY = '(?:MDL|USD|EUR|lei|euro|dolari|доллар[а-я]*|ле[йя]|\\$|€)';
const RANGE = '(?:-|–|—|to|până la|pana la|до)';
const AMOUNT = new RegExp(`(?<![\\p{L}\\p{N}])(?:${CURRENCY}\\s*${NUMBER}(?:\\s*${RANGE}\\s*(?:${CURRENCY}\\s*)?${NUMBER})?|${NUMBER}(?:\\s*${RANGE}\\s*${NUMBER})?\\s*${CURRENCY})(?!\\p{L})`, 'iu');

function extractSalaryAmount(job) {
  // A later job's salary is not the pay for an internship before employment.
  let flags = job.quality_flags;
  if (!Array.isArray(flags)) {
    try { flags = JSON.parse(flags || '[]'); } catch { flags = []; }
  }
  if (!Array.isArray(flags)) flags = [];
  if (flags.includes('INTERNSHIP_PAY_UNCLEAR')) return '';
  const stated = cleanText(job.salary || '').replace(/\s+/g, ' ');
  if (AMOUNT.test(stated)) return stated;
  // A numeric salary field is still an amount when the board omits currency.
  if (new RegExp(`^(?:(?:from|de la|от)\\s*)?${NUMBER}(?:\\s*${RANGE}\\s*${NUMBER})?$`, 'iu').test(stated)) return stated;
  const titleAmount = (job.title || '').match(AMOUNT);
  if (titleAmount) return cleanText(titleAmount[0]);
  const lines = (job.description || '').split(/\n+/).map(cleanText);
  const amountLine = new RegExp(`^(?:(?:from|de la|от)\\s*)?${AMOUNT.source}(?:\\s*(?:per month|monthly|pe lun[aă]|/month|/lun[aă]|в месяц))?[;.!]?$`, 'iu');
  const roleSalary = /^(?:intern(?:ship)?|trainee|junior|stagiar|specialist junior|стажер|стажёр|младший специалист)\s*:\s*/iu;
  for (let i = 0; i < lines.length; i++) {
    if (!/salary|salari[au]|remunerare|зарплат[а-я]*|заработн[а-я]* плат[а-я]*|compensation|pay:/u.test(normalize(lines[i]))) continue;
    if (/after.{0,30}(?:internship|training)|dupa.{0,25}(?:stagiu|instruire)|после.{0,25}стажировк/u.test(normalize(lines[i]))) continue;
    // A following amount-only line belongs to the salary label; another benefit
    // or a training cost on that line does not.
    const following = [];
    if (/^(?:salary|salari[au]l?|зарплата|compensation|remunerare)\s*:$/iu.test(lines[i])) {
      for (const line of lines.slice(i + 1, i + 4)) {
        if (!amountLine.test(line.replace(roleSalary, ''))) break;
        following.push(line.replace(/[;.!]$/, ''));
      }
      if (following.length) return following.join('; ');
    }
    const next = lines[i + 1] || '';
    const context = lines[i] + (amountLine.test(next) ? ` ${next}` : '');
    const match = context.match(AMOUNT);
    if (match) {
      const prefix = context.slice(Math.max(0, match.index - 15), match.index).match(/(?:from|de la|începând de la|incepand de la|от)\s*$/iu)?.[0] || '';
      return cleanText(`${prefix}${match[0]}`);
    }
  }
  return '';
}

module.exports = { extractSalaryAmount };
