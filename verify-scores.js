const db = require('./db');

console.log('=== TOP 5 HIGHEST CUSTOMER EXPOSURE SCORES ===');
const highExposure = db.prepare(`
  SELECT id, title, company, category, exposure_score, tags
  FROM jobs
  WHERE status = 'active'
  ORDER BY exposure_score DESC
  LIMIT 5
`).all();
console.table(highExposure);

console.log('\n=== JOBS WITH QUALITY / INFLATION FLAGS ===');
const flaggedJobs = db.prepare(`
  SELECT id, title, company, quality_flags
  FROM jobs
  WHERE quality_flags != '[]' AND quality_flags IS NOT NULL
`).all();
console.table(flaggedJobs);

console.log('\n=== ACTIVE CATEGORY DISTRIBUTION ===');
const categoryCounts = db.prepare(`
  SELECT category, COUNT(*) as total_jobs
  FROM jobs
  WHERE status = 'active'
  GROUP BY category
  ORDER BY total_jobs DESC
`).all();
console.table(categoryCounts);