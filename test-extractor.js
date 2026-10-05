const db = require('./db');
const { extractSections } = require('./lib/section-extractor');

// Grab a stored job with a description
const sampleJob = db.prepare("SELECT title, description FROM jobs WHERE description IS NOT NULL AND source = 'Lucru.md' LIMIT 1").get();

if (sampleJob) {
  console.log(`Testing Extractor on: "${sampleJob.title}"\n`);
  const sections = extractSections(sampleJob.description);

  console.log('--- RESPONSIBILITIES ---');
  console.log(sections.responsibilities.slice(0, 300) || '(None detected)');
  console.log('\n--- REQUIREMENTS ---');
  console.log(sections.requirements.slice(0, 300) || '(None detected)');
  console.log('\n--- BENEFITS ---');
  console.log(sections.benefits.slice(0, 300) || '(None detected)');
} else {
  console.log('No enriched jobs found in SQLite.');
}