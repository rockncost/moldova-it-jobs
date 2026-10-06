function normalize(value = '') {
  // Fold Romanian/Latin accents but retain Cyrillic й and ё, whose marks are
  // part of the letter. Removing every combining mark corrupts Russian words.
  return String(value).normalize('NFKD').replace(/(\p{Script=Latin})\p{M}+/gu, '$1').normalize('NFC').toLowerCase()
    .replace(/[’‘]/g, "'").replace(/[–—]/g, '-').replace(/\u00a0/g, ' ');
}

function cleanText(value = '') {
  return String(value).replace(/\u00a0/g, ' ').replace(/[\t ]+/g, ' ')
    .replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function phrase(pattern) {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`, 'u');
}

module.exports = { normalize, cleanText, phrase };
